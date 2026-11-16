/**
 * 芯宠全量存档：链上宠物属性落 SQLite，供运营列表分页与历史追溯。
 */
import { getAdminDb } from './adminDb.ts';

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

export type PetArchiveInput = {
  chainId: number;
  petId: number;
  owner: string;
  name: string;
  cpu: string;
  circuitId: string | number | bigint;
  rarity: number;
  energy: number;
  mood: number;
  intimacy: number;
  level: number;
  lastFeed: number;
  lastPlay: number;
  gates?: number | null;
  nIn?: number | null;
  nOut?: number | null;
};

function ensureTable() {
  getAdminDb().exec(`
    CREATE TABLE IF NOT EXISTS chipet_pets (
      chain_id INTEGER NOT NULL,
      pet_id INTEGER NOT NULL,
      owner TEXT NOT NULL,
      name TEXT NOT NULL,
      cpu TEXT NOT NULL,
      circuit_id TEXT NOT NULL,
      rarity INTEGER NOT NULL,
      energy INTEGER NOT NULL,
      mood INTEGER NOT NULL,
      intimacy INTEGER NOT NULL,
      level INTEGER NOT NULL,
      last_feed INTEGER NOT NULL,
      last_play INTEGER NOT NULL,
      gates INTEGER,
      n_in INTEGER,
      n_out INTEGER,
      first_seen INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (chain_id, pet_id)
    );
    CREATE INDEX IF NOT EXISTS idx_chipet_pets_chain_id
      ON chipet_pets(chain_id, pet_id DESC);
    CREATE INDEX IF NOT EXISTS idx_chipet_pets_owner
      ON chipet_pets(chain_id, owner);
  `);
}

function rowToPet(r: Record<string, unknown>): ArchivedPet {
  return {
    chainId: Number(r.chain_id),
    petId: Number(r.pet_id),
    owner: String(r.owner),
    name: String(r.name),
    cpu: String(r.cpu),
    circuitId: String(r.circuit_id),
    rarity: Number(r.rarity),
    energy: Number(r.energy),
    mood: Number(r.mood),
    intimacy: Number(r.intimacy),
    level: Number(r.level),
    lastFeed: Number(r.last_feed),
    lastPlay: Number(r.last_play),
    gates: r.gates == null ? null : Number(r.gates),
    nIn: r.n_in == null ? null : Number(r.n_in),
    nOut: r.n_out == null ? null : Number(r.n_out),
    firstSeen: Number(r.first_seen),
    updatedAt: Number(r.updated_at),
  };
}

export function upsertArchivedPet(input: PetArchiveInput): void {
  ensureTable();
  const now = Date.now();
  const owner = input.owner.trim().toLowerCase();
  const cpu = input.cpu.trim().toLowerCase();
  const circuitId = String(input.circuitId);
  getAdminDb().prepare(`
    INSERT INTO chipet_pets (
      chain_id, pet_id, owner, name, cpu, circuit_id, rarity,
      energy, mood, intimacy, level, last_feed, last_play,
      gates, n_in, n_out, first_seen, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(chain_id, pet_id) DO UPDATE SET
      owner = excluded.owner,
      name = excluded.name,
      cpu = excluded.cpu,
      circuit_id = excluded.circuit_id,
      rarity = excluded.rarity,
      energy = excluded.energy,
      mood = excluded.mood,
      intimacy = excluded.intimacy,
      level = excluded.level,
      last_feed = excluded.last_feed,
      last_play = excluded.last_play,
      gates = COALESCE(excluded.gates, chipet_pets.gates),
      n_in = COALESCE(excluded.n_in, chipet_pets.n_in),
      n_out = COALESCE(excluded.n_out, chipet_pets.n_out),
      updated_at = excluded.updated_at
  `).run(
    input.chainId,
    input.petId,
    owner,
    input.name,
    cpu,
    circuitId,
    input.rarity,
    input.energy,
    input.mood,
    input.intimacy,
    input.level,
    input.lastFeed,
    input.lastPlay,
    input.gates ?? null,
    input.nIn ?? null,
    input.nOut ?? null,
    now,
    now,
  );
}

export function countArchivedPets(chainId: number): number {
  ensureTable();
  const row = getAdminDb()
    .prepare(`SELECT COUNT(*) AS n FROM chipet_pets WHERE chain_id = ?`)
    .get(chainId) as { n: number };
  return Number(row?.n ?? 0);
}

export function listArchivedPets(
  chainId: number,
  opts?: { page?: number; pageSize?: number },
): { items: ArchivedPet[]; total: number; page: number; pageSize: number; pages: number } {
  ensureTable();
  const pageSize = Math.min(100, Math.max(1, Number(opts?.pageSize ?? 20) || 20));
  const page = Math.max(1, Number(opts?.page ?? 1) || 1);
  const total = countArchivedPets(chainId);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pages);
  const offset = (safePage - 1) * pageSize;
  const rows = getAdminDb().prepare(`
    SELECT * FROM chipet_pets
    WHERE chain_id = ?
    ORDER BY pet_id DESC
    LIMIT ? OFFSET ?
  `).all(chainId, pageSize, offset) as Record<string, unknown>[];
  return {
    items: rows.map(rowToPet),
    total,
    page: safePage,
    pageSize,
    pages,
  };
}
