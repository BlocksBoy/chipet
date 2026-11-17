/**
 * Chipet 本地 ↔ API 同步：公共广场随时拉；私有进度连钱包后 hydrate / 上传。
 */
import {
  fetchChipetBem,
  fetchChipetFeed,
  fetchChipetLeaderboard,
  fetchChipetLocalPets,
  fetchChipetNotes,
  fetchChipetPetAggAll,
  fetchChipetProfile,
  postChipetActivity,
  postChipetBootstrap,
  postChipetLike,
  postChipetNote,
  postChipetPetAgg,
  putChipetBem,
  putChipetLocalPets,
  putChipetPetStats,
  putChipetProfile,
  type ChipetLeaderboardItemDto,
  type ChipetText,
} from '../api.ts';
import { bem } from './bem.ts';
import { social } from './social.ts';
import { isChainPet, localChipet, type LocalPet } from './store.ts';
import type { Address } from 'viem';
import { txt } from '../i18n.ts';

let profileTimer: ReturnType<typeof setTimeout> | null = null;
let bemTimer: ReturnType<typeof setTimeout> | null = null;
let petsTimer: ReturnType<typeof setTimeout> | null = null;
let hydrating = false;
/** 启动即视为加载中，直到首次 hydratePublic 结束 */
let publicLoading = true;
let publicHydrated = false;
let walletLoading = false;
const BOOTSTRAP_KEY = 'chipet.social.bootstrapped.v1';

type RankKind = 'pats' | 'wins' | 'intimacy' | 'level' | 'heat';
const leaderboardCache: Partial<Record<RankKind, ChipetLeaderboardItemDto[]>> = {};
const leaderboardSubs = new Set<() => void>();
let leaderboardRev = 0;
let leaderboardLoading = false;

const cloudSubs = new Set<() => void>();
let cloudRev = 0;
/** 广场动态服务端总数（分页） */
let feedTotal = 0;
/** 按页缓存：key=页码(从1起)；展示以 API 为准，可被 force 整页替换 */
const feedPageCache = new Map<number, Parameters<typeof social.applyCloudFeed>[0]>();
let feedPageSizeCached = 0;
const feedLoadingPages = new Set<number>();
const feedPagePromises = new Map<number, Promise<void>>();
/** 防止并发 force/非 force 旧请求回写覆盖新结果 */
const feedPageEpoch = new Map<number, number>();
let feedPageLoading = false;

function notifyCloud() {
  cloudRev += 1;
  cloudSubs.forEach((fn) => fn());
}

function notifyLeaderboard() {
  leaderboardRev += 1;
  leaderboardSubs.forEach((fn) => fn());
}

export function subscribeCloudSync(fn: () => void) {
  cloudSubs.add(fn);
  return () => { cloudSubs.delete(fn); };
}

export function getCloudSyncRev() {
  return cloudRev;
}

export function isPublicLoading() {
  return publicLoading;
}

export function isPublicHydrated() {
  return publicHydrated;
}

export function isWalletHydrating() {
  return walletLoading;
}

export function getFeedTotal() {
  return feedTotal;
}

export function isFeedPageLoading(page?: number) {
  if (page != null) return feedLoadingPages.has(Math.max(1, page));
  return feedPageLoading || feedLoadingPages.size > 0;
}

/** 已拉过的广场动态页；未拉过返回 undefined（区分「空页」与「还没请求」） */
export function getCachedFeedPage(page: number) {
  const p = Math.max(1, page);
  return feedPageCache.has(p) ? feedPageCache.get(p)! : undefined;
}

export function subscribeLeaderboard(fn: () => void) {
  leaderboardSubs.add(fn);
  return () => { leaderboardSubs.delete(fn); };
}

export function getLeaderboardRev() {
  return leaderboardRev;
}

export function isLeaderboardLoading() {
  return leaderboardLoading;
}

export function getCachedLeaderboard(kind: RankKind): ChipetLeaderboardItemDto[] | null {
  return leaderboardCache[kind] ?? null;
}

function wallet(): string {
  return (social.profile().boundWallet || '').toLowerCase();
}

