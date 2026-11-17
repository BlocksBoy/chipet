/**
 * Chipet 演示 BEM 经济：按钱包同步（声明式 address）。
 */
import { getAdminDb } from './adminDb.ts';
import { normalizeAddress } from './walletUsers.ts';

export interface ChipetBemState {
  address: string;
  demoBal: number;
  bondSlots: number;
  eggCredits: number;
  faucetDay: string;
  log: { at: number; sku: string; price: number; via: 'demo' | 'chain'; note?: string }[];
  updatedAt: number;
  exists: boolean;
}

const BOND_SLOTS_DEFAULT = 3;
const BOND_SLOTS_MAX = 5;

function ensureTable() {
  getAdminDb().exec(`
    CREATE TABLE IF NOT EXISTS chipet_wallet_bem (
      address TEXT PRIMARY KEY,
      demo_bal REAL NOT NULL DEFAULT 0,
      bond_slots INTEGER NOT NULL DEFAULT 3,
      egg_credits INTEGER NOT NULL DEFAULT 0,
      faucet_day TEXT NOT NULL DEFAULT '',
      log_json TEXT NOT NULL DEFAULT '[]',
      updated_at INTEGER NOT NULL
    );
  `);
}

function parseLog(raw: string): ChipetBemState['log'] {
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.slice(0, 40) as ChipetBemState['log'] : [];
  } catch {
    return [];
  }
}

export function getWalletBem(address: string): ChipetBemState {
  ensureTable();
  const addr = normalizeAddress(address);
  if (!addr) throw new Error('invalid address');
  const row = getAdminDb().prepare(`SELECT * FROM chipet_wallet_bem WHERE address = ?`).get(addr) as Record<string, unknown> | undefined;
  if (!row) {
    return {
      address: addr,
      demoBal: 0,
      bondSlots: BOND_SLOTS_DEFAULT,
      eggCredits: 0,
      faucetDay: '',
      log: [],
      updatedAt: 0,
      exists: false,
    };
  }
  return {
    address: addr,
    demoBal: Math.max(0, Number(row.demo_bal) || 0),
    bondSlots: Math.min(BOND_SLOTS_MAX, Math.max(BOND_SLOTS_DEFAULT, Number(row.bond_slots) || BOND_SLOTS_DEFAULT)),
    eggCredits: Math.max(0, Number(row.egg_credits) || 0),
    faucetDay: String(row.faucet_day ?? ''),
    log: parseLog(String(row.log_json ?? '[]')),
    updatedAt: Number(row.updated_at) || 0,
    exists: true,
  };
}

export function putWalletBem(input: {
  address: string;
  demoBal?: number;
  bondSlots?: number;
  eggCredits?: number;
  faucetDay?: string;
  log?: ChipetBemState['log'];
}): ChipetBemState {
  ensureTable();
  const addr = normalizeAddress(input.address);
  if (!addr) throw new Error('invalid address');
  const prev = getWalletBem(addr);
  const now = Date.now();
  const next = {
    demoBal: Math.max(0, Number(input.demoBal ?? prev.demoBal) || 0),
    bondSlots: Math.min(BOND_SLOTS_MAX, Math.max(BOND_SLOTS_DEFAULT, Number(input.bondSlots ?? prev.bondSlots) || BOND_SLOTS_DEFAULT)),
    eggCredits: Math.max(0, Number(input.eggCredits ?? prev.eggCredits) || 0),
    faucetDay: String(input.faucetDay ?? prev.faucetDay),
    log: (input.log ?? prev.log).slice(0, 40),
  };
  getAdminDb().prepare(`
    INSERT INTO chipet_wallet_bem (address, demo_bal, bond_slots, egg_credits, faucet_day, log_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(address) DO UPDATE SET
      demo_bal = excluded.demo_bal,
      bond_slots = excluded.bond_slots,
      egg_credits = excluded.egg_credits,
      faucet_day = excluded.faucet_day,
      log_json = excluded.log_json,
      updated_at = excluded.updated_at
  `).run(addr, next.demoBal, next.bondSlots, next.eggCredits, next.faucetDay, JSON.stringify(next.log), now);
  return { ...getWalletBem(addr), exists: true };
}
