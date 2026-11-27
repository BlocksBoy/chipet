import type { Address, PublicClient } from 'viem';
import { petsOfOwner } from '@tapearena/chain';
import { localChipet } from './store.ts';

/** 前端直读链上的「我的芯宠」：不经后端归档，钱包一连上就从合约拉。 */

let loading = false;
let error: string | null = null;
let rev = 0;
let seq = 0;
const subs = new Set<() => void>();

function bump() {
  rev += 1;
  subs.forEach((fn) => fn());
}

export function subscribeChainPets(fn: () => void) {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

export const getChainPetsRev = () => rev;
export const isChainPetsLoading = () => loading;
export const chainPetsError = () => error;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 读失败时退避重试；被更新的调用顶掉（换钱包/换链）就直接放弃结果。 */
export async function loadChainPets(pub: PublicClient, chipet: Address, owner: Address): Promise<void> {
  const my = ++seq;
  loading = true;
  error = null;
  bump();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const list = await petsOfOwner(pub, chipet, owner);
      if (my !== seq) return;
      localChipet.useWalletCache(owner);
      localChipet.syncChainPets(list);
      loading = false;
      bump();
      return;
    } catch (e) {
      if (my !== seq) return;
      error = e instanceof Error ? e.message : String(e);
      if (attempt < 2) await sleep(1500 * (attempt + 1));
    }
  }
  if (my !== seq) return;
  loading = false;
  bump();
}

/** 断开钱包或当前链没有芯宠合约时，作废进行中的读取。 */
export function cancelChainPets() {
  seq += 1;
  if (loading) {
    loading = false;
    bump();
  }
}