export const cloudSync = {
  /**
   * 启动：先把本机广场数据灌进库（一次性），再拉库覆盖展示。
   * 这样库不会空，所有人看到的是同一份服务端动态。
   */
  async hydratePublic(): Promise<void> {
    publicLoading = true;
    notifyCloud();
    try {
      await this.bootstrapLocalPublic();

      const [feed, aggs] = await Promise.all([
        // 首屏多拉一些；广场分页按页直拉，不依赖本地累计条数
        fetchChipetFeed({ limit: 100, offset: 0 }),
        fetchChipetPetAggAll(),
      ]);
      if (feed) {
        feedTotal = Math.max(0, Number(feed.total) || feed.items?.length || 0);
        const items = (feed.items ?? []) as Parameters<typeof social.applyCloudFeed>[0];
        social.applyCloudFeed(items, feed.likes ?? {}, true);
        // 预填前几页缓存（与广场 FEED_PAGE=10 对齐）
        const ps = 10;
        feedPageSizeCached = ps;
        feedPageCache.clear();
        for (let i = 0; i * ps < items.length; i++) {
          feedPageCache.set(i + 1, items.slice(i * ps, (i + 1) * ps));
        }
      }
      if (aggs?.length) {
        const pats: Record<string, number> = {};
        const visits: Record<string, number> = {};
        for (const a of aggs) {
          pats[a.petKey] = a.pats;
          visits[a.petKey] = a.visits;
        }
        social.applyCloudPetAggBulk(pats, visits);
      }
      await this.refreshLeaderboards();
      publicHydrated = true;
    } finally {
      publicLoading = false;
      notifyCloud();
    }
  },

  /**
   * 按页直打后端 /api/chipet/feed?offset&limit。
   * page 从 1 起；广场列表以本次 API 结果为准（force 可打穿缓存）。
   */
  async loadFeedPage(page: number, pageSize: number, opts?: { force?: boolean }): Promise<void> {
    const size = Math.max(1, pageSize);
    const p = Math.max(1, page);
    const force = !!opts?.force;
    if (feedPageSizeCached && feedPageSizeCached !== size) {
      feedPageCache.clear();
    }
    feedPageSizeCached = size;
    if (!force && feedPageCache.has(p)) return;
    if (!force) {
      const existing = feedPagePromises.get(p);
      if (existing) return existing;
    }
    if (force && p === 1) {
      // 只清分页缓存；请求失败时不留下空首页
      feedPageCache.clear();
    }

    const epoch = (feedPageEpoch.get(p) ?? 0) + 1;
    feedPageEpoch.set(p, epoch);

    feedLoadingPages.add(p);
    feedPageLoading = true;
    notifyCloud();
    const job = (async () => {
      try {
        const offset = (p - 1) * size;
        const r = await fetchChipetFeed({ limit: size, offset });
        // 旧请求作废：不写缓存
        if (feedPageEpoch.get(p) !== epoch) return;
        if (!r) {
          // 失败保留旧缓存，避免把列表刷空
          return;
        }
        if (r.total != null) feedTotal = Math.max(0, Number(r.total) || 0);
        const items = (r.items ?? []) as Parameters<typeof social.applyCloudFeed>[0];
        feedPageCache.set(p, items);
        if (items.length) {
          social.applyCloudFeed(items, r.likes ?? {}, false);
        } else if (offset >= feedTotal) {
          feedTotal = Math.min(feedTotal, offset);
        }
      } finally {
        if (feedPageEpoch.get(p) === epoch) {
          feedLoadingPages.delete(p);
          feedPagePromises.delete(p);
        }
        feedPageLoading = feedLoadingPages.size > 0;
        notifyCloud();
      }
    })();
    feedPagePromises.set(p, job);
    return job;
  },

  /** 重拉广场动态首页（打穿缓存）；切 Tab / 轮询 / 发动态后调用 */
  async refreshFeedHead(pageSize: number): Promise<void> {
    return this.loadFeedPage(1, pageSize, { force: true });
  },

  /** @deprecated 改用 loadFeedPage；保留别名以免旧调用炸掉 */
  async ensureFeedThrough(page: number, pageSize: number): Promise<void> {
    return this.loadFeedPage(page, pageSize);
  },

  /** 本机 localStorage → 库；每浏览器只跑一次（成功或空载荷也打标）。 */
  async bootstrapLocalPublic(): Promise<void> {
    try {
      if (localStorage.getItem(BOOTSTRAP_KEY) === '1') return;
    } catch { /* ignore */ }

    const payload = social.exportBootstrapPayload();
    const has =
      payload.activities.length > 0
      || payload.notes.length > 0
      || payload.petAggs.some((p) => p.pats > 0 || p.visits > 0);

    if (has) {
      const addr = wallet() || undefined;
      // 本地宠也带进排行档案
      const localPets = localChipet.list().filter((p) => !isChainPet(p));
      const petAggs = [
        ...payload.petAggs,
        ...localPets.map((p) => ({
          petKey: `mine:${p.id}`,
          pats: payload.petAggs.find((x) => x.petKey === `mine:${p.id}`)?.pats ?? 0,
          visits: payload.petAggs.find((x) => x.petKey === `mine:${p.id}`)?.visits ?? 0,
          wins: p.wins,
          level: p.level,
          intimacy: p.intimacy,
          rarity: p.rarity,
          energy: p.energy,
          mood: p.mood,
          name: p.name,
          owner: social.profile().displayName,
          cpu: p.cpu,
          circuitId: p.circuitId.toString(),
          routeId: p.id,
        })),
      ];
      const r = await postChipetBootstrap({
        address: addr,
        activities: payload.activities,
        notes: payload.notes,
        petAggs,
        likes: payload.likes,
      });
      if (!r) return; // 失败不打标，下次启动再试
    }

    try {
      localStorage.setItem(BOOTSTRAP_KEY, '1');
    } catch { /* ignore */ }
  },

  async refreshLeaderboards(): Promise<void> {
    leaderboardLoading = true;
    notifyLeaderboard();
    try {
      // 本机宠名写回库，避免排行榜仍显示 mine:1 占位
      for (const p of localChipet.list().filter((x) => !isChainPet(x))) {
        this.pushLocalPetStats(p);
      }
      const kinds: RankKind[] = ['heat', 'pats', 'wins', 'intimacy', 'level'];
      const results = await Promise.all(kinds.map((k) => fetchChipetLeaderboard(k, k === 'heat' ? 6 : 10)));
      kinds.forEach((k, i) => {
        const items = results[i];
        if (items) leaderboardCache[k] = items;
      });
    } finally {
      leaderboardLoading = false;
      notifyLeaderboard();
    }
  },

  async refreshLeaderboard(kind: RankKind, limit?: number): Promise<ChipetLeaderboardItemDto[]> {
    leaderboardLoading = true;
    notifyLeaderboard();
    try {
      const items = await fetchChipetLeaderboard(kind, limit ?? (kind === 'heat' ? 6 : 10));
      if (items) {
        leaderboardCache[kind] = items;
        return items;
      }
      return leaderboardCache[kind] ?? [];
    } finally {
      leaderboardLoading = false;
      notifyLeaderboard();
    }
  },

  /** 连钱包后：拉 profile/bem/pets；云端空则上传本地，否则覆盖本地。 */
  async hydrateWallet(address: string): Promise<void> {
    const addr = address.trim().toLowerCase();
    if (!addr || hydrating) return;
    hydrating = true;
    walletLoading = true;
    notifyCloud();
    // 取消 bindAccount/save 触发的待推送，避免用旧本地盖掉刚拉下的云端
    if (profileTimer) { clearTimeout(profileTimer); profileTimer = null; }
    if (bemTimer) { clearTimeout(bemTimer); bemTimer = null; }
    if (petsTimer) { clearTimeout(petsTimer); petsTimer = null; }
    try {
      if (!publicHydrated) await this.hydratePublic();

      const [profile, bemState, petsState] = await Promise.all([
        fetchChipetProfile(addr),
        fetchChipetBem(addr),
        fetchChipetLocalPets(addr),
      ]);

      if (profile) {
        if (!profile.exists) {
          const snap = social.exportProfileForCloud();
          if (snap) await putChipetProfile({ address: addr, ...snap });
        } else {
          social.applyCloudProfile(profile);
        }
      }

      if (bemState) {
        if (!bemState.exists) {
          const local = bem.exportForCloud();
          if (local.hasLocal) await putChipetBem({ address: addr, ...local.state });
        } else {
          bem.applyCloud({
            demoBal: bemState.demoBal,
            bondSlots: bemState.bondSlots,
            eggCredits: bemState.eggCredits,
            faucetDay: bemState.faucetDay,
            log: bemState.log as ReturnType<typeof bem.exportForCloud>['state']['log'],
          });
        }
      }

      if (petsState) {
        if (!petsState.exists) {
          const local = localChipet.exportLocalForCloud();
          if (local.length) await putChipetLocalPets(addr, local);
        } else {
          localChipet.applyCloudLocal(petsState.pets);
        }
      }
    } finally {
      hydrating = false;
      walletLoading = false;
      notifyCloud();
    }
  },

  /** 读某宠留言并写入本地缓存（打开宠页时）。 */
  async hydrateNotes(petKey: string): Promise<void> {
    const items = await fetchChipetNotes(petKey);
    if (!items) return;
    social.applyCloudNotes(petKey, items);
  },

  scheduleProfilePush() {
    if (hydrating) return;
    const addr = wallet();
    if (!addr) return;
    if (profileTimer) clearTimeout(profileTimer);
    profileTimer = setTimeout(() => {
      if (hydrating) return;
      const snap = social.exportProfileForCloud();
      if (!snap) return;
      void putChipetProfile({ address: addr, ...snap });
    }, 400);
  },

  scheduleBemPush() {
    if (hydrating) return;
    const addr = wallet();
    if (!addr) return;
    if (bemTimer) clearTimeout(bemTimer);
    bemTimer = setTimeout(() => {
      if (hydrating) return;
      const { state } = bem.exportForCloud();
      void putChipetBem({ address: addr, ...state });
    }, 400);
  },

  schedulePetsPush() {
    if (hydrating) return;
    const addr = wallet();
    if (!addr) return;
    if (petsTimer) clearTimeout(petsTimer);
    petsTimer = setTimeout(() => {
      if (hydrating) return;
      const pets = localChipet.exportLocalForCloud();
      void putChipetLocalPets(addr, pets).then(() => {
        for (const p of localChipet.list().filter((x) => !isChainPet(x))) {
          this.pushLocalPetStats(p);
        }
      });
    }, 400);
  },

  pushActivity(act: {
    id: string;
    at: number;
    kind: string;
    actor: ChipetText;
    petKey: string;
    petName: string;
    text: ChipetText;
  }) {
    const addr = wallet();
    // 先插进首页缓存，广场立刻能看见自己刚发的；再打 API，成功后 force 对齐服务端
    const size = feedPageSizeCached || 10;
    const head = feedPageCache.get(1) ?? [];
    if (!head.some((a) => a.id === act.id)) {
      feedPageCache.set(1, [act as Parameters<typeof social.applyCloudFeed>[0][number], ...head].slice(0, size));
      feedTotal = Math.max(feedTotal + 1, feedPageCache.get(1)?.length ?? 0);
      notifyCloud();
    }
    const body = {
      address: addr || undefined,
      id: act.id,
      at: act.at,
      kind: act.kind,
      actor: act.actor,
      petKey: act.petKey,
      petName: act.petName,
      text: act.text,
    };
    const tryPost = async (attempt: number): Promise<void> => {
      const item = await postChipetActivity(body);
      if (item) {
        void this.refreshFeedHead(size);
        return;
      }
      if (attempt >= 3) {
        console.warn('[chipet] post activity failed after retries', act.id, act.kind);
        return;
      }
      await new Promise((r) => setTimeout(r, 400 * attempt));
      return tryPost(attempt + 1);
    };
    void tryPost(1);
  },

  pushNote(note: {
    id: string;
    petKey: string;
    from: ChipetText;
    text: ChipetText;
    at: number;
  }) {
    const addr = wallet();
    if (!addr) return;
    void postChipetNote({
      address: addr,
      id: note.id,
      petKey: note.petKey,
      from: note.from,
      text: note.text,
      at: note.at,
    });
  },

  pushLike(activityId: string) {
    const addr = wallet();
    if (!addr) return;
    void postChipetLike(addr, activityId).then((r) => {
      if (!r) return;
      social.applyCloudLikeResult(activityId, r.liked, r.likes);
    });
  },

  pushPetAgg(petKey: string, field: 'pats' | 'visits', delta = 1) {
    void postChipetPetAgg(petKey, field, delta).then((r) => {
      if (!r) return;
      social.applyCloudPetAgg(petKey, r.pats, r.visits);
      void this.refreshLeaderboards();
    });
  },

  /** 上报宠档案到排行榜（孵化/对战/本地宠变更）。 */
  pushPetStats(input: {
    petKey: string;
    wins?: number;
    level?: number;
    intimacy?: number;
    rarity?: number;
    energy?: number;
    mood?: number;
    name?: string;
    owner?: ChipetText;
    cpu?: string;
    circuitId?: string;
    routeId?: number;
  }) {
    void putChipetPetStats(input).then((row) => {
      if (!row) return;
      void this.refreshLeaderboards();
    });
  },

  pushLocalPetStats(pet: LocalPet, owner?: ChipetText) {
    this.pushPetStats({
      petKey: `mine:${pet.id}`,
      wins: pet.wins,
      level: pet.level,
      intimacy: pet.intimacy,
      rarity: pet.rarity,
      energy: pet.energy,
      mood: pet.mood,
      name: pet.name,
      owner: owner ?? social.profile().displayName,
      cpu: pet.cpu,
      circuitId: pet.circuitId.toString(),
      routeId: pet.id,
    });
  },
};

