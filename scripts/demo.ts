// 本地演示：在 X Layer 主网 fork（anvil）上用官方 TapeOut 工厂跑完整剧情，并把部署地址写进
// packages/chain/src/deployments.json，前端切到「Local X Layer fork」就能看到真实数据。
//
//   anvil --fork-url https://rpc.xlayer.tech --chain-id 31337
//   npx tsx scripts/demo.ts
//
// 演示账户通过 anvil_impersonateAccount 解锁（eth_sendTransaction），不涉及任何私钥。

import { readFileSync, writeFileSync } from 'node:fs';
import { createPublicClient, createWalletClient, getAddress, http, keccak256, parseAbiItem, parseEther, toBytes, zeroAddress, type Address, type Hex, type PublicClient } from 'viem';
import { EXAMPLES, FULL_ADDER_NAND9, generateVectors, encodeVectors, toHex, checkVectors } from '@tapearena/netlist';
import {
  arenaAbi, build, challengeHint, challengeVector, ChainLibrary, createBounty, erc20Abi, factoryAbi, fetchBounty, finalize,
  libraryAbi, localFork, registerComponent, submit, tapeout, XLAYER_BEM, XLAYER_TAPEOUT_FACTORY, type Signer,
} from '@tapearena/chain';

const RPC = process.env.RPC ?? 'http://127.0.0.1:8545';
const transport = http(RPC);
const pub = createPublicClient({ chain: localFork, transport }) as PublicClient;
const lib = new ChainLibrary(pub);
const rpc = (method: string, params: unknown[]) => pub.request({ method: method as never, params: params as never });
const log = (...a: unknown[]) => console.log('·', ...a);

// anvil 默认账户在 X Layer 主网上已被设置了 EIP-7702 代码，收不了 ERC1155，所以用专属地址 + impersonate
const accounts = ['alice', 'bob', 'carol', 'dave', 'erin'].map((n) => getAddress(`0x${keccak256(toBytes(`tapearena-demo-${n}`)).slice(26)}`));
for (const a of accounts) {
  await rpc('anvil_impersonateAccount', [a]);
  await rpc('anvil_setBalance', [a, '0x3635C9ADC5DEA00000']);
}
const [alice, bob, carol, dave, erin] = accounts;
const NAMES: Record<string, string> = { [alice]: 'alice(出题)', [bob]: 'bob', [carol]: 'carol(作弊)', [dave]: 'dave(挑战)', [erin]: 'erin' };
const signer = (account: Address): Signer => ({ pub, wallet: createWalletClient({ account, chain: localFork, transport }), account, chain: localFork });
const step = (who: Address) => (s: string, hash?: Hex) => { if (!hash) log(`${NAMES[who]}: ${s}`); };

async function now(): Promise<bigint> {
  return (await pub.getBlock()).timestamp;
}

async function waitUntil(ts: bigint) {
  for (;;) {
    const t = await now();
    if (t >= ts) return;
    const ms = Number(ts - t) * 1000;
    log(`等待 ${Math.ceil(ms / 1000)} 秒到期…`);
    await new Promise((r) => setTimeout(r, Math.min(ms + 1500, 20000)));
    await rpc('evm_mine', []);
  }
}

// ---------------------------------------------------------------- 1. 给测试账户发 BEM（借用持有 BEM 的晶体管合约）

async function fundBem() {
  // 在主网最近的 BEM 转账里找收款方，挑 fork 时余额最多的那个（公共 RPC 限制每次最多查 100 个块）
  const upstream = createPublicClient({ transport: http(process.env.UPSTREAM ?? 'https://rpc.xlayer.tech') });
  const head = await upstream.getBlockNumber();
  const seen = new Set<Address>();
  for (let k = 0n; k < 10n; k++) {
    const logs = await upstream.getLogs({
      address: XLAYER_BEM, event: parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)'),
      fromBlock: head - 100n * (k + 1n), toBlock: head - 100n * k,
    });
    for (const l of logs) if (l.args.to) seen.add(l.args.to);
  }
  let best: { who: Address; bal: bigint } = { who: zeroAddress, bal: 0n };
  for (const who of seen) {
    const bal = await pub.readContract({ address: XLAYER_BEM, abi: erc20Abi, functionName: 'balanceOf', args: [who] });
    if (bal > best.bal) best = { who, bal };
  }
  if (best.bal === 0n) throw new Error('没找到持有 BEM 的地址');
  const each = best.bal / 8n;
  log(`从 ${best.who} 借 BEM（余额 ${Number(best.bal) / 1e8}），每个账户 ${Number(each) / 1e8}`);
  await rpc('anvil_impersonateAccount', [best.who]);
  await rpc('anvil_setBalance', [best.who, '0x56BC75E2D63100000']);
  const w = createWalletClient({ account: best.who, chain: localFork, transport });
  for (const a of [alice, bob, carol, dave, erin]) {
    const hash = await w.writeContract({ address: XLAYER_BEM, abi: erc20Abi, functionName: 'transfer', args: [a, each], chain: localFork });
    await pub.waitForTransactionReceipt({ hash });
  }
  await rpc('anvil_stopImpersonatingAccount', [best.who]);
}

