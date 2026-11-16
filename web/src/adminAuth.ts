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

export type AdminScanJob = {
  chainId: number;
  status: 'idle' | 'running' | 'done' | 'error';
  full: boolean;
  startedAt: number;
  updatedAt: number;
  error?: string;
  scannedTo?: string;
  head?: string;
  complete?: boolean;
};

export type AdminStatsPayload = {
  id?: number;
  chainId: number;
  cats: number;
  /** 全局独立钱包地址数（连钱包注册；非扫链孵化地址） */
  registered: number;
  /** 本链最近一次连接归因的地址数 */
  registeredOnChain?: number;
  walletRegistered?: number;
  players: number;
  rechargeUsers: number;
  rechargeTxs: number;
  rechargeBem: string;
  /** 商店主动上报的笔数（不含历史扫链冻结） */
  reportedTxs?: number;
  treasuryBal: string;
  scannedTo: string;
  scannedFrom?: string;
  scanMode?: 'incremental' | 'full' | 'noop';
  complete?: boolean;
  head?: string;
  rpcHost: string;
  note: string;
  createdAt?: number;
  source?: 'cache' | 'live';
  empty?: boolean;
  job?: AdminScanJob;
};

/** empty 扫链快照仍可能带钱包注册 / 上报充值，归一成可展示的 stats。 */
export function coalesceAdminStats(s: AdminStatsPayload): AdminStatsPayload | null {
  if (!s.empty) return s;
  const registered = Number(s.registered ?? s.walletRegistered ?? 0);
  const walletRegistered = Number(s.walletRegistered ?? 0);
  const rechargeTxs = Number(s.rechargeTxs ?? 0);
  const rechargeUsers = Number(s.rechargeUsers ?? 0);
  if (!registered && !s.registeredOnChain && !rechargeTxs && !rechargeUsers) return null;
  return {
    chainId: s.chainId,
    empty: true,
    cats: 0,
    registered,
    registeredOnChain: Number(s.registeredOnChain ?? 0),
    walletRegistered,
    players: 0,
    rechargeUsers,
    rechargeTxs,
    rechargeBem: String(s.rechargeBem ?? '0'),
    reportedTxs: Number(s.reportedTxs ?? 0),
    treasuryBal: '0',
    scannedTo: '0',
    rpcHost: '',
    note: s.note ?? '',
    job: s.job,
  };
}

export async function adminLogin(token: string) {
  let r: Response;
  try {
    r = await fetch(apiURL('/api/admin/login'), {
      method: 'POST',
      cache: 'no-store',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    });
  } catch {
    throw Object.assign(new Error('后端未启动（请 npm run dev 或先开 npm run dev:server）'), { status: 0 });
  }
  const data = await readJson(r);
  if (!r.ok) {
    const unreachable = r.status >= 500 && !data.error;
    const msg = data.error
      || (unreachable ? '后端未启动或暂时不可用（请 npm run dev 或先开 npm run dev:server）' : `HTTP ${r.status}`);
    const err = new Error(msg) as Error & { status?: number; code?: string };
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
  const q = new URLSearchParams({ chainId: String(chainId) });
  const r = await fetch(apiURL(`/api/admin/stats?${q}`), { cache: 'no-store', credentials: 'include' });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data.error || `HTTP ${r.status}`) as Error & { status?: number; code?: string };
    err.status = r.status;
    err.code = data.code;
    throw err;
  }
  return data as AdminStatsPayload;
}

/** 启动后台扫链（立即返回，需轮询 adminStats） */
export async function adminStartScan(chainId: number, opts?: { full?: boolean }) {
  const q = new URLSearchParams({ chainId: String(chainId) });
  if (opts?.full) q.set('full', '1');
  const r = await fetch(apiURL(`/api/admin/stats/scan?${q}`), {
    method: 'POST',
    cache: 'no-store',
    credentials: 'include',
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data.error || `HTTP ${r.status}`) as Error & { status?: number; code?: string };
    err.status = r.status;
    err.code = data.code;
    throw err;
  }
  return data as { ok: boolean; job: AdminScanJob; stats: AdminStatsPayload | null };
}

export async function adminStatsHistory(chainId: number, limit = 10) {
  const q = new URLSearchParams({ chainId: String(chainId), limit: String(limit) });
  const r = await fetch(apiURL(`/api/admin/stats/history?${q}`), { cache: 'no-store', credentials: 'include' });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data.error || `HTTP ${r.status}`) as Error & { status?: number; code?: string };
    err.status = r.status;
    err.code = data.code;
    throw err;
  }
  return data as { chainId: number; items: AdminStatsPayload[] };
}

export type ArchivedPet = {
  chainId: number;
  petId: number;
  owner: string;
  name: string;
  cpu: string;
  circuitId: string;
  rarity: number;
  energy: number;
  mood: number;
  intimacy: number;
  level: number;
  lastFeed: number;
  lastPlay: number;
  gates: number | null;
  nIn: number | null;
  nOut: number | null;
  firstSeen: number;
  updatedAt: number;
};

export type AdminCatsFilter = {
  chainId?: number;
  rarity?: number | null;
  levelMin?: number | null;
  levelMax?: number | null;
  energyMin?: number | null;
  energyMax?: number | null;
};

/** 默认拉全链一张表；可传 chainId / 稀有度 / 等级 / 能量筛选 */
export async function adminCats(page = 1, pageSize = 20, filter?: number | AdminCatsFilter) {
  const f: AdminCatsFilter = typeof filter === 'number' ? { chainId: filter } : (filter ?? {});
  const q = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (f.chainId != null) q.set('chainId', String(f.chainId));
  else q.set('chainId', 'all');
  if (f.rarity != null) q.set('rarity', String(f.rarity));
  if (f.levelMin != null) q.set('levelMin', String(f.levelMin));
  if (f.levelMax != null) q.set('levelMax', String(f.levelMax));
  if (f.energyMin != null) q.set('energyMin', String(f.energyMin));
  if (f.energyMax != null) q.set('energyMax', String(f.energyMax));
  const r = await fetch(apiURL(`/api/admin/cats?${q}`), { cache: 'no-store', credentials: 'include' });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data.error || `HTTP ${r.status}`) as Error & { status?: number; code?: string };
    err.status = r.status;
    err.code = data.code;
    throw err;
  }
  return data as {
    chainId: number | 'all';
    archived: number;
    items: ArchivedPet[];
    total: number;
    page: number;
    pageSize: number;
    pages: number;
  };
}

/** 从链上全量拉取宠物属性写入 SQLite；默认双链一起同步 */
export async function adminSyncCats(chainId?: number) {
  const q = new URLSearchParams();
  if (chainId != null) q.set('chainId', String(chainId));
  else q.set('chainId', 'all');
  const r = await fetch(apiURL(`/api/admin/cats/sync?${q}`), {
    method: 'POST',
    cache: 'no-store',
    credentials: 'include',
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data.error || `HTTP ${r.status}`) as Error & { status?: number; code?: string };
    err.status = r.status;
    err.code = data.code;
    throw err;
  }
  return data as {
    ok: boolean;
    archived: number;
    results: Array<Record<string, unknown>>;
  };
}
