/**
 * Chipet 广场公共数据 + 钱包私有进度（声明式 address，无 SIWE）。
 */
import { getAdminDb } from './adminDb.ts';
import { normalizeAddress } from './walletUsers.ts';

export type JsonText = string | { zh: string; en: string };

export interface ChipetActivity {
  id: string;
  at: number;
  kind: string;
  actor: JsonText;
  petKey: string;
  petName: string;
  text: JsonText;
  wallet: string;
  likes: number;
}

export interface ChipetNote {
  id: string;
  petKey: string;
  from: JsonText;
  text: JsonText;
  at: number;
  wallet: string;
}

export interface ChipetWalletProfile {
  address: string;
  displayName: string;
  nameCustomized: boolean;
  friendCode: string;
  checkinDay: string;
  streak: number;
  fish: number;
  quest: { day: string; n: Record<string, number>; claimed: Record<string, boolean> };
  myPatsToday: Record<string, string>;
  giftsToday: Record<string, string>;
  wildDay: Record<string, string>;
  bonds: string[];
  liked: Record<string, boolean>;
  bubbles: Record<string, JsonText>;
  updatedAt: number;
  exists: boolean;
}

const NOTE_WINDOW_MS = 60_000;
const NOTE_WINDOW_MAX = 5;
const NOTE_PET_WINDOW_MS = 5 * 60_000;
const NOTE_PET_WINDOW_MAX = 3;
const NOTE_COOLDOWN_MS = 8_000;

/** 表结构只需检查一次；原先每次 listFeed 都跑 CREATE/PRAGMA，无谓 IO */
let schemaReady = false;
let seedChecked = false;

