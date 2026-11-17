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

function ensureTables() {
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
      visits INTEGER NOT NULL DEFAULT 0
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
  `);
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
  const db = getAdminDb();
  const meta = db.prepare(`SELECT value FROM chipet_social_meta WHERE key = 'seeded'`).get() as { value: string } | undefined;
  if (meta?.value === '1') return;

  const count = db.prepare(`SELECT COUNT(*) AS n FROM chipet_activities`).get() as { n: number };
  if (Number(count.n) > 0) {
    db.prepare(`INSERT OR REPLACE INTO chipet_social_meta (key, value) VALUES ('seeded', '1')`).run();
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

  // NPC pet agg seed
  const agg = db.prepare(`INSERT OR IGNORE INTO chipet_pet_agg (pet_key, pats, visits) VALUES (?, ?, ?)`);
  for (const id of [-1, -2, -3, -4, -5, -6]) {
    agg.run(`npc:${id}`, 3 + (Math.abs(id) * 7) % 40, 20 + (Math.abs(id) * 11) % 80);
  }

  db.prepare(`INSERT OR REPLACE INTO chipet_social_meta (key, value) VALUES ('seeded', '1')`).run();
}

function likeCounts(ids: string[]): Record<string, number> {
  if (!ids.length) return {};
  const db = getAdminDb();
  const out: Record<string, number> = {};
  const stmt = db.prepare(`SELECT COUNT(*) AS n FROM chipet_activity_likes WHERE activity_id = ?`);
  for (const id of ids) {
    const row = stmt.get(id) as { n: number };
    out[id] = Number(row.n) || 0;
  }
  return out;
}

export function listFeed(opts?: { limit?: number; before?: number }): { items: ChipetActivity[]; likes: Record<string, number> } {
  seedIfEmpty();
  const limit = Math.min(Math.max(1, opts?.limit ?? 40), 100);
  const before = opts?.before;
  const db = getAdminDb();
  const rows = (before != null
    ? db.prepare(`
        SELECT id, at, kind, actor_json, pet_key, pet_name, text_json, wallet
        FROM chipet_activities WHERE at < ? ORDER BY at DESC LIMIT ?
      `).all(before, limit)
    : db.prepare(`
        SELECT id, at, kind, actor_json, pet_key, pet_name, text_json, wallet
        FROM chipet_activities ORDER BY at DESC LIMIT ?
      `).all(limit)) as Record<string, unknown>[];

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
  return { items, likes };
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
  const key = petKey.trim().slice(0, 128);
  if (!key) throw new Error('missing petKey');
  const d = Math.max(0, Math.floor(delta));
  const db = getAdminDb();
  db.prepare(`INSERT OR IGNORE INTO chipet_pet_agg (pet_key, pats, visits) VALUES (?, 0, 0)`).run(key);
  if (field === 'pats') {
    db.prepare(`UPDATE chipet_pet_agg SET pats = pats + ? WHERE pet_key = ?`).run(d, key);
  } else {
    db.prepare(`UPDATE chipet_pet_agg SET visits = visits + ? WHERE pet_key = ?`).run(d, key);
  }
  const row = db.prepare(`SELECT pats, visits FROM chipet_pet_agg WHERE pet_key = ?`).get(key) as { pats: number; visits: number };
  return { pats: Number(row.pats) || 0, visits: Number(row.visits) || 0 };
}

export function getPetAgg(petKey: string): { pats: number; visits: number } {
  seedIfEmpty();
  const key = petKey.trim().slice(0, 128);
  if (!key) return { pats: 0, visits: 0 };
  const row = getAdminDb().prepare(`SELECT pats, visits FROM chipet_pet_agg WHERE pet_key = ?`).get(key) as { pats: number; visits: number } | undefined;
  return { pats: Number(row?.pats) || 0, visits: Number(row?.visits) || 0 };
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
