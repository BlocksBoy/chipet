import { useEffect, useRef } from 'react';
import { cn } from '../components/ui.tsx';
import { tr } from '../i18n.ts';
import {
  BENCH_H,
  BENCH_W,
  CAT_H,
  CAT_STEP,
  HERO_H,
  HERO_STEP,
  PLANTER_H,
  PLANTER_W,
  catWorldX,
  createWalkState,
  greet,
  jumpOrClimb,
  startWalk,
  stepWalk,
  walkScore,
  type WalkActor,
  type WalkCoat,
  type WalkEvent,
  type Walker,
  type WalkState,
} from './walkGame.ts';
import {
  createFx,
  drawDapple,
  drawRope,
  drawLeaves,
  drawParticles,
  drawPigeons,
  drawRays,
  shakeOffset,
  spawnFor,
  squashAmount,
  stepRope,
  updateFx,
  type WalkFx,
} from './walkFx.ts';
import { startWalkMusic, stopWalkMusic, walkSfx } from './sound.ts';
import { CAT_WALK, HERO_WALK, NPC_WALK } from './walkSprites.ts';
import { drawChestXray, drawHeartLens, drawNameTag, stepXray, xrayFor, type HeartXray } from './walkHeart.ts';

type Props = {
  actor: WalkActor;
  /** 每次 +1 触发一次「打招呼」 */
  greetTick?: number;
  className?: string;
  onHud?: (s: WalkState) => void;
  reducedMotion?: boolean;
};

const ASSET = '/walk';
const FILES = {
  bgA: 'bg_cafe_books.webp',
  bgB: 'bg_flowers_market.webp',
  heroWalk: HERO_WALK.src,
  catWalk: CAT_WALK.src,
  catJump: 'cat_jump.webp',
  npcDog: 'npc_dog.webp',
  npcCat: 'npc_cat.webp',
  npcFlowers: 'npc_flowers.webp',
  npcCoffee: 'npc_coffee.webp',
  bench: 'prop_bench.webp',
  planter: 'prop_planter.webp',
  pigeonStand: 'pigeon_stand.webp',
  pigeonFly: 'pigeon_fly.webp',
} as const;
type Key = keyof typeof FILES;
type Sprites = Record<Key, HTMLImageElement>;
type Drawable = HTMLImageElement | HTMLCanvasElement;

/** 跳跃姿势里背上牵引环的位置（相对裁切框 0–1） */
const JUMP_RING = [0.626, 0.187] as const;
/** 站着不动时用的帧：双脚并拢 / 四爪着地 */
const HERO_IDLE = 0;
const CAT_IDLE = 0;
/** 走路帧里胸口（心脏）的位置，相对裁切框 0–1 */
const CAT_CHEST = [0.68, 0.5] as const;

type CatFrames = { walk: Drawable; jump: Drawable };

/** 各车道：脚底高度（占画布高）与透视缩放 */
const LANE = {
  far: { y: 0.855, k: 0.86 },
  mid: { y: 0.915, k: 1 },
  near: { y: 0.985, k: 1.12 },
} as const;

/** 路人走路图集较大：主场景先出，图集到了再从静态图切成走路动画 */
const npcSheets: Partial<Record<Walker['kind'], HTMLImageElement>> = {};
let npcLoading = false;
function loadNpcSheets() {
  if (npcLoading) return;
  npcLoading = true;
  for (const kind of Object.keys(NPC_WALK) as Walker['kind'][]) {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { npcSheets[kind] = img; };
    img.src = `${ASSET}/${NPC_WALK[kind].src}`;
  }
}

let spriteCache: Promise<Sprites> | null = null;
function loadSprites(): Promise<Sprites> {
  spriteCache ??= Promise.all(
    (Object.keys(FILES) as Key[]).map((k) => new Promise<[Key, HTMLImageElement]>((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve([k, img]);
      img.onerror = reject;
      img.src = `${ASSET}/${FILES[k]}`;
    })),
  ).then((pairs) => Object.fromEntries(pairs) as Sprites);
  return spriteCache;
}

