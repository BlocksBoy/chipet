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
let publicHydrated = false;
const BOOTSTRAP_KEY = 'chipet.social.bootstrapped.v1';

type RankKind = 'pats' | 'wins' | 'intimacy' | 'level' | 'heat';
const leaderboardCache: Partial<Record<RankKind, ChipetLeaderboardItemDto[]>> = {};
const leaderboardSubs = new Set<() => void>();
let leaderboardRev = 0;

function notifyLeaderboard() {
  leaderboardRev += 1;
  leaderboardSubs.forEach((fn) => fn());
}

export function subscribeLeaderboard(fn: () => void) {
  leaderboardSubs.add(fn);
  return () => { leaderboardSubs.delete(fn); };
}

export function getLeaderboardRev() {
  return leaderboardRev;
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
    await this.bootstrapLocalPublic();

    const [feed, aggs] = await Promise.all([
      fetchChipetFeed({ limit: 40 }),
      fetchChipetPetAggAll(),
    ]);
    if (feed?.items?.length) {
      social.applyCloudFeed(feed.items as Parameters<typeof social.applyCloudFeed>[0], feed.likes, true);
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
    const kinds: RankKind[] = ['heat', 'pats', 'wins', 'intimacy', 'level'];
    const results = await Promise.all(kinds.map((k) => fetchChipetLeaderboard(k, k === 'heat' ? 6 : 10)));
    kinds.forEach((k, i) => {
      const items = results[i];
      if (items) leaderboardCache[k] = items;
    });
    notifyLeaderboard();
  },

  async refreshLeaderboard(kind: RankKind, limit?: number): Promise<ChipetLeaderboardItemDto[]> {
    const items = await fetchChipetLeaderboard(kind, limit ?? (kind === 'heat' ? 6 : 10));
    if (items) {
      leaderboardCache[kind] = items;
      notifyLeaderboard();
      return items;
    }
    return leaderboardCache[kind] ?? [];
  },

  /** 连钱包后：拉 profile/bem/pets；云端空则上传本地，否则覆盖本地。 */
  async hydrateWallet(address: string): Promise<void> {
    const addr = address.trim().toLowerCase();
    if (!addr || hydrating) return;
    hydrating = true;
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
    void postChipetActivity({
      address: addr || undefined,
      id: act.id,
      at: act.at,
      kind: act.kind,
      actor: act.actor,
      petKey: act.petKey,
      petName: act.petName,
      text: act.text,
    });
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

/** 把排行榜 DTO 转成 Plaza 用的 pet 展示形状 */
export function leaderboardItemToPet(item: ChipetLeaderboardItemDto) {
  const owner = typeof item.owner === 'string' ? item.owner : txt(item.owner);
  return {
    key: item.petKey,
    id: item.routeId || (item.petKey.startsWith('npc:') ? Number(item.petKey.slice(4)) : Number(item.petKey.replace(/^mine:/, '')) || 0),
    name: item.name,
    owner,
    cpu: (item.cpu || '0x000000000000000000000000000000000000c111') as Address,
    circuitId: BigInt(item.circuitId || '0'),
    rarity: (Math.max(0, Math.min(2, item.rarity)) || 0) as 0 | 1 | 2,
    energy: item.energy,
    mood: item.mood,
    intimacy: item.intimacy,
    level: item.level,
    wins: item.wins,
    mine: item.petKey.startsWith('mine:'),
  };
}