function ensureTables() {
  if (schemaReady) return;
  getAdminDb().exec(`
    CREATE TABLE IF NOT EXISTS chipet_activities (
      id TEXT PRIMARY KEY,
      at INTEGER NOT NULL,
      kind TEXT NOT NULL,
      actor_json TEXT NOT NULL,
      pet_key TEXT NOT NULL DEFAULT '',
      pet_name TEXT NOT NULL DEFAULT '',
      text_json TEXT NOT NULL,
      wallet TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_chipet_activities_at ON chipet_activities(at DESC);

    CREATE TABLE IF NOT EXISTS chipet_notes (
      id TEXT PRIMARY KEY,
      pet_key TEXT NOT NULL,
      from_json TEXT NOT NULL,
      text_json TEXT NOT NULL,
      at INTEGER NOT NULL,
      wallet TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_chipet_notes_pet_at ON chipet_notes(pet_key, at DESC);
    CREATE INDEX IF NOT EXISTS idx_chipet_notes_wallet_at ON chipet_notes(wallet, at DESC);

    CREATE TABLE IF NOT EXISTS chipet_activity_likes (
      activity_id TEXT NOT NULL,
      wallet TEXT NOT NULL,
      at INTEGER NOT NULL,
      PRIMARY KEY (activity_id, wallet)
    );

    CREATE TABLE IF NOT EXISTS chipet_pet_agg (
      pet_key TEXT PRIMARY KEY,
      pats INTEGER NOT NULL DEFAULT 0,
      visits INTEGER NOT NULL DEFAULT 0,
      wins INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 1,
      intimacy INTEGER NOT NULL DEFAULT 0,
      rarity INTEGER NOT NULL DEFAULT 0,
      energy INTEGER NOT NULL DEFAULT 80,
      mood INTEGER NOT NULL DEFAULT 70,
      name TEXT NOT NULL DEFAULT '',
      owner_json TEXT NOT NULL DEFAULT '""',
      cpu TEXT NOT NULL DEFAULT '',
      circuit_id TEXT NOT NULL DEFAULT '0',
      route_id INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    );

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

    CREATE TABLE IF NOT EXISTS chipet_social_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chipet_leaderboard (
      kind TEXT NOT NULL,
      rank INTEGER NOT NULL,
      pet_key TEXT NOT NULL,
      score INTEGER NOT NULL,
      recent INTEGER NOT NULL DEFAULT 0,
      pats INTEGER NOT NULL DEFAULT 0,
      visits INTEGER NOT NULL DEFAULT 0,
      wins INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 1,
      intimacy INTEGER NOT NULL DEFAULT 0,
      rarity INTEGER NOT NULL DEFAULT 0,
      energy INTEGER NOT NULL DEFAULT 80,
      mood INTEGER NOT NULL DEFAULT 70,
      name TEXT NOT NULL DEFAULT '',
      owner_json TEXT NOT NULL DEFAULT '""',
      cpu TEXT NOT NULL DEFAULT '',
      circuit_id TEXT NOT NULL DEFAULT '0',
      route_id INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (kind, rank)
    );
    CREATE INDEX IF NOT EXISTS idx_chipet_lb_kind_pet ON chipet_leaderboard(kind, pet_key);
  `);
  // 兼容旧库：补齐排行榜字段
  const cols = getAdminDb().prepare(`PRAGMA table_info(chipet_pet_agg)`).all() as { name: string }[];
  const names = new Set(cols.map((c) => c.name));
  const add = (col: string, ddl: string) => {
    if (!names.has(col)) getAdminDb().exec(`ALTER TABLE chipet_pet_agg ADD COLUMN ${ddl}`);
  };
  add('wins', 'wins INTEGER NOT NULL DEFAULT 0');
  add('level', 'level INTEGER NOT NULL DEFAULT 1');
  add('intimacy', 'intimacy INTEGER NOT NULL DEFAULT 0');
  add('rarity', 'rarity INTEGER NOT NULL DEFAULT 0');
  add('energy', 'energy INTEGER NOT NULL DEFAULT 80');
  add('mood', 'mood INTEGER NOT NULL DEFAULT 70');
  add('name', "name TEXT NOT NULL DEFAULT ''");
  add('owner_json', "owner_json TEXT NOT NULL DEFAULT '\"\"'");
  add('cpu', "cpu TEXT NOT NULL DEFAULT ''");
  add('circuit_id', "circuit_id TEXT NOT NULL DEFAULT '0'");
  add('route_id', 'route_id INTEGER NOT NULL DEFAULT 0');
  add('updated_at', 'updated_at INTEGER NOT NULL DEFAULT 0');
  schemaReady = true;
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function toJson(v: unknown): string {
  return JSON.stringify(v ?? null);
}

const SEED_ACTOR = (zh: string, en: string) => ({ zh, en });

function seedIfEmpty() {
  ensureTables();
  if (seedChecked) return;
  const db = getAdminDb();
  const meta = db.prepare(`SELECT value FROM chipet_social_meta WHERE key = 'seeded'`).get() as { value: string } | undefined;
  if (meta?.value === '1') {
    seedChecked = true;
    return;
  }

  const count = db.prepare(`SELECT COUNT(*) AS n FROM chipet_activities`).get() as { n: number };
  if (Number(count.n) > 0) {
    db.prepare(`INSERT OR REPLACE INTO chipet_social_meta (key, value) VALUES ('seeded', '1')`).run();
    seedChecked = true;
    return;
  }

  const now = Date.now();
  const acts: ChipetActivity[] = [
    {
      id: 'a4', at: now - 600000, kind: 'battle',
      actor: SEED_ACTOR('脉冲主', 'Pulse keeper'), petKey: 'npc:-6', petName: '脉冲',
      text: SEED_ACTOR('「脉冲」在电路对战中击败了野怪「静电怪」', 'Pulse beat the wild bug Static in a circuit battle'),
      wallet: '', likes: 3,
    },
    {
      id: 'a3', at: now - 900000, kind: 'note',
      actor: SEED_ACTOR('访客', 'Visitor'), petKey: 'npc:-3', petName: '糖芯',
      text: SEED_ACTOR('在「糖芯」家留言：基因页的芯片好酷', 'Left a note for Sugarchip: The chip on the gene page is so cool'),
      wallet: '', likes: 2,
    },
    {
      id: 'a2', at: now - 1800000, kind: 'gift',
      actor: SEED_ACTOR('海盐主', 'Seasalt keeper'), petKey: 'npc:-5', petName: '海盐',
      text: SEED_ACTOR('给「海盐」投喂了小鱼干', 'Fed Seasalt a fish treat'),
      wallet: '', likes: 0,
    },
    {
      id: 'a1', at: now - 5400000, kind: 'pat',
      actor: SEED_ACTOR('青橘主', 'Kumquat keeper'), petKey: 'npc:-1', petName: '青橘',
      text: SEED_ACTOR('摸了摸「青橘」的头', 'Patted Kumquat on the head'),
      wallet: '', likes: 0,
    },
    {
      id: 'a0', at: now - 7200000, kind: 'hatch',
      actor: SEED_ACTOR('糖芯主', 'Sugarchip keeper'), petKey: 'npc:-3', petName: '糖芯',
      text: SEED_ACTOR('孵化了限定芯宠「糖芯」', 'Hatched an Exclusive Chipet, Sugarchip'),
      wallet: '', likes: 5,
    },
  ];

  const insertAct = db.prepare(`
    INSERT OR IGNORE INTO chipet_activities (id, at, kind, actor_json, pet_key, pet_name, text_json, wallet)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const a of acts) {
    insertAct.run(a.id, a.at, a.kind, toJson(a.actor), a.petKey, a.petName, toJson(a.text), a.wallet);
  }

  // seed likes without wallet rows (synthetic counts via dummy wallets)
  const likeIns = db.prepare(`INSERT OR IGNORE INTO chipet_activity_likes (activity_id, wallet, at) VALUES (?, ?, ?)`);
  for (let i = 0; i < 5; i++) likeIns.run('a0', `seed:a0:${i}`, now);
  for (let i = 0; i < 2; i++) likeIns.run('a3', `seed:a3:${i}`, now);
  for (let i = 0; i < 3; i++) likeIns.run('a4', `seed:a4:${i}`, now);

  const notes = [
    {
      id: 'n1', petKey: 'npc:-3',
      from: SEED_ACTOR('邻居 A', 'Neighbor A'),
      text: SEED_ACTOR('限定芯宠好闪！求摸', 'That Exclusive Chipet is so shiny! Pat mine back?'),
      at: now - 86400000,
    },
    {
      id: 'n2', petKey: 'npc:-3',
      from: SEED_ACTOR('邻居 B', 'Neighbor B'),
      text: SEED_ACTOR('基因页的芯片好酷', 'The chip on the gene page is so cool'),
      at: now - 3600000,
    },
  ];
  const insertNote = db.prepare(`
    INSERT OR IGNORE INTO chipet_notes (id, pet_key, from_json, text_json, at, wallet)
    VALUES (?, ?, ?, ?, ?, '')
  `);
  for (const n of notes) {
    insertNote.run(n.id, n.petKey, toJson(n.from), toJson(n.text), n.at);
  }

  // NPC 排行榜种子（与前端 NEIGHBORS 对齐）
  const MOCK_CPU = '0x000000000000000000000000000000000000c111';
  const npcSeed: {
    id: number; name: string; owner: JsonText; circuitId: string; rarity: number;
    intimacy: number; level: number; wins: number; energy: number; mood: number;
  }[] = [
    { id: -1, name: '青橘', owner: SEED_ACTOR('林间小站', 'ForestStop'), circuitId: '2048', rarity: 1, intimacy: 24, level: 4, wins: 6, energy: 88, mood: 92 },
    { id: -2, name: '比特', owner: SEED_ACTOR('XLayerFans', 'XLayerFans'), circuitId: '3110', rarity: 0, intimacy: 11, level: 2, wins: 2, energy: 70, mood: 65 },
    { id: -3, name: '糖芯', owner: SEED_ACTOR('喵呜研究所', 'MeowLabs'), circuitId: '7777', rarity: 2, intimacy: 56, level: 7, wins: 15, energy: 95, mood: 98 },
    { id: -4, name: '豆皮', owner: SEED_ACTOR('周末玩家', 'WeekendPlayer'), circuitId: '1201', rarity: 0, intimacy: 8, level: 1, wins: 1, energy: 60, mood: 80 },
    { id: -5, name: '海盐', owner: SEED_ACTOR('DeWEB旅行者', 'DeWEBNomad'), circuitId: '9090', rarity: 1, intimacy: 19, level: 3, wins: 4, energy: 75, mood: 70 },
    { id: -6, name: '脉冲', owner: SEED_ACTOR('电路夜猫', 'CircuitNightOwl'), circuitId: '4242', rarity: 2, intimacy: 41, level: 6, wins: 11, energy: 90, mood: 85 },
  ];
  const agg = db.prepare(`
    INSERT OR IGNORE INTO chipet_pet_agg (
      pet_key, pats, visits, wins, level, intimacy, rarity, energy, mood,
      name, owner_json, cpu, circuit_id, route_id, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const n of npcSeed) {
    const pats = 3 + (Math.abs(n.id) * 7) % 40;
    const visits = 20 + (Math.abs(n.id) * 11) % 80;
    agg.run(
      `npc:${n.id}`, pats, visits, n.wins, n.level, n.intimacy, n.rarity, n.energy, n.mood,
      n.name, toJson(n.owner), MOCK_CPU, n.circuitId, n.id, now,
    );
  }

  db.prepare(`INSERT OR REPLACE INTO chipet_social_meta (key, value) VALUES ('seeded', '1')`).run();
  seedChecked = true;
}

/** 单条 SQL 批量取赞数，避免 listFeed 每页 N 次 COUNT */
function likeCounts(ids: string[]): Record<string, number> {
  if (!ids.length) return {};
  const db = getAdminDb();
  const out: Record<string, number> = {};
  for (const id of ids) out[id] = 0;
  const chunk = 80;
  for (let i = 0; i < ids.length; i += chunk) {
    const part = ids.slice(i, i + chunk);
    const ph = part.map(() => '?').join(',');
    const rows = db.prepare(
      `SELECT activity_id AS id, COUNT(*) AS n FROM chipet_activity_likes WHERE activity_id IN (${ph}) GROUP BY activity_id`,
    ).all(...part) as { id: string; n: number }[];
    for (const r of rows) out[String(r.id)] = Number(r.n) || 0;
  }
  return out;
}

/** 测试换库时清掉 schema/seed 内存标记 */
export function resetChipetSocialSchemaCacheForTests() {
  schemaReady = false;
  seedChecked = false;
}

export function countActivities(): number {
  seedIfEmpty();
  return Number(
    (getAdminDb().prepare(`SELECT COUNT(*) AS n FROM chipet_activities`).get() as { n: number } | undefined)?.n,
  ) || 0;
}

export function listFeed(opts?: { limit?: number; before?: number; offset?: number }): {
  items: ChipetActivity[];
  likes: Record<string, number>;
  total: number;
} {
  seedIfEmpty();
  const limit = Math.min(Math.max(1, opts?.limit ?? 40), 200);
  const offset = Math.max(0, Math.floor(opts?.offset ?? 0));
  const before = opts?.before;
  const db = getAdminDb();
  const total = countActivities();
  const rows = (before != null
    ? db.prepare(`
        SELECT id, at, kind, actor_json, pet_key, pet_name, text_json, wallet
        FROM chipet_activities WHERE at < ? ORDER BY at DESC LIMIT ?
      `).all(before, limit)
    : db.prepare(`
        SELECT id, at, kind, actor_json, pet_key, pet_name, text_json, wallet
        FROM chipet_activities ORDER BY at DESC LIMIT ? OFFSET ?
      `).all(limit, offset)) as Record<string, unknown>[];

  const items: ChipetActivity[] = rows.map((r) => ({
    id: String(r.id),
    at: Number(r.at),
    kind: String(r.kind),
    actor: parseJson<JsonText>(String(r.actor_json), ''),
    petKey: String(r.pet_key ?? ''),
    petName: String(r.pet_name ?? ''),
    text: parseJson<JsonText>(String(r.text_json), ''),
    wallet: String(r.wallet ?? ''),
    likes: 0,
  }));
  const likes = likeCounts(items.map((a) => a.id));
  for (const a of items) a.likes = likes[a.id] ?? 0;
  return { items, likes, total };
}

export function insertActivity(input: {
  id?: string;
  at?: number;
  kind: string;
  actor: JsonText;
  petKey?: string;
  petName?: string;
  text: JsonText;
  wallet?: string;
}): ChipetActivity {
  seedIfEmpty();
  const id = (input.id ?? `a${Date.now()}${Math.random().toString(36).slice(2, 8)}`).slice(0, 64);
  const at = input.at ?? Date.now();
  const wallet = input.wallet ? (normalizeAddress(input.wallet) ?? '') : '';
  getAdminDb().prepare(`
    INSERT OR REPLACE INTO chipet_activities (id, at, kind, actor_json, pet_key, pet_name, text_json, wallet)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    at,
    String(input.kind).slice(0, 32),
    toJson(input.actor),
    String(input.petKey ?? '').slice(0, 128),
    String(input.petName ?? '').slice(0, 64),
    toJson(input.text),
    wallet,
  );
  return {
    id, at, kind: String(input.kind).slice(0, 32),
    actor: input.actor,
    petKey: String(input.petKey ?? ''),
    petName: String(input.petName ?? ''),
    text: input.text,
    wallet,
    likes: 0,
  };
}

export function listNotes(petKey: string, limit = 20): ChipetNote[] {
  seedIfEmpty();
  const key = petKey.trim().slice(0, 128);
  if (!key) return [];
  const rows = getAdminDb().prepare(`
    SELECT id, pet_key, from_json, text_json, at, wallet
    FROM chipet_notes WHERE pet_key = ? ORDER BY at DESC LIMIT ?
  `).all(key, Math.min(Math.max(1, limit), 50)) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    petKey: String(r.pet_key),
    from: parseJson<JsonText>(String(r.from_json), ''),
    text: parseJson<JsonText>(String(r.text_json), ''),
    at: Number(r.at),
    wallet: String(r.wallet ?? ''),
  }));
}

function assertNoteRate(wallet: string, petKey: string) {
  const db = getAdminDb();
  const now = Date.now();
  const recent = db.prepare(`
    SELECT at, pet_key FROM chipet_notes WHERE wallet = ? AND at > ? ORDER BY at DESC LIMIT 20
  `).all(wallet, now - NOTE_PET_WINDOW_MS) as { at: number; pet_key: string }[];

  const global = recent.filter((r) => r.at > now - NOTE_WINDOW_MS);
  if (global.length >= NOTE_WINDOW_MAX) {
    throw new Error('note rate limited');
  }
  const samePet = recent.filter((r) => r.pet_key === petKey);
  if (samePet.length >= NOTE_PET_WINDOW_MAX) {
    throw new Error('note rate limited for pet');
  }
  if (samePet[0] && now - samePet[0].at < NOTE_COOLDOWN_MS) {
    throw new Error('note cooldown');
  }
}

export function insertNote(input: {
  id?: string;
  petKey: string;
  from: JsonText;
  text: JsonText;
  at?: number;
  wallet: string;
}): ChipetNote {
  seedIfEmpty();
  const addr = normalizeAddress(input.wallet);
  if (!addr) throw new Error('invalid address');
  const petKey = String(input.petKey).trim().slice(0, 128);
  if (!petKey) throw new Error('missing petKey');
  assertNoteRate(addr, petKey);

  const id = (input.id ?? `n${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`).slice(0, 64);
  const at = input.at ?? Date.now();
  getAdminDb().prepare(`
    INSERT OR REPLACE INTO chipet_notes (id, pet_key, from_json, text_json, at, wallet)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, petKey, toJson(input.from), toJson(input.text), at, addr);

  return { id, petKey, from: input.from, text: input.text, at, wallet: addr };
}

/** 击掌切换；返回当前是否已赞与总赞数 */
export function toggleLike(activityId: string, wallet: string): { liked: boolean; likes: number } {
  seedIfEmpty();
  const addr = normalizeAddress(wallet);
  if (!addr) throw new Error('invalid address');
  const id = activityId.trim().slice(0, 64);
  if (!id) throw new Error('missing activityId');
  const db = getAdminDb();
  const exists = db.prepare(`SELECT id FROM chipet_activities WHERE id = ?`).get(id);
  if (!exists) throw new Error('activity not found');

  const row = db.prepare(`SELECT wallet FROM chipet_activity_likes WHERE activity_id = ? AND wallet = ?`).get(id, addr);
  if (row) {
    db.prepare(`DELETE FROM chipet_activity_likes WHERE activity_id = ? AND wallet = ?`).run(id, addr);
  } else {
    db.prepare(`INSERT INTO chipet_activity_likes (activity_id, wallet, at) VALUES (?, ?, ?)`).run(id, addr, Date.now());
  }
  const likes = Number((db.prepare(`SELECT COUNT(*) AS n FROM chipet_activity_likes WHERE activity_id = ?`).get(id) as { n: number }).n) || 0;
  return { liked: !row, likes };
}

export function bumpPetAgg(petKey: string, field: 'pats' | 'visits', delta = 1): { pats: number; visits: number } {
  seedIfEmpty();
  ensureNpcProfiles();
  const key = petKey.trim().slice(0, 128);
  if (!key) throw new Error('missing petKey');
  const d = Math.max(0, Math.floor(delta));
  const db = getAdminDb();
  db.prepare(`INSERT OR IGNORE INTO chipet_pet_agg (pet_key, pats, visits, updated_at) VALUES (?, 0, 0, ?)`).run(key, Date.now());
  if (field === 'pats') {
    db.prepare(`UPDATE chipet_pet_agg SET pats = pats + ?, updated_at = ? WHERE pet_key = ?`).run(d, Date.now(), key);
  } else {
    db.prepare(`UPDATE chipet_pet_agg SET visits = visits + ?, updated_at = ? WHERE pet_key = ?`).run(d, Date.now(), key);
  }
  const row = db.prepare(`SELECT pats, visits FROM chipet_pet_agg WHERE pet_key = ?`).get(key) as { pats: number; visits: number };
  scheduleLeaderboardRecompute();
  return { pats: Number(row.pats) || 0, visits: Number(row.visits) || 0 };
}

export function getPetAgg(petKey: string): { pats: number; visits: number } {
  seedIfEmpty();
  const key = petKey.trim().slice(0, 128);
  if (!key) return { pats: 0, visits: 0 };
  const row = getAdminDb().prepare(`SELECT pats, visits FROM chipet_pet_agg WHERE pet_key = ?`).get(key) as { pats: number; visits: number } | undefined;
  return { pats: Number(row?.pats) || 0, visits: Number(row?.visits) || 0 };
}

export interface ChipetPetAggRow {
  petKey: string;
  pats: number;
  visits: number;
  wins: number;
  level: number;
  intimacy: number;
  rarity: number;
  energy: number;
  mood: number;
  name: string;
  owner: JsonText;
  cpu: string;
  circuitId: string;
  routeId: number;
  updatedAt: number;
}

export type LeaderboardKind = 'pats' | 'wins' | 'intimacy' | 'level' | 'heat';

export interface ChipetLeaderboardItem extends ChipetPetAggRow {
  score: number;
  recent: number;
}

const MOCK_CPU = '0x000000000000000000000000000000000000c111';

/** 旧库已 seeded 但缺 NPC 档案时补齐（不覆盖已有 pats/visits）。 */
function ensureNpcProfiles() {
  ensureTables();
  const db = getAdminDb();
  const now = Date.now();
  const npcSeed: {
    id: number; name: string; owner: JsonText; circuitId: string; rarity: number;
    intimacy: number; level: number; wins: number; energy: number; mood: number;
  }[] = [
    { id: -1, name: '青橘', owner: { zh: '林间小站', en: 'ForestStop' }, circuitId: '2048', rarity: 1, intimacy: 24, level: 4, wins: 6, energy: 88, mood: 92 },
    { id: -2, name: '比特', owner: { zh: 'XLayerFans', en: 'XLayerFans' }, circuitId: '3110', rarity: 0, intimacy: 11, level: 2, wins: 2, energy: 70, mood: 65 },
    { id: -3, name: '糖芯', owner: { zh: '喵呜研究所', en: 'MeowLabs' }, circuitId: '7777', rarity: 2, intimacy: 56, level: 7, wins: 15, energy: 95, mood: 98 },
    { id: -4, name: '豆皮', owner: { zh: '周末玩家', en: 'WeekendPlayer' }, circuitId: '1201', rarity: 0, intimacy: 8, level: 1, wins: 1, energy: 60, mood: 80 },
    { id: -5, name: '海盐', owner: { zh: 'DeWEB旅行者', en: 'DeWEBNomad' }, circuitId: '9090', rarity: 1, intimacy: 19, level: 3, wins: 4, energy: 75, mood: 70 },
    { id: -6, name: '脉冲', owner: { zh: '电路夜猫', en: 'CircuitNightOwl' }, circuitId: '4242', rarity: 2, intimacy: 41, level: 6, wins: 11, energy: 90, mood: 85 },
  ];
  for (const n of npcSeed) {
    const key = `npc:${n.id}`;
    const row = db.prepare(`SELECT pet_key, name FROM chipet_pet_agg WHERE pet_key = ?`).get(key) as { pet_key: string; name: string } | undefined;
    if (!row) {
      const pats = 3 + (Math.abs(n.id) * 7) % 40;
      const visits = 20 + (Math.abs(n.id) * 11) % 80;
      db.prepare(`
        INSERT INTO chipet_pet_agg (
          pet_key, pats, visits, wins, level, intimacy, rarity, energy, mood,
          name, owner_json, cpu, circuit_id, route_id, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        key, pats, visits, n.wins, n.level, n.intimacy, n.rarity, n.energy, n.mood,
        n.name, toJson(n.owner), MOCK_CPU, n.circuitId, n.id, now,
      );
    } else if (!row.name) {
      db.prepare(`
        UPDATE chipet_pet_agg SET
          wins = ?, level = ?, intimacy = ?, rarity = ?, energy = ?, mood = ?,
          name = ?, owner_json = ?, cpu = ?, circuit_id = ?, route_id = ?,
          updated_at = ?
        WHERE pet_key = ?
      `).run(
        n.wins, n.level, n.intimacy, n.rarity, n.energy, n.mood,
        n.name, toJson(n.owner), MOCK_CPU, n.circuitId, n.id, now, key,
      );
    }
  }
}

/** 名字是否仍是 petKey 占位（mine:1 / npc:-2） */
function isPlaceholderPetName(name: string, petKey: string): boolean {
  const n = name.trim();
  if (!n) return true;
  if (n === petKey) return true;
  if (/^mine:\d+$/i.test(n)) return true;
  if (/^npc:-?\d+$/i.test(n)) return true;
  return false;
}

/** 从动态表回填真实宠名；仍没有则返回空串（绝不回落成 mine:1）。 */
function resolvePetDisplayName(petKey: string, stored: string): string {
  if (!isPlaceholderPetName(stored, petKey)) return stored.trim().slice(0, 32);
  try {
    const row = getAdminDb().prepare(`
      SELECT pet_name FROM chipet_activities
      WHERE pet_key = ?
        AND pet_name IS NOT NULL AND TRIM(pet_name) != ''
        AND pet_name NOT LIKE 'mine:%'
        AND pet_name NOT LIKE 'npc:%'
      ORDER BY at DESC
      LIMIT 1
    `).get(petKey) as { pet_name: string } | undefined;
    const fromAct = String(row?.pet_name ?? '').trim();
    if (fromAct && !isPlaceholderPetName(fromAct, petKey)) return fromAct.slice(0, 32);
  } catch { /* ignore */ }
  return '';
}

function rowToAgg(r: Record<string, unknown>): ChipetPetAggRow {
  const petKey = String(r.pet_key ?? '');
  let routeId = Number(r.route_id) || 0;
  if (!routeId) {
    if (petKey.startsWith('npc:')) routeId = Number(petKey.slice(4)) || 0;
    else if (petKey.startsWith('mine:')) routeId = Number(petKey.slice(5)) || 0;
  }
  const rawName = String(r.name ?? '');
  return {
    petKey,
    pats: Number(r.pats) || 0,
    visits: Number(r.visits) || 0,
    wins: Number(r.wins) || 0,
    level: Math.max(1, Number(r.level) || 1),
    intimacy: Math.max(0, Number(r.intimacy) || 0),
    rarity: Math.max(0, Math.min(2, Number(r.rarity) || 0)),
    energy: Math.max(0, Math.min(100, Number(r.energy) || 80)),
    mood: Math.max(0, Math.min(100, Number(r.mood) || 70)),
    name: resolvePetDisplayName(petKey, rawName),
    owner: parseJson<JsonText>(String(r.owner_json ?? '""'), ''),
    cpu: String(r.cpu ?? '') || MOCK_CPU,
    circuitId: String(r.circuit_id ?? '0') || '0',
    routeId,
    updatedAt: Number(r.updated_at) || 0,
  };
}

export function listAllPetAgg(): ChipetPetAggRow[] {
  seedIfEmpty();
  ensureNpcProfiles();
  const rows = getAdminDb().prepare(`SELECT * FROM chipet_pet_agg`).all() as Record<string, unknown>[];
  return rows.map(rowToAgg);
}

/** 写入/更新宠的排行榜档案（摸头增量仍走 bumpPetAgg）。 */
export function upsertPetStats(input: {
  petKey: string;
  pats?: number;
  visits?: number;
  wins?: number;
  level?: number;
  intimacy?: number;
  rarity?: number;
  energy?: number;
  mood?: number;
  name?: string;
  owner?: JsonText;
  cpu?: string;
  circuitId?: string;
  routeId?: number;
}): ChipetPetAggRow {
  seedIfEmpty();
  ensureNpcProfiles();
  const key = String(input.petKey).trim().slice(0, 128);
  if (!key) throw new Error('missing petKey');
  const db = getAdminDb();
  const prev = db.prepare(`SELECT * FROM chipet_pet_agg WHERE pet_key = ?`).get(key) as Record<string, unknown> | undefined;
  const now = Date.now();
  const next = {
    pats: input.pats != null ? Math.max(0, Math.floor(input.pats)) : (Number(prev?.pats) || 0),
    visits: input.visits != null ? Math.max(0, Math.floor(input.visits)) : (Number(prev?.visits) || 0),
    wins: input.wins != null ? Math.max(0, Math.floor(input.wins)) : (Number(prev?.wins) || 0),
    level: input.level != null ? Math.max(1, Math.floor(input.level)) : Math.max(1, Number(prev?.level) || 1),
    intimacy: input.intimacy != null ? Math.max(0, Math.floor(input.intimacy)) : Math.max(0, Number(prev?.intimacy) || 0),
    rarity: input.rarity != null ? Math.max(0, Math.min(2, Math.floor(input.rarity))) : Math.max(0, Math.min(2, Number(prev?.rarity) || 0)),
    energy: input.energy != null ? Math.max(0, Math.min(100, Math.floor(input.energy))) : Math.max(0, Math.min(100, Number(prev?.energy) || 80)),
    mood: input.mood != null ? Math.max(0, Math.min(100, Math.floor(input.mood))) : Math.max(0, Math.min(100, Number(prev?.mood) || 70)),
    name: (() => {
      const incoming = input.name != null ? String(input.name).trim() : '';
      const prevName = String(prev?.name ?? '').trim();
      if (incoming && !isPlaceholderPetName(incoming, key)) return incoming.slice(0, 32);
      if (prevName && !isPlaceholderPetName(prevName, key)) return prevName.slice(0, 32);
      return resolvePetDisplayName(key, incoming || prevName).slice(0, 32);
    })(),
    owner: input.owner ?? parseJson<JsonText>(String(prev?.owner_json ?? '""'), ''),
    cpu: (input.cpu ?? (String(prev?.cpu ?? '') || MOCK_CPU)).slice(0, 66),
    circuitId: (input.circuitId ?? (String(prev?.circuit_id ?? '0') || '0')).slice(0, 64),
    routeId: input.routeId != null ? Math.trunc(input.routeId) : (Number(prev?.route_id) || 0),
  };
  if (!next.routeId) {
    if (key.startsWith('npc:')) next.routeId = Number(key.slice(4)) || 0;
    else if (key.startsWith('mine:')) next.routeId = Number(key.slice(5)) || 0;
  }
  db.prepare(`
    INSERT INTO chipet_pet_agg (
      pet_key, pats, visits, wins, level, intimacy, rarity, energy, mood,
      name, owner_json, cpu, circuit_id, route_id, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(pet_key) DO UPDATE SET
      pats = excluded.pats,
      visits = excluded.visits,
      wins = excluded.wins,
      level = excluded.level,
      intimacy = excluded.intimacy,
      rarity = excluded.rarity,
      energy = excluded.energy,
      mood = excluded.mood,
      name = excluded.name,
      owner_json = excluded.owner_json,
      cpu = excluded.cpu,
      circuit_id = excluded.circuit_id,
      route_id = excluded.route_id,
      updated_at = excluded.updated_at
  `).run(
    key, next.pats, next.visits, next.wins, next.level, next.intimacy, next.rarity, next.energy, next.mood,
    next.name, toJson(next.owner), next.cpu, next.circuitId, next.routeId, now,
  );
  scheduleLeaderboardRecompute();
  return rowToAgg(db.prepare(`SELECT * FROM chipet_pet_agg WHERE pet_key = ?`).get(key) as Record<string, unknown>);
}

/** 计分规则（写入 chipet_leaderboard 前现算） */
export function scorePet(
  kind: LeaderboardKind,
  p: Pick<ChipetPetAggRow, 'pats' | 'visits' | 'wins' | 'intimacy' | 'level' | 'rarity'>,
  recent: number,
): number {
  if (kind === 'pats') return p.pats;
  if (kind === 'wins') return p.wins;
  if (kind === 'intimacy') return p.intimacy;
  if (kind === 'level') return p.level;
  // heat：摸头×3 + 串门 + 胜场×2 + 亲密 + 等级×2 + 近两日动态×4 + 稀有度×5
  return p.pats * 3 + p.visits + p.wins * 2 + p.intimacy + p.level * 2 + recent * 4 + p.rarity * 5;
}

function recentActivityCounts(extra?: Map<string, number>): Map<string, number> {
  const recentAt = Date.now() - 2 * 86_400_000;
  const recentRows = getAdminDb().prepare(`
    SELECT pet_key, COUNT(*) AS n FROM chipet_activities
    WHERE at > ? AND pet_key != '' GROUP BY pet_key
  `).all(recentAt) as { pet_key: string; n: number }[];
  const map = new Map(recentRows.map((r) => [r.pet_key, Number(r.n) || 0]));
  if (extra) {
    for (const [k, n] of extra) map.set(k, (map.get(k) ?? 0) + n);
  }
  return map;
}

function computeKindScores(
  kind: LeaderboardKind,
  pets: ChipetPetAggRow[],
  recentMap: Map<string, number>,
  limit = 50,
): ChipetLeaderboardItem[] {
  return pets.map((p) => {
    const recent = recentMap.get(p.petKey) ?? 0;
    return { ...p, score: scorePet(kind, p, recent), recent };
  })
    .sort((a, b) => b.score - a.score || b.rarity - a.rarity || b.wins - a.wins)
    .slice(0, limit);
}

const LB_KINDS: LeaderboardKind[] = ['heat', 'pats', 'wins', 'intimacy', 'level'];
let lbRecomputeTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 动态算分并整表写入 chipet_leaderboard（每种榜 top 50）。
 * pets / recentExtra 可注入写队列 pending，使刷库前也能物化最新榜。
 */
export function recomputeAndStoreLeaderboards(opts?: {
  pets?: ChipetPetAggRow[];
  recentExtra?: Map<string, number>;
}): number {
  seedIfEmpty();
  ensureNpcProfiles();
  const db = getAdminDb();
  // 物化前把 agg 里的 mine:1 占位名回填成真实昵称
  const rawPets = opts?.pets ?? listAllPetAgg();
  const pets = rawPets
    .map((p) => {
      if (!isPlaceholderPetName(p.name, p.petKey)) return p;
      const fixed = resolvePetDisplayName(p.petKey, p.name);
      if (!fixed || fixed === p.name) return { ...p, name: '' };
      try {
        db.prepare(`UPDATE chipet_pet_agg SET name = ? WHERE pet_key = ?`).run(fixed, p.petKey);
      } catch { /* ignore */ }
      return { ...p, name: fixed };
    })
    // 没有真实昵称的（宠已不在 / 只有 mine:id）不进排行榜
    .filter((p) => !!p.name && !isPlaceholderPetName(p.name, p.petKey));
  const recentMap = recentActivityCounts(opts?.recentExtra);
  const now = Date.now();
  const insert = db.prepare(`
    INSERT INTO chipet_leaderboard (
      kind, rank, pet_key, score, recent, pats, visits, wins, level, intimacy, rarity,
      energy, mood, name, owner_json, cpu, circuit_id, route_id, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let rows = 0;
  db.exec('BEGIN');
  try {
    for (const kind of LB_KINDS) {
      db.prepare(`DELETE FROM chipet_leaderboard WHERE kind = ?`).run(kind);
      const scored = computeKindScores(kind, pets, recentMap, 50);
      scored.forEach((p, i) => {
        insert.run(
          kind, i + 1, p.petKey, p.score, p.recent, p.pats, p.visits, p.wins, p.level, p.intimacy, p.rarity,
          p.energy, p.mood, p.name, toJson(p.owner), p.cpu, p.circuitId, p.routeId, now,
        );
        rows += 1;
      });
    }
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    throw e;
  }
  return rows;
}

/** 防抖重算（摸头/刷队列后调用） */
export function scheduleLeaderboardRecompute(delayMs = 800): void {
  if (lbRecomputeTimer) clearTimeout(lbRecomputeTimer);
  lbRecomputeTimer = setTimeout(() => {
    lbRecomputeTimer = null;
    try {
      recomputeAndStoreLeaderboards();
    } catch (e) {
      console.error('[chipet-lb] recompute failed', e);
    }
  }, delayMs);
}

/** 从物化表读取排行；空表则先算一遍再读。 */
export function listLeaderboard(kind: LeaderboardKind, limit = 10): ChipetLeaderboardItem[] {
  seedIfEmpty();
  ensureNpcProfiles();
  const lim = Math.min(Math.max(1, limit), 50);
  const db = getAdminDb();
  let n = Number(
    (db.prepare(`SELECT COUNT(*) AS n FROM chipet_leaderboard WHERE kind = ?`).get(kind) as { n: number })?.n,
  ) || 0;
  if (n === 0) recomputeAndStoreLeaderboards();

  const rows = db.prepare(`
    SELECT * FROM chipet_leaderboard WHERE kind = ? ORDER BY rank ASC LIMIT ?
  `).all(kind, lim) as Record<string, unknown>[];

  return rows.map((r) => ({
    ...rowToAgg({
      pet_key: r.pet_key,
      pats: r.pats,
      visits: r.visits,
      wins: r.wins,
      level: r.level,
      intimacy: r.intimacy,
      rarity: r.rarity,
      energy: r.energy,
      mood: r.mood,
      name: r.name,
      owner_json: r.owner_json,
      cpu: r.cpu,
      circuit_id: r.circuit_id,
      route_id: r.route_id,
      updated_at: r.updated_at,
    }),
    score: Number(r.score) || 0,
    recent: Number(r.recent) || 0,
  }));
}

export function getWalletProfile(address: string): ChipetWalletProfile {
  seedIfEmpty();
  const addr = normalizeAddress(address);
  if (!addr) throw new Error('invalid address');
  const row = getAdminDb().prepare(`SELECT * FROM chipet_wallet_profiles WHERE address = ?`).get(addr) as Record<string, unknown> | undefined;
  if (!row) {
    return {
      address: addr,
      displayName: '',
      nameCustomized: false,
      friendCode: '',
      checkinDay: '',
      streak: 0,
      fish: 0,
      quest: { day: '', n: {}, claimed: {} },
      myPatsToday: {},
      giftsToday: {},
      wildDay: {},
      bonds: [],
      liked: {},
      bubbles: {},
      updatedAt: 0,
      exists: false,
    };
  }
  return {
    address: addr,
    displayName: String(row.display_name ?? ''),
    nameCustomized: Number(row.name_customized) === 1,
    friendCode: String(row.friend_code ?? ''),
    checkinDay: String(row.checkin_day ?? ''),
    streak: Number(row.streak) || 0,
    fish: Math.max(0, Number(row.fish) || 0),
    quest: parseJson(String(row.quest_json ?? '{}'), { day: '', n: {}, claimed: {} }),
    myPatsToday: parseJson(String(row.my_pats_today_json ?? '{}'), {}),
    giftsToday: parseJson(String(row.gifts_today_json ?? '{}'), {}),
    wildDay: parseJson(String(row.wild_day_json ?? '{}'), {}),
    bonds: parseJson(String(row.bonds_json ?? '[]'), []),
    liked: parseJson(String(row.liked_json ?? '{}'), {}),
    bubbles: parseJson(String(row.bubbles_json ?? '{}'), {}),
    updatedAt: Number(row.updated_at) || 0,
    exists: true,
  };
}

export function putWalletProfile(input: {
  address: string;
  displayName?: string;
  nameCustomized?: boolean;
  friendCode?: string;
  checkinDay?: string;
  streak?: number;
  fish?: number;
  quest?: ChipetWalletProfile['quest'];
  myPatsToday?: Record<string, string>;
  giftsToday?: Record<string, string>;
  wildDay?: Record<string, string>;
  bonds?: string[];
  liked?: Record<string, boolean>;
  bubbles?: Record<string, JsonText>;
}): ChipetWalletProfile {
  seedIfEmpty();
  const addr = normalizeAddress(input.address);
  if (!addr) throw new Error('invalid address');
  const now = Date.now();
  const prev = getWalletProfile(addr);
  const next = {
    displayName: (input.displayName ?? prev.displayName).slice(0, 16),
    nameCustomized: input.nameCustomized ?? prev.nameCustomized,
    friendCode: (input.friendCode ?? prev.friendCode).slice(0, 32),
    checkinDay: input.checkinDay ?? prev.checkinDay,
    streak: Math.max(0, Number(input.streak ?? prev.streak) || 0),
    fish: Math.max(0, Number(input.fish ?? prev.fish) || 0),
    quest: input.quest ?? prev.quest,
    myPatsToday: input.myPatsToday ?? prev.myPatsToday,
    giftsToday: input.giftsToday ?? prev.giftsToday,
    wildDay: input.wildDay ?? prev.wildDay,
    bonds: input.bonds ?? prev.bonds,
    liked: input.liked ?? prev.liked,
    bubbles: input.bubbles ?? prev.bubbles,
  };
  getAdminDb().prepare(`
    INSERT INTO chipet_wallet_profiles (
      address, display_name, name_customized, friend_code, checkin_day, streak, fish,
      quest_json, my_pats_today_json, gifts_today_json, wild_day_json,
      bonds_json, liked_json, bubbles_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(address) DO UPDATE SET
      display_name = excluded.display_name,
      name_customized = excluded.name_customized,
      friend_code = excluded.friend_code,
      checkin_day = excluded.checkin_day,
      streak = excluded.streak,
      fish = excluded.fish,
      quest_json = excluded.quest_json,
      my_pats_today_json = excluded.my_pats_today_json,
      gifts_today_json = excluded.gifts_today_json,
      wild_day_json = excluded.wild_day_json,
      bonds_json = excluded.bonds_json,
      liked_json = excluded.liked_json,
      bubbles_json = excluded.bubbles_json,
      updated_at = excluded.updated_at
  `).run(
    addr,
    next.displayName,
    next.nameCustomized ? 1 : 0,
    next.friendCode,
    next.checkinDay,
    next.streak,
    next.fish,
    toJson(next.quest),
    toJson(next.myPatsToday),
    toJson(next.giftsToday),
    toJson(next.wildDay),
    toJson(next.bonds),
    toJson(next.liked),
    toJson(next.bubbles),
    now,
  );
  return { ...getWalletProfile(addr), exists: true };
}

/**
 * 把浏览器本地广场数据一次性灌进库（活动 / 留言 / 摸访聚合）。
 * 活动与留言按 id INSERT OR IGNORE；摸访取 max(本地, 库)，避免空库或种子盖掉用户数据。
 */
export function bootstrapPublic(input: {
  wallet?: string;
  activities?: {
    id?: string;
    at?: number;
    kind: string;
    actor: JsonText;
    petKey?: string;
    petName?: string;
    text: JsonText;
  }[];
  notes?: {
    id?: string;
    petKey: string;
    from: JsonText;
    text: JsonText;
    at?: number;
  }[];
  petAggs?: {
    petKey: string;
    pats?: number;
    visits?: number;
    wins?: number;
    level?: number;
    intimacy?: number;
    rarity?: number;
    energy?: number;
    mood?: number;
    name?: string;
    owner?: JsonText;
    cpu?: string;
    circuitId?: string;
    routeId?: number;
  }[];
  likes?: { activityId: string; count?: number }[];
}): { activities: number; notes: number; petAggs: number; likes: number } {
  seedIfEmpty();
  ensureNpcProfiles();
  const db = getAdminDb();
  const wallet = input.wallet ? (normalizeAddress(input.wallet) ?? '') : '';
  let nAct = 0;
  let nNote = 0;
  let nAgg = 0;
  let nLike = 0;

  const acts = (input.activities ?? []).slice(0, 80);
  const insertAct = db.prepare(`
    INSERT OR IGNORE INTO chipet_activities (id, at, kind, actor_json, pet_key, pet_name, text_json, wallet)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const a of acts) {
    if (!a?.kind || a.text == null) continue;
    const id = String(a.id ?? `a${Date.now()}${Math.random().toString(36).slice(2, 8)}`).slice(0, 64);
    const r = insertAct.run(
      id,
      Number(a.at) || Date.now(),
      String(a.kind).slice(0, 32),
      toJson(a.actor ?? ''),
      String(a.petKey ?? '').slice(0, 128),
      String(a.petName ?? '').slice(0, 64),
      toJson(a.text),
      wallet,
    );
    if (Number(r.changes) > 0) nAct += 1;
  }

  const notes = (input.notes ?? []).slice(0, 120);
  const insertNote = db.prepare(`
    INSERT OR IGNORE INTO chipet_notes (id, pet_key, from_json, text_json, at, wallet)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const n of notes) {
    if (!n?.petKey || n.text == null) continue;
    const id = String(n.id ?? `n${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`).slice(0, 64);
    const r = insertNote.run(
      id,
      String(n.petKey).trim().slice(0, 128),
      toJson(n.from ?? ''),
      toJson(n.text),
      Number(n.at) || Date.now(),
      wallet,
    );
    if (Number(r.changes) > 0) nNote += 1;
  }

  for (const p of (input.petAggs ?? []).slice(0, 120)) {
    if (!p?.petKey) continue;
    const key = String(p.petKey).trim().slice(0, 128);
    const prev = db.prepare(`SELECT * FROM chipet_pet_agg WHERE pet_key = ?`).get(key) as Record<string, unknown> | undefined;
    const pats = Math.max(Number(prev?.pats) || 0, Math.max(0, Math.floor(Number(p.pats) || 0)));
    const visits = Math.max(Number(prev?.visits) || 0, Math.max(0, Math.floor(Number(p.visits) || 0)));
    upsertPetStats({
      petKey: key,
      pats,
      visits,
      wins: p.wins,
      level: p.level,
      intimacy: p.intimacy,
      rarity: p.rarity,
      energy: p.energy,
      mood: p.mood,
      name: p.name,
      owner: p.owner,
      cpu: p.cpu,
      circuitId: p.circuitId,
      routeId: p.routeId,
    });
    nAgg += 1;
  }

  const likeIns = db.prepare(`INSERT OR IGNORE INTO chipet_activity_likes (activity_id, wallet, at) VALUES (?, ?, ?)`);
  for (const L of (input.likes ?? []).slice(0, 200)) {
    const aid = String(L.activityId ?? '').slice(0, 64);
    if (!aid) continue;
    const count = Math.min(20, Math.max(0, Math.floor(Number(L.count) || 0)));
    const exists = db.prepare(`SELECT id FROM chipet_activities WHERE id = ?`).get(aid);
    if (!exists) continue;
    for (let i = 0; i < count; i++) {
      const r = likeIns.run(aid, `boot:${aid}:${i}`, Date.now());
      if (Number(r.changes) > 0) nLike += 1;
    }
  }

  if (nAct + nNote + nAgg + nLike > 0) scheduleLeaderboardRecompute(200);
  return { activities: nAct, notes: nNote, petAggs: nAgg, likes: nLike };
}
