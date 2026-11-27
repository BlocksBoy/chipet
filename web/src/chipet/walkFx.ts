/**
 * 遛猫大道的环境动效与粒子：树影光斑、斜阳光柱、落叶、鸽群、扬尘/闪光/爱心。
 * 坐标沿用 walkGame：x 为世界坐标（h 单位），y 为离地高度（h 单位，向上为正）。
 */
import { catWorldX, type WalkEvent, type WalkState } from './walkGame.ts';

type PKind = 'dust' | 'spark' | 'star' | 'heart' | 'text';

interface Particle {
  kind: PKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  born: number;
  life: number;
  size: number;
  color: string;
  /** 所在车道的地面高度（占画布高） */
  lane: number;
  rot: number;
  vr: number;
  text?: string;
}

interface Leaf {
  /** 视差坐标：屏幕 x = (x - scroll * depth) * h */
  x: number;
  /** 屏幕 y（占画布高） */
  y: number;
  vx: number;
  vy: number;
  depth: number;
  size: number;
  rot: number;
  vr: number;
  flip: number;
  vflip: number;
  color: string;
  restAt: number;
}

interface Pigeon {
  x: number;
  lane: number;
  dir: 1 | -1;
  peck: number;
  flying: boolean;
  takeoffAt: number;
  y: number;
  vx: number;
  vy: number;
  flap: number;
  flock: number;
}

interface RopePt { x: number; y: number; px: number; py: number }

export interface WalkFx {
  /** 牵绳节点（屏幕坐标 / h） */
  rope: RopePt[];
  /** 开走时的镜头位置，走路帧从第 0 帧起步 */
  walkFrom: number;
  parts: Particle[];
  leaves: Leaf[];
  pigeons: Pigeon[];
  nextLeaf: number;
  nextFlockX: number;
  flockSeq: number;
  shakeAt: number;
  squashAt: number;
}

const LEAF_COLORS = ['#7f9a3c', '#a2ad48', '#c9a445', '#d48b3a', '#6e8f3a', '#b9b34f'];
const PIGEON_LANE = 0.888;

export function createFx(): WalkFx {
  return { rope: [], walkFrom: 0, parts: [], leaves: [], pigeons: [], nextLeaf: 0, nextFlockX: 1.6, flockSeq: 0, shakeAt: -1e9, squashAt: -1e9 };
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** 把游戏事件变成粒子；返回值无，音效由调用方处理 */
export function spawnFor(fx: WalkFx, e: WalkEvent, s: WalkState, now: number, laneMid: number, laneFar: number, laneNear: number, heroH: number) {
  const p = (o: Partial<Particle> & Pick<Particle, 'kind' | 'x' | 'y'>) => {
    fx.parts.push({ vx: 0, vy: 0, g: 0, born: now, life: 600, size: 0.01, color: '#fff', lane: laneMid, rot: 0, vr: 0, ...o });
  };
  switch (e.type) {
    case 'start':
      fx.walkFrom = s.scroll;
      break;
    case 'jump': {
      const x = catWorldX(s);
      for (let i = 0; i < 5; i++) p({ kind: 'dust', x: x + rand(-0.03, 0.02), y: s.catY + 0.004, vx: rand(-0.18, -0.05), vy: rand(0.02, 0.08), life: rand(380, 560), size: rand(0.012, 0.02), color: '150,132,108' });
      break;
    }
    case 'land': {
      fx.squashAt = now;
      const n = e.hard ? 9 : 6;
      for (let i = 0; i < n; i++) {
        const side = i % 2 ? 1 : -1;
        p({ kind: 'dust', x: e.x + rand(-0.02, 0.02), y: e.y + 0.004, vx: side * rand(0.08, 0.24), vy: rand(0.01, 0.07), life: rand(420, 700), size: rand(0.012, e.hard ? 0.026 : 0.02), color: '150,132,108' });
      }
      break;
    }
    case 'fish': {
      for (let i = 0; i < 12; i++) {
        const a = (Math.PI * 2 * i) / 12 + rand(-0.2, 0.2);
        const v = rand(0.25, 0.5);
        p({ kind: 'spark', x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v + 0.15, g: 0.9, life: rand(450, 700), size: rand(0.005, 0.009), color: i % 3 ? '#ffd76a' : '#fff6d8' });
      }
      p({ kind: 'text', x: e.x, y: e.y + 0.04, vy: 0.14, life: 950, size: 0.036, color: '#ffe08a', text: '+1' });
      break;
    }
    case 'hit': {
      fx.shakeAt = now;
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i - 2.5) * 0.45;
        p({ kind: 'star', x: e.x, y: e.y + 0.03, vx: Math.cos(a) * rand(0.2, 0.35), vy: -Math.sin(a) * rand(0.25, 0.4), g: 1.1, life: rand(650, 850), size: rand(0.012, 0.018), color: '#ffd35a', vr: rand(-8, 8) });
      }
      p({ kind: 'text', x: e.x - 0.04, y: e.y + 0.1, vy: 0.12, life: 900, size: 0.032, color: '#ff9c8a', text: '♥ −1' });
      break;
    }
    case 'greet': {
      const w = s.walkers.find((o) => o.id === e.walkerId);
      if (!w) break;
      const lane = w.lane === 0 ? laneFar : laneNear;
      const k = w.lane === 0 ? 0.86 : 1.12;
      const top = heroH * k * 0.95;
      for (let i = 0; i < 4; i++) {
        p({ kind: 'heart', x: w.x + rand(-0.05, 0.05), y: top + rand(-0.02, 0.03), vx: rand(-0.03, 0.03) + w.dir * w.speed, vy: rand(0.12, 0.2), life: rand(1100, 1500), born: now + i * 110, size: rand(0.016, 0.024) * k, color: i % 2 ? '#ff7d9a' : '#ff9fb4', lane });
      }
      if (e.kind === 'dog' || e.kind === 'cat') {
        p({ kind: 'text', x: catWorldX(s), y: s.catY + 0.17, vy: 0.12, life: 1100, size: 0.032, color: '#ffe08a', text: '+1 🐟' });
      }
      break;
    }
    default:
      break;
  }
}

