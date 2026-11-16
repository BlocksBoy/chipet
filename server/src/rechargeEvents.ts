/**
 * 商店链上充值主动上报：按 txHash 去重入库。
 * 运营看板充值指标 = 扫链冻结基线（历史）+ 本表增量。
 */
import { formatUnits } from 'viem';
import { bemNetwork } from '@tapearena/chain';
import { getAdminDb, getAdminScanCheckpoint } from './adminDb.ts';
import { normalizeAddress } from './walletUsers.ts';

const TX_RE = /^0x[a-fA-F0-9]{64}$/;
const AMOUNT_RE = /^\d+$/;

function ensureTable() {
  getAdminDb().exec(`
    CREATE TABLE IF NOT EXISTS recharge_events (
      tx_hash TEXT PRIMARY KEY,
      address TEXT NOT NULL,
      chain_id INTEGER NOT NULL,
      amount_raw TEXT NOT NULL,
      sku TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_recharge_events_chain ON recharge_events(chain_id);
    CREATE INDEX IF NOT EXISTS idx_recharge_events_addr ON recharge_events(address);
  `);
}

export type RechargeReport = {
  txHash: string;
  address: string;
  chainId: number;
  amountRaw: string;
  sku?: string;
};

export function recordRecharge(input: RechargeReport): { isNew: boolean; txs: number } {
  const addr = normalizeAddress(input.address);
  if (!addr) throw new Error('invalid address');
  const txHash = input.txHash.trim().toLowerCase();
  if (!TX_RE.test(txHash)) throw new Error('invalid txHash');
  const amountRaw = String(input.amountRaw ?? '').trim();
  if (!AMOUNT_RE.test(amountRaw) || amountRaw === '0') throw new Error('invalid amountRaw');
  const chainId = Number(input.chainId);
  if (chainId !== 196 && chainId !== 56) throw new Error('unsupported chainId');

  ensureTable();
  const db = getAdminDb();
  const existing = db.prepare(`SELECT tx_hash FROM recharge_events WHERE tx_hash = ?`).get(txHash) as
    | { tx_hash: string }
    | undefined;
  if (existing) {
    return { isNew: false, txs: countRechargeTxs(chainId) };
  }
  db.prepare(
    `INSERT INTO recharge_events (tx_hash, address, chain_id, amount_raw, sku, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(txHash, addr, chainId, amountRaw, input.sku ?? null, Date.now());
  return { isNew: true, txs: countRechargeTxs(chainId) };
}

export function countRechargeTxs(chainId: number): number {
  ensureTable();
  const row = getAdminDb()
    .prepare(`SELECT COUNT(*) AS n FROM recharge_events WHERE chain_id = ?`)
    .get(chainId) as { n: number };
  return Number(row?.n ?? 0);
}

export type RechargeSummary = {
  txs: number;
  users: number;
  amountRaw: string;
  addresses: string[];
};

export function rechargeSummary(chainId: number): RechargeSummary {
  ensureTable();
  const db = getAdminDb();
  const rows = db
    .prepare(`SELECT address, amount_raw FROM recharge_events WHERE chain_id = ?`)
    .all(chainId) as { address: string; amount_raw: string }[];
  const addresses = [...new Set(rows.map((r) => r.address))];
  let raw = 0n;
  for (const r of rows) {
    try {
      raw += BigInt(r.amount_raw);
    } catch {
      /* ignore bad row */
    }
  }
  return {
    txs: rows.length,
    users: addresses.length,
    amountRaw: raw.toString(),
    addresses,
  };
}

/** 扫链冻结基线 + 上报增量 → 看板充值三项 */
export function overlayRechargeStats(chainId: number): {
  rechargeUsers: number;
  rechargeTxs: number;
  rechargeBem: string;
  reportedTxs: number;
} {
  const cp = getAdminScanCheckpoint(chainId);
  const report = rechargeSummary(chainId);
  const payers = new Set([...(cp?.payers ?? []), ...report.addresses]);
  const frozenTxs = Number(cp?.rechargeTxs ?? 0);
  const frozenRaw = BigInt(cp?.rechargeBemRaw || '0');
  const totalRaw = frozenRaw + BigInt(report.amountRaw || '0');
  const bem = bemNetwork(chainId);
  return {
    rechargeUsers: payers.size || report.users,
    rechargeTxs: frozenTxs + report.txs,
    rechargeBem: bem ? formatUnits(totalRaw, bem.decimals) : formatUnits(totalRaw, 8),
    reportedTxs: report.txs,
  };
}
