// 链上 NetlistVM.run 的逐位移植：state[t+1] = f(state[t], inputs)，输出 = 信号空间最后 nOut 个信号。

import { getBit } from './bits.ts';
import { decode, refKey, stats, type Element } from './format.ts';

export interface CircuitData {
  netlist: Uint8Array;
  nIn: number;
  nOut: number;
}

/** 已解析好的电路（含递归统计），由 Library 统一缓存。 */
export interface Resolved extends CircuitData {
  elements: Element[];
  nState: number;   // LATCH 总数（递归）
  gateCount: number; // 晶体管总数（递归），与链上 circuitInfo 一致
}

/** REF 目标的取数接口：同步查表。异步读链请先用 loadRefTree 预取。 */
export interface RefSource {
  get(cpu: string, cid: bigint): CircuitData | undefined;
}

export class Library implements RefSource {
  private data = new Map<string, CircuitData>();
  private cache = new Map<string, Resolved>();

  set(cpu: string, cid: bigint | number, c: CircuitData): void {
    this.data.set(refKey(cpu, cid), c);
  }

  get(cpu: string, cid: bigint): CircuitData | undefined {
    return this.data.get(refKey(cpu, cid));
  }

  has(cpu: string, cid: bigint | number): boolean {
    return this.data.has(refKey(cpu, cid));
  }

  resolve(cpu: string, cid: bigint, depth = 0): Resolved {
    const k = refKey(cpu, cid);
    const hit = this.cache.get(k);
    if (hit) return hit;
    const c = this.data.get(k);
    if (!c) throw new Error(`REF target not loaded: ${k}`);
    const r = resolveData(c, this, depth);
    this.cache.set(k, r);
    return r;
  }
}

const MAX_REF_LEVELS = 16;

export function resolveData(c: CircuitData, lib: Library | null, depth = 0): Resolved {
  if (depth > MAX_REF_LEVELS) throw new Error('REF nesting too deep');
  const elements = decode(c.netlist);
  let nState = 0;
  let gateCount = 0;
  for (const e of elements) {
    if (e.op === 'nand') gateCount++;
    else if (e.op === 'latch') { gateCount++; nState++; }
    else {
      if (!lib) throw new Error('netlist contains REF but no library given');
      const sub = lib.resolve(e.cpu, e.cid, depth + 1);
      if (sub.nIn !== e.rIn || sub.nOut !== e.rOut) throw new Error(`REF: pin mismatch for ${refKey(e.cpu, e.cid)}`);
      nState += sub.nState;
      gateCount += sub.gateCount;
    }
  }
  return { ...c, elements, nState, gateCount };
}

function setBit(b: Uint8Array, i: number): void {
  b[i >> 3] |= 1 << (i & 7);
}

function sliceBits(b: Uint8Array, start: number, len: number): Uint8Array {
  const out = new Uint8Array(Math.ceil(len / 8));
  for (let k = 0; k < len; k++) if (getBit(b, start + k)) setBit(out, k);
  return out;
}

export interface StepResult {
  state: Uint8Array;
  outputs: Uint8Array;
  /** 每个信号的取值（调试/可视化用），下标即信号号。 */
  signals: Uint8Array;
}