// ---------------------------------------------------------------- 2. 建 CPU、部署合约

function artifact(name: string): Hex {
  const j = JSON.parse(readFileSync(new URL(`../contracts/out/${name}.sol/${name}.json`, import.meta.url), 'utf8'));
  return j.bytecode.object as Hex;
}

async function deploy(name: string, abi: readonly unknown[], args: unknown[]): Promise<Address> {
  const w = signer(alice).wallet;
  const hash = await w.deployContract({ abi: abi as never, bytecode: artifact(name), args: args as never, account: alice, chain: localFork });
  const r = await pub.waitForTransactionReceipt({ hash });
  return r.contractAddress!;
}

async function setup() {
  const fee = await pub.readContract({ address: XLAYER_TAPEOUT_FACTORY, abi: factoryAbi, functionName: 'deployFee' });
  const s = signer(alice);
  await s.wallet.writeContract({ address: XLAYER_BEM, abi: erc20Abi, functionName: 'approve', args: [XLAYER_TAPEOUT_FACTORY, fee], account: alice, chain: localFork })
    .then((hash) => pub.waitForTransactionReceipt({ hash }));
  const { result, request } = await pub.simulateContract({
    address: XLAYER_TAPEOUT_FACTORY, abi: factoryAbi, functionName: 'createCPU', args: ['TapeArena Demo', 'TAD', 'TapeArena 演示处理器', 10_000_000n, 0n], account: alice,
  });
  await pub.waitForTransactionReceipt({ hash: await s.wallet.writeContract({ ...request, account: alice, chain: localFork } as never) });
  const cpu = result[1];
  log(`官方工厂创建 CPU：${cpu}`);

  const libAbi = [{ type: 'constructor', inputs: [{ type: 'address' }, { type: 'address' }] }];
  const arenaCtor = [{ type: 'constructor', inputs: [{ type: 'address' }, { type: 'address' }, { type: 'address' }, { type: 'uint16' }, { type: 'address' }] }];
  const library = await deploy('ComponentLibrary', libAbi, [XLAYER_TAPEOUT_FACTORY, alice]);
  const arena = await deploy('TapeArena', arenaCtor, [XLAYER_TAPEOUT_FACTORY, library, alice, 250, alice]);
  await s.wallet.writeContract({ address: library, abi: [...libraryAbi, { type: 'function', name: 'setArena', stateMutability: 'nonpayable', inputs: [{ type: 'address' }], outputs: [] }] as never, functionName: 'setArena' as never, args: [arena] as never, account: alice, chain: localFork } as never)
    .then((hash) => pub.waitForTransactionReceipt({ hash }));
  log(`组件库 ${library}`);
  log(`擂台   ${arena}`);

  const file = new URL('../packages/chain/src/deployments.json', import.meta.url);
  const all = JSON.parse(readFileSync(file, 'utf8'));
  all['31337'] = { chainId: 31337, factory: XLAYER_TAPEOUT_FACTORY, arena, library, cpu, deployedAt: new Date().toISOString() };
  writeFileSync(file, JSON.stringify(all, null, 2) + '\n');
  return { cpu, arena, library };
}

// ---------------------------------------------------------------- 3. 剧情

const ADD8_REF = `circuit add8
in a[8], b[8], cin
out s[8], cout
wire c[9]
c[0] = cin
for i in 0..7 {
  s[i] = a[i] ^ b[i] ^ c[i]
  c[i+1] = (a[i] & b[i]) | (a[i] & c[i]) | (b[i] & c[i])
}
cout = c[8]
`;

/** 最高位进位偷工减料：少几个门，但 a7=0,b7=1,c7=1 时算错。 */
const ADD8_CHEAT = ADD8_REF.replace('add8', 'add8_fast').replace('cout = c[8]', 'cout = (a[7] & b[7]) | (a[7] & c[7])');

const add4WithFA = (cpu: Address, id: bigint) => `circuit add4_fa
use FA = ${cpu}#${id}
in a[4], b[4], cin
out s[4], cout
wire c[5]
c[0] = cin
for i in 0..3 {
  (s[i], c[i+1]) = FA(a[i], b[i], c[i])
}
cout = c[4]
`;

