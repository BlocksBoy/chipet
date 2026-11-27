/**
 * 遛猫时的「心脏透视」：猫胸口开一扇心形透视窗，头顶挂名牌，背上方浮一枚放大镜，
 * 里面是这只芯喵心脏的真实网表版图，每次心跳喂一组随机输入，信号按逻辑深度逐层点亮。
 */
import { dieLayout, type DieCell, type DieLayout } from '../components/dieLayout.ts';
import { tr } from '../i18n.ts';
import { run, type Heart } from './heart.ts';

const BEAT_MS = 1500;
/** 信号波扫过全部逻辑深度所用时间 */
const WAVE_MS = 650;

export interface HeartXray {
  heart: Heart;
  lay: DieLayout;
  sig: Uint8Array | null;
  beatAt: number;
  lensX: number;
  lensY: number;
  placed: boolean;
}

const cache = new WeakMap<Heart, HeartXray>();

export function xrayFor(heart: Heart): HeartXray {
  let x = cache.get(heart);
  if (!x) {
    x = { heart, lay: dieLayout(heart.c.elements, heart.c.nIn), sig: null, beatAt: -1e9, lensX: 0, lensY: 0, placed: false };
    cache.set(heart, x);
  }
  return x;
}

export function stepXray(x: HeartXray, now: number) {
  if (now - x.beatAt < BEAT_MS) return;
  x.beatAt = now;
  const bits = Array.from({ length: x.heart.nIn }, () => (Math.random() < 0.5 ? 1 : 0));
  x.sig = run(x.heart, bits).signals;
}

/** 「扑通-扑通」两下：0..1 */
export function beatPulse(x: HeartXray, now: number, reduce: boolean): number {
  if (reduce) return 0;
  const t = (now - x.beatAt) / 1000;
  const lub = Math.exp(-t * 16);
  const dub = t > 0.2 ? 0.65 * Math.exp(-(t - 0.2) * 16) : 0;
  return Math.min(1, lub + dub);
}

function waveFront(x: HeartXray, now: number, reduce: boolean) {
  if (reduce) return Infinity;
  return ((now - x.beatAt) / WAVE_MS) * (x.lay.maxLevel + 1);
}

function heartPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.95);
  ctx.bezierCurveTo(cx - s * 1.25, cy + s * 0.15, cx - s * 1.05, cy - s * 0.95, cx, cy - s * 0.35);
  ctx.bezierCurveTo(cx + s * 1.05, cy - s * 0.95, cx + s * 1.25, cy + s * 0.15, cx, cy + s * 0.95);
  ctx.closePath();
}

const NAND = [224, 138, 76] as const;
const LATCH = [127, 209, 185] as const;
const REF = [242, 196, 109] as const;

/** 把版图画进一个方框：走线 + 元件，已被信号波扫过且为高电平的亮起来 */
function drawCircuit(
  ctx: CanvasRenderingContext2D,
  x: HeartXray,
  front: number,
  bx: number, by: number, bw: number, bh: number,
  wires: boolean,
) {
  const { lay, sig } = x;
  const colW = bw / (lay.maxLevel + 1);
  const rowH = bh / lay.maxRows;
  const size = Math.max(1, Math.min(colW * 0.5, rowH * 0.62));
  const px = (c: DieCell) => bx + c.x * colW + colW / 2;
  const py = (c: DieCell) => by + c.y * rowH + rowH / 2;
  const lit = (c: DieCell) => !!sig && c.level <= front && Array.from({ length: c.w }, (_, k) => sig[c.sig + k]).some(Boolean);

  if (wires && lay.cells.length <= 600) {
    const bySig = new Map<number, DieCell>();
    for (const c of lay.cells) bySig.set(c.sig, c);
    ctx.lineWidth = Math.max(0.5, size * 0.14);
    for (const c of lay.cells) {
      for (const s of c.ins) {
        const src = bySig.get(s);
        if (!src) continue;
        const hot = !!sig && !!sig[s] && src.level <= front;
        ctx.strokeStyle = hot ? 'rgba(255,186,130,0.7)' : 'rgba(127,209,185,0.16)';
        const x0 = px(src), y0 = py(src), x1 = px(c), y1 = py(c);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.bezierCurveTo((x0 + x1) / 2, y0, (x0 + x1) / 2, y1, x1, y1);
        ctx.stroke();
      }
    }
  }

  for (const c of lay.cells) {
    const on = lit(c);
    const cx = px(c), cy = py(c);
    const base = c.kind === 'ref' ? REF : c.kind === 'latch' ? LATCH : NAND;
    ctx.fillStyle = `rgba(${base[0]},${base[1]},${base[2]},${on ? 1 : 0.32})`;
    if (on) { ctx.shadowColor = `rgb(${base[0]},${base[1]},${base[2]})`; ctx.shadowBlur = size * 1.6; }
    if (c.kind === 'ref') ctx.fillRect(cx - size, cy - rowH / 2, size * 2, rowH * 3 - 1);
    else ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
    ctx.shadowBlur = 0;
  }
}

