// 用 X Layer 主网上真实流片的电路对拍：本地 JS 仿真 vs 链上 eval/step，逐位比较。
//   npx tsx packages/chain/scripts/crosscheck.ts [处理器数量] [每台电路数]

import { createPublicClient, http, type Address } from 'viem';
import { packBits, unpackBits, step as jsStep, rng, toHex, fromHex } from '@tapearena/netlist';
import { ChainLibrary, cpuAbi, factoryAbi, xlayer, XLAYER_TAPEOUT_FACTORY } from '../src/index.ts';

const nCpus = Number(process.argv[2] ?? 8);
const perCpu = Number(process.argv[3] ?? 4);
const client = createPublicClient({ chain: xlayer, transport: http('https://rpc.xlayer.tech', { batch: true, retryCount: 4 }) });
const lib = new ChainLibrary(client);
const r = rng(Number(process.argv[4] ?? 2026));

const total = Number(await client.readContract({ address: XLAYER_TAPEOUT_FACTORY, abi: factoryAbi, functionName: 'cpuCount' }));
console.log(`X Layer 上共有 ${total} 台处理器，抽查 ${nCpus} 台，每台最多 ${perCpu} 枚电路`);

let checked = 0, mismatches = 0, circuits = 0, withRef = 0, withLatch = 0;
const picks = new Set<number>();
while (picks.size < Math.min(nCpus, total)) picks.add(Math.floor(r() * total));

for (const ci of picks) {
  const cpu = await client.readContract({ address: XLAYER_TAPEOUT_FACTORY, abi: factoryAbi, functionName: 'cpuAt', args: [BigInt(ci)] }) as Address;
  const next = Number(await client.readContract({ address: cpu, abi: cpuAbi, functionName: 'nextId' }));
  if (next === 0) continue;
  const ids = new Set<number>();
  while (ids.size < Math.min(perCpu, next)) ids.add(1 + Math.floor(r() * next));
  for (const id of ids) {
    let c;
    try {
      c = await lib.resolved(cpu, BigInt(id));
    } catch (e) {
      console.log(`  跳过 cpu#${ci} 电路#${id}: ${(e as Error).message.slice(0, 80)}`);
      continue;
    }
    if (c.nIn > 4096 || c.gateCount > 20000) continue;
    circuits++;
    if (c.elements.some((e) => e.op === 'ref')) withRef++;
    if (c.nState > 0) withLatch++;
    for (let t = 0; t < 3; t++) {
      const inputs = packBits(Array.from({ length: c.nIn }, () => (r() < 0.5 ? 1 : 0)));
      const state = packBits(Array.from({ length: c.nState }, () => (r() < 0.5 ? 1 : 0)));
      const local = jsStep(c, state, inputs, lib);
      const [chainState, chainOut] = await client.readContract({
        address: cpu, abi: cpuAbi, functionName: 'step', args: [BigInt(id), toHex(state), toHex(inputs)],
      });
      const okOut = unpackBits(local.outputs, c.nOut).join('') === unpackBits(fromHex(chainOut), c.nOut).join('');
      const okState = unpackBits(local.state, c.nState).join('') === unpackBits(fromHex(chainState), c.nState).join('');
      checked++;
      if (!okOut || !okState) {
        mismatches++;
        console.log(`  ✗ 不一致 cpu#${ci} ${cpu} 电路#${id} nIn=${c.nIn} nOut=${c.nOut} nState=${c.nState}`);
      }
    }
    console.log(`  ✓ cpu#${ci} 电路#${id}  门数 ${c.gateCount}  输入 ${c.nIn}  输出 ${c.nOut}  寄存器 ${c.nState}`);
  }
}

console.log(`\n对拍 ${circuits} 枚电路（含 REF ${withRef} 枚、含寄存器 ${withLatch} 枚），共 ${checked} 次求值，不一致 ${mismatches} 次`);
process.exit(mismatches ? 1 : 0);
