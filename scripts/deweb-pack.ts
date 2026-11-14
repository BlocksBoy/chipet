// 把 web/dist-deweb 切成 SiteRegistry 的 24,000 字节分块，写出 contracts/deweb/ 给 PublishSite.s.sol 用。
//   npx tsx scripts/deweb-pack.ts <处理器合约地址> <电路 #ID> [构建目录]
// 只读链（算链上名字、对比已上传的文件），不签名、不碰私钥。

import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { createPublicClient, getAddress, http, parseAbi, type Hex } from 'viem';
import { CHAINS } from '../packages/chain/src/index.ts';

const FACTORY = '0x1f09DAeFA827f02CBb40967cc91b259763760761';
const OPENER = '0x536add8f30f03b69f6fbf29d425a816a0dc50106';
const REGISTRY = '0xd6efb7adcc9c83dc4924ad56f6a8e4e969b9adb6';
const CHUNK = 24_000;

const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  ico: 'image/x-icon',
  woff2: 'font/woff2',
  txt: 'text/plain; charset=utf-8',
};

const [circuitsArg, idArg, distArg] = process.argv.slice(2);
if (!circuitsArg || !idArg) {
  console.error('用法: npx tsx scripts/deweb-pack.ts <处理器合约地址> <电路 #ID> [构建目录]');
  process.exit(1);
}
const circuits = getAddress(circuitsArg);
const id = BigInt(idArg);
const root = new URL('..', import.meta.url).pathname;
const dist = resolve(root, distArg ?? 'web/dist-deweb');
const out = join(root, 'contracts/deweb');

const pub = createPublicClient({ chain: CHAINS[196], transport: http(process.env.RPC_URL ?? 'https://rpc.xlayer.tech') });

const factoryAbi = parseAbi(['function cpuCount() view returns (uint256)', 'function cpuAt(uint256) view returns (address)']);
const openerAbi = parseAbi(['function accountOf(address,uint256) view returns (address)', 'function isDeployed(address,uint256) view returns (bool)', 'function FEE() view returns (uint256)']);
const registryAbi = parseAbi(['function fileInfo(address,string) view returns (uint32,string,bytes32,uint40,uint256)']);
const ownerAbi = parseAbi(['function ownerOf(uint256) view returns (address)']);

async function processorIndex(): Promise<number> {
  const n = Number(await pub.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'cpuCount' }));
  for (let from = n - 1; from >= 0; from -= 64) {
    const idx = Array.from({ length: Math.min(64, from + 1) }, (_, k) => from - k);
    const addrs = await Promise.all(idx.map((i) => pub.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'cpuAt', args: [BigInt(i)] })));
    const hit = addrs.findIndex((a) => getAddress(a) === circuits);
    if (hit >= 0) return idx[hit];
  }
  throw new Error(`${circuits} 不是官方工厂创建的处理器`);
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = walk(dist)
  .map((p) => relative(dist, p).split('\\').join('/'))
  .filter((p) => !p.startsWith('.tape/') && p !== 'sw.js')
  .sort((a, b) => Number(a === 'index.html') - Number(b === 'index.html') || a.localeCompare(b));
if (!files.includes('index.html')) throw new Error(`${dist} 里没有 index.html，先运行 npm run build:deweb -w web`);

const [index, owner, container] = await Promise.all([
  processorIndex(),
  pub.readContract({ address: circuits, abi: ownerAbi, functionName: 'ownerOf', args: [id] }),
  pub.readContract({ address: OPENER, abi: openerAbi, functionName: 'accountOf', args: [circuits, id] }),
]);
const [opened, openFee] = await Promise.all([
  pub.readContract({ address: OPENER, abi: openerAbi, functionName: 'isDeployed', args: [circuits, id] }),
  pub.readContract({ address: OPENER, abi: openerAbi, functionName: 'FEE' }),
]);
const name = `${id}.${index}.tape`;

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const paths: string[] = [], types: string[] = [], hashes: Hex[] = [], chunks: number[] = [];
let upload = 0, uploadBytes = 0;
for (const [fi, path] of files.entries()) {
  const data = readFileSync(join(dist, path));
  const hash = `0x${createHash('sha256').update(data).digest('hex')}` as Hex;
  const n = Math.max(1, Math.ceil(data.length / CHUNK));
  for (let c = 0; c < n; c++) writeFileSync(join(out, `${fi}-${c}.bin`), data.subarray(c * CHUNK, (c + 1) * CHUNK));
  paths.push(path);
  types.push(TYPES[path.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream');
  hashes.push(hash);
  chunks.push(n);

  const [, , onchainHash, , onchainChunks] = opened
    ? await pub.readContract({ address: REGISTRY, abi: registryAbi, functionName: 'fileInfo', args: [container, path] })
    : [0, '', '0x', 0, 0n];
  const same = onchainHash === hash && Number(onchainChunks) === n;
  if (!same) (upload++, (uploadBytes += data.length));
  console.log(`${same ? '  已是最新' : '  待上传  '} ${path}  ${data.length} 字节 / ${n} 块`);
}

writeFileSync(join(out, 'manifest.json'), JSON.stringify({ circuits, id: Number(id), name, paths, types, hashes, chunks }, null, 2));

console.log(`
链上名字   ${name}   （访问：tape://${name}）
电路持有人 ${owner}   ← 必须用这个钱包签名
容器       ${container}  ${opened ? '已开通' : `未开通，脚本会付 ${Number(openFee) / 1e18} OKB 开通`}
待上传     ${upload} 个文件，${(uploadBytes / 1024).toFixed(0)} KB
分块已写到 contracts/deweb/，下一步：
  cd contracts && forge script script/PublishSite.s.sol --rpc-url xlayer --broadcast --slow --account <你的 keystore 名> --sender ${owner}`);