/** 推进环境与粒子；返回本帧是否惊飞了一群鸽子 */
export function updateFx(fx: WalkFx, s: WalkState, now: number, dt: number, aspect: number, reduce: boolean): boolean {
  // 粒子
  fx.parts = fx.parts.filter((q) => now - q.born < q.life);
  for (const q of fx.parts) {
    if (now < q.born) continue;
    q.vy -= q.g * dt;
    q.x += q.vx * dt;
    q.y += q.vy * dt;
    q.rot += q.vr * dt;
    if (q.kind === 'dust') {
      q.vx *= 1 - 2.5 * dt;
      q.vy *= 1 - 2 * dt;
    }
  }

  // 落叶
  if (!reduce) {
    if (now > fx.nextLeaf && fx.leaves.length < 22) {
      fx.nextLeaf = now + rand(320, 900);
      const depth = Math.random() < 0.3 ? 1.25 : rand(0.85, 1);
      fx.leaves.push({
        x: s.scroll * depth + rand(-0.1, aspect * 1.15),
        y: rand(-0.06, 0.3),
        vx: rand(-0.06, 0.03),
        vy: rand(0.05, 0.09),
        depth,
        size: rand(0.011, 0.018) * (depth > 1 ? 1.6 : 1),
        rot: rand(0, Math.PI * 2),
        vr: rand(-1.6, 1.6),
        flip: rand(0, Math.PI * 2),
        vflip: rand(3, 6),
        color: LEAF_COLORS[Math.floor(Math.random() * LEAF_COLORS.length)]!,
        restAt: 0,
      });
    }
    for (const l of fx.leaves) {
      if (l.restAt) continue;
      const sway = Math.sin(now / 520 + l.flip) * 0.05;
      l.x += (l.vx + sway) * dt;
      l.y += l.vy * dt;
      l.rot += l.vr * dt;
      l.flip += l.vflip * dt;
      const floor = l.depth > 1 ? 1.02 : 0.9 + (l.depth - 0.85) * 0.5;
      if (l.y >= floor) {
        l.y = floor;
        l.restAt = now;
      }
    }
    fx.leaves = fx.leaves.filter((l) => {
      const sx = l.x - s.scroll * l.depth;
      return sx > -0.4 && sx < aspect + 0.6 && (!l.restAt || now - l.restAt < 2600);
    });
  } else {
    fx.leaves.length = 0;
  }

  // 鸽群：在前方路面成群觅食，猫走近就扑棱棱飞走
  const ahead = s.scroll + aspect + 0.3;
  if (fx.nextFlockX < s.scroll) fx.nextFlockX = ahead + rand(0.5, 2);
  if (fx.nextFlockX < ahead + 0.5) {
    const n = 2 + Math.floor(Math.random() * 3);
    const flock = ++fx.flockSeq;
    for (let i = 0; i < n; i++) {
      fx.pigeons.push({
        x: fx.nextFlockX + i * rand(0.07, 0.13),
        lane: PIGEON_LANE + rand(-0.012, 0.012),
        dir: Math.random() < 0.5 ? 1 : -1,
        peck: rand(0, 10),
        flying: false,
        takeoffAt: 0,
        y: 0,
        vx: 0,
        vy: 0,
        flap: rand(0, 6),
        flock,
      });
    }
    fx.nextFlockX += rand(4.5, 9);
  }
  const cx = catWorldX(s);
  let scared = false;
  for (const g of fx.pigeons) {
    if (!g.flying) {
      if (s.phase === 'running' && Math.abs(g.x - cx) < 0.5) {
        for (const o of fx.pigeons) {
          if (o.flock !== g.flock || o.flying) continue;
          o.flying = true;
          o.takeoffAt = now + rand(0, 220);
          o.dir = Math.random() < 0.7 ? 1 : -1;
          o.vx = o.dir * rand(0.45, 0.8);
          o.vy = rand(0.55, 0.85);
        }
        scared = true;
        continue;
      }
      g.peck += dt * (1.2 + Math.random());
      if (Math.sin(g.peck * 0.7) > 0.96) g.x += g.dir * 0.05 * dt;
    } else if (now >= g.takeoffAt) {
      g.vy += 0.4 * dt;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      g.flap += dt * 26;
    }
  }
  fx.pigeons = fx.pigeons.filter((g) => g.y < 1.3 && g.x > s.scroll - 0.5);
  return scared;
}

