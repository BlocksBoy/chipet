/**
 * 前端连钱包注册：独立地址入库。
 * 看板「注册人数」= 连钱包地址 ∪ 扫链孵化地址（去重），避免只数新表丢掉历史孵化用户。
 */
import { MAINNET_IDS } from '@tapearena/chain';
import { getAdminDb, getAdminScanCheckpoint } from './adminDb.ts';

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

export function normalizeAddress(raw: string): string | null {
  const a = raw.trim().toLowerCase();
  return ADDR_RE.test(a) ? a : null;
}

function ensureTable() {
  getAdminDb().exec(`
    CREATE TABLE IF NOT EXISTS wallet_users (
      address TEXT PRIMARY KEY,
      chain_id INTEGER NOT NULL DEFAULT 0,
      first_seen INTEGER NOT NULL,
      last_seen INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_wallet_users_chain ON wallet_users(chain_id);
  `);
}

export function listWalletUsers(): { address: string; chainId: number }[] {
  ensureTable();
  const rows = getAdminDb()
    .prepare(`SELECT address, chain_id FROM wallet_users`)
    .all() as { address: string; chain_id: number }[];
  return rows.map((r) => ({ address: r.address, chainId: Number(r.chain_id) }));
}

export function countWalletUsers(): number {
  return listWalletUsers().length;
}

export function countWalletUsersByChain(chainId: number): number {
  return listWalletUsers().filter((w) => w.chainId === chainId).length;
}

/** 全局注册人数 + 本链归因（钱包 last_seen 链 ∪ 本链孵化地址） */
export function overlayRegisteredStats(chainId: number): {
  registered: number;
  registeredOnChain: number;
  walletRegistered: number;
} {
  const wallets = listWalletUsers();
  const global = new Set(wallets.map((w) => w.address));
  for (const id of MAINNET_IDS) {
    const cp = getAdminScanCheckpoint(id);
    for (const h of cp?.hatchers ?? []) global.add(h.toLowerCase());
  }

  const onChain = new Set<string>();
  for (const w of wallets) {
    if (w.chainId === chainId) onChain.add(w.address);
  }
  const cp = getAdminScanCheckpoint(chainId);
  for (const h of cp?.hatchers ?? []) onChain.add(h.toLowerCase());

  return {
    registered: global.size,
    registeredOnChain: onChain.size,
    walletRegistered: wallets.length,
  };
}

/** 新地址插入并返回 true；已存在则刷新 last_seen / chain_id，返回 false。 */
export function registerWallet(address: string, chainId = 0): { isNew: boolean; total: number } {
  const addr = normalizeAddress(address);
  if (!addr) throw new Error('invalid address');
  ensureTable();
  const db = getAdminDb();
  const now = Date.now();
  const existing = db.prepare(`SELECT address FROM wallet_users WHERE address = ?`).get(addr) as { address: string } | undefined;
  if (existing) {
    db.prepare(`UPDATE wallet_users SET last_seen = ?, chain_id = ? WHERE address = ?`).run(now, chainId, addr);
    return { isNew: false, total: overlayRegisteredStats(chainId || 196).registered };
  }
  db.prepare(
    `INSERT INTO wallet_users (address, chain_id, first_seen, last_seen) VALUES (?, ?, ?, ?)`,
  ).run(addr, chainId, now, now);
  return { isNew: true, total: overlayRegisteredStats(chainId || 196).registered };
}
