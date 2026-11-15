// 浏览器钱包发起的写操作。签名全部在用户钱包里完成，这里只组装交易。

import { decodeEventLog, maxUint256, zeroAddress, type Account, type Address, type Chain, type Hex, type PublicClient, type WalletClient } from 'viem';
import { L, stats, toHex } from '@tapearena/netlist';
import { arenaAbi, cpuAbi, erc20Abi, libraryAbi, transistorsAbi } from './abi.ts';

export interface Signer {
  pub: PublicClient;
  wallet: WalletClient;
  account: Address;
  chain: Chain;
}

export type Progress = (step: string, hash?: Hex) => void;

async function send(s: Signer, req: Parameters<WalletClient['writeContract']>[0], label: string, onStep?: Progress) {
  onStep?.(label);
  const { request } = await s.pub.simulateContract({ ...req, account: s.account } as never);
  // 擂台抽检的向量取决于出块时的 prevrandao，实际耗 gas 可能高于估算，留 30% 余量
  const est = await s.pub.estimateContractGas({ ...req, account: s.account } as never);
  const hash = await s.wallet.writeContract({ ...(request as object), gas: (est * 13n) / 10n, account: s.account as unknown as Account, chain: s.chain } as never);
  onStep?.(label, hash);
  const receipt = await s.pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(L(`${label} 交易失败`, `${label}: transaction failed`));
  return receipt;
}

/** 确保 spender 对 token 的授权至少为 amount，不够就请求一次无限授权。 */
export async function ensureAllowance(s: Signer, token: Address, spender: Address, amount: bigint, onStep?: Progress) {
  const cur = await s.pub.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [s.account, spender] });
  if (cur >= amount) return;
  await send(s, { address: token, abi: erc20Abi, functionName: 'approve', args: [spender, maxUint256] } as never, L('授权代币', 'Approve token'), onStep);
}

/** 直接 transfer ERC20（商店扣 BEM 用，不需要 approve）。 */
export async function transferErc20(s: Signer, token: Address, to: Address, amount: bigint, onStep?: Progress) {
  await send(s, { address: token, abi: erc20Abi, functionName: 'transfer', args: [to, amount] } as never, L('转账代币', 'Transfer token'), onStep);
}

/** 主网 Transistors 已升级为 BEM 付费，本地测试栈仍收原生币：读得到 BEM() 就走 ERC20。 */
export async function mintPayment(pub: PublicClient, transistors: Address) {
  const [price, fee] = await Promise.all([
    pub.readContract({ address: transistors, abi: transistorsAbi, functionName: 'mintPrice' }),
    pub.readContract({ address: transistors, abi: transistorsAbi, functionName: 'protocolFee' }),
  ]);
  let bem: Address | null = null;
  try {
    bem = await pub.readContract({ address: transistors, abi: transistorsAbi, functionName: 'BEM' });
  } catch { /* 旧版本：原生币支付 */ }
  return { price, fee, token: bem && bem !== zeroAddress ? bem : null };
}

/** 补齐流片所需的 NAND / LATCH，返回实际铸造数量。 */
export async function mintFor(s: Signer, cpu: Address, netlist: Uint8Array, nIn: number, onStep?: Progress) {
  const st = stats(netlist, nIn);
  const transistors = await s.pub.readContract({ address: cpu, abi: cpuAbi, functionName: 'transistors' });
  const pay = await mintPayment(s.pub, transistors);
  const minted: { nand: number; latch: number } = { nand: 0, latch: 0 };
  for (const [id, need, key] of [[0n, st.nNand, 'nand'], [1n, st.nLatch, 'latch']] as const) {
    if (!need) continue;
    const have = await s.pub.readContract({ address: transistors, abi: transistorsAbi, functionName: 'balanceOf', args: [s.account, id] });
    const short = BigInt(need) - have;
    if (short <= 0n) continue;
    const cost = pay.price * short + pay.fee;
    const kind = key === 'nand' ? 'NAND' : 'LATCH';
    const label = L(`铸造 ${short} 个 ${kind}`, `Mint ${short} ${kind}`);
    if (pay.token) {
      await ensureAllowance(s, pay.token, transistors, cost, onStep);
      await send(s, { address: transistors, abi: transistorsAbi, functionName: 'mint', args: [id, short] } as never, label, onStep);
    } else {
      await send(s, { address: transistors, abi: transistorsAbi, functionName: 'mint', args: [id, short], value: cost } as never, label, onStep);
    }
    minted[key] = Number(short);
  }
  return minted;
}

