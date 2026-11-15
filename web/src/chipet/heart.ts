/**
 * 芯喵的「心脏」：一枚真实的 TapeOut 网表（只有 NAND / REF）。
 * 通电玩耍、电路对战、合体技都在这里逐门求值，和链上 eval 用的是同一套 VM 规则。
 */
import {
  compile, depthOf, encode, EXAMPLES, Library, packBits, resolveData, step, unpackBits,
  type Resolved,
} from '@tapearena/netlist';
import { both, tr, txt, type Txt } from '../i18n.ts';
import type { Rarity } from './phenotype.ts';

/** 预置模板池所在的「流片地址」（本地演示用占位地址）。 */
export const HEART_CPU = '0x000000000000000000000000000000000000c111';

interface Template {
  key: string;
  name: Txt;
  tagline: Txt;
  rarity: Rarity;
  src: string;
}

/** 孵化时按稀有度从模板池里抽：越稀有，心脏越大。 */
const TEMPLATES: Template[] = [
  { key: 'fa', name: both('加法心', 'Adder Heart'), tagline: both('三根引脚做一位加法', 'One-bit addition on three pins'), rarity: 0, src: EXAMPLES.fullAdder!.src },
  {
    key: 'gray3', name: both('格雷心', 'Gray Heart'), tagline: both('把二进制拧成格雷码', 'Twists binary into Gray code'), rarity: 0,
    src: `circuit gray3
in b[3]
out g[3]
g[0] = b[0] ^ b[1]
g[1] = b[1] ^ b[2]
g[2] = b[2] & 1
`,
  },
  { key: 'mux4', name: both('选择心', 'Mux Heart'), tagline: both('四选一，要么爆发要么哑火', 'Picks one of four: all or nothing'), rarity: 0, src: EXAMPLES.mux4!.src },
  {
    key: 'cmp2', name: both('比较心', 'Compare Heart'), tagline: both('谁大谁小一眼看穿', 'Sees at a glance which one is bigger'), rarity: 0,
    src: `circuit cmp2
in a[2], b[2]
out gt, ge
wire g1, e1
g1 = a[1] & ~b[1]
e1 = ~(a[1] ^ b[1])
gt = g1 | (e1 & a[0] & ~b[0])
ge = g1 | (e1 & (a[0] | ~b[0]))
`,
  },
  {
    key: 'check4', name: both('校验心', 'Checker Heart'), tagline: both('奇偶、有无、全满，三盏灯', 'Odd, any, all: three lamps'), rarity: 0,
    src: `circuit check4
in x[4]
out odd, any, all
odd = x[0] ^ x[1] ^ x[2] ^ x[3]
any = x[0] | x[1] | x[2] | x[3]
all = x[0] & x[1] & x[2] & x[3]
`,
  },
  {
    key: 'add2', name: both('进位心', 'Carry Heart'), tagline: both('两位加法，带进位', 'Two-bit addition with carry'), rarity: 1,
    src: `circuit add2
in a[2], b[2]
out s[2], cout
wire c
s[0] = a[0] ^ b[0]
c = a[0] & b[0]
s[1] = a[1] ^ b[1] ^ c
cout = (a[1] & b[1]) | (c & (a[1] ^ b[1]))
`,
  },
  {
    key: 'mul2', name: both('乘法心', 'Multiplier Heart'), tagline: both('两位乘两位，四盏灯', 'Two bits times two bits, four lamps'), rarity: 1,
    src: `circuit mul2
in a[2], b[2]
out p[4]
wire t0, t1, t2, c
p[0] = a[0] & b[0]
t0 = a[1] & b[0]
t1 = a[0] & b[1]
t2 = a[1] & b[1]
p[1] = t0 ^ t1
c = t0 & t1
p[2] = t2 ^ c
p[3] = t2 & c
`,
  },
  {
    key: 'prio4', name: both('优先心', 'Priority Heart'), tagline: both('谁排第一它说了算', 'Decides who goes first'), rarity: 1,
    src: `circuit prio4
in r[4]
out idx[2], valid
idx[0] = r[3] | (~r[2] & r[1])
idx[1] = r[3] | r[2]
valid = r[0] | r[1] | r[2] | r[3]
`,
  },
  { key: 'add4', name: both('行波心', 'Ripple Heart'), tagline: both('四位行波进位加法器', 'A 4-bit ripple-carry adder'), rarity: 2, src: EXAMPLES.add4!.src },
  {
    key: 'alu2', name: both('运算心', 'ALU Heart'), tagline: both('与、或、异或、加，一颗全包', 'AND, OR, XOR and ADD in a single heart'), rarity: 2,
    src: `circuit alu2
in op[2], a[2], b[2]
out y[2], flag
wire n[2], o[2], x[2], s[2], c0, c1
n = a & b
o = a | b
x = a ^ b
s[0] = x[0]
c0 = n[0]
s[1] = x[1] ^ c0
c1 = n[1] | (c0 & x[1])
y = op[1] ? (op[0] ? s : x) : (op[0] ? o : n)
flag = op[1] & op[0] & c1
`,
  },
  {
    key: 'max4', name: both('冠军心', 'Champion Heart'), tagline: both('两个四位数里挑最大的', 'Picks the larger of two 4-bit numbers'), rarity: 2,
    src: `circuit max4
in a[4], b[4]
out m[4], gt
wire g[5]
g[0] = 0
for i in 0..3 {
  g[i+1] = (a[i] & ~b[i]) | (~(a[i] ^ b[i]) & g[i])
}
m = g[4] ? a : b
gt = g[4]
`,
  },
];

