/**
 * Chipet 高频写缓冲：动态 / 点赞 / 摸访先入 Redis（或内存），再定时+阈值批量刷 SQLite。
 * 读路径合并 pending overlay，避免刷库前读不到刚写入的数据。
 */
import { getRedis } from './adminAuth.ts';
import { getAdminDb } from './adminDb.ts';
import {
  bumpPetAgg, getPetAgg, insertActivity, listAllPetAgg, listFeed,
  type ChipetActivity, type ChipetLeaderboardItem, type ChipetPetAggRow,
  type JsonText, type LeaderboardKind,
} from './chipetSocial.ts';
import { normalizeAddress } from './walletUsers.ts';

const JOBS_KEY = 'chipet:wq:jobs';
const FLUSH_INTERVAL_MS = 3_000;
const FLUSH_THRESHOLD = 100;
const FLUSH_BATCH = 100;

type ActivityJob = {
  t: 'activity';
  id: string;
  at: number;
  kind: string;
  actor: JsonText;
  petKey: string;
  petName: string;
  text: JsonText;
  wallet: string;
};

type LikeJob = {
  t: 'like_set';
  activityId: string;
  wallet: string;
  liked: boolean;
};

type AggJob = {
  t: 'pet_agg';
  petKey: string;
  field: 'pats' | 'visits';
  delta: number;
};

type Job = ActivityJob | LikeJob | AggJob;

const memJobs: Job[] = [];
const pendingActs = new Map<string, ChipetActivity>();
const pendingLikes = new Map<string, Map<string, boolean>>();
const pendingAgg = new Map<string, { pats: number; visits: number }>();

let flushTimer: ReturnType<typeof setInterval> | null = null;
let flushing = false;

async function queueLen(): Promise<number> {
  const r = await getRedis();
  if (r?.isOpen) {
    try { return await r.lLen(JOBS_KEY); } catch (e) {
      console.error('[chipet-wq] llen failed', e);
    }
  }
  return memJobs.length;
}

async function pushJob(job: Job): Promise<void> {
  const r = await getRedis();
  if (r?.isOpen) {
    try {
      await r.rPush(JOBS_KEY, JSON.stringify(job));
      if ((await r.lLen(JOBS_KEY)) >= FLUSH_THRESHOLD) void flushWriteQueue();
      return;
    } catch (e) {
      console.error('[chipet-wq] rpush failed, use memory', e);
    }
  }
  memJobs.push(job);
  if (memJobs.length >= FLUSH_THRESHOLD) void flushWriteQueue();
}

async function popJobs(limit: number): Promise<Job[]> {
  const r = await getRedis();
  if (r?.isOpen) {
    try {
      const raw = await r.lRange(JOBS_KEY, 0, limit - 1);
      if (raw.length) await r.lTrim(JOBS_KEY, raw.length, -1);
      const out: Job[] = [];
      for (const s of raw) {
        try { out.push(JSON.parse(s) as Job); } catch { /* skip */ }
      }
      return out;
    } catch (e) {
      console.error('[chipet-wq] pop failed', e);
    }
  }
  return memJobs.splice(0, limit);
}

function dbHasLike(activityId: string, wallet: string): boolean {
  return Boolean(
    getAdminDb().prepare(
      `SELECT wallet FROM chipet_activity_likes WHERE activity_id = ? AND wallet = ?`,
    ).get(activityId, wallet),
  );
}

function dbLikeCount(activityId: string): number {
  return Number(
    (getAdminDb().prepare(`SELECT COUNT(*) AS n FROM chipet_activity_likes WHERE activity_id = ?`).get(activityId) as { n: number })?.n,
  ) || 0;
}

function applyLikeSetToDb(activityId: string, wallet: string, liked: boolean) {
  const has = dbHasLike(activityId, wallet);
  if (liked && !has) {
    getAdminDb().prepare(
      `INSERT INTO chipet_activity_likes (activity_id, wallet, at) VALUES (?, ?, ?)`,
    ).run(activityId, wallet, Date.now());
  } else if (!liked && has) {
    getAdminDb().prepare(
      `DELETE FROM chipet_activity_likes WHERE activity_id = ? AND wallet = ?`,
    ).run(activityId, wallet);
  }
}

function applyJobToDb(job: Job) {
  if (job.t === 'activity') {
    insertActivity({
      id: job.id,
      at: job.at,
      kind: job.kind,
      actor: job.actor,
      petKey: job.petKey,
      petName: job.petName,
      text: job.text,
      wallet: job.wallet,
    });
    return;
  }
  if (job.t === 'like_set') {
    applyLikeSetToDb(job.activityId, job.wallet, job.liked);
    return;
  }
  bumpPetAgg(job.petKey, job.field, job.delta);
}

