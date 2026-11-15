/**
 * 电路对战规则（纯函数）。
 * 每回合：随机种子 + 回合号 + 招式 → 心脏电路的输入位 → 逐门求值 → 亮灯数换算成功率。
 * 三招互克：进攻 > 技巧 > 防御 > 进攻；克制方伤害翻倍，被克方减半。
 */
import { both, txt, type Txt } from '../i18n.ts';
import { powerOf, run, type Fusion, type Heart } from './heart.ts';
import type { Rarity } from './phenotype.ts';

export type Move = 0 | 1 | 2;

const mv = (name: Txt, tip: Txt) => ({ get name() { return txt(name); }, get tip() { return txt(tip); } });

/** name / tip 是 getter，读到的总是当前语言。 */
export const MOVES: { readonly name: string; readonly tip: string }[] = [
  mv(both('进攻', 'Attack'), both('克技巧，怕防御', 'Beats Trick, loses to Defend')),
  mv(both('防御', 'Defend'), both('克进攻，怕技巧', 'Beats Attack, loses to Trick')),
  mv(both('技巧', 'Trick'), both('克防御，怕进攻', 'Beats Defend, loses to Attack')),
];

export const beats = (a: Move, b: Move) => (a === 0 && b === 2) || (a === 2 && b === 1) || (a === 1 && b === 0);

/** 性格决定偏爱的招式，让对手有迹可循。下标是物种号：机灵 / 好胜 / 软萌 / 轻快 / 慵懒 / 敏捷 / 稳重 / 飘逸。 */
const SPECIES_FAV: Move[] = [2, 0, 1, 2, 1, 0, 1, 2];
export const favOf = (speciesId: number): Move => SPECIES_FAV[speciesId] ?? 0;

/** 心情 ≥ 80 时额外加的体力 */
export const MOOD_HP = 3;
/** 体力：等级和稀有度让身板更厚，心情好再多一点。一次克制最多打 8，这个量级大约能打五六回合。 */
export const maxHpOf = (level: number, rarity: Rarity = 0, mood = 0) =>
  20 + 3 * (level - 1) + rarity * 4 + (mood >= 80 ? MOOD_HP : 0);
/** 野怪比同级芯喵脆一些，第一场好上手。 */
export const wildHpOf = (level: number) => 13 + 3 * level;
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 由（种子、哪一方、第几回合、哪一招）确定地派生 n 个输入位——上链后这一步换成 prevrandao。 */
export function seedBits(seed: number, side: string, round: number, move: number, n: number): number[] {
  let x = hash(`${seed}:${side}:${round}:${move}`) || 1;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    out.push(x & 1);
  }
  return out;
}

export interface Roll {
  inBits: number[];
  outBits: number[];
  power: number;
}

export function roll(h: Heart | Fusion, seed: number, side: string, round: number, move: number): Roll {
  const inBits = seedBits(seed, side, round, move, h.nIn);
  const outBits = run(h, inBits).out;
  return { inBits, outBits, power: powerOf(outBits) };
}

export function rollAll(h: Heart, seed: number, side: string, round: number): [Roll, Roll, Roll] {
  return [roll(h, seed, side, round, 0), roll(h, seed, side, round, 1), roll(h, seed, side, round, 2)];
}

/** 对手出招：功率越高越想用，再叠上性格偏好。 */
export function aiPick(rolls: Roll[], fav: Move, rand = Math.random): Move {
  const w = rolls.map((r, i) => r.power ** 1.4 * (i === fav ? 1.7 : 1));
  let t = rand() * w.reduce((s, v) => s + v, 0);
  for (let i = 0; i < w.length; i++) {
    t -= w[i]!;
    if (t <= 0) return i as Move;
  }
  return fav;
}

export interface Clash {
  myDmg: number; // 我打出的伤害
  opDmg: number; // 对手打出的伤害
  /** 1 我克制对手 · -1 我被克 · 0 同招硬碰 */
  edge: 1 | 0 | -1;
}

export function clash(my: { move: Move; power: number }, op: { move: Move; power: number }): Clash {
  if (beats(my.move, op.move)) return { myDmg: my.power * 2, opDmg: Math.floor(op.power / 2), edge: 1 };
  if (beats(op.move, my.move)) return { myDmg: Math.floor(my.power / 2), opDmg: op.power * 2, edge: -1 };
  return { myDmg: my.power, opDmg: op.power, edge: 0 };
}

/** 合体技：无视克制，伤害 = 合体电路功率 + 2；对手照常出手但吃不到克制加成。 */
export function fusionClash(fusionPower: number, opPower: number): Clash {
  return { myDmg: fusionPower + 2, opDmg: opPower, edge: 0 };
}

export function xpFor(result: 'win' | 'lose' | 'draw', opLevel: number): number {
  return result === 'win' ? 20 + 5 * opLevel : result === 'draw' ? 12 : 8;
}

/** 野怪：芯片里的各种「Bug」。 */
export interface Wild {
  id: string;
  /** 两种语言的名字；name / line 是按当前语言取的 getter */
  names: Txt;
  readonly name: string;
  readonly line: string;
  level: number;
  heartKey: string;
  fav: Move;
  color: string;
  dark: string;
  bg: string;
}

const wild = (w: Omit<Wild, 'name' | 'line'>, lines: Txt): Wild => ({
  ...w,
  get name() { return txt(w.names); },
  get line() { return txt(lines); },
});

export const WILDS: Wild[] = [
  wild({ id: 'glitch', names: both('毛刺怪', 'Glitch'), level: 1, heartKey: 'fa', fav: 2, color: '#9be07a', dark: '#3f7a2c', bg: '#e6f5c9' },
    both('信号一抖一抖的小毛刺', 'A tiny spike that makes signals jitter')),
  wild({ id: 'short', names: both('短路怪', 'Short'), level: 2, heartKey: 'cmp2', fav: 0, color: '#ffb35c', dark: '#a85a12', bg: '#ffe8d1' },
    both('两根线搭在一起就炸毛', 'Bristles the moment two wires touch')),
  wild({ id: 'static', names: both('静电怪', 'Static'), level: 3, heartKey: 'check4', fav: 2, color: '#8fc8ff', dark: '#2f6fb3', bg: '#cfe6fb' },
    both('摸一下噼啪响', 'Crackles when you touch it')),
  wild({ id: 'meta', names: both('亚稳怪', 'Metastable'), level: 5, heartKey: 'prio4', fav: 1, color: '#c9a2ff', dark: '#6a3fb8', bg: '#f1e2fd' },
    both('永远在 0 和 1 之间犹豫', 'Forever hesitating between 0 and 1')),
  wild({ id: 'boss', names: both('大 Bug 王', 'The Bug'), level: 7, heartKey: 'add4', fav: 0, color: '#ff8a8a', dark: '#a82f2f', bg: '#fddcdc' },
    both('流片前夜才现身的那一只', 'The one that only shows up the night before tape-out')),
];
