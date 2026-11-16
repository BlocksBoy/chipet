/**
 * Admin 扫链结果 SQLite 持久化。默认 ./data/admin.sqlite（可用 ADMIN_DB_PATH 覆盖）。
 * 用 createRequire 加载 node:sqlite，避免 vitest/vite 把 `import 'node:sqlite'` 解析失败。
 */
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';
import type { AdminScanCheckpoint, AdminStats } from '@tapearena/chain';

type DatabaseSyncCtor = typeof import('node:sqlite').DatabaseSync;

const require = createRequire(import.meta.url);
function loadDatabaseSync(): DatabaseSyncCtor {
  return (require('node:sqlite') as typeof import('node:sqlite')).DatabaseSync;
}

export type AdminStatsRow = AdminStats & {
  id: number;
  createdAt: number;
  source: 'cache' | 'live';
};

let db: DatabaseSyncType | null = null;

function dbPath(): string {
  return resolve(process.env.ADMIN_DB_PATH ?? resolve(process.cwd(), 'data', 'admin.sqlite'));
}

/** 测试用：关闭并清空单例，下次 getAdminDb 会按当前 ADMIN_DB_PATH 重开。 */
export function closeAdminDb(): void {
  if (!db) return;
  try { db.close(); } catch { /* ignore */ }
  db = null;
}

export function getAdminDb(): DatabaseSyncType {
  if (db) return db;
  const path = dbPath();
  mkdirSync(dirname(path), { recursive: true });
  const DatabaseSync = loadDatabaseSync();
  db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_stats_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chain_id INTEGER NOT NULL,
      cats INTEGER NOT NULL,
      registered INTEGER NOT NULL,
      players INTEGER NOT NULL,
      recharge_users INTEGER NOT NULL,
      recharge_txs INTEGER NOT NULL,
      recharge_bem TEXT NOT NULL,
      treasury_bal TEXT NOT NULL,
      scanned_to TEXT NOT NULL,
      scanned_from TEXT NOT NULL DEFAULT '',
      scan_mode TEXT NOT NULL DEFAULT 'full',
      rpc_host TEXT NOT NULL,
      note TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_admin_stats_chain_time
      ON admin_stats_snapshots(chain_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS admin_scan_state (
      chain_id INTEGER PRIMARY KEY,
      scanned_to TEXT NOT NULL,
      recharge_txs INTEGER NOT NULL,
      recharge_bem_raw TEXT NOT NULL,
      payers_json TEXT NOT NULL,
      hatchers_json TEXT NOT NULL,
      played_pets_json TEXT NOT NULL,
      players_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  // 兼容旧库：补齐增量字段
  const cols = db.prepare(`PRAGMA table_info(admin_stats_snapshots)`).all() as { name: string }[];
  const names = new Set(cols.map((c) => c.name));
  if (!names.has('scanned_from')) {
    db.exec(`ALTER TABLE admin_stats_snapshots ADD COLUMN scanned_from TEXT NOT NULL DEFAULT ''`);
  }
  if (!names.has('scan_mode')) {
    db.exec(`ALTER TABLE admin_stats_snapshots ADD COLUMN scan_mode TEXT NOT NULL DEFAULT 'full'`);
  }
  return db;
}

function parseJsonList(raw: string): string[] {
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function rowToStats(r: Record<string, unknown>, source: 'cache' | 'live'): AdminStatsRow {
  return {
    id: Number(r.id),
    chainId: Number(r.chain_id),
    cats: Number(r.cats),
    registered: Number(r.registered),
    players: Number(r.players),
    rechargeUsers: Number(r.recharge_users),
    rechargeTxs: Number(r.recharge_txs),
    rechargeBem: String(r.recharge_bem),
    treasuryBal: String(r.treasury_bal),
    scannedTo: String(r.scanned_to),
    scannedFrom: String(r.scanned_from ?? ''),
    scanMode: (String(r.scan_mode || 'full') as AdminStats['scanMode']),
    rpcHost: String(r.rpc_host),
    note: String(r.note),
    createdAt: Number(r.created_at),
    source,
  };
}

export function saveAdminStats(stats: AdminStats): AdminStatsRow {
  const d = getAdminDb();
  const createdAt = Date.now();
  const result = d.prepare(`
    INSERT INTO admin_stats_snapshots (
      chain_id, cats, registered, players,
      recharge_users, recharge_txs, recharge_bem, treasury_bal,
      scanned_to, scanned_from, scan_mode, rpc_host, note, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    stats.chainId,
    stats.cats,
    stats.registered,
    stats.players,
    stats.rechargeUsers,
    stats.rechargeTxs,
    stats.rechargeBem,
    stats.treasuryBal,
    stats.scannedTo,
    stats.scannedFrom,
    stats.scanMode,
    stats.rpcHost,
    stats.note,
    createdAt,
  );
  return {
    ...stats,
    id: Number(result.lastInsertRowid),
    createdAt,
    source: 'live',
  };
}

export function latestAdminStats(chainId: number): AdminStatsRow | null {
  const d = getAdminDb();
  const r = d.prepare(`
    SELECT * FROM admin_stats_snapshots
    WHERE chain_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(chainId) as Record<string, unknown> | undefined;
  return r ? rowToStats(r, 'cache') : null;
}

export function listAdminStatsHistory(chainId: number, limit = 20): AdminStatsRow[] {
  const d = getAdminDb();
  const rows = d.prepare(`
    SELECT * FROM admin_stats_snapshots
    WHERE chain_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(chainId, Math.min(Math.max(1, limit), 100)) as Record<string, unknown>[];
  return rows.map((r) => rowToStats(r, 'cache'));
}

export function getAdminScanCheckpoint(chainId: number): AdminScanCheckpoint | null {
  const d = getAdminDb();
  const r = d.prepare(`SELECT * FROM admin_scan_state WHERE chain_id = ?`).get(chainId) as
    | Record<string, unknown>
    | undefined;
  if (!r) return null;
  return {
    scannedTo: String(r.scanned_to),
    rechargeTxs: Number(r.recharge_txs),
    rechargeBemRaw: String(r.recharge_bem_raw),
    payers: parseJsonList(String(r.payers_json)),
    hatchers: parseJsonList(String(r.hatchers_json)),
    playedPets: parseJsonList(String(r.played_pets_json)),
    players: parseJsonList(String(r.players_json)),
  };
}

export function saveAdminScanCheckpoint(chainId: number, cp: AdminScanCheckpoint): void {
  const d = getAdminDb();
  d.prepare(`
    INSERT INTO admin_scan_state (
      chain_id, scanned_to, recharge_txs, recharge_bem_raw,
      payers_json, hatchers_json, played_pets_json, players_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(chain_id) DO UPDATE SET
      scanned_to = excluded.scanned_to,
      recharge_txs = excluded.recharge_txs,
      recharge_bem_raw = excluded.recharge_bem_raw,
      payers_json = excluded.payers_json,
      hatchers_json = excluded.hatchers_json,
      played_pets_json = excluded.played_pets_json,
      players_json = excluded.players_json,
      updated_at = excluded.updated_at
  `).run(
    chainId,
    cp.scannedTo,
    cp.rechargeTxs,
    cp.rechargeBemRaw,
    JSON.stringify(cp.payers),
    JSON.stringify(cp.hatchers),
    JSON.stringify(cp.playedPets),
    JSON.stringify(cp.players),
    Date.now(),
  );
}
