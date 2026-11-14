// 擂台测试向量：在链上合约里按「输入字节 | 期望输出字节」定长打包，链下负责生成与预检。

import { bitsToInt, concatBytes, intToBits, packBits, unpackBits } from './bits.ts';
import type { Pin } from './hdl.ts';
import { evaluate, type Library, type Resolved } from './vm.ts';

export interface Vector {
  inputs: number[];  // nIn 位
  outputs: number[]; // nOut 位
}

export const inBytes = (nIn: number) => Math.ceil(nIn / 8);
export const outBytes = (nOut: number) => Math.ceil(nOut / 8);

export function encodeVectors(nIn: number, nOut: number, vs: Vector[]): Uint8Array {
  return concatBytes(vs.flatMap((v) => {
    if (v.inputs.length !== nIn || v.outputs.length !== nOut) throw new Error('vector width mismatch');
    return [packBits(v.inputs), packBits(v.outputs)];
  }));
}

export function decodeVectors(nIn: number, nOut: number, blob: Uint8Array): Vector[] {
  const a = inBytes(nIn), b = outBytes(nOut), w = a + b;
  if (w === 0 || blob.length % w !== 0) throw new Error('vector blob length mismatch');
  const out: Vector[] = [];
  for (let o = 0; o < blob.length; o += w) {
    out.push({
      inputs: unpackBits(blob.subarray(o, o + a), nIn),
      outputs: unpackBits(blob.subarray(o + a, o + w), nOut),
    });
  }
  return out;
}

/** 按引脚名把整数值展开成位（向量低位在前，引脚按声明顺序）。 */
export function pinsToBits(pins: Pin[], values: Record<string, bigint | number>): number[] {
  return pins.flatMap((p) => intToBits(values[p.name] ?? 0, p.width));
}

export function bitsToPins(pins: Pin[], bits: number[]): Record<string, bigint> {
  const out: Record<string, bigint> = {};
  let o = 0;
  for (const p of pins) {
    out[p.name] = bitsToInt(bits.slice(o, o + p.width));
    o += p.width;
  }
  return out;
}

/** 确定性伪随机（mulberry32），保证同一份种子生成同一组向量，方便任何人复现。 */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 用参考电路生成测试向量：输入不超过 maxExhaustiveBits 位时穷举，否则全 0、全 1、
 * 单热位与随机输入混合，直到 count 条。
 */
export function generateVectors(
  ref: Resolved,
  lib: Library | null,
  opts: { count?: number; seed?: number; maxExhaustiveBits?: number } = {},
): Vector[] {
  const { count = 64, seed = 1, maxExhaustiveBits = 8 } = opts;
  const nIn = ref.nIn;
  const inputsList: number[][] = [];
  if (nIn <= maxExhaustiveBits) {
    for (let x = 0; x < 1 << nIn; x++) inputsList.push(intToBits(x, nIn));
  } else {
    const seen = new Set<string>();
    const add = (bits: number[]) => {
      const k = bits.join('');
      if (!seen.has(k) && inputsList.length < count) { seen.add(k); inputsList.push(bits); }
    };
    add(Array(nIn).fill(0));
    add(Array(nIn).fill(1));
    for (let i = 0; i < nIn && inputsList.length < Math.min(count, 2 + nIn); i++) {
      const b = Array(nIn).fill(0); b[i] = 1; add(b);
    }
    const r = rng(seed);
    let guard = 0;
    while (inputsList.length < count && guard++ < count * 20) add(Array.from({ length: nIn }, () => (r() < 0.5 ? 0 : 1)));
  }
  return inputsList.map((inputs) => ({
    inputs,
    outputs: unpackBits(evaluate(ref, packBits(inputs), lib), ref.nOut),
  }));
}

export interface VectorReport {
  passed: number;
  total: number;
  failures: { index: number; inputs: number[]; expected: number[]; actual: number[] }[];
}

export function checkVectors(c: Resolved, lib: Library | null, vs: Vector[], maxFailures = 8): VectorReport {
  const failures: VectorReport['failures'] = [];
  let passed = 0;
  vs.forEach((v, index) => {
    const actual = unpackBits(evaluate(c, packBits(v.inputs), lib), c.nOut);
    if (actual.every((b, i) => b === v.outputs[i])) passed++;
    else if (failures.length < maxFailures) failures.push({ index, inputs: v.inputs, expected: v.outputs, actual });
  });
  return { passed, total: vs.length, failures };
}

/** 在参考电路与候选电路之间找反例（随机搜索 + 穷举小输入），供挑战功能使用。 */
export function findCounterexample(
  candidate: Resolved,
  reference: Resolved,
  lib: Library | null,
  opts: { tries?: number; seed?: number } = {},
): number[] | null {
  if (candidate.nIn !== reference.nIn || candidate.nOut !== reference.nOut) throw new Error('pin mismatch');
  const nIn = candidate.nIn;
  const differs = (bits: number[]) => {
    const p = packBits(bits);
    const a = evaluate(candidate, p, lib), b = evaluate(reference, p, lib);
    return unpackBits(a, candidate.nOut).some((x, i) => x !== unpackBits(b, reference.nOut)[i]);
  };
  if (nIn <= 16) {
    for (let x = 0; x < 1 << nIn; x++) { const bits = intToBits(x, nIn); if (differs(bits)) return bits; }
    return null;
  }
  const r = rng(opts.seed ?? 7);
  for (let t = 0; t < (opts.tries ?? 20000); t++) {
    const bits = Array.from({ length: nIn }, () => (r() < 0.5 ? 0 : 1));
    if (differs(bits)) return bits;
  }
  return null;
}
