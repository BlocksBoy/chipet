import { createPublicClient, http, parseAbi, formatEther, type Address, type Hex } from 'viem';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { xlayer } from '../packages/chain/src/networks.ts';

const REGISTRY = '0xd6EFb7adCc9c83dC4924Ad56f6a8E4e969b9ADB6' as const;
const OPENER = '0x536adD8F30f03b69f6fbF29d425A816A0dC50106' as const;
const BINDING = '0x68809Fd2fb343aA57D0aeB7f33Defe477c9666f9' as const;
const registryAbi = parseAbi([
  'function fileInfo(address c, string path) view returns (uint32, string, bytes32, uint40, uint256)',
  'function paths(address c) view returns (string[])',
  'function fallbackPath(address c) view returns (string)',
]);
const openerAbi = parseAbi([
  'function accountOf(address,uint256) view returns (address)',
  'function isDeployed(address,uint256) view returns (bool)',
]);
const bindingAbi = parseAbi(['function isContainerLive(address c) view returns (bool)']);

async function main() {
  const root = new URL('..', import.meta.url).pathname;
  const m = JSON.parse(readFileSync(join(root, 'contracts/deweb/manifest.json'), 'utf8')) as {
    circuits: Address; id: number; name: string; paths: string[]; hashes: Hex[]; chunks: number[];
  };
  const pub = createPublicClient({ chain: xlayer, transport: http('https://rpc.xlayer.tech') });
  const owner = '0xBd435f285916F437A2971D62233F08d1f1434e00' as const;
  const container = await pub.readContract({
    address: OPENER, abi: openerAbi, functionName: 'accountOf', args: [m.circuits, BigInt(m.id)],
  });
  const opened = await pub.readContract({
    address: OPENER, abi: openerAbi, functionName: 'isDeployed', args: [m.circuits, BigInt(m.id)],
  });
  let live = false;
  try { live = await pub.readContract({ address: BINDING, abi: bindingAbi, functionName: 'isContainerLive', args: [container] }); } catch {}
  const bal = await pub.getBalance({ address: owner });
  const onchain = await pub.readContract({ address: REGISTRY, abi: registryAbi, functionName: 'paths', args: [container] });
  let ok = 0, partial = 0, missing = 0;
  const bad: string[] = [];
  for (let i = 0; i < m.paths.length; i++) {
    const path = m.paths[i]!;
    const [, , hash, , chunks] = await pub.readContract({
      address: REGISTRY, abi: registryAbi, functionName: 'fileInfo', args: [container, path],
    });
    if (hash === m.hashes[i] && Number(chunks) === m.chunks[i]) ok++;
    else if (Number(chunks) > 0) { partial++; bad.push(`${path} ${chunks}/${m.chunks[i]}`); }
    else missing++;
  }
  let fb = '';
  try { fb = await pub.readContract({ address: REGISTRY, abi: registryAbi, functionName: 'fallbackPath', args: [container] }); } catch {}
  console.log(JSON.stringify({
    site: `tape://${m.name}`,
    container, opened, live, fallback: fb,
    okb: formatEther(bal),
    onchainFiles: onchain.length,
    manifestFiles: m.paths.length,
    ok, partial, missing,
    partialSamples: bad.slice(0, 10),
  }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