const add8WithFA = (cpu: Address, id: bigint) => add4WithFA(cpu, id).replace('add4_fa', 'add8_fa').replace(/\[4\]/g, '[8]').replace('c[5]', 'c[9]').replace('0..3', '0..7').replace('c[4]', 'c[8]');

async function tape(who: Address, cpu: Address, src: string) {
  const b = await build(src, lib);
  const r = await tapeout(signer(who), cpu, b.compiled.netlist, b.compiled.nIn, b.compiled.nOut, step(who));
  log(`${NAMES[who]} 流片 ${b.compiled.name} → #${r.circuitId}（${r.gateCount} 门）`);
  return { id: r.circuitId, built: b };
}

async function bounty(cpu: Address, arena: Address, o: {
  title: string; description: string; src: string; reward: string; bond?: string; royalty?: number; count?: number; sample?: number;
  deadlineSec: number; windowSec: number;
}) {
  const ref = await tape(alice, cpu, o.src);
  const vs = generateVectors(ref.built.circuit, lib, { count: o.count ?? 64, seed: 7 });
  const t = await now();
  const id = await createBounty(signer(alice), arena, {
    token: zeroAddress, reward: parseEther(o.reward), bond: parseEther(o.bond ?? '0.001'),
    refCpu: cpu, refId: ref.id, nIn: ref.built.compiled.nIn, nOut: ref.built.compiled.nOut, maxGates: 0,
    royaltyBps: (o.royalty ?? 0) * 100, sampleSize: o.sample ?? 0,
    deadline: t + BigInt(o.deadlineSec), challengeWindow: BigInt(o.windowSec),
    vectors: toHex(encodeVectors(ref.built.compiled.nIn, ref.built.compiled.nOut, vs)),
    meta: JSON.stringify({ title: o.title, description: o.description, inputs: ref.built.compiled.inputs, outputs: ref.built.compiled.outputs, referenceHdl: o.src }),
  }, step(alice));
  log(`擂台 #${id}「${o.title}」上线，奖金 ${o.reward} OKB，${vs.length} 条向量`);
  return { id, deadline: t + BigInt(o.deadlineSec), challengeEnd: t + BigInt(o.deadlineSec + o.windowSec) };
}

async function enter(who: Address, arena: Address, bountyId: number, cpu: Address, src: string) {
  const { id } = await tape(who, cpu, src);
  const b = await fetchBounty(pub, arena, bountyId);
  await submit(signer(who), arena, bountyId, cpu, id, b.bond, step(who));
  log(`${NAMES[who]} 提交到 #${bountyId}`);
  return id;
}

