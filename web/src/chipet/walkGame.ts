/**
 * 遛猫大道：沿街店铺、路人遛猫遛狗。
 * 世界坐标以「画布高度 h」为单位（1h ≈ 3.9 m），人/猫/长椅按真实比例缩放。
 */
import type { Heart } from './heart.ts';

export type WalkPhase = 'ready' | 'running' | 'over';
export type CatAnim = 'run' | 'jump' | 'climb';
export type WalkerKind = 'dog' | 'cat' | 'flowers' | 'coffee';

export interface WalkCoat {
  body: string;
  belly: string;
  accent: string;
  outline: string;
  eye: string;
  nose: string;
  pattern: number;
  ear: number;
  bodyShape: number;
}

export interface WalkActor {
  name: string;
  coat: WalkCoat;
  demo: boolean;
  /** 胸口透视里显示的心脏电路 */
  heart: Heart;
}

export interface Walker {
  id: number;
  kind: WalkerKind;
  /** 世界 x（h 单位），脚底中心 */
  x: number;
  /** 0 远侧人行道 · 2 近侧 */
  lane: 0 | 2;
  dir: 1 | -1;
  speed: number;
  phase: number;
  /** 累计走过的距离（h），走路帧按它和步幅同步 */
  walked: number;
  owner: string;
  petName: string;
  greetedAt?: number;
}

export type PropKind = 'bench' | 'planter';

export interface WorldObj {
  id: number;
  kind: PropKind | 'fish';
  x: number;
  w: number;
  /** 可落脚面高度（h 单位）；fish 为悬浮高度 */
  top: number;
  /** 已被撞过，不再重复扣心 */
  bumped?: boolean;
  taken?: boolean;
}

/** 本帧发生的事，交给渲染层放音效、出粒子；x/y 为世界坐标（h 单位，y 自地面向上） */
export type WalkEvent =
  | { type: 'start' | 'over' | 'jump' | 'climb' }
  | { type: 'land'; x: number; y: number; hard: boolean }
  | { type: 'fish'; x: number; y: number }
  | { type: 'hit'; x: number; y: number }
  | { type: 'greet'; kind: WalkerKind; walkerId: number };

export interface WalkState {
  events: WalkEvent[];
  phase: WalkPhase;
  t: number;
  scroll: number;
  speed: number;
  /** 米 */
  distance: number;
  fish: number;
  hits: number;
  maxHits: number;
  best: number;
  greets: number;
  /** 猫在画面中的横向位置（0–1 宽度） */
  catX: number;
  catY: number;
  catVy: number;
  catAnim: CatAnim;
  climbFrom: number;
  climbTo: number;
  climbStart: number;
  invulnUntil: number;
  walkers: Walker[];
  objs: WorldObj[];
  nearClimb: boolean;
  nearWalker: Walker | null;
  aspect: number;
  seed: number;
}

export const METERS_PER_H = 3.9;
export const HERO_H = 0.42;
export const CAT_H = 0.115;
export const BENCH_H = 0.21;
export const BENCH_W = BENCH_H * 2.23;
export const PLANTER_H = 0.2;
export const PLANTER_W = PLANTER_H * 2.47;
/** 步行速度（h/s）：0.36h ≈ 1.4 m/s，正常散步；越走越快但不超过快走 */
const WALK_V = 0.36;
const WALK_MAX = 0.48;
/** 主人、猫一个完整步态周期各走多远（h），走路帧按这个跟脚下距离同步，脚不打滑 */
export const HERO_STEP = 0.37;
export const CAT_STEP = 0.22;
/** 猫身半长（h），用于碰撞 */
const CAT_HALF = 0.085;
const G = 4.4;
const JUMP_V = 1.42;
const CLIMB_MS = 380;
const GOAL_M = 600;

const BEST_KEY = 'chipet.walk.best';

const OWNERS = ['阿乔', 'Mira', '老周', 'Nori', '小满', 'Kai', '陈陈', 'Luna', '阿树', 'Ivy', '豆豆妈', 'Leo'];
const DOG_NAMES = ['旺财', '豆豆', 'Milo', '球球', 'Coco', '阿黄', 'Buddy', '瓜子'];
const CAT_NAMES = ['芝麻', '奶盖', '奥利奥', 'Pepper', '团子', 'Mochi', '灰灰', '年糕'];

export function loadWalkBest(): number {
  try {
    return Math.max(0, Math.floor(Number(localStorage.getItem(BEST_KEY)) || 0));
  } catch {
    return 0;
  }
}

