// 在 Chipet Heart CPU 上流片一枚 1-NAND 电路，供 DeWEB 挂站用。
import { createPublicClient, createWalletClient, http, formatEther, decodeEventLog, zeroAddress, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { xlayer } from '../packages/chain/src/networks.ts';
import { compile, toHex } from '../packages/netlist/src/index.ts';
import { cpuAbi, transistorsAbi, erc20Abi } from '../packages/chain/src/abi.ts';

const CPU = '0x550992f2dC407BfFDd82c516C0984dc5e00B37d3' as const;

async function main() {
  const raw = process.env.X_LAYER_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (!raw) throw new Error('缺少 X_LAYER_PRIVATE_KEY');
  const pk = (raw.startsWith('0x') ? raw : `0x${raw}`) as Hex;
  const account = privateKeyToAccount(pk);
  const pub = createPublicClient({ chain: xlayer, transport: http('https://rpc.xlayer.tech') });
  const wallet = createWalletClient({ account, chain: xlayer, transport: http('https://rpc.xlayer.tech') });

  const compiled = compile(`circuit chipet_site
in a
out y
y = nand(a, a)
`);
  console.log('compiled gates', compiled.gateCount, 'nand', compiled.nNand);

  const transistors = await pub.readContract({ address: CPU, abi: cpuAbi, functionName: 'transistors' });
  const have = await pub.readContract({
    address: transistors, abi: transistorsAbi, functionName: 'balanceOf', args: [account.address, 0n],
  });
  console.log('have NAND', have.toString());

  if (have < BigInt(compiled.nNand)) {
    const short = BigInt(compiled.nNand) - have;
    const [price, fee] = await Promise.all([
      pub.readContract({ address: transistors, abi: transistorsAbi, functionName: 'mintPrice' }),
      pub.readContract({ address: transistors, abi: transistorsAbi, functionName: 'protocolFee' }),
    ]);
    let bem: `0x${string}` | null = null;
    try { bem = await pub.readContract({ address: transistors, abi: transistorsAbi, functionName: 'BEM' }); } catch { /* native */ }
    const cost = price * short + fee;
    console.log('mint', short.toString(), 'NAND, cost', cost.toString(), 'bem', bem);

    if (bem && bem !== zeroAddress) {
      const allow = await pub.readContract({
        address: bem, abi: erc20Abi, functionName: 'allowance', args: [account.address, transistors],
      });
      if (allow < cost) {
        const h = await wallet.writeContract({
          address: bem, abi: erc20Abi, functionName: 'approve', args: [transistors, 2n ** 256n - 1n],
          account, chain: xlayer,
        });
        console.log('approve', h);
        await pub.waitForTransactionReceipt({ hash: h });
      }
      const h = await wallet.writeContract({
        address: transistors, abi: transistorsAbi, functionName: 'mint', args: [0n, short],
        account, chain: xlayer,
      });
      console.log('mint tx', h);
      await pub.waitForTransactionReceipt({ hash: h });
    } else {
      const h = await wallet.writeContract({
        address: transistors, abi: transistorsAbi, functionName: 'mint', args: [0n, short], value: cost,
        account, chain: xlayer,
      });
      console.log('mint tx', h);
      await pub.waitForTransactionReceipt({ hash: h });
    }
  }

  const tapeFee = await pub.readContract({ address: CPU, abi: cpuAbi, functionName: 'TAPEOUT_FEE' });
  console.log('tapeFee', formatEther(tapeFee));
  const hash = await wallet.writeContract({
    address: CPU,
    abi: cpuAbi,
    functionName: 'tapeout',
    args: [toHex(compiled.netlist), compiled.nIn, compiled.nOut],
    value: tapeFee,
    account,
    chain: xlayer,
  });
  console.log('tapeout tx', hash);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  console.log('status', receipt.status);

  let circuitId: bigint | null = null;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== CPU.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: cpuAbi, data: log.data, topics: log.topics });
      if (ev.eventName === 'TapedOut') {
        circuitId = ev.args.circuitId as bigint;
        console.log('circuitId', circuitId.toString(), 'gates', ev.args.gateCount);
      }
    } catch { /* other logs */ }
  }
  if (!circuitId) throw new Error('no circuit id');
  console.log('CPU', CPU);
  console.log('CIRCUIT', circuitId.toString());
  console.log('OWNER', account.address);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