function clearOverlaysForJobs(jobs: Job[]) {
  for (const j of jobs) {
    if (j.t === 'activity') pendingActs.delete(j.id);
    if (j.t === 'like_set') {
      const m = pendingLikes.get(j.activityId);
      if (m) {
        m.delete(j.wallet);
        if (m.size === 0) pendingLikes.delete(j.activityId);
      }
    }
    if (j.t === 'pet_agg') {
      const cur = pendingAgg.get(j.petKey);
      if (!cur) continue;
      if (j.field === 'pats') cur.pats = Math.max(0, cur.pats - j.delta);
      else cur.visits = Math.max(0, cur.visits - j.delta);
      if (cur.pats === 0 && cur.visits === 0) pendingAgg.delete(j.petKey);
      else pendingAgg.set(j.petKey, cur);
    }
  }
}

function likeCountWithPending(activityId: string): number {
  let delta = 0;
  const m = pendingLikes.get(activityId);
  if (m) {
    for (const [wallet, liked] of m) {
      const has = dbHasLike(activityId, wallet);
      if (liked && !has) delta += 1;
      if (!liked && has) delta -= 1;
    }
  }
  return Math.max(0, dbLikeCount(activityId) + delta);
}

function isLikedWithPending(activityId: string, wallet: string): boolean {
  const m = pendingLikes.get(activityId);
  if (m?.has(wallet)) return Boolean(m.get(wallet));
  return dbHasLike(activityId, wallet);
}

export async function enqueueActivity(input: {
  id?: string;
  at?: number;
  kind: string;
  actor: JsonText;
  petKey?: string;
  petName?: string;
  text: JsonText;
  wallet?: string;
}): Promise<ChipetActivity> {
  const id = (input.id ?? `a${Date.now()}${Math.random().toString(36).slice(2, 8)}`).slice(0, 64);
  const at = input.at ?? Date.now();
  const wallet = input.wallet ? (normalizeAddress(input.wallet) ?? '') : '';
  const job: ActivityJob = {
    t: 'activity',
    id,
    at,
    kind: String(input.kind).slice(0, 32),
    actor: input.actor,
    petKey: String(input.petKey ?? '').slice(0, 128),
    petName: String(input.petName ?? '').slice(0, 64),
    text: input.text,
    wallet,
  };
  const item: ChipetActivity = {
    id: job.id, at: job.at, kind: job.kind, actor: job.actor,
    petKey: job.petKey, petName: job.petName, text: job.text, wallet: job.wallet, likes: 0,
  };
  pendingActs.set(job.id, item);
  await pushJob(job);
  return item;
}

export async function enqueueLikeToggle(activityId: string, wallet: string): Promise<{ liked: boolean; likes: number }> {
  const addr = normalizeAddress(wallet);
  if (!addr) throw new Error('invalid address');
  const id = activityId.trim().slice(0, 64);
  if (!id) throw new Error('missing activityId');
  listFeed({ limit: 1 }); // 确保表结构 / 种子
  const exists = pendingActs.has(id)
    || Boolean(getAdminDb().prepare(`SELECT id FROM chipet_activities WHERE id = ?`).get(id));
  if (!exists) throw new Error('activity not found');

  const liked = !isLikedWithPending(id, addr);
  let m = pendingLikes.get(id);
  if (!m) { m = new Map(); pendingLikes.set(id, m); }
  m.set(addr, liked);
  await pushJob({ t: 'like_set', activityId: id, wallet: addr, liked });
  return { liked, likes: likeCountWithPending(id) };
}

export async function enqueuePetAggBump(
  petKey: string,
  field: 'pats' | 'visits',
  delta = 1,
): Promise<{ pats: number; visits: number }> {
  const key = petKey.trim().slice(0, 128);
  if (!key) throw new Error('missing petKey');
  const d = Math.max(0, Math.floor(delta));
  const cur = pendingAgg.get(key) ?? { pats: 0, visits: 0 };
  if (field === 'pats') cur.pats += d;
  else cur.visits += d;
  pendingAgg.set(key, cur);
  await pushJob({ t: 'pet_agg', petKey: key, field, delta: d });
  return getPetAggWithPending(key);
}

export function getPetAggWithPending(petKey: string): { pats: number; visits: number } {
  const base = getPetAgg(petKey);
  const add = pendingAgg.get(petKey.trim().slice(0, 128));
  return { pats: base.pats + (add?.pats ?? 0), visits: base.visits + (add?.visits ?? 0) };
}