/** 通用求值，等价于链上 ICPU.step。state/inputs/返回值均为位打包。 */
export function step(c: Resolved, state: Uint8Array, inputs: Uint8Array, lib: Library | null): StepResult {
  const nSignals = 2 + c.nIn + c.elements.reduce((s, e) => s + (e.op === 'ref' ? e.rOut : 1), 0);
  const sig = new Uint8Array(nSignals);
  sig[1] = 1;
  for (let i = 0; i < c.nIn; i++) if (getBit(inputs, i)) sig[2 + i] = 1;

  const newState = new Uint8Array(Math.ceil(c.nState / 8));
  const latchD: number[] = [];
  const latchSlot: number[] = [];
  let outPos = 2 + c.nIn;
  let statePos = 0;

  for (const e of c.elements) {
    if (e.op === 'nand') {
      sig[outPos++] = sig[e.a] & sig[e.b] ? 0 : 1;
    } else if (e.op === 'latch') {
      sig[outPos++] = getBit(state, statePos);
      latchD.push(e.d);
      latchSlot.push(statePos);
      statePos++;
    } else {
      const sub = lib!.resolve(e.cpu, e.cid);
      const subIn = new Uint8Array(Math.ceil(e.rIn / 8));
      e.inputs.forEach((s, k) => { if (sig[s]) setBit(subIn, k); });
      const r = step(sub, sliceBits(state, statePos, sub.nState), subIn, lib);
      for (let k = 0; k < sub.nState; k++) if (getBit(r.state, k)) setBit(newState, statePos + k);
      for (let k = 0; k < e.rOut; k++) sig[outPos + k] = getBit(r.outputs, k);
      statePos += sub.nState;
      outPos += e.rOut;
    }
  }
  for (let i = 0; i < latchD.length; i++) if (sig[latchD[i]]) setBit(newState, latchSlot[i]);

  const outputs = new Uint8Array(Math.ceil(c.nOut / 8));
  for (let i = 0; i < c.nOut; i++) if (sig[nSignals - c.nOut + i]) setBit(outputs, i);
  return { state: newState, outputs, signals: sig };
}

/** 组合逻辑求值，等价于链上 ICPU.eval（含 LATCH 时抛错，与链上一致）。 */
export function evaluate(c: Resolved, inputs: Uint8Array, lib: Library | null): Uint8Array {
  if (c.nState !== 0) throw new Error('has latch: use step');
  return step(c, new Uint8Array(0), inputs, lib).outputs;
}

/** 关键路径深度，语义同链上 NetlistVM.depthOf（REF 按黑盒最坏路径计）。 */
export function depthOf(c: Resolved, lib: Library | null, memo = new Map<string, number>()): number {
  const nSignals = 2 + c.nIn + c.elements.reduce((s, e) => s + (e.op === 'ref' ? e.rOut : 1), 0);
  const d = new Array<number>(nSignals).fill(0);
  let outPos = 2 + c.nIn;
  let regIn = 0;
  for (const e of c.elements) {
    if (e.op === 'nand') {
      d[outPos++] = 1 + Math.max(d[e.a], d[e.b]);
    } else if (e.op === 'latch') {
      regIn = Math.max(regIn, d[e.d] ?? 0);
      outPos++;
    } else {
      const k = refKey(e.cpu, e.cid);
      let sd = memo.get(k);
      if (sd === undefined) {
        sd = depthOf(lib!.resolve(e.cpu, e.cid), lib, memo);
        memo.set(k, sd);
      }
      const inMax = e.inputs.reduce((m, s) => Math.max(m, d[s]), 0);
      for (let j = 0; j < e.rOut; j++) d[outPos + j] = inMax + sd;
      outPos += e.rOut;
    }
  }
  let dep = 0;
  for (let i = 0; i < c.nOut; i++) dep = Math.max(dep, d[nSignals - c.nOut + i]);
  return Math.max(dep, regIn);
}

/** 递归预取所有 REF 目标（异步读链），之后即可同步仿真。 */
export async function loadRefTree(
  root: CircuitData,
  lib: Library,
  fetcher: (cpu: string, cid: bigint) => Promise<CircuitData>,
): Promise<void> {
  const queue = stats(root.netlist, root.nIn).refs;
  let guard = 0;
  while (queue.length) {
    if (++guard > 4096) throw new Error('REF tree too large');
    const r = queue.shift()!;
    if (lib.has(r.cpu, r.cid)) continue;
    const c = await fetcher(r.cpu, r.cid);
    lib.set(r.cpu, r.cid, c);
    queue.push(...stats(c.netlist, c.nIn).refs);
  }
}
