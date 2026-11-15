import { useEffect, useMemo, useRef } from 'react';
import type { Element } from '@tapearena/netlist';
import { Cpu, Layers } from 'lucide-react';
import { tr } from '../i18n.ts';

interface Cell { x: number; y: number; level: number; kind: Element['op']; sig: number; w: number; ins: number[] }

/** 按逻辑深度分列排布每个元件，像一张芯片版图：铜色 NAND、青色 LATCH、金色 REF 黑盒。 */
function layout(elements: Element[], nIn: number) {
  const level: number[] = new Array(2 + nIn).fill(0);
  const cells: Cell[] = [];
  const latchFix: { cell: number; d: number }[] = [];
  let pos = 2 + nIn;
  for (const e of elements) {
    const ins = e.op === 'nand' ? [e.a, e.b] : e.op === 'latch' ? [] : e.inputs;
    const lv = e.op === 'latch' ? 0 : 1 + Math.max(0, ...ins.map((s) => level[s] ?? 0));
    const width = e.op === 'ref' ? e.rOut : 1;
    cells.push({ x: 0, y: 0, level: lv, kind: e.op, sig: pos, w: width, ins });
    if (e.op === 'latch') latchFix.push({ cell: cells.length - 1, d: e.d });
    for (let k = 0; k < width; k++) level[pos + k] = lv;
    pos += width;
  }
  const maxLevel = Math.max(1, ...cells.map((c) => c.level));
  const cols: number[] = new Array(maxLevel + 1).fill(0);
  for (const c of cells) { c.y = cols[c.level]; cols[c.level] += c.kind === 'ref' ? 3 : 1; c.x = c.level; }
  const maxRows = Math.max(1, ...cols);
  for (const c of cells) c.y += (maxRows - cols[c.level]) / 2;
  return { cells, maxLevel, maxRows, nSignals: pos };
}

export function Die({ elements, nIn, signals, height = 280, label }: {
  elements: Element[]; nIn: number; signals?: Uint8Array; height?: number; label?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const lay = useMemo(() => layout(elements, nIn), [elements, nIn]);
  const wave = useRef({ start: 0, sig: signals });

  useEffect(() => { wave.current = { start: performance.now(), sig: signals }; }, [signals]);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d')!;
    let raf = 0;
    const draw = (now: number) => {
      const dpr = window.devicePixelRatio || 1;
      const W = cv.clientWidth, H = cv.clientHeight;
      if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const pad = 18;
      const colW = (W - pad * 2) / (lay.maxLevel + 1);
      const rowH = Math.min(26, (H - pad * 2 - 14) / lay.maxRows);
      const size = Math.max(2, Math.min(colW * 0.5, rowH * 0.62, 14));
      const offY = (H - 14 - lay.maxRows * rowH) / 2;
      const px = (c: Cell) => pad + c.x * colW + colW / 2;
      const py = (c: Cell) => offY + c.y * rowH + rowH / 2;

      // 晶圆网格
      ctx.strokeStyle = 'rgba(127,209,185,0.05)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= lay.maxLevel + 1; i++) { const x = pad + i * colW; ctx.beginPath(); ctx.moveTo(x, pad / 2); ctx.lineTo(x, H - pad / 2); ctx.stroke(); }

      const { start, sig } = wave.current;
      const t = sig ? (now - start) / 700 : Infinity; // 信号波每 700ms 扫过全部深度
      const front = t * (lay.maxLevel + 1);
      const bySig = new Map<number, Cell>();
      for (const c of lay.cells) bySig.set(c.sig, c);

      // 走线：只画前若干条，避免大电路卡顿
      if (lay.cells.length <= 2500) {
        ctx.lineWidth = 0.6;
        for (const c of lay.cells) {
          for (const s of c.ins) {
            const src = bySig.get(s);
            if (!src) continue;
            const hot = sig && sig[s] && src.level <= front;
            ctx.strokeStyle = hot ? 'rgba(255,178,122,0.35)' : 'rgba(122,74,42,0.18)';
            ctx.beginPath();
            const x0 = px(src), y0 = py(src), x1 = px(c), y1 = py(c);
            ctx.moveTo(x0, y0); ctx.bezierCurveTo((x0 + x1) / 2, y0, (x0 + x1) / 2, y1, x1, y1);
            ctx.stroke();
          }
        }
      }

      for (const c of lay.cells) {
        const reached = c.level <= front;
        const on = sig ? reached && Array.from({ length: c.w }, (_, k) => sig[c.sig + k]).some(Boolean) : false;
        const x = px(c), y = py(c);
        if (c.kind === 'ref') {
          const h = rowH * 3 - 3;
          ctx.fillStyle = on ? 'rgba(242,196,109,0.9)' : 'rgba(242,196,109,0.18)';
          ctx.strokeStyle = 'rgba(242,196,109,0.7)';
          ctx.fillRect(x - size, y - rowH / 2, size * 2, h);
          ctx.strokeRect(x - size, y - rowH / 2, size * 2, h);
        } else {
          const base = c.kind === 'latch' ? [127, 209, 185] : [224, 138, 76];
          const a = on ? 1 : sig && reached ? 0.22 : 0.42;
          ctx.fillStyle = `rgba(${base[0]},${base[1]},${base[2]},${a})`;
          if (on) { ctx.shadowColor = `rgb(${base.join(',')})`; ctx.shadowBlur = 8; }
          ctx.fillRect(x - size / 2, y - size / 2, size, size);
          ctx.shadowBlur = 0;
        }
      }

      if (t < 1.4) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); });
    ro.observe(cv);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [lay, signals]);

  const nNand = elements.filter((e) => e.op === 'nand').length;
  const nLatch = elements.filter((e) => e.op === 'latch').length;
  const nRef = elements.filter((e) => e.op === 'ref').length;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-[#070908]" style={{ height }}>
      <canvas ref={ref} className="block size-full" />
      <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-md bg-substrate/80 px-2 py-1 font-mono text-[11px] text-mute ring-1 ring-line backdrop-blur-sm">
        <Cpu className="size-3.5 text-copper" />{label ?? 'DIE'}
      </div>
      <div className="absolute right-3 bottom-3 left-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-mute tabular-nums">
        <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-copper" /><b className="font-normal text-copper-hi">{nNand}</b> NAND</span>
        <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-si" /><b className="font-normal text-si">{nLatch}</b> LATCH</span>
        <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-gold" /><b className="font-normal text-gold">{nRef}</b> REF</span>
        <span className="ml-auto flex items-center gap-1"><Layers className="size-3" />{tr('深度', 'depth')} <b className="font-normal text-[#e8f3ee]">{lay.maxLevel}</b></span>
      </div>
    </div>
  );
}
