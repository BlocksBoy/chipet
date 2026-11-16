/**
 * 运营后台登录（对齐 hbtc）：口令换 HttpOnly Cookie，不把 ADMIN_TOKEN 存 localStorage。
 */
import { DEWEB } from './env.ts';

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

function apiURL(path: string): string {
  if (DEWEB && !BASE) throw new Error('Backend API is not configured (VITE_API_URL)');
  return `${BASE}${path}`;
}

async function readJson(r: Response) {
  return r.json().catch(() => ({})) as Promise<{ error?: string; code?: string; ok?: boolean; expiresIn?: number }>;
}

export async function adminLogin(token: string) {
  const r = await fetch(apiURL('/api/admin/login'), {
    method: 'POST',
    cache: 'no-store',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  const data = await readJson(r);
  if (!r.ok) {
    const err = new Error(data.error || `HTTP ${r.status}`) as Error & { status?: number; code?: string };
    err.status = r.status;
    err.code = data.code;
    throw err;
  }
  return data;
}

export async function adminLogout() {
  try {
    await fetch(apiURL('/api/admin/logout'), { method: 'POST', cache: 'no-store', credentials: 'include' });
  } catch {
    /* ignore */
  }
}

export async function adminSession(): Promise<boolean> {
  try {
    const r = await fetch(apiURL('/api/admin/session'), { cache: 'no-store', credentials: 'include' });
    return r.ok;
  } catch {
    return false;
  }
}

export async function adminStats(chainId: number) {
  const r = await fetch(apiURL(`/api/admin/stats?chainId=${chainId}`), { cache: 'no-store', credentials: 'include' });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data.error || `HTTP ${r.status}`) as Error & { status?: number; code?: string };
    err.status = r.status;
    err.code = data.code;
    throw err;
  }
  return data as {
    chainId: number;
    cats: number;
    registered: number;
    players: number;
    rechargeUsers: number;
    rechargeTxs: number;
    rechargeBem: string;
    treasuryBal: string;
    scannedTo: string;
    rpcHost: string;
    note: string;
  };
}