const ROPE_N = 16;

/**
 * 牵绳：Verlet 绳子，两端钉在手和背环上，自己下垂、晃动、绷直。
 * 坐标为屏幕像素 / h，镜头跟着人走，所以在屏幕空间里解算就对。
 */
export function stepRope(fx: WalkFx, ax: number, ay: number, bx: number, by: number, dt: number) {
  const span = Math.hypot(bx - ax, by - ay);
  const len = Math.max(0.5, span * 1.02);
  const seg = len / (ROPE_N - 1);
  if (fx.rope.length !== ROPE_N) {
    fx.rope = Array.from({ length: ROPE_N }, (_, i) => {
      const u = i / (ROPE_N - 1);
      const x = ax + (bx - ax) * u;
      const y = ay + (by - ay) * u + Math.sin(u * Math.PI) * 0.08;
      return { x, y, px: x, py: y };
    });
  }
  const t = Math.min(dt, 1 / 30);
  const g = 3.2 * t * t;
  for (let i = 1; i < ROPE_N - 1; i++) {
    const p = fx.rope[i]!;
    const vx = (p.x - p.px) * 0.97;
    const vy = (p.y - p.py) * 0.97;
    p.px = p.x;
    p.py = p.y;
    p.x += vx;
    p.y += vy + g;
  }
  const a = fx.rope[0]!;
  const b = fx.rope[ROPE_N - 1]!;
  for (let it = 0; it < 18; it++) {
    a.x = ax; a.y = ay;
    b.x = bx; b.y = by;
    for (let i = 0; i < ROPE_N - 1; i++) {
      const p = fx.rope[i]!;
      const q = fx.rope[i + 1]!;
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const d = Math.hypot(dx, dy) || 1e-6;
      const k = (d - seg) / d / 2;
      if (i > 0) { p.x += dx * k; p.y += dy * k; }
      if (i + 1 < ROPE_N - 1) { q.x -= dx * k; q.y -= dy * k; }
    }
  }
  a.x = ax; a.y = ay;
  b.x = bx; b.y = by;
}

export function drawRope(ctx: CanvasRenderingContext2D, fx: WalkFx, h: number) {
  const pts = fx.rope;
  if (pts.length < 2) return;
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0]!.x * h, pts[0]!.y * h);
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i]!;
      const q = pts[i + 1]!;
      ctx.quadraticCurveTo(p.x * h, p.y * h, ((p.x + q.x) / 2) * h, ((p.y + q.y) / 2) * h);
    }
    const last = pts[pts.length - 1]!;
    ctx.lineTo(last.x * h, last.y * h);
  };
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  path();
  ctx.strokeStyle = '#a8352a';
  ctx.lineWidth = Math.max(2, h * 0.0048);
  ctx.stroke();
  path();
  ctx.strokeStyle = 'rgba(255,196,170,0.32)';
  ctx.lineWidth = Math.max(0.8, h * 0.0014);
  ctx.stroke();
  ctx.restore();
}

/* ───────── 绘制 ───────── */

