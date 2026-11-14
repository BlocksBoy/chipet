// 编译 / 仿真 / 向量 / 预检：浏览器与服务端共用同一套逻辑。

import {
  bitsToPins, checkVectors, compile, encodeVectors, findCounterexample, fromHex, generateVectors, packBits, pinsToBits,
  resolveData, step, toHex, unpackBits,
  type CompileResult, type Library, type Pin, type Resolved, type Vector, type VectorReport,
} from '@tapearena/netlist';
import { ChainLibrary } from './reader.ts';

export interface Built {
  compiled: CompileResult;
  circuit: Resolved;
}

export async function build(src: string, lib: Library): Promise<Built> {
  if (lib instanceof ChainLibrary) await lib.preloadUses(src);
  const compiled = compile(src, { components: lib as ChainLibrary });
  const circuit = resolveData({ netlist: compiled.netlist, nIn: compiled.nIn, nOut: compiled.nOut }, lib);
  return { compiled, circuit };
}

export function summary(c: CompileResult) {
  return {
    name: c.name,
    netlist: toHex(c.netlist),
    nIn: c.nIn,
    nOut: c.nOut,
    inputs: c.inputs,
    outputs: c.outputs,
    nNand: c.nNand,
    nLatch: c.nLatch,
    gateCount: c.gateCount,
    bytes: c.netlist.length,
    components: c.components,
  };
}

/** 接受 12 / "0x0c" / "0b1100" / "12" 这几种写法。 */
export function parseValue(v: unknown): bigint {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number') return BigInt(Math.trunc(v));
  if (typeof v === 'boolean') return v ? 1n : 0n;
  if (typeof v === 'string' && v.trim() !== '') return BigInt(v.trim());
  return 0n;
}

export function pinValues(pins: Pin[], values: Record<string, unknown> = {}): Record<string, bigint> {
  const out: Record<string, bigint> = {};
  for (const p of pins) out[p.name] = parseValue(values[p.name]);
  return out;
}

const fmt = (o: Record<string, bigint>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.toString()]));

/**
 * 逐拍仿真。inputs 可以是单组（每拍相同）或数组（逐拍给定）。
 * 返回每拍输出与寄存器状态，组合电路就是一拍。
 */
export function simulate(
  b: Built,
  lib: Library,
  inputs: Record<string, unknown> | Record<string, unknown>[],
  cycles = 1,
  stateHex?: string,
) {
  const { compiled, circuit } = b;
  const seq = Array.isArray(inputs) ? inputs : Array.from({ length: Math.max(1, cycles) }, () => inputs);
  if (seq.length > 1024) throw new Error('最多仿真 1024 拍');
  let state = stateHex ? fromHex(stateHex) : new Uint8Array(Math.ceil(circuit.nState / 8));
  const trace = seq.map((vals, cycle) => {
    const inBits = pinsToBits(compiled.inputs, pinValues(compiled.inputs, vals));
    const r = step(circuit, state, packBits(inBits), lib);
    state = r.state;
    return {
      cycle,
      outputs: fmt(bitsToPins(compiled.outputs, unpackBits(r.outputs, circuit.nOut))),
      state: toHex(r.state),
    };
  });
  return { nState: circuit.nState, trace };
}

export function vectorsFor(b: Built, lib: Library, count = 64, seed = 1) {
  if (b.circuit.nState) throw new Error('含寄存器的电路不能当擂台参考（链上只比组合逻辑）');
  const vs = generateVectors(b.circuit, lib, { count, seed });
  return { count: vs.length, hex: toHex(encodeVectors(b.circuit.nIn, b.circuit.nOut, vs)), vectors: vs.map((v) => describe(b.compiled, v)) };
}

export function describe(c: Pick<CompileResult, 'inputs' | 'outputs'>, v: Vector) {
  return { inputs: fmt(bitsToPins(c.inputs, v.inputs)), outputs: fmt(bitsToPins(c.outputs, v.outputs)) };
}

export interface Precheck {
  ok: boolean;
  reasons: string[];
  gateCount: number;
  report: VectorReport;
  rankIfSubmitted?: number;
}

/** 离线复现合约 submit 的判定：引脚、寄存器、门数上限与全部向量。 */
export function precheck(
  cand: Resolved,
  lib: Library,
  bounty: { nIn: number; nOut: number; maxGates: number; vectors: Vector[]; submissions?: { gateCount: number; disqualified: boolean }[] },
): Precheck {
  const reasons: string[] = [];
  if (cand.nIn !== bounty.nIn || cand.nOut !== bounty.nOut) reasons.push(`引脚不符：需要 ${bounty.nIn} 入 ${bounty.nOut} 出，实际 ${cand.nIn} 入 ${cand.nOut} 出`);
  if (cand.nState) reasons.push('电路含寄存器，擂台只接受组合逻辑');
  if (bounty.maxGates && cand.gateCount > bounty.maxGates) reasons.push(`门数 ${cand.gateCount} 超过上限 ${bounty.maxGates}`);
  let report: VectorReport = { passed: 0, total: bounty.vectors.length, failures: [] };
  if (!reasons.length) {
    report = checkVectors(cand, lib, bounty.vectors);
    if (report.passed !== report.total) reasons.push(`测试向量未全过：${report.passed}/${report.total}`);
  }
  const live = (bounty.submissions ?? []).filter((s) => !s.disqualified);
  const rankIfSubmitted = 1 + live.filter((s) => s.gateCount <= cand.gateCount).length;
  return { ok: reasons.length === 0, reasons, gateCount: cand.gateCount, report, rankIfSubmitted };
}

/** 给挑战者用：先找与参考电路不一致的输入，没有参考电路时退回到找不通过的已存向量。 */
export function challengeHint(cand: Resolved, ref: Resolved | null, lib: Library, vectors: Vector[]) {
  const failing = checkVectors(cand, lib, vectors, 1).failures[0];
  if (failing) return { kind: 'vector' as const, vectorIndex: failing.index, input: toHex(packBits(failing.inputs)) };
  if (ref) {
    const bits = findCounterexample(cand, ref, lib, { tries: 20000 });
    if (bits) return { kind: 'input' as const, input: toHex(packBits(bits)), bits };
  }
  return null;
}