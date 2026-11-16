import { createPublicClient, http, type Address, type PublicClient } from 'viem';
import { CHAINS, ChainLibrary, deploymentFor, fetchBounty, listBounties, listComponents, type Deployment } from '@tapearena/chain';

export interface ChainCtx {
  chainId: number;
  client: PublicClient;
  lib: ChainLibrary;
  deployment: Deployment | undefined;
}

const ctxs = new Map<number, ChainCtx>();

export function rpcFor(chainId: number): string {
  const env = process.env[`RPC_URL_${chainId}`] ?? (chainId === 196 ? process.env.RPC_URL : undefined);
  if (env) return env;
  const chain = CHAINS[chainId as keyof typeof CHAINS];
  if (!chain) throw new HttpError(400, `不支持的链 ${chainId}`);
  return chain.rpcUrls.default.http[0];
}

/** 展示用：只回主机名，避免把 Alchemy key 泄露到 Admin 前端。 */
export function rpcHostLabel(chainId: number): string {
  try {
    return new URL(rpcFor(chainId)).host;
  } catch {
    return 'unknown';
  }
}

export function chainCtx(chainId = Number(process.env.CHAIN_ID ?? 196)): ChainCtx {
  let c = ctxs.get(chainId);
  if (!c) {
    const url = rpcFor(chainId);
    const client = createPublicClient({
      transport: http(url, { batch: true, retryCount: 3, timeout: 30_000 }),
    }) as PublicClient;
    c = { chainId, client, lib: new ChainLibrary(client), deployment: deploymentFor(chainId) };
    ctxs.set(chainId, c);
  }
  return c;
}

/** 热更新 .env 后清缓存，让 Admin 立刻用上新 RPC。 */
export function resetChainCtx(chainId?: number) {
  if (chainId == null) ctxs.clear();
  else ctxs.delete(chainId);
}

export class HttpError extends Error {
  constructor(public status: 400 | 401 | 404 | 422 | 429 | 502 | 503, message: string) { super(message); }
}

export function arenaOf(c: ChainCtx): Address {
  if (!c.deployment?.arena) throw new HttpError(503, `链 ${c.chainId} 上还没有部署 TapeArena`);
  return c.deployment.arena;
}

export function libraryOf(c: ChainCtx): Address {
  if (!c.deployment?.library) throw new HttpError(503, `链 ${c.chainId} 上还没有部署组件库`);
  return c.deployment.library;
}

/** 列表类读链做短 TTL 缓存，避免前端轮询把公共 RPC 打满。 */
const ttl = new Map<string, { at: number; v: Promise<unknown> }>();
function cached<T>(key: string, ms: number, f: () => Promise<T>): Promise<T> {
  const hit = ttl.get(key);
  if (hit && Date.now() - hit.at < ms) return hit.v as Promise<T>;
  const v = f().catch((e) => { ttl.delete(key); throw e; });
  ttl.set(key, { at: Date.now(), v });
  return v;
}

export const bountiesOf = (c: ChainCtx) => cached(`b:${c.chainId}`, 8000, () => listBounties(c.client, arenaOf(c)));
export const bountyOf = (c: ChainCtx, id: number) => cached(`b:${c.chainId}:${id}`, 5000, () => fetchBounty(c.client, arenaOf(c), id));
export const componentsOf = (c: ChainCtx) => cached(`c:${c.chainId}`, 15000, () => listComponents(c.client, libraryOf(c)));