/** 两段街景接成可循环长卷，接缝做横向渐隐 */
function buildStrip(a: HTMLImageElement, b: HTMLImageElement) {
  const H = 720;
  const wa = Math.round((a.width / a.height) * H);
  const wb = Math.round((b.width / b.height) * H);
  const lap = 180;
  const W = wa + wb - lap * 2;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const x0 = wa - lap;
  const sx = b.width / wb;
  // A 铺底；B 主体接在 A 后面，两端各留 lap 做渐隐
  g.drawImage(a, 0, 0, wa, H);
  g.drawImage(b, lap * sx, 0, (wb - lap * 2) * sx, b.height, x0 + lap, 0, wb - lap * 2, H);
  for (let i = 0; i < lap; i += 2) {
    // B 头部压在 A 尾部：0 → 1
    g.globalAlpha = (i + 1) / lap;
    g.drawImage(b, i * sx, 0, 2 * sx, b.height, x0 + i, 0, 2, H);
    // B 尾部绕回长卷开头压在 A 头部：1 → 0，循环无缝
    g.globalAlpha = 1 - (i + 1) / lap;
    g.drawImage(b, (wb - lap + i) * sx, 0, 2 * sx, b.height, i, 0, 2, H);
  }
  g.globalAlpha = 1;
  return c;
}

/** 把演示橘猫重新上色成芯喵毛色：只动毛（橘色相、较亮），保留明暗与纹理 */
function tintCat(img: HTMLImageElement, coat: WalkCoat): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height);
  const [th, ts, tl] = hexToHsl(coat.body);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3]! < 8) continue;
    const [h, s, l] = rgbToHsl(px[i]!, px[i + 1]!, px[i + 2]!);
    if (h < 0.02 || h > 0.14 || s < 0.32 || l < 0.28) continue;
    const nl = Math.min(0.96, Math.max(0.04, l + (tl - 0.55) * 0.9));
    const ns = Math.min(1, s * (ts / 0.72));
    const [r, gg, b] = hslToRgb(th, ns, nl);
    px[i] = r;
    px[i + 1] = gg;
    px[i + 2] = b;
  }
  g.putImageData(data, 0, 0);
  return c;
}

