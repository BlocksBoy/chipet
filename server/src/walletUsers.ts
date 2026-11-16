/**
 * 前端连钱包注册：独立地址入库；运营看板「注册人数」读这里的总数。
 */
import { getAdminDb } from './adminDb.ts';

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

export function countWalletUsers(): number {
  ensureTable();
  const row = getAdminDb().prepare(`SELECT COUNT(*) AS n FROM wallet_users`).get() as { n: number };
  return Number(row?.n ?? 0);
}

export function countWalletUsersByChain(chainId: number): number {
  ensureTable();
  const row = getAdminDb()
    .prepare(`SELECT COUNT(*) AS n FROM wallet_users WHERE chain_id = ?`)
    .get(chainId) as { n: number };
  return Number(row?.n ?? 0);
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
    return { isNew: false, total: countWalletUsers() };
  }
  db.prepare(
    `INSERT INTO wallet_users (address, chain_id, first_seen, last_seen) VALUES (?, ?, ?, ?)`,
  ).run(addr, chainId, now, now);
  return { isNew: true, total: countWalletUsers() };
}
