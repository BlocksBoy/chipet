import type { Address } from 'viem';
import { LEGACY_PET_ID_BASE, toChainTokenId, toLocalPetId } from '@tapearena/chain';
import { tr } from '../i18n.ts';
import type { Rarity } from './phenotype.ts';

/** 本地演示宠：链上 Chipet 未部署时用 localStorage，让前端立刻可玩。 */
export interface LocalPet {
  /** 本地/路由 id；旧合约猫 = tokenId + LEGACY_PET_ID_BASE */
  id: number;
  name: string;
  cpu: Address;
  circuitId: bigint;
  rarity: Rarity;
  energy: number;
  mood: number;
  intimacy: number;
  level: number;
  xp: number;
  wins: number;
  losses: number;
  lastFeed: number;
  lastPlay: number;
  hatchedAt: number;
  /** 链上 Chipet 合约；本地 MOCK 宠无此字段 */
  chipet?: Address;
}

export { LEGACY_PET_ID_BASE, toChainTokenId };

/** 详情页展示的链上编号（去掉旧合约偏移） */
export function displayPetNumber(p: { id: number }): number {
  return toChainTokenId(p.id);
}

const KEY = 'chipet.local.pets';
const FEED_CD = 5 * 60 * 1000;
const PLAY_CD = 3 * 60 * 1000;
/** 对战一场消耗的能量 */
export const BATTLE_ENERGY = 15;

export const MOCK_CPU = '0x000000000000000000000000000000000000c111' as Address;

/** 链上宠物：cpu 不是本地占位地址 */
export const isChainPet = (p: { cpu: Address }) => p.cpu.toLowerCase() !== MOCK_CPU.toLowerCase();

type Stored = Omit<LocalPet, 'circuitId' | 'xp' | 'wins' | 'losses' | 'chipet'> & {
  circuitId: string;
  xp?: number;
  wins?: number;
  losses?: number;
  chipet?: string;
};

function load(): LocalPet[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]') as Stored[];
    return raw.map((p) => ({
      ...p,
      circuitId: BigInt(p.circuitId),
      xp: p.xp ?? 0,
      wins: p.wins ?? 0,
      losses: p.losses ?? 0,
      chipet: p.chipet ? (p.chipet as Address) : undefined,
    }));
  } catch {
    return [];
  }
}

function save(pets: LocalPet[]) {
  localStorage.setItem(KEY, JSON.stringify(pets.map((p) => ({ ...p, circuitId: p.circuitId.toString() }))));
}

function rollRarity(): Rarity {
  const r = Math.random();
  if (r < 0.05) return 2;
  if (r < 0.30) return 1;
  return 0;
}

/** 限定彩蛋：保底珍奇，限定概率约 25% */
function rollRarityFancy(): Rarity {
  return Math.random() < 0.25 ? 2 : 1;
}

/** 升到下一级需要的经验 */
export const xpNeed = (level: number) => level * 40;

/** 加经验并处理连续升级，返回升了几级。 */
function gainXp(p: LocalPet, xp: number): number {
  p.xp += xp;
  let ups = 0;
  while (p.xp >= xpNeed(p.level)) {
    p.xp -= xpNeed(p.level);
    p.level += 1;
    ups += 1;
  }
  return ups;
}

function mustFind(pets: LocalPet[], id: number): LocalPet {
  const p = pets.find((x) => x.id === id);
  if (!p) throw new Error(tr('找不到这只芯宠', "Can't find this Chipet"));
  return p;
}