function isPlaceholderLbName(name: string, petKey: string): boolean {
  const n = (name || '').trim();
  if (!n) return true;
  if (n === petKey) return true;
  if (/^mine:\d+$/i.test(n)) return true;
  if (/^npc:-?\d+$/i.test(n)) return true;
  return false;
}

export type LeaderboardPetView = {
  key: string;
  id: number;
  name: string;
  owner: string;
  cpu: Address;
  circuitId: bigint;
  rarity: 0 | 1 | 2;
  energy: number;
  mood: number;
  intimacy: number;
  level: number;
  wins: number;
  mine: boolean;
};

/**
 * 排行榜 DTO → 展示宠。找不到真名、本机/邻居也已不存在时返回 null（前端直接丢掉）。
 */
export function leaderboardItemToPet(item: ChipetLeaderboardItemDto): LeaderboardPetView | null {
  const id = item.routeId
    || (item.petKey.startsWith('npc:') ? Number(item.petKey.slice(4)) : Number(item.petKey.replace(/^mine:/, '')) || 0);
  const local = item.petKey.startsWith('mine:') && id > 0 ? localChipet.get(id) : undefined;
  const pub = !local && id ? social.getByRouteId(id) ?? social.getPet(item.petKey) : undefined;
  // 「我的」只标本机真正持有的宠
  const mine = !!local;

  let name = item.name;
  if (isPlaceholderLbName(name, item.petKey)) {
    if (local?.name) name = local.name;
    else if (pub?.name && !isPlaceholderLbName(pub.name, item.petKey)) name = pub.name;
    else return null; // 宠已不在 / 只有 mine:id 占位 → 不展示
  }

  let owner = typeof item.owner === 'string' ? item.owner : txt(item.owner);
  if (!owner && local) owner = txt(social.profile().displayName);
  else if (!owner && pub) owner = pub.owner;

  return {
    key: item.petKey,
    id,
    name,
    owner,
    cpu: (local?.cpu || pub?.cpu || item.cpu || '0x000000000000000000000000000000000000c111') as Address,
    circuitId: local?.circuitId ?? pub?.circuitId ?? BigInt(item.circuitId || '0'),
    rarity: (local?.rarity ?? pub?.rarity ?? (Math.max(0, Math.min(2, item.rarity)) || 0)) as 0 | 1 | 2,
    energy: local?.energy ?? pub?.energy ?? item.energy,
    mood: local?.mood ?? pub?.mood ?? item.mood,
    intimacy: local?.intimacy ?? pub?.intimacy ?? item.intimacy,
    level: local?.level ?? pub?.level ?? item.level,
    wins: local?.wins ?? pub?.wins ?? item.wins,
    mine,
  };
}