export function listFeedWithPending(opts?: { limit?: number; before?: number }): {
  items: ChipetActivity[];
  likes: Record<string, number>;
} {
  const limit = Math.min(Math.max(1, opts?.limit ?? 40), 100);
  const before = opts?.before;
  const pending = [...pendingActs.values()]
    .filter((a) => (before == null ? true : a.at < before))
    .sort((a, b) => b.at - a.at);
  const feed = listFeed({ limit, before });
  const byId = new Map<string, ChipetActivity>();
  for (const a of pending) byId.set(a.id, a);
  for (const a of feed.items) {
    if (!byId.has(a.id)) byId.set(a.id, a);
  }
  const items = [...byId.values()]
    .sort((a, b) => b.at - a.at)
    .slice(0, limit)
    .map((a) => ({ ...a, likes: likeCountWithPending(a.id) }));
  const likes: Record<string, number> = {};
  for (const a of items) likes[a.id] = a.likes;
  return { items, likes };
}

export function listAllPetAggWithPending(): ChipetPetAggRow[] {
  const byKey = new Map(listAllPetAgg().map((r) => [r.petKey, { ...r }]));
  for (const [key, add] of pendingAgg) {
    const cur = byKey.get(key);
    if (cur) {
      cur.pats += add.pats;
      cur.visits += add.visits;
    } else {
      byKey.set(key, {
        petKey: key, pats: add.pats, visits: add.visits, wins: 0, level: 1, intimacy: 0, rarity: 0,
        energy: 80, mood: 70, name: key, owner: '', cpu: '', circuitId: '0', routeId: 0, updatedAt: Date.now(),
      });
    }
  }
  return [...byKey.values()];
}

export function listLeaderboardWithPending(kind: LeaderboardKind, limit = 10): ChipetLeaderboardItem[] {
  const lim = Math.min(Math.max(1, limit), 50);
  const recentAt = Date.now() - 2 * 86_400_000;
  const recentRows = getAdminDb().prepare(`
    SELECT pet_key, COUNT(*) AS n FROM chipet_activities
    WHERE at > ? AND pet_key != '' GROUP BY pet_key
  `).all(recentAt) as { pet_key: string; n: number }[];
  const recentMap = new Map(recentRows.map((r) => [r.pet_key, Number(r.n) || 0]));
  // pending 动态也计入近两日
  for (const a of pendingActs.values()) {
    if (!a.petKey || a.at < recentAt) continue;
    recentMap.set(a.petKey, (recentMap.get(a.petKey) ?? 0) + 1);
  }

  const pets = listAllPetAggWithPending().filter((p) => p.name || p.pats > 0 || p.visits > 0 || p.wins > 0);
  return pets.map((p) => {
    const recent = recentMap.get(p.petKey) ?? 0;
    let score = 0;
    if (kind === 'pats') score = p.pats;
    else if (kind === 'wins') score = p.wins;
    else if (kind === 'intimacy') score = p.intimacy;
    else if (kind === 'level') score = p.level;
    else score = p.pats * 3 + p.visits + p.wins * 2 + p.intimacy + p.level * 2 + recent * 4 + p.rarity * 5;
    return { ...p, score, recent };
  }).sort((a, b) => b.score - a.score || b.rarity - a.rarity || b.wins - a.wins).slice(0, lim);
}

export async function flushWriteQueue(): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  let total = 0;
  try {
    for (;;) {
      const jobs = await popJobs(FLUSH_BATCH);
      if (!jobs.length) break;
      const db = getAdminDb();
      try {
        db.exec('BEGIN');
        for (const job of jobs) applyJobToDb(job);
        db.exec('COMMIT');
      } catch (e) {
        try { db.exec('ROLLBACK'); } catch { /* ignore */ }
        console.error('[chipet-wq] flush batch failed', e);
        memJobs.unshift(...jobs);
        break;
      }
      clearOverlaysForJobs(jobs);
      total += jobs.length;
      if (jobs.length < FLUSH_BATCH) break;
    }
  } finally {
    flushing = false;
  }
  return total;
}

export function startChipetWriteQueue(): void {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    void flushWriteQueue().catch((e) => console.error('[chipet-wq] timer flush', e));
  }, FLUSH_INTERVAL_MS);
  if (typeof flushTimer === 'object' && flushTimer && 'unref' in flushTimer) {
    (flushTimer as NodeJS.Timeout).unref();
  }
  console.log(`[chipet-wq] started (every ${FLUSH_INTERVAL_MS}ms or ≥${FLUSH_THRESHOLD} jobs)`);
}

export async function stopChipetWriteQueue(): Promise<void> {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  await flushWriteQueue();
}

export function resetWriteQueueForTests(): void {
  memJobs.length = 0;
  pendingActs.clear();
  pendingLikes.clear();
  pendingAgg.clear();
}

export async function writeQueueDepth(): Promise<number> {
  return queueLen();
}
