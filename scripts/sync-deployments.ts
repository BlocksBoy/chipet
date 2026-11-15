// 把 forge 部署脚本写出的 contracts/deployments/<chainId>.json 合并进前端读取的 deployments.json。
//   npx tsx scripts/sync-deployments.ts

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { zeroAddress } from 'viem';

const dir = new URL('../contracts/deployments/', import.meta.url);
const target = new URL('../packages/chain/src/deployments.json', import.meta.url);
const all = JSON.parse(readFileSync(target, 'utf8')) as Record<string, Record<string, unknown>>;

if (existsSync(dir)) {
  for (const f of readdirSync(dir).filter((x) => /^\d+\.json$/.test(x))) {
    const d = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
    const id = String(d.chainId);
    all[id] = {
      ...all[id],
      chainId: Number(id),
      factory: d.factory,
      arena: d.arena,
      library: d.library,
      ...(d.cpu && d.cpu !== zeroAddress ? { cpu: d.cpu } : {}),
      ...(d.chipet && d.chipet !== zeroAddress ? { chipet: d.chipet } : {}),
      deployedAt: new Date().toISOString(),
    };
    console.log(`链 ${id}: arena ${d.arena} library ${d.library}`);
  }
  for (const f of readdirSync(dir).filter((x) => /^\d+-chipet\.json$/.test(x))) {
    const d = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
    const id = String(d.chainId);
    all[id] = {
      ...all[id],
      chainId: Number(id),
      ...(d.factory ? { factory: d.factory } : {}),
      ...(d.cpu && d.cpu !== zeroAddress ? { cpu: d.cpu } : {}),
      ...(d.chipet && d.chipet !== zeroAddress ? { chipet: d.chipet } : {}),
      deployedAt: new Date().toISOString(),
    };
    console.log(`链 ${id}: chipet ${d.chipet}${d.cpu ? ` cpu ${d.cpu}` : ''}`);
  }
}
writeFileSync(target, JSON.stringify(all, null, 2) + '\n');
