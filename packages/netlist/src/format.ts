// TapeOut 网表字节格式（与链上 NetlistVM.sol 一致）：
//   信号空间：0 = 常量 0，1 = 常量 1，2..2+nIn-1 = 输入引脚，之后每个元件按声明顺序产生输出信号。
//   NAND  0x00 a:u24 b:u24                       7 字节，a/b 必须指向已存在的信号
//   LATCH 0x01 d:u24                             4 字节，输出 = 上一周期状态，新状态 = 本周期 sig[d]（d 可指向后面的信号）
//   REF   0x02 cpu:addr20 cid:u64 rIn:u8 rOut:u8 rIn×u24   黑盒调用另一枚已流片电路
//   输出引脚 = 信号空间最后 nOut 个信号。多字节整数大端。

import { concatBytes } from './bits.ts';

export const OP_NAND = 0x00;
export const OP_LATCH = 0x01;
export const OP_REF = 0x02;
export const MAX_SIGNALS = 1 << 24;

export type Element =
  | { op: 'nand'; a: number; b: number }
  | { op: 'latch'; d: number }
  | { op: 'ref'; cpu: string; cid: bigint; rIn: number; rOut: number; inputs: number[] };

export interface RefTarget {
  cpu: string;
  cid: bigint;
}

export function refKey(cpu: string, cid: bigint | number): string {
  return `${cpu.toLowerCase()}#${BigInt(cid).toString()}`;
}

function u24(b: Uint8Array, p: number): number {
  if (p + 3 > b.length) throw new Error('netlist: truncated');
  return (b[p] << 16) | (b[p + 1] << 8) | b[p + 2];
}

function u64(b: Uint8Array, p: number): bigint {
  if (p + 8 > b.length) throw new Error('netlist: truncated');
  let v = 0n;
  for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(b[p + i]);
  return v;
}

function addr(b: Uint8Array, p: number): string {
  if (p + 20 > b.length) throw new Error('netlist: truncated');
  let s = '0x';
  for (let i = 0; i < 20; i++) s += b[p + i].toString(16).padStart(2, '0');
  return s;
}

export function decode(nl: Uint8Array): Element[] {
  const out: Element[] = [];
  let p = 0;
  while (p < nl.length) {
    const op = nl[p];
    p += 1;
    if (op === OP_NAND) {
      out.push({ op: 'nand', a: u24(nl, p), b: u24(nl, p + 3) });
      p += 6;
    } else if (op === OP_LATCH) {
      out.push({ op: 'latch', d: u24(nl, p) });
      p += 3;
    } else if (op === OP_REF) {
      if (p + 30 > nl.length) throw new Error('netlist: truncated');
      const cpu = addr(nl, p);
      const cid = u64(nl, p + 20);
      const rIn = nl[p + 28];
      const rOut = nl[p + 29];
      p += 30;
      const inputs: number[] = [];
      for (let k = 0; k < rIn; k++) {
        inputs.push(u24(nl, p));
        p += 3;
      }
      out.push({ op: 'ref', cpu, cid, rIn, rOut, inputs });
    } else {
      throw new Error(`netlist: bad opcode 0x${op.toString(16)} at ${p - 1}`);
    }
  }
  return out;
}

function w24(v: number): number[] {
  if (!Number.isInteger(v) || v < 0 || v >= MAX_SIGNALS) throw new Error(`netlist: signal ${v} out of u24 range`);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

export function encode(elements: Element[]): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const e of elements) {
    if (e.op === 'nand') parts.push(Uint8Array.from([OP_NAND, ...w24(e.a), ...w24(e.b)]));
    else if (e.op === 'latch') parts.push(Uint8Array.from([OP_LATCH, ...w24(e.d)]));
    else {
      if (!/^0x[0-9a-fA-F]{40}$/.test(e.cpu)) throw new Error('netlist: bad REF cpu address');
      if (e.rIn > 255 || e.rOut > 255 || e.inputs.length !== e.rIn) throw new Error('netlist: bad REF pins');
      const head = new Uint8Array(30);
      const a = e.cpu.slice(2);
      for (let i = 0; i < 20; i++) head[i] = parseInt(a.substr(i * 2, 2), 16);
      let c = e.cid;
      for (let i = 7; i >= 0; i--) {
        head[20 + i] = Number(c & 0xffn);
        c >>= 8n;
      }
      head[28] = e.rIn;
      head[29] = e.rOut;
      parts.push(Uint8Array.from([OP_REF]), head, Uint8Array.from(e.inputs.flatMap(w24)));
    }
  }
  return concatBytes(parts);
}

export interface Stats {
  nNand: number;
  nLatch: number;
  nRef: number;
  nSignals: number;
  refs: RefTarget[];
}

/** 本层统计（不递归）。nNand/nLatch = 流片时本层真正烧掉的晶体管数。 */
export function stats(nl: Uint8Array, nIn: number): Stats {
  const els = decode(nl);
  let nNand = 0, nLatch = 0, nRef = 0, produced = 0;
  const refs: RefTarget[] = [];
  for (const e of els) {
    if (e.op === 'nand') { nNand++; produced++; }
    else if (e.op === 'latch') { nLatch++; produced++; }
    else { nRef++; produced += e.rOut; refs.push({ cpu: e.cpu, cid: e.cid }); }
  }
  return { nNand, nLatch, nRef, nSignals: 2 + nIn + produced, refs };
}

/**
 * 与链上 NetlistVM.analyze 相同的拓扑校验（不含 REF 白名单与引脚核对，那两项需要读链）。
 * 返回错误描述；合法时返回 null。
 */
export function validate(nl: Uint8Array, nIn: number, nOut: number): string | null {
  let els: Element[];
  try {
    els = decode(nl);
  } catch (e) {
    return (e as Error).message;
  }
  if (nOut <= 0) return 'no outputs';
  let outPos = 2 + nIn;
  let maxLatchD = -1;
  let nLatch = 0;
  for (const e of els) {
    if (e.op === 'nand') {
      if (e.a >= outPos || e.b >= outPos) return `NAND: future signal at signal ${outPos}`;
      outPos++;
    } else if (e.op === 'latch') {
      maxLatchD = Math.max(maxLatchD, e.d);
      nLatch++;
      outPos++;
    } else {
      for (const s of e.inputs) if (s >= outPos) return `REF: future signal at signal ${outPos}`;
      outPos += e.rOut;
    }
  }
  if (outPos < 2 + nIn + nOut) return 'too few signals for outputs';
  if (nLatch > 0 && maxLatchD >= outPos) return 'LATCH d out of range';
  return null;
}
