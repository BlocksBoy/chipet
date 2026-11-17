// 按文件逐笔上传 contracts/deweb/ 到 X Layer SiteRegistry（避开 forge 整段模拟 OOG）。
//   X_LAYER_PRIVATE_KEY=… npx tsx scripts/deweb-publish.ts
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createPublicClient, createWalletClient, http, parseAbi, formatEther,
  type Hex, type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { xlayer } from '../packages/chain/src/networks.ts';

const OPENER = '0x536adD8F30f03b69f6fbF29d425A816A0dC50106' as const;
const REGISTRY = '0xd6EFb7adCc9c83dC4924Ad56f6a8E4e969b9ADB6' as const;
const BINDING = '0x68809Fd2fb343aA57D0aeB7f33Defe477c9666f9' as const;
const ENTRY = 'index.html';
const CHUNK = 24_000;

const openerAbi = parseAbi([
  'function FEE() view returns (uint256)',
  'function accountOf(address circuits, uint256 id) view returns (address)',
  'function isDeployed(address circuits, uint256 id) view returns (bool)',
  'function open(address circuits, uint256 id) payable returns (address)',
]);
const registryAbi = parseAbi([
  'function fileInfo(address c, string path) view returns (uint32, string, bytes32, uint40, uint256)',
  'function paths(address c) view returns (string[])',
  'function fallbackPath(address c) view returns (string)',
  'function putFile(address c, string path, string contentType, bytes32 sha256Hash, bytes data)',
  'function appendChunk(address c, string path, uint256 expectIndex, bytes data)',
  'function removeFile(address c, string path)',
  'function setFallback(address c, string path)',
]);
const bindingAbi = parseAbi([
  'function monthlyFee() view returns (uint256)',
  'function isContainerLive(address c) view returns (bool)',
  'function bind(string name, address c, uint256 months) payable',
]);

type Manifest = {
  circuits: Address;
  id: number;
  name: string;
  paths: string[];
  types: string[];
  hashes: Hex[];
  chunks: number[];
};

