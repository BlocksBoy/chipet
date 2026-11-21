/**
 * Chipet 本地孵化宠按钱包同步（JSON 快照列表）。
 */
import { getAdminDb } from './adminDb.ts';
import { normalizeAddress } from './walletUsers.ts';

export interface ChipetAuxHeartDto {
  bountyId: number;
  cpu: string;
  circuitId: string;
  weldedAt: number;
  unequippedAt?: number;
}

export interface ChipetLocalPetDto {
  id: number;
  name: string;
  cpu: string;
  circuitId: string;
  rarity: number;
  energy: number;
  mood: number;
  intimacy: number;
  level: number;
  xp?: number;
  wins?: number;
  losses?: number;
  lastFeed: number;
  lastPlay: number;
  hatchedAt: number;
  auxHeart?: ChipetAuxHeartDto;
}

function parseAuxHeart(raw: unknown): ChipetAuxHeartDto | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const cpu = String(o.cpu ?? '').trim();
  const circuitId = String(o.circuitId ?? '').trim();
  if (!cpu || !circuitId) return undefined;
  const unequippedAt = o.unequippedAt != null ? Number(o.unequippedAt) : undefined;
  return {
    bountyId: Math.max(0, Math.trunc(Number(o.bountyId) || 0)),
    cpu,
    circuitId,
    weldedAt: Number(o.weldedAt) || Date.now(),
    ...(unequippedAt && unequippedAt > 0 ? { unequippedAt } : {}),
  };
}

export interface ChipetWalletPets {
  address: string;
  pets: ChipetLocalPetDto[];
  updatedAt: number;
  exists: boolean;
}

function ensureTable() {
  getAdminDb().exec(`
    CREATE TABLE IF NOT EXISTS chipet_wallet_pets (
      address TEXT PRIMARY KEY,
      pets_json TEXT NOT NULL DEFAULT '[]',
      updated_at INTEGER NOT NULL
    );
  `);
}

function parsePets(raw: string): ChipetLocalPetDto[] {
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter((p) => p && typeof p === 'object').map((p) => {
      const o = p as Record<string, unknown>;
      const auxHeart = parseAuxHeart(o.auxHeart);
      return {
        id: Number(o.id) || 0,
        name: String(o.name ?? '').slice(0, 32),
        cpu: String(o.cpu ?? ''),
        circuitId: String(o.circuitId ?? '0'),
        rarity: Math.max(0, Math.min(2, Number(o.rarity) || 0)),
        energy: Math.max(0, Math.min(100, Number(o.energy) || 0)),
        mood: Math.max(0, Math.min(100, Number(o.mood) || 0)),
        intimacy: Math.max(0, Number(o.intimacy) || 0),
        level: Math.max(1, Number(o.level) || 1),
        xp: Math.max(0, Number(o.xp) || 0),
        wins: Math.max(0, Number(o.wins) || 0),
        losses: Math.max(0, Number(o.losses) || 0),
        lastFeed: Number(o.lastFeed) || 0,
        lastPlay: Number(o.lastPlay) || 0,
        hatchedAt: Number(o.hatchedAt) || 0,
        ...(auxHeart ? { auxHeart } : {}),
      };
    }).filter((p) => p.id > 0);
  } catch {
    return [];
  }
}

export function getWalletPets(address: string): ChipetWalletPets {
  ensureTable();
  const addr = normalizeAddress(address);
  if (!addr) throw new Error('invalid address');
  const row = getAdminDb().prepare(`SELECT pets_json, updated_at FROM chipet_wallet_pets WHERE address = ?`).get(addr) as
    | { pets_json: string; updated_at: number }
    | undefined;
  if (!row) {
    return { address: addr, pets: [], updatedAt: 0, exists: false };
  }
  return {
    address: addr,
    pets: parsePets(row.pets_json),
    updatedAt: Number(row.updated_at) || 0,
    exists: true,
  };
}

export function putWalletPets(address: string, pets: ChipetLocalPetDto[]): ChipetWalletPets {
  ensureTable();
  const addr = normalizeAddress(address);
  if (!addr) throw new Error('invalid address');
  const now = Date.now();
  const cleaned = parsePets(JSON.stringify(pets ?? []));
  getAdminDb().prepare(`
    INSERT INTO chipet_wallet_pets (address, pets_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(address) DO UPDATE SET
      pets_json = excluded.pets_json,
      updated_at = excluded.updated_at
  `).run(addr, JSON.stringify(cleaned), now);
  return { address: addr, pets: cleaned, updatedAt: now, exists: true };
}