function saveWalkBest(n: number) {
  try {
    localStorage.setItem(BEST_KEY, String(Math.max(0, Math.floor(n))));
  } catch {
    /* ignore */
  }
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(rnd: () => number, xs: T[]) => xs[Math.floor(rnd() * xs.length)]!;

export function createWalkState(now = performance.now()): WalkState {
  const s: WalkState = {
    events: [],
    phase: 'ready',
    t: now,
    scroll: 0,
    speed: WALK_V,
    distance: 0,
    fish: 0,
    hits: 0,
    maxHits: 3,
    best: loadWalkBest(),
    greets: 0,
    catX: 0.56,
    catY: 0,
    catVy: 0,
    catAnim: 'run',
    climbFrom: 0,
    climbTo: 0,
    climbStart: 0,
    invulnUntil: 0,
    walkers: [],
    objs: [],
    nearClimb: false,
    nearWalker: null,
    aspect: 1.9,
    seed: (Date.now() & 0xffff) ^ 0x5bd1,
  };
  // 准备态也有路人走动，街道不空
  spawnAhead(s, 6);
  return s;
}

function nextId(items: { id: number }[]) {
  return items.reduce((m, o) => Math.max(m, o.id), 0) + 1;
}

function spawnAhead(s: WalkState, until: number) {
  const rnd = mulberry(s.seed + Math.floor(s.scroll * 97));
  s.seed = (s.seed * 1103515245 + 12345) >>> 0;
  const startProps = s.phase === 'running' ? s.scroll + s.aspect + 0.4 : s.scroll + s.aspect + 1.5;

  let px = s.objs.reduce((m, o) => Math.max(m, o.x + o.w), startProps);
  while (px < until) {
    px += 1.3 + rnd() * 1.5;
    const roll = rnd();
    if (roll < 0.42) {
      s.objs.push({ id: nextId(s.objs), kind: 'planter', x: px, w: PLANTER_W, top: PLANTER_H * 0.56 });
      if (rnd() < 0.5) s.objs.push({ id: nextId(s.objs), kind: 'fish', x: px + PLANTER_W * 0.5, w: 0.06, top: PLANTER_H * 0.56 + 0.07 });
    } else if (roll < 0.72) {
      s.objs.push({ id: nextId(s.objs), kind: 'bench', x: px, w: BENCH_W, top: BENCH_H * 0.647 });
      s.objs.push({ id: nextId(s.objs), kind: 'fish', x: px + BENCH_W * (0.3 + rnd() * 0.4), w: 0.06, top: BENCH_H * 0.647 + 0.06 });
    } else {
      s.objs.push({ id: nextId(s.objs), kind: 'fish', x: px, w: 0.06, top: rnd() < 0.5 ? 0.05 : 0.17 });
      px -= 0.6;
    }
  }

  let wx = s.walkers.reduce((m, o) => Math.max(m, o.x), s.scroll + s.aspect * 0.3);
  while (wx < until + 1) {
    wx += 0.9 + rnd() * 1.2;
    const kind = pick<WalkerKind>(rnd, ['dog', 'cat', 'dog', 'cat', 'flowers', 'coffee']);
    const lane: 0 | 2 = rnd() < 0.55 ? 0 : 2;
    const dir: 1 | -1 = lane === 2 ? (rnd() < 0.75 ? -1 : 1) : (rnd() < 0.3 ? -1 : 1);
    s.walkers.push({
      id: nextId(s.walkers),
      kind,
      x: wx,
      lane,
      dir,
      speed: dir > 0 ? 0.2 + rnd() * 0.14 : 0.3 + rnd() * 0.12,
      phase: rnd() * Math.PI * 2,
      walked: rnd() * 2,
      owner: pick(rnd, OWNERS),
      petName: kind === 'dog' ? pick(rnd, DOG_NAMES) : kind === 'cat' ? pick(rnd, CAT_NAMES) : '',
    });
  }

  const cut = s.scroll - 2;
  s.objs = s.objs.filter((o) => o.x + o.w > cut && !o.taken);
  s.walkers = s.walkers.filter((o) => o.x > cut - 1 && o.x < until + 4);
}

export function startWalk(s: WalkState, now: number) {
  s.phase = 'running';
  s.t = now;
  s.speed = WALK_V;
  s.fish = 0;
  s.hits = 0;
  s.greets = 0;
  s.distance = 0;
  s.catY = 0;
  s.catVy = 0;
  s.catAnim = 'run';
  s.invulnUntil = 0;
  // 清掉镜头里的道具，给玩家一段起步路
  s.objs = s.objs.filter((o) => o.x > s.scroll + s.aspect + 1.2);
  spawnAhead(s, s.scroll + s.aspect + 8);
  s.events.push({ type: 'start' });
}

export function catWorldX(s: WalkState) {
  return s.scroll + s.catX * s.aspect;
}

function climbTarget(s: WalkState) {
  const cx = catWorldX(s);
  return s.objs.find((o) => o.kind !== 'fish' && cx > o.x - 0.24 && cx < o.x + o.w * 0.5);
}

export function jumpOrClimb(s: WalkState, now: number) {
  if (s.phase !== 'running' || s.catAnim === 'climb') return;
  const grounded = s.catVy === 0;
  if (!grounded) return;
  const prop = s.catY < 0.01 ? climbTarget(s) : undefined;
  if (prop) {
    s.catAnim = 'climb';
    s.climbFrom = s.catY;
    s.climbTo = prop.top;
    s.climbStart = now;
    s.events.push({ type: 'climb' });
    return;
  }
  s.catVy = JUMP_V;
  s.catAnim = 'jump';
  s.events.push({ type: 'jump' });
}

export function greet(s: WalkState, now: number) {
  const w = s.nearWalker;
  if (!w || w.greetedAt) return null;
  w.greetedAt = now;
  s.greets += 1;
  if (w.kind === 'dog' || w.kind === 'cat') s.fish += 1;
  s.events.push({ type: 'greet', kind: w.kind, walkerId: w.id });
  return w;
}

export function stepWalk(s: WalkState, now: number, aspect: number) {
  const dt = Math.min(0.033, Math.max(0.004, (now - s.t) / 1000));
  s.t = now;
  s.aspect = aspect;

  for (const w of s.walkers) {
    w.x += w.dir * w.speed * dt;
    w.phase += dt * 9.5 * (w.speed / 0.3);
    w.walked += w.speed * dt;
  }

  if (s.phase !== 'running') {
    // 准备 / 结算态：主人和猫站着，路人照常走
    spawnAhead(s, s.scroll + aspect + 6);
    return;
  }

  s.speed = Math.min(WALK_MAX, WALK_V + s.distance / 4000);
  s.scroll += s.speed * dt;
  s.distance += s.speed * dt * METERS_PER_H;
  spawnAhead(s, s.scroll + aspect + 6);

  const cx = catWorldX(s);

  if (s.catAnim === 'climb') {
    const u = Math.min(1, (now - s.climbStart) / CLIMB_MS);
    const ease = 1 - (1 - u) * (1 - u);
    s.catY = s.climbFrom + (s.climbTo - s.climbFrom) * ease + Math.sin(u * Math.PI) * 0.05;
    if (u >= 1) {
      s.catY = s.climbTo;
      s.catVy = 0;
      s.catAnim = 'run';
      s.events.push({ type: 'land', x: cx, y: s.catY, hard: false });
    }
  } else {
    const prevY = s.catY;
    const support = supportUnder(s, cx);
    if (s.catVy !== 0 || s.catY > support + 1e-4) {
      s.catVy -= G * dt;
      s.catY += s.catVy * dt;
      if (s.catVy <= 0) {
        const land = landingUnder(s, cx, prevY);
        if (s.catY <= land) {
          s.events.push({ type: 'land', x: cx, y: land, hard: s.catVy < -1.1 });
          s.catY = land;
          s.catVy = 0;
          s.catAnim = 'run';
        } else {
          s.catAnim = 'jump';
        }
      }
    } else {
      s.catY = support;
      s.catVy = 0;
    }
  }

  // 撞花箱侧面
  if (now > s.invulnUntil && s.catAnim !== 'climb') {
    for (const o of s.objs) {
      if (o.kind !== 'planter' || o.bumped) continue;
      const overlap = cx + CAT_HALF > o.x + 0.02 && cx - CAT_HALF < o.x + o.w - 0.02;
      if (overlap && s.catY < o.top * 0.7) {
        o.bumped = true;
        s.hits += 1;
        s.events.push({ type: 'hit', x: cx + CAT_HALF, y: s.catY + CAT_H * 0.5 });
        s.invulnUntil = now + 1100;
        s.catVy = 0.9;
        s.catAnim = 'jump';
        if (s.hits >= s.maxHits) {
          endWalk(s);
          return;
        }
        break;
      }
    }
  }

  // 鱼干
  for (const o of s.objs) {
    if (o.kind !== 'fish' || o.taken) continue;
    if (Math.abs(o.x - (cx + 0.05)) < 0.09 && Math.abs(o.top - (s.catY + CAT_H * 0.5)) < 0.09) {
      o.taken = true;
      s.fish += 1;
      s.events.push({ type: 'fish', x: o.x, y: o.top });
    }
  }

  const target = s.catY < 0.01 && s.catVy === 0 ? climbTarget(s) : undefined;
  s.nearClimb = !!target;

  s.nearWalker = null;
  let best = 0.42;
  for (const w of s.walkers) {
    if (w.greetedAt) continue;
    const d = Math.abs(w.x - cx);
    if (d < best) {
      best = d;
      s.nearWalker = w;
    }
  }

  if (s.distance >= GOAL_M) endWalk(s);
}

function supportUnder(s: WalkState, cx: number) {
  let top = 0;
  for (const o of s.objs) {
    if (o.kind === 'fish') continue;
    if (cx > o.x + 0.03 && cx < o.x + o.w - 0.03 && Math.abs(s.catY - o.top) < 0.012) top = Math.max(top, o.top);
  }
  return top;
}

function landingUnder(s: WalkState, cx: number, prevY: number) {
  let top = 0;
  for (const o of s.objs) {
    if (o.kind === 'fish') continue;
    if (cx > o.x + 0.02 && cx < o.x + o.w - 0.02 && prevY >= o.top - 0.01) top = Math.max(top, o.top);
  }
  return top;
}

export function walkScore(s: Pick<WalkState, 'distance' | 'fish' | 'greets'>) {
  return Math.floor(s.distance + s.fish * 10 + s.greets * 15);
}

export function endWalk(s: WalkState) {
  s.phase = 'over';
  s.events.push({ type: 'over' });
  const score = walkScore(s);
  if (score > s.best) {
    s.best = score;
    saveWalkBest(score);
  }
}