async function main() {
  const raw = process.env.X_LAYER_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (!raw) throw new Error('缺少 X_LAYER_PRIVATE_KEY');
  const pk = (raw.startsWith('0x') ? raw : `0x${raw}`) as Hex;
  const account = privateKeyToAccount(pk);
  const pub = createPublicClient({ chain: xlayer, transport: http('https://rpc.xlayer.tech') });
  const wallet = createWalletClient({ account, chain: xlayer, transport: http('https://rpc.xlayer.tech') });

  const root = new URL('..', import.meta.url).pathname;
  const deweb = join(root, 'contracts/deweb');
  const m = JSON.parse(readFileSync(join(deweb, 'manifest.json'), 'utf8')) as Manifest;
  const circuits = m.circuits;
  const id = BigInt(m.id);
  const container = await pub.readContract({ address: OPENER, abi: openerAbi, functionName: 'accountOf', args: [circuits, id] });

  console.log('site', `tape://${m.name}`);
  console.log('owner', account.address);
  console.log('container', container);
  console.log('okb', formatEther(await pub.getBalance({ address: account.address })));

  const opened = await pub.readContract({ address: OPENER, abi: openerAbi, functionName: 'isDeployed', args: [circuits, id] });
  if (!opened) {
    const fee = await pub.readContract({ address: OPENER, abi: openerAbi, functionName: 'FEE' });
    console.log('opening container, fee', formatEther(fee));
    const hash = await wallet.writeContract({
      address: OPENER, abi: openerAbi, functionName: 'open', args: [circuits, id], value: fee, account, chain: xlayer,
    });
    await pub.waitForTransactionReceipt({ hash });
    console.log('opened', hash);
  } else {
    console.log('container already open');
  }

  const readChunk = (fi: number, c: number) =>
    readFileSync(join(deweb, `${fi}-${c}.bin`)) as Buffer;

  for (let f = 0; f < m.paths.length; f++) {
    const path = m.paths[f]!;
    const type = m.types[f]!;
    const hash = m.hashes[f]!;
    const n = m.chunks[f]!;
    const [, , onHash, , onChunks] = await pub.readContract({
      address: REGISTRY, abi: registryAbi, functionName: 'fileInfo', args: [container, path],
    });
    if (onHash === hash && Number(onChunks) === n) {
      console.log('skip', path);
      continue;
    }

    const first = readChunk(f, 0);
    // sanity: recompute sha of full file from chunks
    const full = Buffer.concat(Array.from({ length: n }, (_, c) => readChunk(f, c)));
    const sha = `0x${createHash('sha256').update(full).digest('hex')}` as Hex;
    if (sha !== hash) throw new Error(`hash mismatch ${path}`);

    const bal = await pub.getBalance({ address: account.address });
    if (bal < 10n ** 14n) throw new Error(`OKB 不足（${formatEther(bal)}），请先充值后再续传`);

    // 不完整旧文件先整文件重传
    console.log('putFile', path, `${full.length}B / ${n} chunks`);
    const putArgs = [container, path, type, hash, `0x${first.toString('hex')}` as Hex] as const;
    let gas = await pub.estimateContractGas({
      address: REGISTRY, abi: registryAbi, functionName: 'putFile', args: [...putArgs], account: account.address,
    });
    gas = (gas * 13n) / 10n;
    let tx = await wallet.writeContract({
      address: REGISTRY, abi: registryAbi, functionName: 'putFile', args: [...putArgs],
      account, chain: xlayer, gas,
    });
    let receipt = await pub.waitForTransactionReceipt({ hash: tx });
    if (receipt.status !== 'success') throw new Error(`putFile failed ${path} ${tx}`);

    for (let c = 1; c < n; c++) {
      const chunk = readChunk(f, c);
      console.log('  append', path, c);
      const args = [container, path, BigInt(c), `0x${chunk.toString('hex')}` as Hex] as const;
      gas = await pub.estimateContractGas({
        address: REGISTRY, abi: registryAbi, functionName: 'appendChunk', args: [...args], account: account.address,
      });
      gas = (gas * 13n) / 10n;
      tx = await wallet.writeContract({
        address: REGISTRY, abi: registryAbi, functionName: 'appendChunk', args: [...args],
        account, chain: xlayer, gas,
      });
      receipt = await pub.waitForTransactionReceipt({ hash: tx });
      if (receipt.status !== 'success') throw new Error(`append failed ${path}#${c} ${tx}`);
    }
  }

  if (!process.env.KEEP_OLD) {
    const onchain = await pub.readContract({ address: REGISTRY, abi: registryAbi, functionName: 'paths', args: [container] });
    const keep = new Set(m.paths);
    for (const p of onchain) {
      if (keep.has(p)) continue;
      console.log('remove', p);
      const tx = await wallet.writeContract({
        address: REGISTRY, abi: registryAbi, functionName: 'removeFile', args: [container, p], account, chain: xlayer,
      });
      await pub.waitForTransactionReceipt({ hash: tx });
    }
  }

  const fb = await pub.readContract({ address: REGISTRY, abi: registryAbi, functionName: 'fallbackPath', args: [container] });
  if (fb !== ENTRY) {
    console.log('setFallback', ENTRY);
    const tx = await wallet.writeContract({
      address: REGISTRY, abi: registryAbi, functionName: 'setFallback', args: [container, ENTRY], account, chain: xlayer,
    });
    await pub.waitForTransactionReceipt({ hash: tx });
  }

  let live = false;
  try {
    live = await pub.readContract({ address: BINDING, abi: bindingAbi, functionName: 'isContainerLive', args: [container] });
  } catch { /* older */ }
  if (!live) {
    const months = BigInt(process.env.MONTHS || '12');
    const monthly = await pub.readContract({ address: BINDING, abi: bindingAbi, functionName: 'monthlyFee' });
    const value = months * monthly;
    console.log('bind', m.name, 'months', months.toString(), 'fee', formatEther(value));
    const tx = await wallet.writeContract({
      address: BINDING, abi: bindingAbi, functionName: 'bind', args: [m.name, container, months], value, account, chain: xlayer,
    });
    await pub.waitForTransactionReceipt({ hash: tx });
  }

  console.log('done');
  console.log('container', container);
  console.log('site', `tape://${m.name}`);
  console.log('gateway', `https://1-422.tapekit.org/`);
  console.log('gateway-xlayer', `https://1-2-422.tapekit.org/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