function hash(i: number) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** 路面上被树叶筛下来的光斑，随风轻轻闪 */
export function drawDapple(ctx: CanvasRenderingContext2D, s: WalkState, w: number, h: number, now: number, reduce: boolean) {
  const step = 0.31;
  const i0 = Math.floor(s.scroll / step) - 2;
  const i1 = Math.ceil((s.scroll + w / h) / step) + 2;
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  for (let i = i0; i <= i1; i++) {
    const r1 = hash(i);
    const r2 = hash(i + 91);
    const x = (i * step + r1 * step - s.scroll) * h;
    const y = (0.8 + r2 * 0.19) * h;
    const rad = (0.035 + hash(i + 7) * 0.06) * h;
    const flick = reduce ? 0.7 : 0.55 + 0.45 * Math.sin(now / (700 + r1 * 600) + i * 1.7);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(255,236,190,${0.55 * flick})`);
    g.addColorStop(1, 'rgba(255,236,190,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, rad, rad * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** 从左上斜进来的几道柔光 */
export function drawRays(ctx: CanvasRenderingContext2D, w: number, h: number, now: number, reduce: boolean) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < 4; i++) {
    const pulse = reduce ? 0.6 : 0.5 + 0.5 * Math.sin(now / (2600 + i * 700) + i * 2.1);
    const x0 = w * (0.08 + i * 0.22);
    const bw = w * (0.05 + (i % 2) * 0.035);
    const g = ctx.createLinearGradient(x0, 0, x0 + h * 0.55, h);
    g.addColorStop(0, `rgba(255,222,160,${0.12 * pulse})`);
    g.addColorStop(0.7, `rgba(255,222,160,${0.03 * pulse})`);
    g.addColorStop(1, 'rgba(255,222,160,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    ctx.lineTo(x0 + bw, 0);
    ctx.lineTo(x0 + bw + h * 0.6, h);
    ctx.lineTo(x0 + h * 0.6 - bw * 0.4, h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export function drawPigeons(ctx: CanvasRenderingContext2D, fx: WalkFx, s: WalkState, w: number, h: number, stand: HTMLImageElement, fly: HTMLImageElement, now: number) {
  for (const g of fx.pigeons) {
    const x = (g.x - s.scroll) * h;
    if (x < -60 || x > w + 60) continue;
    const gy = g.lane * h;
    if (!g.flying || now < g.takeoffAt) {
      const ph = 0.05 * h;
      const pw = (stand.width / stand.height) * ph;
      const bob = Math.max(0, Math.sin(g.peck * 3)) ;
      ctx.save();
      ctx.globalAlpha = 0.5;
      const sh = ctx.createRadialGradient(x, gy, 0, x, gy, pw * 0.45);
      sh.addColorStop(0, 'rgba(20,14,8,0.45)');
      sh.addColorStop(1, 'rgba(20,14,8,0)');
      ctx.fillStyle = sh;
      ctx.beginPath();
      ctx.ellipse(x, gy, pw * 0.45, ph * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.translate(x, gy);
      if (g.dir < 0) ctx.scale(-1, 1);
      ctx.rotate(bob * 0.12);
      ctx.drawImage(stand, -pw / 2, -ph, pw, ph);
      ctx.restore();
    } else {
      const ph = 0.11 * h;
      const pw = (fly.width / fly.height) * ph;
      // 翅膀扇动：以身体为轴纵向收放，起飞头几下扇得最猛
      const sy = 0.5 + 0.5 * (0.5 + 0.5 * Math.cos(g.flap));
      const y = gy - g.y * h;
      ctx.save();
      ctx.translate(x, y);
      if (g.dir < 0) ctx.scale(-1, 1);
      ctx.rotate(-0.18 - Math.min(0.2, g.vy * 0.1));
      ctx.scale(1, sy);
      ctx.drawImage(fly, -pw / 2, -ph * 0.78, pw, ph);
      ctx.restore();
    }
  }
}

export function drawParticles(ctx: CanvasRenderingContext2D, fx: WalkFx, s: WalkState, h: number, now: number) {
  for (const q of fx.parts) {
    if (now < q.born) continue;
    const u = (now - q.born) / q.life;
    const x = (q.x - s.scroll) * h;
    const y = q.lane * h - q.y * h;
    const r = q.size * h;
    ctx.save();
    switch (q.kind) {
      case 'dust': {
        const rr = r * (0.6 + u * 1.4);
        const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
        g.addColorStop(0, `rgba(${q.color},${0.35 * (1 - u)})`);
        g.addColorStop(1, `rgba(${q.color},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, rr, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'spark': {
        ctx.globalAlpha = 1 - u;
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = q.color;
        ctx.shadowColor = '#ffcf5a';
        ctx.shadowBlur = r * 3;
        ctx.beginPath();
        ctx.arc(x, y, r * (1 - u * 0.5), 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'star': {
        ctx.globalAlpha = 1 - u * u;
        ctx.translate(x, y);
        ctx.rotate(q.rot);
        ctx.fillStyle = q.color;
        ctx.strokeStyle = '#a8740a';
        ctx.lineWidth = Math.max(1, r * 0.12);
        starPath(ctx, r);
        ctx.fill();
        ctx.stroke();
        break;
      }
      case 'heart': {
        ctx.globalAlpha = u > 0.7 ? (1 - u) / 0.3 : Math.min(1, u * 6);
        const sway = Math.sin((now - q.born) / 180) * r * 0.6;
        ctx.translate(x + sway, y);
        ctx.scale(0.8 + Math.min(1, u * 5) * 0.2, 0.8 + Math.min(1, u * 5) * 0.2);
        ctx.fillStyle = q.color;
        ctx.shadowColor = 'rgba(0,0,0,0.25)';
        ctx.shadowBlur = 4;
        heartPath(ctx, r);
        ctx.fill();
        break;
      }
      case 'text': {
        ctx.globalAlpha = u > 0.65 ? (1 - u) / 0.35 : 1;
        const pop = u < 0.12 ? 0.6 + (u / 0.12) * 0.55 : u < 0.22 ? 1.15 - ((u - 0.12) / 0.1) * 0.15 : 1;
        ctx.translate(x, y);
        ctx.scale(pop, pop);
        ctx.font = `800 ${Math.round(r)}px "Outfit", "Noto Sans SC", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = Math.max(2, r * 0.14);
        ctx.strokeStyle = 'rgba(40,26,10,0.7)';
        ctx.strokeText(q.text ?? '', 0, 0);
        ctx.fillStyle = q.color;
        ctx.fillText(q.text ?? '', 0, 0);
        break;
      }
    }
    ctx.restore();
  }
}

/** 前景落叶（压在所有人物前面） */
export function drawLeaves(ctx: CanvasRenderingContext2D, fx: WalkFx, s: WalkState, h: number, now: number) {
  for (const l of fx.leaves) {
    const x = (l.x - s.scroll * l.depth) * h;
    const y = l.y * h;
    const r = l.size * h;
    const fade = l.restAt ? Math.max(0, 1 - (now - l.restAt) / 2600) : 1;
    ctx.save();
    ctx.globalAlpha = 0.92 * fade;
    ctx.translate(x, y);
    ctx.rotate(l.rot);
    ctx.scale(1, l.restAt ? 0.45 : Math.max(0.18, Math.abs(Math.cos(l.flip))));
    ctx.fillStyle = l.color;
    ctx.beginPath();
    ctx.moveTo(-r * 1.4, 0);
    ctx.quadraticCurveTo(0, -r * 0.9, r * 1.4, 0);
    ctx.quadraticCurveTo(0, r * 0.9, -r * 1.4, 0);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,50,20,0.45)';
    ctx.lineWidth = Math.max(0.6, r * 0.12);
    ctx.beginPath();
    ctx.moveTo(-r * 1.4, 0);
    ctx.lineTo(r * 1.7, 0);
    ctx.stroke();
    ctx.restore();
  }
}

/** 撞击时的镜头抖动偏移（px） */
export function shakeOffset(fx: WalkFx, h: number, now: number): [number, number] {
  const t = now - fx.shakeAt;
  if (t > 320) return [0, 0];
  const a = (1 - t / 320) * h * 0.012;
  return [Math.sin(t * 0.11) * a, Math.cos(t * 0.17) * a * 0.6];
}

/** 落地压扁量 0–1 */
export function squashAmount(fx: WalkFx, now: number) {
  const t = now - fx.squashAt;
  if (t > 220) return 0;
  return Math.sin((t / 220) * Math.PI) * 0.14;
}

function starPath(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    if (i) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
}

function heartPath(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  ctx.moveTo(0, r * 0.9);
  ctx.bezierCurveTo(-r * 1.4, -r * 0.1, -r * 0.7, -r * 1.2, 0, -r * 0.45);
  ctx.bezierCurveTo(r * 0.7, -r * 1.2, r * 1.4, -r * 0.1, 0, r * 0.9);
  ctx.closePath();
}