/** 铸晶体管 + 流片，返回新电路号。 */
export async function tapeout(s: Signer, cpu: Address, netlist: Uint8Array, nIn: number, nOut: number, onStep?: Progress) {
  await mintFor(s, cpu, netlist, nIn, onStep);
  const fee = await s.pub.readContract({ address: cpu, abi: cpuAbi, functionName: 'TAPEOUT_FEE' });
  const receipt = await send(s, {
    address: cpu, abi: cpuAbi, functionName: 'tapeout', args: [toHex(netlist), nIn, nOut], value: fee,
  } as never, L('流片', 'Tape out'), onStep);
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== cpu.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: cpuAbi, data: log.data, topics: log.topics });
      if (ev.eventName === 'TapedOut') return { circuitId: ev.args.circuitId, gateCount: ev.args.gateCount, hash: receipt.transactionHash };
    } catch { /* 其他事件 */ }
  }
  throw new Error(L('流片成功但没解析到电路号', 'Tape-out succeeded, but the circuit ID could not be read from the receipt'));
}

export interface CreateBountyInput {
  token: Address; // zeroAddress = OKB
  reward: bigint;
  bond: bigint;
  refCpu: Address;
  refId: bigint;
  nIn: number;
  nOut: number;
  maxGates: number;
  royaltyBps: number;
  sampleSize: number;
  deadline: bigint;
  challengeWindow: bigint;
  vectors: Hex;
  meta: string;
}

export async function createBounty(s: Signer, arena: Address, p: CreateBountyInput, onStep?: Progress) {
  if (p.token !== zeroAddress) await ensureAllowance(s, p.token, arena, p.reward, onStep);
  const receipt = await send(s, {
    address: arena, abi: arenaAbi, functionName: 'createBounty', args: [p], value: p.token === zeroAddress ? p.reward : 0n,
  } as never, L('发布擂台', 'Post bounty'), onStep);
  for (const log of receipt.logs) {
    try {
      const ev = decodeEventLog({ abi: arenaAbi, data: log.data, topics: log.topics });
      if (ev.eventName === 'BountyCreated') return Number(ev.args.id);
    } catch { /* 其他事件 */ }
  }
  throw new Error(L('发布成功但没解析到擂台号', 'Published, but the bounty ID could not be read from the receipt'));
}

export const submit = (s: Signer, arena: Address, id: number, cpu: Address, circuitId: bigint, bond: bigint, onStep?: Progress) =>
  send(s, { address: arena, abi: arenaAbi, functionName: 'submit', args: [BigInt(id), cpu, circuitId], value: bond } as never, L('提交电路', 'Submit circuit'), onStep);

export const challenge = (s: Signer, arena: Address, id: number, index: number, input: Hex, onStep?: Progress) =>
  send(s, { address: arena, abi: arenaAbi, functionName: 'challenge', args: [BigInt(id), BigInt(index), input] } as never, L('发起挑战', 'Challenge'), onStep);

export const challengeVector = (s: Signer, arena: Address, id: number, index: number, vectorIndex: number, onStep?: Progress) =>
  send(s, { address: arena, abi: arenaAbi, functionName: 'challengeVector', args: [BigInt(id), BigInt(index), BigInt(vectorIndex)] } as never, L('用向量挑战', 'Challenge with a vector'), onStep);

export const finalize = (s: Signer, arena: Address, id: number, onStep?: Progress) =>
  send(s, { address: arena, abi: arenaAbi, functionName: 'finalize', args: [BigInt(id)] } as never, L('结算擂台', 'Settle bounty'), onStep);

export const claimBond = (s: Signer, arena: Address, id: number, index: number, onStep?: Progress) =>
  send(s, { address: arena, abi: arenaAbi, functionName: 'claimBond', args: [BigInt(id), BigInt(index)] } as never, L('取回保证金', 'Reclaim bond'), onStep);

export const withdraw = (s: Signer, arena: Address, token: Address, onStep?: Progress) =>
  send(s, { address: arena, abi: arenaAbi, functionName: 'withdraw', args: [token] } as never, L('提取奖金', 'Withdraw'), onStep);

export const registerComponent = (s: Signer, library: Address, cpu: Address, circuitId: bigint, name: string, meta: string, onStep?: Progress) =>
  send(s, { address: library, abi: libraryAbi, functionName: 'register', args: [cpu, circuitId, name, meta] } as never, L('登记组件', 'Register component'), onStep);

export const tipComponent = (s: Signer, library: Address, key: Hex, amount: bigint, onStep?: Progress) =>
  send(s, { address: library, abi: libraryAbi, functionName: 'tip', args: [key], value: amount } as never, L('打赏作者', 'Tip the author'), onStep);
