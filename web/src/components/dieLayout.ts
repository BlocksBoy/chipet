import type { Element } from '@tapearena/netlist';

export interface DieCell { x: number; y: number; level: number; kind: Element['op']; sig: number; w: number; ins: number[] }

export interface DieLayout { cells: DieCell[]; maxLevel: number; maxRows: number; nSignals: number }

/** 按逻辑深度分列排布每个元件，像一张芯片版图：铜色 NAND、青色 LATCH、金色 REF 黑盒。 */
export function dieLayout(elements: Element[], nIn: number): DieLayout {
  const level: number[] = new Array(2 + nIn).fill(0);
  const cells: DieCell[] = [];
  let pos = 2 + nIn;
  for (const e of elements) {
    const ins = e.op === 'nand' ? [e.a, e.b] : e.op === 'latch' ? [] : e.inputs;
    const lv = e.op === 'latch' ? 0 : 1 + Math.max(0, ...ins.map((s) => level[s] ?? 0));
    const width = e.op === 'ref' ? e.rOut : 1;
    cells.push({ x: 0, y: 0, level: lv, kind: e.op, sig: pos, w: width, ins });
    for (let k = 0; k < width; k++) level[pos + k] = lv;
    pos += width;
  }
  const maxLevel = Math.max(1, ...cells.map((c) => c.level));
  const cols: number[] = new Array(maxLevel + 1).fill(0);
  for (const c of cells) { c.y = cols[c.level]!; cols[c.level]! += c.kind === 'ref' ? 3 : 1; c.x = c.level; }
  const maxRows = Math.max(1, ...cols);
  for (const c of cells) c.y += (maxRows - cols[c.level]!) / 2;
  return { cells, maxLevel, maxRows, nSignals: pos };
}
