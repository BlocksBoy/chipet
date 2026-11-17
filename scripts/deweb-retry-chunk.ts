import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPublicClient, createWalletClient, http, parseAbi, type Hex, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { xlayer } from '../packages/chain/src/networks.ts';

const REGISTRY = '0xd6EFb7adCc9c83dC4924Ad56f6a8E4e969b9ADB6' as const;
const OPENER = '0x536adD8F30f03b69f6fbF29d425A816A0dC50106' as const;
const registryAbi = parseAbi([
  'function fileInfo(address c, string path) view returns (uint32, string, bytes32, uint40, uint256)',
  'function putFile(address c, string path, string contentType, bytes32 sha256Hash, bytes data)',
  'function appendChunk(address c, string path, uint256 expectIndex, bytes data)',
]);
const openerAbi = parseAbi(['function accountOf(address,uint256) view returns (address)']);

async function main() {
  const raw = process.env.X_LAYER_PRIVATE_KEY || process.env.PRIVATE_KEY!;
  const pk = (raw.startsWith('0x') ? raw : `0x${raw}`) as Hex;
  const account = privateKeyToAccount(pk);
  const pub = createPublicClient({ chain: xlayer, transport: http('https://rpc.xlayer.tech') });
  const wallet = createWalletClient({ account, chain: xlayer, transport: http('https://rpc.xlayer.tech') });
  const root = new URL('..', import.meta.url).pathname;
  const m = JSON.parse(readFileSync(join(root, 'contracts/deweb/manifest.json'), 'utf8')) as {
    circuits: Address; id: number; paths: string[]; types: string[]; hashes: Hex[]; chunks: number[];
  };
  const fi = m.paths.findIndex((p) => p.includes('metamask-sdk'));
  const path = m.paths[fi]!;
  const container = await pub.readContract({
    address: OPENER, abi: openerAbi, functionName: 'accountOf', args: [m.circuits, BigInt(m.id)],
  });
  const info = await pub.readContract({
    address: REGISTRY, abi: registryAbi, functionName: 'fileInfo', args: [container, path],
  });
  console.log('onchain fileInfo', { ver: info[0], type: info[1], hash: info[2], updated: info[3], chunks: info[4].toString() });
  console.log('want chunks', m.chunks[fi], 'hash', m.hashes[fi]);

  // Re-put from scratch with high gas, then append all
  const deweb = join(root, 'contracts/deweb');
  const chunk0 = readFileSync(join(deweb, `${fi}-0.bin`));
  console.log('re-putFile with gas 8_000_000');
  let hash = await wallet.writeContract({
    address: REGISTRY, abi: registryAbi, functionName: 'putFile',
    args: [container, path, m.types[fi]!, m.hashes[fi]!, `0x${chunk0.toString('hex')}` as Hex],
    account, chain: xlayer, gas: 8_000_000n,
  });
  let receipt = await pub.waitForTransactionReceipt({ hash });
  console.log('putFile', receipt.status, hash);

  for (let c = 1; c < m.chunks[fi]!; c++) {
    const data = readFileSync(join(deweb, `${fi}-${c}.bin`));
    console.log('append', c, 'size', data.length);
    // estimate first
    try {
      const est = await pub.estimateContractGas({
        address: REGISTRY, abi: registryAbi, functionName: 'appendChunk',
        args: [container, path, BigInt(c), `0x${data.toString('hex')}` as Hex],
        account: account.address,
      });
      console.log('  est gas', est.toString());
    } catch (e) {
      console.error('  estimate failed', e instanceof Error ? e.message.slice(0, 300) : e);
    }
    hash = await wallet.writeContract({
      address: REGISTRY, abi: registryAbi, functionName: 'appendChunk',
      args: [container, path, BigInt(c), `0x${data.toString('hex')}` as Hex],
      account, chain: xlayer, gas: 8_000_000n,
    });
    receipt = await pub.waitForTransactionReceipt({ hash });
    console.log('  status', receipt.status, hash);
    if (receipt.status !== 'success') throw new Error(`append ${c} failed`);
  }
  console.log('metamask ok');
}

main().catch((e) => { console.error(e); process.exit(1); });