/** 出力风格：功率波动小的「稳定」，波动大的「爆发」。 */
const STYLES = [both('稳定', 'steady'), both('均衡', 'balanced'), both('爆发', 'bursty')];

export interface Heart {
  /** 模板号，同时充当 REF 里的电路号 */
  tid: number;
  key: string;
  name: string;
  tagline: string;
  rarity: Rarity;
  c: Resolved;
  nIn: number;
  nOut: number;
  inLabels: string[];
  outLabels: string[];
  gates: number;
  depth: number;
  /** 遍历全部输入得到的平均功率与出力风格 */
  avgPower: number;
  style: string;
}

/** 合体电路：两颗心脏用 REF 串起来，A 的输出接进 B 的输入。 */
export interface Fusion {
  a: Heart;
  b: Heart;
  c: Resolved;
  nIn: number;
  nOut: number;
  gates: number;
}

const lib = new Library();
const hearts: Heart[] = [];
let ready = false;

function labels(pins: { name: string; width: number }[]): string[] {
  return pins.flatMap((p) => (p.width === 1 ? [p.name] : Array.from({ length: p.width }, (_, i) => `${p.name}${i}`)));
}

/** 亮几盏灯 → 功率 1..4。 */
export function powerOf(out: ArrayLike<number>): number {
  let pop = 0;
  for (let i = 0; i < out.length; i++) pop += out[i] ? 1 : 0;
  return 1 + Math.round((3 * pop) / Math.max(1, out.length));
}

function build() {
  if (ready) return;
  ready = true;
  TEMPLATES.forEach((t, tid) => {
    const r = compile(t.src);
    lib.set(HEART_CPU, tid, { netlist: r.netlist, nIn: r.nIn, nOut: r.nOut });
    const c = lib.resolve(HEART_CPU, BigInt(tid));
    let sum = 0;
    let sq = 0;
    const total = 1 << c.nIn;
    for (let v = 0; v < total; v++) {
      const bits = Array.from({ length: c.nIn }, (_, i) => (v >> i) & 1);
      const p = powerOf(unpackBits(step(c, new Uint8Array(0), packBits(bits), lib).outputs, c.nOut));
      sum += p;
      sq += p * p;
    }
    const avg = sum / total;
    const sd = Math.sqrt(Math.max(0, sq / total - avg * avg));
    const style = STYLES[sd < 0.75 ? 0 : sd < 1.1 ? 1 : 2]!;
    // 名字、简介、风格用 getter：心脏只建一次，切换语言后照样读到当前语言
    hearts.push({
      tid,
      key: t.key,
      get name() { return txt(t.name); },
      get tagline() { return txt(t.tagline); },
      rarity: t.rarity,
      c,
      nIn: c.nIn,
      nOut: c.nOut,
      inLabels: labels(r.inputs),
      outLabels: labels(r.outputs),
      gates: c.gateCount,
      depth: depthOf(c, lib),
      avgPower: avg,
      get style() { return txt(style); },
    });
  });
}

/** 同一枚电路 ID + 稀有度永远对应同一颗心脏。 */
export function heartOf(circuitId: bigint | number, rarity: Rarity = 0): Heart {
  build();
  const pool = hearts.filter((h) => h.rarity === rarity);
  return pool[Number(BigInt(circuitId) % BigInt(pool.length))]!;
}

export function heartByKey(key: string): Heart {
  build();
  const h = hearts.find((x) => x.key === key);
  if (!h) throw new Error(tr(`未知的心脏模板：${key}`, `Unknown heart template: ${key}`));
  return h;
}

export function allHearts(): Heart[] {
  build();
  return hearts;
}

export interface RunResult {
  out: number[];
  signals: Uint8Array;
}

/** 给电路通电：输入位 → 逐门求值 → 输出位（以及每根信号线的电平，供版图动画用）。 */
export function run(h: { c: Resolved; nOut: number }, inBits: ArrayLike<number>): RunResult {
  const r = step(h.c, new Uint8Array(0), packBits(inBits), lib);
  return { out: unpackBits(r.outputs, h.nOut), signals: r.signals };
}

const fusions = new Map<string, Fusion>();

/** 用两条 REF 把 a、b 串成一枚新电路：a 的输出先接进 b，不够的引脚再接回原始输入。 */
export function fuse(a: Heart, b: Heart): Fusion {
  const k = `${a.tid}>${b.tid}`;
  const hit = fusions.get(k);
  if (hit) return hit;
  const aOut0 = 2 + a.nIn;
  const bInputs = Array.from({ length: b.nIn }, (_, i) => (i < a.nOut ? aOut0 + i : 2 + ((i - a.nOut) % a.nIn)));
  const netlist = encode([
    { op: 'ref', cpu: HEART_CPU, cid: BigInt(a.tid), rIn: a.nIn, rOut: a.nOut, inputs: Array.from({ length: a.nIn }, (_, i) => 2 + i) },
    { op: 'ref', cpu: HEART_CPU, cid: BigInt(b.tid), rIn: b.nIn, rOut: b.nOut, inputs: bInputs },
  ]);
  const c = resolveData({ netlist, nIn: a.nIn, nOut: b.nOut }, lib);
  const f: Fusion = { a, b, c, nIn: a.nIn, nOut: b.nOut, gates: c.gateCount };
  fusions.set(k, f);
  return f;
}