export function WalkCanvas({ actor, greetTick = 0, className, onHud, reducedMotion }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<WalkState>(createWalkState());
  const actorRef = useRef(actor);
  const hudRef = useRef(onHud);
  const reduceRef = useRef(!!reducedMotion);
  const catFramesRef = useRef<CatFrames | null>(null);
  const spritesRef = useRef<Sprites | null>(null);

  useEffect(() => { hudRef.current = onHud; }, [onHud]);
  useEffect(() => { reduceRef.current = !!reducedMotion; }, [reducedMotion]);

  useEffect(() => {
    actorRef.current = actor;
    const sp = spritesRef.current;
    if (sp) catFramesRef.current = catFrames(sp, actor);
  }, [actor]);

  useEffect(() => {
    if (!greetTick) return;
    greet(stateRef.current, performance.now());
  }, [greetTick]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let alive = true;
    let lastHud = 0;
    let last = performance.now();
    let strip: HTMLCanvasElement | null = null;
    let visible = true;
    const fx = createFx();
    startWalkMusic();

    void loadSprites().then((sp) => {
      if (!alive) return;
      spritesRef.current = sp;
      strip = buildStrip(sp.bgA, sp.bgB);
      catFramesRef.current = catFrames(sp, actorRef.current);
      loadNpcSheets();
    });

    const resize = () => {
      const parent = canvas.parentElement;
      const w = Math.max(320, parent?.clientWidth ?? 800);
      const h = Math.round(Math.min(600, Math.max(320, w * 0.5)));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingQuality = 'high';
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    const io = new IntersectionObserver(([e]) => { visible = !!e?.isIntersecting; });
    io.observe(canvas);

    const action = () => {
      const s = stateRef.current;
      const now = performance.now();
      if (s.phase !== 'running') {
        if (s.phase === 'over') {
          const fresh = createWalkState(now);
          fresh.scroll = s.scroll;
          fresh.walkers = s.walkers;
          stateRef.current = fresh;
        }
        startWalk(stateRef.current, now);
        return;
      }
      jumpOrClimb(s, now);
    };
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        action();
      } else if (e.code === 'KeyE' || e.code === 'KeyH') {
        greet(stateRef.current, performance.now());
      }
    };
    canvas.addEventListener('pointerdown', action);
    window.addEventListener('keydown', onKey);

    const loop = (now: number) => {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      const s = stateRef.current;
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      if (!visible) {
        s.t = now;
        return;
      }
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      stepWalk(s, now, w / h);
      for (const e of s.events) {
        playEvent(e);
        spawnFor(fx, e, s, now, LANE.mid.y, LANE.far.y, LANE.near.y, HERO_H);
      }
      s.events.length = 0;
      if (updateFx(fx, s, now, dt, w / h, reduceRef.current)) walkSfx.pigeons();
      const sp = spritesRef.current;
      const cats = catFramesRef.current;
      if (sp && strip && cats) drawScene(ctx, w, h, s, sp, strip, cats, actorRef.current, reduceRef.current, now, fx, dt);
      else drawLoading(ctx, w, h);
      if (now - lastHud > 90) {
        lastHud = now;
        hudRef.current?.(s);
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener('pointerdown', action);
      window.removeEventListener('keydown', onKey);
      stopWalkMusic();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={tr('遛猫大道街景', 'Cat Boulevard street scene')}
      className={cn('block w-full cursor-pointer touch-manipulation select-none', className)}
    />
  );
}

function playEvent(e: WalkEvent) {
  switch (e.type) {
    case 'start': walkSfx.start(); startWalkMusic(); break;
    case 'jump': walkSfx.jump(); break;
    case 'climb': walkSfx.climb(); break;
    case 'land': walkSfx.land(e.hard); break;
    case 'fish': walkSfx.fish(); break;
    case 'hit': walkSfx.hit(); break;
    case 'greet': walkSfx.greet(e.kind); break;
    case 'over': walkSfx.over(); break;
  }
}

function catFrames(sp: Sprites, actor: WalkActor): CatFrames {
  if (actor.demo) return { walk: sp.catWalk, jump: sp.catJump };
  return { walk: tintCat(sp.catWalk, actor.coat), jump: tintCat(sp.catJump, actor.coat) };
}

/* ═════════════════════ render ═════════════════════ */

function drawLoading(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = '#d8cdb8';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(40,40,30,0.55)';
  ctx.font = '500 13px "Noto Sans SC", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(tr('街景加载中…', 'Loading the boulevard…'), w / 2, h / 2);
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  s: WalkState,
  sp: Sprites,
  strip: HTMLCanvasElement,
  cats: CatFrames,
  actor: WalkActor,
  reduce: boolean,
  now: number,
  fx: WalkFx,
  dt: number,
) {
  const [sx, sy] = reduce ? [0, 0] : shakeOffset(fx, h, now);
  const shaking = sx !== 0 || sy !== 0;
  ctx.save();
  if (shaking) {
    ctx.translate(w / 2 + sx, h / 2 + sy);
    ctx.scale(1.03, 1.03);
    ctx.translate(-w / 2, -h / 2);
  }

  // 街景长卷：随步道同速平移
  const k = h / strip.height;
  const sw = strip.width * k;
  const off = ((s.scroll * h) % sw + sw) % sw;
  for (let x = -off; x < w; x += sw) ctx.drawImage(strip, x, 0, sw, h);

  // 暖色斜阳 + 地面压暗，统一光感
  const warm = ctx.createLinearGradient(0, 0, w, h);
  warm.addColorStop(0, 'rgba(255,196,120,0.16)');
  warm.addColorStop(0.55, 'rgba(255,196,120,0)');
  warm.addColorStop(1, 'rgba(40,24,10,0.18)');
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, w, h);
  drawDapple(ctx, s, w, h, now, reduce);

  const toX = (worldX: number) => (worldX - s.scroll) * h;

  // 远侧路人
  for (const wk of s.walkers) if (wk.lane === 0) drawWalker(ctx, sp, wk, toX(wk.x), h, LANE.far, now, reduce);
  drawPigeons(ctx, fx, s, w, h, sp.pigeonStand, sp.pigeonFly, now);

  // 步道道具
  for (const o of s.objs) {
    const x = toX(o.x);
    if (x < -o.w * h - 20 || x > w + 20) continue;
    const gy = LANE.mid.y * h;
    if (o.kind === 'bench') drawProp(ctx, sp.bench, x, gy, BENCH_W * h, BENCH_H * h);
    else if (o.kind === 'planter') drawProp(ctx, sp.planter, x, gy, PLANTER_W * h, PLANTER_H * h);
  }
  for (const o of s.objs) {
    if (o.kind !== 'fish' || o.taken) continue;
    const x = toX(o.x);
    if (x < -20 || x > w + 20) continue;
    drawTreat(ctx, x, LANE.mid.y * h - o.top * h, h, now, reduce);
  }

  const xr = xrayFor(actor.heart);
  stepXray(xr, now);
  const cat = drawPlayer(ctx, sp, cats, s, w, h, reduce ? 0 : squashAmount(fx, now), fx, now, dt, xr, reduce);

  // 近侧路人（压在玩家前面，透视更大）
  for (const wk of s.walkers) if (wk.lane === 2) drawWalker(ctx, sp, wk, toX(wk.x), h, LANE.near, now, reduce);

  drawParticles(ctx, fx, s, h, now);
  drawLeaves(ctx, fx, s, h, now);
  drawRays(ctx, w, h, now, reduce);

  // 头顶名牌 + 背上方的心脏放大镜（放在猫身后上方，不挡前路也不压牵绳）
  const lensR = h * 0.08;
  const lensX = Math.max(lensR + 8, cat.x - h * 0.09);
  const lensY = Math.max(lensR + 24, cat.top - h * 0.075 - lensR);
  if (!cat.airborne) drawHeartLens(ctx, xr, cat.chestX, cat.chestY, lensX, lensY, h, now, dt, reduce);
  else drawHeartLens(ctx, xr, cat.x, cat.top + (cat.foot - cat.top) * 0.5, lensX, lensY, h, now, dt, reduce);
  drawNameTag(ctx, xr, actor.demo ? tr(`${actor.name}（演示）`, `${actor.name} (demo)`) : actor.name, cat.headX, cat.top, h, now, reduce);

  // 暗角
  const vig = ctx.createRadialGradient(w / 2, h * 0.55, h * 0.35, w / 2, h * 0.55, w * 0.75);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(12,10,6,0.32)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);

  if (s.phase === 'running' && now < s.invulnUntil && Math.floor(now / 110) % 2 === 0) {
    ctx.fillStyle = 'rgba(224,122,69,0.08)';
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();

  drawOverlay(ctx, w, h, s, actor);
}