export const localChipet = {
  list(): LocalPet[] {
    return load().sort((a, b) => b.hatchedAt - a.hatchedAt);
  },
  get(id: number) {
    return load().find((p) => p.id === id);
  },
  hatch(name: string, opts?: { guarantee?: 'fancy' }): LocalPet {
    const pets = load();
    const id = (pets.reduce((m, p) => Math.max(m, p.id), 0) || 0) + 1;
    const rarity = opts?.guarantee === 'fancy' ? rollRarityFancy() : rollRarity();
    const pet: LocalPet = {
      id,
      name: name.trim().slice(0, 32) || tr(`芯宠 #${id}`, `Chipet #${id}`),
      cpu: MOCK_CPU,
      circuitId: BigInt(1000 + id * 17 + Math.floor(Math.random() * 100)),
      rarity,
      energy: 80,
      mood: 70,
      intimacy: 0,
      level: 1,
      xp: 0,
      wins: 0,
      losses: 0,
      lastFeed: 0,
      lastPlay: 0,
      hatchedAt: Date.now(),
    };
    pets.push(pet);
    save(pets);
    return pet;
  },
  /** 把链上宠物写入本地缓存（按 chipet+tokenId / 本地 id 覆盖）。 */
  upsertChain(input: {
    id: number;
    name: string;
    cpu: Address;
    circuitId: bigint;
    rarity: Rarity;
    energy: number;
    mood: number;
    intimacy: number;
    level: number;
    lastFeed: number;
    lastPlay: number;
    chipet?: Address;
    /** 当前可孵化合约；有 chipet 时用于算本地 id 偏移 */
    primaryChipet?: Address;
  }): LocalPet {
    const pets = load();
    const localId = input.chipet && input.primaryChipet
      ? toLocalPetId(input.id, input.chipet, input.primaryChipet)
      : input.id;
    const i = pets.findIndex((p) => p.id === localId);
    const prev = i >= 0 ? pets[i]! : undefined;
    const pet: LocalPet = {
      id: localId,
      name: input.name,
      cpu: input.cpu,
      circuitId: input.circuitId,
      rarity: input.rarity,
      energy: input.energy,
      mood: input.mood,
      intimacy: input.intimacy,
      // 合约 level 仅对战改；本地通电也会涨级，取较大值
      level: Math.max(prev?.level ?? 1, input.level),
      xp: prev?.xp ?? 0,
      wins: prev?.wins ?? 0,
      losses: prev?.losses ?? 0,
      // 合约存的是秒；本地冷却用毫秒
      lastFeed: input.lastFeed ? input.lastFeed * 1000 : 0,
      lastPlay: input.lastPlay ? input.lastPlay * 1000 : 0,
      hatchedAt: prev?.hatchedAt ?? Date.now(),
      chipet: input.chipet ?? prev?.chipet,
    };
    if (i >= 0) pets[i] = pet;
    else pets.push(pet);
    save(pets);
    return pet;
  },
  /** 批量同步链上宠物；保留纯本地（MOCK_CPU）的演示宠。 */
  syncChainPets(
    chainPets: {
      id: number; name: string; cpu: Address; circuitId: bigint; rarity: Rarity;
      energy: number; mood: number; intimacy: number; level: number; lastFeed: number; lastPlay: number;
      chipet?: Address;
    }[],
    primaryChipet?: Address,
  ) {
    const prevAll = load();
    const keep = prevAll.filter((p) => !isChainPet(p));
    const mapped = chainPets.map((c) => {
      const localId = c.chipet && primaryChipet
        ? toLocalPetId(c.id, c.chipet, primaryChipet)
        : c.id;
      const prev = prevAll.find((p) => p.id === localId)
        ?? prevAll.find((p) => p.id === c.id && (!c.chipet || !p.chipet || p.chipet.toLowerCase() === c.chipet.toLowerCase()));
      return {
        id: localId,
        name: c.name,
        cpu: c.cpu,
        circuitId: c.circuitId,
        rarity: c.rarity,
        energy: c.energy,
        mood: c.mood,
        intimacy: c.intimacy,
        level: Math.max(prev?.level ?? 1, c.level),
        xp: prev?.xp ?? 0,
        wins: prev?.wins ?? 0,
        losses: prev?.losses ?? 0,
        lastFeed: c.lastFeed ? c.lastFeed * 1000 : 0,
        lastPlay: c.lastPlay ? c.lastPlay * 1000 : 0,
        hatchedAt: prev?.hatchedAt ?? Date.now(),
        chipet: c.chipet,
      } satisfies LocalPet;
    });
    save([...keep, ...mapped]);
    return mapped;
  },
  feed(id: number) {
    const pets = load();
    const p = mustFind(pets, id);
    if (p.lastFeed && Date.now() - p.lastFeed < FEED_CD) throw new Error(tr('还在消化，稍后再喂', 'Still digesting. Feed it again later'));
    p.lastFeed = Date.now();
    p.energy = Math.min(100, p.energy + 25);
    p.intimacy += 1;
    save(pets);
    return p;
  },
  /** BEM 能量快充：无视冷却，一次回满 */
  refillEnergy(id: number) {
    const pets = load();
    const p = mustFind(pets, id);
    p.energy = 100;
    p.lastFeed = 0;
    save(pets);
    return p;
  },
  /** 通电玩耍结束后结算：星星越多，心情和经验涨得越多。 */
  powerUp(id: number, stars: number) {
    const pets = load();
    const p = mustFind(pets, id);
    if (p.lastPlay && Date.now() - p.lastPlay < PLAY_CD) throw new Error(tr('玩累了，让它歇一会儿', 'It is tired from playing. Let it rest a while'));
    p.lastPlay = Date.now();
    const mood = 8 + stars * 2;
    const xp = 4 + stars * 2;
    p.mood = Math.min(100, p.mood + mood);
    p.energy = Math.max(0, p.energy - 5);
    p.intimacy += 1;
    const ups = gainXp(p, xp);
    save(pets);
    return { pet: p, mood, xp, ups };
  },
  feedCdLeft(p: LocalPet) {
    if (!p.lastFeed) return 0;
    return Math.max(0, FEED_CD - (Date.now() - p.lastFeed));
  },
  playCdLeft(p: LocalPet) {
    if (!p.lastPlay) return 0;
    return Math.max(0, PLAY_CD - (Date.now() - p.lastPlay));
  },
  canBattle(p: LocalPet) {
    return p.energy >= BATTLE_ENERGY;
  },
  /** 开打先扣能量，中途退出不退。 */
  startBattle(id: number) {
    const pets = load();
    const p = mustFind(pets, id);
    if (p.energy < BATTLE_ENERGY) throw new Error(tr('太累了，先喂点东西再来对战', 'Too tired. Feed it before the next battle'));
    p.energy -= BATTLE_ENERGY;
    save(pets);
    return p;
  },
  finishBattle(id: number, result: 'win' | 'lose' | 'draw', xp: number) {
    const pets = load();
    const p = mustFind(pets, id);
    if (result === 'win') {
      p.wins += 1;
      p.mood = Math.min(100, p.mood + 8);
    } else if (result === 'lose') {
      p.losses += 1;
      p.mood = Math.max(0, p.mood - 6);
    }
    const ups = gainXp(p, xp);
    save(pets);
    return { pet: p, ups };
  },
  /** 链上玩耍后补本地经验（合约不存 XP）。 */
  grantXp(id: number, xp: number) {
    const pets = load();
    const p = mustFind(pets, id);
    const ups = gainXp(p, xp);
    save(pets);
    return { pet: p, ups, xp };
  },
  /** 被摸头 / 收礼物时的轻量心情加成 */
  cheer(id: number, mood = 8, intimacy = 1) {
    const pets = load();
    const p = pets.find((x) => x.id === id);
    if (!p) return;
    p.mood = Math.min(100, p.mood + mood);
    p.intimacy += intimacy;
    save(pets);
    return p;
  },
};