async function main() {
  const chainId = await pub.getChainId();
  if (chainId !== 31337) throw new Error(`期望本地 fork（31337），实际 ${chainId}`);
  await fundBem();
  const { cpu, arena, library } = await setup();

  // 全加器（短期，演示结算）：bob 的 9 门手写版胜出并登记成组件
  const fa = await bounty(cpu, arena, {
    title: '一位全加器', description: 'a + b + cin，输出和 s 与进位 cout。经典题：最少几个 NAND？',
    src: EXAMPLES.fullAdder.src.replace('cout = (a & b) | (p & cin)', 'cout = (a & b) | (a & cin) | (b & cin)'),
    reward: '0.02', deadlineSec: 70, windowSec: 20,
  });
  const fa9 = await enter(bob, arena, fa.id, cpu, FULL_ADDER_NAND9);
  await registerComponent(signer(bob), library, cpu, fa9, 'FA9', JSON.stringify({ inputs: [{ name: 'a', width: 1 }, { name: 'b', width: 1 }, { name: 'cin', width: 1 }], outputs: [{ name: 's', width: 1 }, { name: 'cout', width: 1 }], description: '9 个 NAND 的全加器' }), step(bob));
  log('bob 把 FA9 登记进组件库');

  // 4 位加法器（短期，演示上游分润）：erin 用 FA9 拼装，结算时 bob 分到 20%
  const add4 = await bounty(cpu, arena, {
    title: '4 位加法器', description: '两个 4 位数相加带进位。允许引用组件库里的组件，冠军奖金的 20% 分给被引用组件的持有人。',
    src: EXAMPLES.add4.src, reward: '0.05', royalty: 20, deadlineSec: 80, windowSec: 20,
  });
  await enter(erin, arena, add4.id, cpu, add4WithFA(cpu, fa9));

  // 8 位加法器（长期，抽检 + 挑战）：carol 的作弊电路混过抽检，被 dave 用向量挑战拿下
  const add8 = await bounty(cpu, arena, {
    title: '8 位加法器', description: '两个 8 位数相加带进位。提交时只抽检 8 条向量（省 gas），其余靠挑战期兜底。',
    src: ADD8_REF, reward: '0.1', royalty: 20, count: 256, sample: 8, deadlineSec: 3 * 86400, windowSec: 86400,
  });
  await enter(erin, arena, add8.id, cpu, add8WithFA(cpu, fa9));
  const b8 = await fetchBounty(pub, arena, add8.id);
  const cheat = await build(ADD8_CHEAT, lib);
  log(`carol 的作弊电路 ${cheat.circuit.gateCount} 门，全量向量通过 ${checkVectors(cheat.circuit, lib, b8.vectors).passed}/${b8.vectors.length}`);
  const sneakIn = async () => {
    for (let k = 0; k < 40; k++) {
      const { id } = await tape(carol, cpu, ADD8_CHEAT);
      // 抽检种子含 prevrandao，预先模拟不代表出块时的结果，所以直接发交易看回执
      const hash = await signer(carol).wallet.writeContract({
        address: arena, abi: arenaAbi, functionName: 'submit', args: [BigInt(add8.id), cpu, id], value: b8.bond, gas: 30_000_000n, account: carol, chain: localFork,
      });
      if ((await pub.waitForTransactionReceipt({ hash })).status === 'success') {
        log(`carol 第 ${k + 1} 次混过抽检，排进榜单`);
        return (await fetchBounty(pub, arena, add8.id)).submissions.length - 1;
      }
      log('carol 被抽检抓到，换一枚再试');
    }
    return -1;
  };
  const cheatIndex = await sneakIn();
  if (cheatIndex >= 0) {
    const now8 = await fetchBounty(pub, arena, add8.id);
    const s = now8.submissions[cheatIndex];
    const hint = challengeHint(await lib.resolved(s.cpu, s.circuitId), await lib.resolved(now8.refCpu, now8.refId), lib, now8.vectors);
    if (hint?.kind === 'vector') {
      await challengeVector(signer(dave), arena, add8.id, cheatIndex, hint.vectorIndex, step(dave));
      log(`dave 用向量 #${hint.vectorIndex} 挑战成功，carol 出局，保证金归 dave`);
    }
  }
  await enter(bob, arena, add8.id, cpu, ADD8_REF.replace('add8', 'add8_bob').replace('(a[i] & b[i]) | (a[i] & c[i]) | (b[i] & c[i])', '(a[i] & b[i]) | (c[i] & (a[i] ^ b[i]))'));
  // 再混进去一枚，留给录屏时在前端现场点「挑战」
  if ((await sneakIn()) >= 0) log('carol 又混进一枚作弊电路，尚未被挑战');

  // 开放中的擂台
  const cmp = await bounty(cpu, arena, {
    title: '4 位比较器 a > b', description: '输入两个 4 位无符号数，输出 a 是否大于 b。', src: EXAMPLES.cmp4.src, reward: '0.05', deadlineSec: 5 * 86400, windowSec: 86400,
  });
  await enter(dave, arena, cmp.id, cpu, EXAMPLES.cmp4.src);
  await bounty(cpu, arena, {
    title: '3 位人口计数', description: '数一数 3 个输入里有几个 1，输出 2 位二进制。', src: EXAMPLES.popcount3.src, reward: '0.03', deadlineSec: 4 * 86400, windowSec: 86400,
  });
  const mux = await bounty(cpu, arena, {
    title: '4 选 1 多路选择器', description: 's 选择 d[0..3] 中的一位输出。', src: EXAMPLES.mux4.src, reward: '0.04', royalty: 10, deadlineSec: 6 * 86400, windowSec: 86400,
  });
  await enter(carol, arena, mux.id, cpu, EXAMPLES.mux4.src);

  // 结算两场短期擂台
  await waitUntil(add4.challengeEnd + 1n);
  await finalize(signer(dave), arena, fa.id, step(dave));
  log(`擂台 #${fa.id} 结算：bob 夺冠，FA9 获得冠军认证`);
  await finalize(signer(dave), arena, add4.id, step(dave));
  const credit = await pub.readContract({ address: arena, abi: arenaAbi, functionName: 'credit', args: [zeroAddress, bob] });
  log(`擂台 #${add4.id} 结算：erin 夺冠；bob 作为 FA9 持有人累计可提 ${Number(credit) / 1e18} OKB（含分润）`);

  // 记录引用关系（任何人都能调用，组件库据此统计被引用次数）
  for (const bid of [add4.id, add8.id]) {
    for (const s of (await fetchBounty(pub, arena, bid)).submissions) {
      const hash = await signer(erin).wallet.writeContract({ address: library, abi: libraryAbi, functionName: 'recordUse', args: [s.cpu, s.circuitId], account: erin, chain: localFork });
      await pub.waitForTransactionReceipt({ hash });
    }
  }
  log('已记录组件引用关系');
  console.log('\n演示数据就绪。前端切换到「Local X Layer fork」查看。');
}

await main();