/** 胸口的心形透视窗（在猫的局部坐标里画，跟着猫一起倾斜/压扁） */
export function drawChestXray(ctx: CanvasRenderingContext2D, x: HeartXray, cx: number, cy: number, s: number, now: number, reduce: boolean) {
  const pulse = beatPulse(x, now, reduce);
  const k = s * (1 + pulse * 0.12);
  ctx.save();
  heartPath(ctx, cx, cy, k);
  ctx.fillStyle = 'rgba(6,18,16,0.6)';
  ctx.fill();
  ctx.clip();
  drawCircuit(ctx, x, waveFront(x, now, reduce), cx - k * 1.05, cy - k * 0.75, k * 2.1, k * 1.5, false);
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, k * 1.2);
  g.addColorStop(0, `rgba(255,140,90,${0.18 + pulse * 0.4})`);
  g.addColorStop(1, 'rgba(255,140,90,0)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - k * 1.3, cy - k * 1.3, k * 2.6, k * 2.6);
  ctx.restore();
  heartPath(ctx, cx, cy, k);
  ctx.strokeStyle = `rgba(150,230,205,${0.55 + pulse * 0.4})`;
  ctx.lineWidth = Math.max(0.7, s * 0.09);
  ctx.stroke();
}

/** 背上方的放大镜：从胸口牵一根引线过来，镜里是放大的心脏版图 */
export function drawHeartLens(
  ctx: CanvasRenderingContext2D,
  x: HeartXray,
  chestX: number, chestY: number,
  targetX: number, targetY: number,
  h: number, now: number, dt: number, reduce: boolean,
) {
  const R = h * 0.08;
  if (!x.placed || reduce) {
    x.lensX = targetX;
    x.lensY = targetY;
    x.placed = true;
  } else {
    const a = 1 - Math.exp(-dt * 9);
    x.lensX += (targetX - x.lensX) * a;
    x.lensY += (targetY - x.lensY) * a;
  }
  const lx = x.lensX, ly = x.lensY;
  const pulse = beatPulse(x, now, reduce);
  const front = waveFront(x, now, reduce);

  // 引线：胸口一个小亮点 → 镜框边缘
  const ang = Math.atan2(chestY - ly, chestX - lx);
  const ex = lx + Math.cos(ang) * R, ey = ly + Math.sin(ang) * R;
  ctx.save();
  ctx.setLineDash([3, 3]);
  ctx.lineDashOffset = reduce ? 0 : -now / 60;
  ctx.strokeStyle = 'rgba(190,245,225,0.95)';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 3;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(chestX, chestY);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.setLineDash([]);
  ctx.fillStyle = `rgba(255,170,120,${0.7 + pulse * 0.3})`;
  ctx.beginPath();
  ctx.arc(chestX, chestY, 1.8 + pulse * 1.2, 0, Math.PI * 2);
  ctx.fill();

  // 镜片
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(lx, ly, R, 0, Math.PI * 2);
  const glass = ctx.createRadialGradient(lx - R * 0.3, ly - R * 0.4, R * 0.1, lx, ly, R);
  glass.addColorStop(0, 'rgba(18,34,30,0.9)');
  glass.addColorStop(1, 'rgba(5,10,9,0.92)');
  ctx.fillStyle = glass;
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.save();
  ctx.beginPath();
  ctx.arc(lx, ly, R - 1, 0, Math.PI * 2);
  ctx.clip();
  // 晶圆网格
  ctx.strokeStyle = 'rgba(127,209,185,0.07)';
  ctx.lineWidth = 1;
  const step = R / 4;
  for (let gx = lx - R; gx <= lx + R; gx += step) { ctx.beginPath(); ctx.moveTo(gx, ly - R); ctx.lineTo(gx, ly + R); ctx.stroke(); }
  for (let gy = ly - R; gy <= ly + R; gy += step) { ctx.beginPath(); ctx.moveTo(lx - R, gy); ctx.lineTo(lx + R, gy); ctx.stroke(); }
  const box = R * 1.5;
  drawCircuit(ctx, x, front, lx - box / 2, ly - box / 2 - R * 0.06, box, box * 0.86, true);
  // 扫描线
  if (!reduce) {
    const sy = ly - R + (((now / 1600) % 1) * R * 2);
    const sg = ctx.createLinearGradient(0, sy - R * 0.25, 0, sy);
    sg.addColorStop(0, 'rgba(127,209,185,0)');
    sg.addColorStop(1, 'rgba(127,209,185,0.16)');
    ctx.fillStyle = sg;
    ctx.fillRect(lx - R, sy - R * 0.25, R * 2, R * 0.25);
  }
  // 镜面高光
  const hl = ctx.createLinearGradient(lx - R, ly - R, lx, ly);
  hl.addColorStop(0, 'rgba(255,255,255,0.12)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hl;
  ctx.fillRect(lx - R, ly - R, R * 2, R * 2);
  ctx.restore();

  // 镜框：内青外铜，心跳时亮一下
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = `rgba(150,230,205,${0.65 + pulse * 0.35})`;
  ctx.beginPath();
  ctx.arc(lx, ly, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(224,138,76,0.55)';
  ctx.beginPath();
  ctx.arc(lx, ly, R + 2.5, 0, Math.PI * 2);
  ctx.stroke();

  // 顶部标签：心脏名 · 门数
  const fs = Math.max(9, Math.round(h * 0.019));
  ctx.font = `600 ${fs}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.textAlign = 'center';
  const label = `${x.heart.name} · ${x.heart.gates} ${tr('门', 'gates')}`;
  const tw = ctx.measureText(label).width + 12;
  const tyTop = ly - R - fs * 0.55;
  ctx.fillStyle = 'rgba(5,10,9,0.85)';
  roundRect(ctx, lx - tw / 2, tyTop, tw, fs + 6, (fs + 6) / 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(150,230,205,0.45)';
  ctx.stroke();
  ctx.fillStyle = '#bff3e2';
  ctx.fillText(label, lx, tyTop + fs + 1);
  ctx.restore();
}

/** 头顶名牌：名字 + 一颗跟着心跳的小红心 */
export function drawNameTag(ctx: CanvasRenderingContext2D, x: HeartXray, name: string, cx: number, bottom: number, h: number, now: number, reduce: boolean) {
  const pulse = beatPulse(x, now, reduce);
  const fs = Math.max(11, Math.round(h * 0.026));
  ctx.save();
  ctx.font = `700 ${fs}px "Noto Sans SC", system-ui, sans-serif`;
  const textW = ctx.measureText(name).width;
  const icon = fs * 0.9;
  const ph = fs + 10;
  const pw = textW + icon + 22;
  const left = cx - pw / 2;
  const top = bottom - ph - 5;
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = 'rgba(255,251,244,0.94)';
  roundRect(ctx, left, top, pw, ph, ph / 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - 4, top + ph);
  ctx.lineTo(cx, top + ph + 5);
  ctx.lineTo(cx + 4, top + ph);
  ctx.fill();
  ctx.shadowBlur = 0;
  const hx = left + 9 + icon / 2;
  const hy = top + ph / 2;
  heartPath(ctx, hx, hy - icon * 0.05, (icon / 2.2) * (1 + pulse * 0.25));
  ctx.fillStyle = '#e0683f';
  ctx.fill();
  ctx.fillStyle = '#2a2420';
  ctx.textAlign = 'left';
  ctx.fillText(name, hx + icon / 2 + 5, top + ph / 2 + fs * 0.36);
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