function softShadow(ctx: CanvasRenderingContext2D, cx: number, gy: number, rw: number, rh: number, a = 0.32) {
  const g = ctx.createRadialGradient(cx, gy, 1, cx, gy, rw);
  g.addColorStop(0, `rgba(20,14,8,${a})`);
  g.addColorStop(1, 'rgba(20,14,8,0)');
  ctx.save();
  ctx.translate(cx, gy);
  ctx.scale(1, rh / rw);
  ctx.translate(-cx, -gy);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, gy, rw, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawProp(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, gy: number, pw: number, ph: number) {
  softShadow(ctx, x + pw * 0.55, gy + 2, pw * 0.55, ph * 0.12, 0.36);
  ctx.drawImage(img, x, gy - ph, pw, ph);
}

function drawTreat(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, now: number, reduce: boolean) {
  const bob = reduce ? 0 : Math.sin(now / 260 + x * 0.03) * h * 0.006;
  const r = h * 0.016;
  ctx.save();
  ctx.translate(x, y + bob);
  const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, r * 3.2);
  glow.addColorStop(0, 'rgba(255,214,140,0.55)');
  glow.addColorStop(1, 'rgba(255,214,140,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, r * 3.2, 0, Math.PI * 2);
  ctx.fill();
  // 小鱼干：烤色鱼身 + 尾
  const body = ctx.createLinearGradient(0, -r, 0, r);
  body.addColorStop(0, '#f2c27a');
  body.addColorStop(1, '#b46a2a');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.6, r * 0.75, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(r * 1.3, 0);
  ctx.lineTo(r * 2.3, -r * 0.7);
  ctx.lineTo(r * 2.3, r * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#3a2412';
  ctx.beginPath();
  ctx.arc(-r * 0.9, -r * 0.1, r * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function walkerSprite(sp: Sprites, kind: Walker['kind']) {
  switch (kind) {
    case 'dog': return { img: sp.npcDog, hFrac: 1 };
    case 'cat': return { img: sp.npcCat, hFrac: 1 };
    case 'flowers': return { img: sp.npcFlowers, hFrac: 0.97 };
    default: return { img: sp.npcCoffee, hFrac: 1 };
  }
}

function drawWalker(
  ctx: CanvasRenderingContext2D,
  sp: Sprites,
  wk: Walker,
  x: number,
  h: number,
  lane: { y: number; k: number },
  now: number,
  reduce: boolean,
) {
  const { img, hFrac } = walkerSprite(sp, wk.kind);
  const dh = HERO_H * lane.k * hFrac * h;
  const sheet = NPC_WALK[wk.kind];
  const strip = npcSheets[wk.kind];
  const dw = strip ? (sheet.cellW / sheet.cellH) * dh : (img.width / img.height) * dh;
  if (x < -dw || x > ctx.canvas.clientWidth + dw) return;
  const gy = lane.y * h;
  // 图集没到之前先用静态图轻晃顶上
  const step = reduce || strip ? 0 : Math.abs(Math.sin(wk.phase)) * dh * 0.012;
  const sway = reduce || strip ? 0 : Math.sin(wk.phase) * 0.008;

  const shadowA = lane.k > 1 ? 0.34 : 0.26;
  if (strip) {
    softShadow(ctx, x + wk.dir * dh * 0.02, gy + 1, dh * 0.3, dh * 0.035, shadowA);
    if (sheet.pet) softShadow(ctx, x + wk.dir * (sheet.pet - sheet.ox) * dw, gy + 1, dh * 0.3, dh * 0.03, shadowA);
  } else {
    softShadow(ctx, x + dw * 0.04, gy + 1, dw * 0.46, dh * 0.035, shadowA);
  }

  ctx.save();
  ctx.translate(x, gy - step);
  ctx.rotate(sway * wk.dir);
  if (wk.dir < 0) ctx.scale(-1, 1);
  if (lane.k < 1) ctx.globalAlpha = 0.94;
  if (strip) {
    // 脚下不打滑：走过的距离 ÷ 屏幕上的步幅
    const p = pose(sheet, wk.walked / (sheet.stride * HERO_H * lane.k * hFrac), 0);
    drawSheet(ctx, strip, sheet, p, -sheet.ox * dw, -dh, dw, dh);
  } else {
    ctx.drawImage(img, -dw / 2, -dh, dw, dh);
  }
  ctx.restore();

  if (wk.greetedAt && now - wk.greetedAt < 2200) {
    const u = (now - wk.greetedAt) / 2200;
    const text = wk.kind === 'dog'
      ? tr(`汪！${wk.petName}也跟你问好`, `Woof! ${wk.petName} says hi`)
      : wk.kind === 'cat'
        ? tr(`喵～我是${wk.petName}`, `Meow — I'm ${wk.petName}`)
        : tr(`${wk.owner}：下午好呀`, `${wk.owner}: good afternoon!`);
    bubble(ctx, x + (wk.dir > 0 ? dw * 0.1 : -dw * 0.1), gy - dh - 10 - u * 14, text, 1 - Math.max(0, u - 0.75) * 4);
  }
}

type Sheet = Pick<typeof HERO_WALK, 'frames' | 'cellW' | 'cellH' | 'pitch' | 'pitchY' | 'cols' | 'anchors'>;

/** 走路循环的取帧：相邻两帧按进度混合，60fps 下也不会一顿一顿 */
interface Pose { f0: number; f1: number; mix: number; anchor: [number, number] }

function pose(sheet: Sheet, cycles: number | null, idle: number): Pose {
  if (cycles === null) return { f0: idle, f1: idle, mix: 0, anchor: sheet.anchors[idle] ?? [0, 0] };
  const u = (cycles - Math.floor(cycles)) * sheet.frames;
  const f0 = Math.floor(u) % sheet.frames;
  const f1 = (f0 + 1) % sheet.frames;
  const mix = u - Math.floor(u);
  const a0 = sheet.anchors[f0] ?? [0, 0];
  const a1 = sheet.anchors[f1] ?? [0, 0];
  return { f0, f1, mix, anchor: [a0[0] + (a1[0] - a0[0]) * mix, a0[1] + (a1[1] - a0[1]) * mix] };
}

function drawSheet(ctx: CanvasRenderingContext2D, img: Drawable, sheet: Sheet, p: Pose, dx: number, dy: number, dw: number, dh: number) {
  const cell = (f: number) => [(f % sheet.cols) * sheet.pitch, Math.floor(f / sheet.cols) * sheet.pitchY] as const;
  const [x0, y0] = cell(p.f0);
  ctx.drawImage(img, x0, y0, sheet.cellW, sheet.cellH, dx, dy, dw, dh);
  if (p.mix > 0.02 && p.f1 !== p.f0) {
    const [x1, y1] = cell(p.f1);
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * p.mix;
    ctx.drawImage(img, x1, y1, sheet.cellW, sheet.cellH, dx, dy, dw, dh);
    ctx.globalAlpha = prev;
  }
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  sp: Sprites,
  cats: CatFrames,
  s: WalkState,
  w: number,
  h: number,
  squash: number,
  fx: WalkFx,
  now: number,
  dt: number,
  xr: HeartXray,
  reduce: boolean,
) {
  const gy = LANE.mid.y * h;
  const moving = s.phase === 'running';
  const walked = s.scroll - fx.walkFrom;
  // 站着时轻轻呼吸
  const breath = moving ? 0 : Math.sin(now / 900) * 0.006;

  // 猫：走路帧跟脚下距离同步；腾空/攀爬换跳跃姿势
  const airborne = s.catAnim !== 'run';
  const catCx = s.catX * w;
  const catFoot = gy - s.catY * h;
  const catPose = pose(CAT_WALK, moving ? walked / CAT_STEP : null, CAT_IDLE);
  const ring: readonly [number, number] = airborne ? JUMP_RING : catPose.anchor;
  const ch = CAT_H * h * (airborne ? 0.94 : 1);
  const cw = airborne ? (cats.jump.width / cats.jump.height) * ch : (CAT_WALK.cellW / CAT_WALK.cellH) * ch;
  const tilt = s.catAnim === 'jump' ? Math.max(-0.22, Math.min(0.2, -s.catVy * 0.12)) : s.catAnim === 'climb' ? -0.2 : 0;

  // 人：跟猫保持一段牵绳距离，步子偶尔快慢一点，脚下照样不打滑
  const drift = moving ? Math.sin(now / 3200) * h * 0.012 : 0;
  const heroPose = pose(HERO_WALK, moving ? (walked + drift / h) / HERO_STEP : null, HERO_IDLE);
  const hh = HERO_H * h * (1 + breath * 0.4);
  const hw = (HERO_WALK.cellW / HERO_WALK.cellH) * HERO_H * h;
  const heroCx = catCx - h * 0.46 + drift;
  const heroTop = gy - hh;
  const heroLeft = heroCx - hw / 2;
  const handX = heroLeft + heroPose.anchor[0] * hw;
  const handY = heroTop + heroPose.anchor[1] * hh;

  // 背环位置要跟着猫的倾斜/压扁一起变换
  const rising = s.catAnim === 'jump' && s.catVy > 0.4;
  const sx = 1 + squash * 0.6 - (rising ? 0.025 : 0);
  const sy = 1 - squash + (rising ? 0.05 : 0) + breath;
  const rlx = (-0.5 + ring[0]) * cw * sx;
  const rly = (-1 + ring[1]) * ch * sy;
  const ringX = catCx + rlx * Math.cos(tilt) - rly * Math.sin(tilt);
  const ringY = catFoot + rlx * Math.sin(tilt) + rly * Math.cos(tilt);

  softShadow(ctx, heroCx + hw * 0.04, gy + 1, hw * 0.5, hh * 0.035, 0.34);
  const shadowScale = Math.max(0.35, 1 - s.catY * 3.2);
  softShadow(ctx, catCx + cw * 0.02, gy - supportY(s) * h + 1, cw * 0.36 * shadowScale, ch * 0.08 * shadowScale, 0.32 * shadowScale + 0.06);

  drawSheet(ctx, sp.heroWalk, HERO_WALK, heroPose, heroLeft, heroTop, hw, hh);

  stepRope(fx, handX / h, handY / h, ringX / h, ringY / h, dt);
  drawRope(ctx, fx, h);

  ctx.save();
  ctx.translate(catCx, catFoot);
  ctx.rotate(tilt);
  ctx.scale(sx, sy);
  if (airborne) ctx.drawImage(cats.jump, -cw / 2, -ch, cw, ch);
  else {
    drawSheet(ctx, cats.walk, CAT_WALK, catPose, -cw / 2, -ch, cw, ch);
    drawChestXray(ctx, xr, (CAT_CHEST[0] - 0.5) * cw, (CAT_CHEST[1] - 1) * ch, ch * 0.13, now, reduce);
  }
  ctx.restore();

  const clx = (CAT_CHEST[0] - 0.5) * cw * sx;
  const cly = (CAT_CHEST[1] - 1) * ch * sy;
  return {
    x: catCx,
    foot: catFoot,
    top: catFoot - ch * sy,
    headX: catCx + cw * 0.34,
    chestX: catCx + clx * Math.cos(tilt) - cly * Math.sin(tilt),
    chestY: catFoot + clx * Math.sin(tilt) + cly * Math.cos(tilt),
    airborne,
  };
}

function drawOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, s: WalkState, actor: WalkActor) {
  if (s.phase === 'running') {
    if (s.nearClimb) pill(ctx, w / 2, h * 0.08, tr('前方可跳上去 · 点按', 'Hop up ahead · tap'));
    return;
  }
  const g = ctx.createLinearGradient(0, h * 0.2, 0, h * 0.75);
  g.addColorStop(0, 'rgba(10,14,12,0)');
  g.addColorStop(0.5, 'rgba(10,14,12,0.42)');
  g.addColorStop(1, 'rgba(10,14,12,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fffaf2';
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 12;
  if (s.phase === 'ready') {
    ctx.font = `700 ${Math.round(h * 0.07)}px "Outfit", "Noto Sans SC", system-ui, sans-serif`;
    ctx.fillText(tr('遛猫大道', 'Cat Boulevard'), w / 2, h * 0.42);
    ctx.font = `500 ${Math.round(h * 0.034)}px "Noto Sans SC", system-ui, sans-serif`;
    ctx.fillText(
      actor.demo ? tr('牵上演示猫出门 · 点按画面或空格', 'Take the demo cat out · tap or press Space') : tr(`牵上「${actor.name}」出门 · 点按画面或空格`, `Walk ${actor.name} · tap or press Space`),
      w / 2, h * 0.5,
    );
  } else {
    ctx.font = `700 ${Math.round(h * 0.06)}px "Outfit", "Noto Sans SC", system-ui, sans-serif`;
    ctx.fillText(tr('今天散得真舒服', 'What a lovely stroll'), w / 2, h * 0.4);
    ctx.font = `500 ${Math.round(h * 0.032)}px "Noto Sans SC", system-ui, sans-serif`;
    ctx.fillText(
      tr(
        `${Math.floor(s.distance)} 米 · 鱼干 ${s.fish} · 招呼 ${s.greets} · 得分 ${walkScore(s)}`,
        `${Math.floor(s.distance)} m · ${s.fish} treats · ${s.greets} hellos · score ${walkScore(s)}`,
      ),
      w / 2, h * 0.48,
    );
    ctx.fillText(tr(`本机最佳 ${s.best} · 点按再遛一圈`, `Best ${s.best} · tap to walk again`), w / 2, h * 0.54);
  }
  ctx.shadowBlur = 0;
}

function pill(ctx: CanvasRenderingContext2D, cx: number, cy: number, text: string) {
  ctx.font = '600 12px "Noto Sans SC", system-ui, sans-serif';
  const tw = ctx.measureText(text).width + 24;
  ctx.fillStyle = 'rgba(16,24,20,0.6)';
  roundRect(ctx, cx - tw / 2, cy - 13, tw, 26, 13);
  ctx.fill();
  ctx.fillStyle = '#f6fff9';
  ctx.textAlign = 'center';
  ctx.fillText(text, cx, cy + 4);
}

function bubble(ctx: CanvasRenderingContext2D, cx: number, by: number, text: string, alpha: number) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.font = '600 12px "Noto Sans SC", system-ui, sans-serif';
  const tw = ctx.measureText(text).width + 20;
  const x = cx - tw / 2;
  const y = by - 26;
  ctx.fillStyle = 'rgba(255,252,246,0.95)';
  ctx.shadowColor = 'rgba(0,0,0,0.2)';
  ctx.shadowBlur = 8;
  roundRect(ctx, x, y, tw, 24, 12);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - 5, y + 24);
  ctx.lineTo(cx, y + 31);
  ctx.lineTo(cx + 5, y + 24);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#2a2a22';
  ctx.textAlign = 'center';
  ctx.fillText(text, cx, y + 16);
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/* ── color ── */

function hexToHsl(hex: string): [number, number, number] {
  const n = hex.replace('#', '');
  const v = n.length === 3 ? n.split('').map((c) => c + c).join('') : n.padEnd(6, '0').slice(0, 6);
  return rgbToHsl(parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16));
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
}

/** 猫脚下的落影高度：在长椅/花箱上就投在台面上 */
function supportY(s: WalkState) {
  const cx = catWorldX(s);
  let top = 0;
  for (const o of s.objs) {
    if (o.kind === 'fish') continue;
    if (cx > o.x && cx < o.x + o.w && s.catY >= o.top - 0.01) top = Math.max(top, o.top);
  }
  return top;
}
