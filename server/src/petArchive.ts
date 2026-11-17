/**
 * 芯宠全量存档：链上宠物属性落 SQLite，供运营列表分页与历史追溯。
 */
import { getAdminDb } from './adminDb.ts';

export type ArchivedPet = {
  chainId: number;
  petId: number;
  owner: string;
  /** chipet 档案昵称（有则优先展示，避免广场只显示 0x…） */
  ownerName?: string;
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
  const ownerName = r.owner_display_name != null ? String(r.owner_display_name).trim() : '';
  return {
    chainId: Number(r.chain_id),
    petId: Number(r.pet_id),
    owner: String(r.owner),
    ownerName: ownerName || undefined,
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

/** 档案表可能尚未建；JOIN 用，缺表时忽略昵称 */
function ensureWalletProfileTable() {
  getAdminDb().exec(`
    CREATE TABLE IF NOT EXISTS chipet_wallet_profiles (
      address TEXT PRIMARY KEY,
      display_name TEXT NOT NULL DEFAULT '',
      name_customized INTEGER NOT NULL DEFAULT 0,
      friend_code TEXT NOT NULL DEFAULT '',
      checkin_day TEXT NOT NULL DEFAULT '',
      streak INTEGER NOT NULL DEFAULT 0,
      fish INTEGER NOT NULL DEFAULT 0,
      quest_json TEXT NOT NULL DEFAULT '{}',
      my_pats_today_json TEXT NOT NULL DEFAULT '{}',
      gifts_today_json TEXT NOT NULL DEFAULT '{}',
      wild_day_json TEXT NOT NULL DEFAULT '{}',
      bonds_json TEXT NOT NULL DEFAULT '[]',
      liked_json TEXT NOT NULL DEFAULT '{}',
      bubbles_json TEXT NOT NULL DEFAULT '{}',
      updated_at INTEGER NOT NULL
    );
  `);
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

export type PetArchiveListOpts = {
  chainId?: number | null;
  page?: number;
  pageSize?: number;
  /** 稀有度：0 普通 / 1 珍奇 / 2 限定 */
  rarity?: number | null;
  levelMin?: number | null;
  levelMax?: number | null;
  energyMin?: number | null;
  energyMax?: number | null;
  /** 排除某钱包地址（切磋对手不展示自己的猫） */
  excludeOwner?: string | null;
};

function buildPetWhere(opts?: PetArchiveListOpts): { sql: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  if (opts?.chainId != null) {
    parts.push('chain_id = ?');
    params.push(opts.chainId);
  }
  if (opts?.excludeOwner) {
    const owner = String(opts.excludeOwner).trim().toLowerCase();
    if (/^0x[a-f0-9]{40}$/.test(owner)) {
      parts.push('owner != ?');
      params.push(owner);
    }
  }
  if (opts?.rarity != null && Number.isFinite(opts.rarity)) {
    parts.push('rarity = ?');
    params.push(Math.trunc(Number(opts.rarity)));
  }
  if (opts?.levelMin != null && Number.isFinite(opts.levelMin)) {
    parts.push('level >= ?');
    params.push(Math.trunc(Number(opts.levelMin)));
  }
  if (opts?.levelMax != null && Number.isFinite(opts.levelMax)) {
    parts.push('level <= ?');
    params.push(Math.trunc(Number(opts.levelMax)));
  }
  if (opts?.energyMin != null && Number.isFinite(opts.energyMin)) {
    parts.push('energy >= ?');
    params.push(Math.trunc(Number(opts.energyMin)));
  }
  if (opts?.energyMax != null && Number.isFinite(opts.energyMax)) {
    parts.push('energy <= ?');
    params.push(Math.trunc(Number(opts.energyMax)));
  }
  return {
    sql: parts.length ? `WHERE ${parts.join(' AND ')}` : '',
    params,
  };
}

/** chainId 省略或 null 时统计全链；可带与列表相同的筛选 */
export function countArchivedPets(chainId?: number | null, filters?: Omit<PetArchiveListOpts, 'chainId' | 'page' | 'pageSize'>): number {
  ensureTable();
  const { sql, params } = buildPetWhere({ ...filters, chainId: chainId ?? null });
  const row = getAdminDb()
    .prepare(`SELECT COUNT(*) AS n FROM chipet_pets ${sql}`)
    .get(...params) as { n: number };
  return Number(row?.n ?? 0);
}

/** chainId 省略时一张表拉全链，行内带 chainId 区分；支持稀有度 / 等级 / 能量筛选 */
export function listArchivedPets(
  opts?: PetArchiveListOpts,
): { items: ArchivedPet[]; total: number; page: number; pageSize: number; pages: number } {
  ensureTable();
  const pageSize = Math.min(100, Math.max(1, Number(opts?.pageSize ?? 20) || 20));
  const page = Math.max(1, Number(opts?.page ?? 1) || 1);
  const { sql, params } = buildPetWhere(opts);
  const total = countArchivedPets(opts?.chainId ?? null, opts);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pages);
  const offset = (safePage - 1) * pageSize;
  const order = opts?.chainId == null
    ? 'ORDER BY updated_at DESC, chain_id ASC, pet_id DESC'
    : 'ORDER BY pet_id DESC';
  const rows = getAdminDb().prepare(`
    SELECT * FROM chipet_pets
    ${sql}
    ${order}
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset) as Record<string, unknown>[];
  return {
    items: rows.map(rowToPet),
    total,
    page: safePage,
    pageSize,
    pages,
  };
}

/** 公开切磋对手：最近更新的存档猫，可排除自己钱包；默认最多 24 只。 */
export function listRivalPets(opts?: {
  excludeOwner?: string | null;
  chainId?: number | null;
  limit?: number;
}): ArchivedPet[] {
  ensureTable();
  ensureWalletProfileTable();
  const limit = Math.min(48, Math.max(1, Number(opts?.limit ?? 24) || 24));
  const { sql, params } = buildPetWhere({
    chainId: opts?.chainId ?? null,
    excludeOwner: opts?.excludeOwner ?? null,
  });
  // 附带主人档案昵称，供广场动态 actor 显示（不要只写 0x 缩写）
  const rows = getAdminDb().prepare(`
    SELECT p.*, (
      SELECT w.display_name FROM chipet_wallet_profiles w
      WHERE lower(w.address) = lower(p.owner) AND w.display_name != ''
      LIMIT 1
    ) AS owner_display_name
    FROM chipet_pets p
    ${sql}
    ORDER BY p.updated_at DESC, p.chain_id ASC, p.pet_id DESC
    LIMIT ?
  `).all(...params, limit) as Record<string, unknown>[];
  return rows.map(rowToPet);
}
