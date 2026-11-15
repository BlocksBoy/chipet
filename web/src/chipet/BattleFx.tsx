import { motion } from 'motion/react';
import { useMemo } from 'react';
import { cn } from '../components/ui.tsx';

/** 招式的特效配色，下标：进攻 / 防御 / 技巧 / 合体技 */
export const MOVE_FX = [
  { color: '#ef6a4c', hi: '#ffb9a6' },
  { color: '#2aa6b8', hi: '#a5e8f1' },
  { color: '#8b6cf0', hi: '#d2c6ff' },
  { color: '#e8ae14', hi: '#ffe78f' },
] as const;
export type FxKind = 0 | 1 | 2 | 3;
export type Side = 'me' | 'op';

/** 一回合的节拍（秒）：蓄力 → 出手飞行 → 命中，total 是整回合揭晓的时长 */
export const BEAT = { charge: 0.5, fly: 0.32, hit: 0.82, total: 2.1 } as const;

/** 一方这回合的出手，特效只看这些 */
export interface Strike {
  kind: FxKind;
  power: number;
  /** 这一招最终打出的伤害 */
  dmg: number;
  /** 1 克制了对手 · -1 被克制 · 0 平 */
  edge: 1 | 0 | -1;
  /** 心脏电路这回合的输出位，「技巧」会把它们当子弹打出去 */
  bits: number[];
}

/** 文字描白边，压在任何底色上都看得清 */
export const OUTLINE = '[text-shadow:0_2px_0_#fff,0_-2px_0_#fff,2px_0_0_#fff,-2px_0_0_#fff,2px_2px_0_#fff,-2px_2px_0_#fff,2px_-2px_0_#fff,-2px_-2px_0_#fff,0_5px_10px_rgb(26_46_40/0.25)]';

/** 固定种子的小随机数：同一回合重渲染时粒子不会跳位置 */
function rng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CENTER = 'absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2';
const at = (side: Side) => (side === 'me' ? 'left-1/4' : 'left-3/4');

const BURST = Array.from({ length: 24 }, (_, i) => {
  const a = (Math.PI * 2 * i) / 24;
  const r = i % 2 ? 24 : 50 - (i % 4 ? 0 : 8);
  return `${(50 + Math.cos(a) * r).toFixed(1)},${(50 + Math.sin(a) * r).toFixed(1)}`;
}).join(' ');
const HEX = '50,4 90,27 90,73 50,96 10,73 10,27';
const SLASHES = ['M18 22 Q52 40 70 86', 'M36 12 Q70 32 86 74', 'M8 42 Q38 58 52 94'];

/** 蓄力：脚下的能量环、身后的光晕和往上飘的位。 */
function Charge({ side, s, n }: { side: Side; s: Strike; n: number }) {
  const fx = MOVE_FX[s.kind];
  const motes = useMemo(() => {
    const r = rng(n * 17 + (side === 'me' ? 3 : 5));
    return Array.from({ length: 7 }, () => ({ x: (r() - 0.5) * 96, s: 4 + r() * 4, d: r() * 0.22, h: 46 + r() * 40 }));
  }, [n, side]);
  return (
    <div className={cn('absolute top-[82%]', at(side))} style={{ opacity: s.power > 0 ? 1 : 0.4 }}>
      <motion.span
        className={cn(CENTER, 'size-44 rounded-full')}
        style={{ background: `radial-gradient(circle, ${fx.color}66, transparent 68%)`, marginTop: -64 }}
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: [0, 0.95, 0], scale: [0.5, 1.05, 1.25] }}
        transition={{ duration: BEAT.charge + 0.2, times: [0, 0.6, 1], ease: 'easeOut' }}
      />
      <motion.span
        className={cn(CENTER, 'h-9 w-32 rounded-[50%] border-2')}
        style={{ borderColor: fx.color, boxShadow: `0 0 16px ${fx.color}, inset 0 0 12px ${fx.color}88` }}
        initial={{ opacity: 0, scale: 0.3 }}
        animate={{ opacity: [0, 1, 1, 0], scale: [0.3, 1.1, 0.92, 1.35] }}
        transition={{ duration: BEAT.charge + 0.15, times: [0, 0.4, 0.8, 1], ease: 'easeOut' }}
      />
      {motes.map((m, i) => (
        <motion.i
          key={i}
          className={cn(CENTER, 'block rounded-[2px]')}
          style={{ width: m.s, height: m.s, marginLeft: m.x, background: i % 2 ? fx.hi : fx.color, boxShadow: `0 0 8px ${fx.color}` }}
          initial={{ opacity: 0, y: 0 }}
          animate={{ opacity: [0, 1, 0], y: [0, -m.h * 0.6, -m.h] }}
          transition={{ duration: BEAT.charge, delay: m.d, ease: 'easeOut' }}
        />
      ))}
    </div>
  );
}

/** 防御：身前撑起一面六边形护盾。克制成功就硬扛，被克制就碎掉。 */
function Shield({ side, s }: { side: Side; s: Strike }) {
  const d = side === 'me' ? 1 : -1;
  const fx = MOVE_FX[1];
  const hold = s.edge === 1;
  const broken = s.edge === -1;
  const hit = BEAT.hit / 1.5;
  return (
    <div className={cn('absolute top-[60%]', side === 'me' ? 'left-[39%]' : 'left-[61%]')}>
      <motion.svg
        viewBox="0 0 64 84" width="64" height="84" className={cn(CENTER, 'overflow-visible')}
        style={{ filter: `drop-shadow(0 0 10px ${fx.color})` }}
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{
          opacity: hold ? [0, 1, 1, 1, 0] : broken ? [0, 1, 1, 0, 0] : [0, 1, 1, 0.5, 0],
          scale: hold ? [0.4, 1, 1, 1.2, 1] : broken ? [0.4, 1, 1, 1.6, 1.6] : [0.4, 1, 1, 1, 0.9],
          rotate: broken ? [0, 0, 0, 16 * d, 16 * d] : 0,
        }}
        transition={{ duration: 1.5, times: [0, 0.14, hit, hit + 0.1, 1], ease: 'easeOut' }}
      >
        <polygon points="32,2 60,16 60,56 32,82 4,56 4,16" fill={`${fx.color}33`} stroke={fx.color} strokeWidth="3" strokeLinejoin="round" />
        <polygon points="32,14 50,23 50,50 32,68 14,50 14,23" fill="none" stroke={fx.hi} strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M32 14 V30 M14 50 L26 42 M50 50 L38 42" stroke={fx.hi} strokeWidth="1.5" strokeLinecap="round" fill="none" />
        <circle cx="32" cy="36" r="5" fill="#fff" stroke={fx.color} strokeWidth="2" />
      </motion.svg>
    </div>
  );
}

/** 飞行物的造型：进攻是月牙斩，防御是盾击波，技巧是一串输出位。朝右画，另一方镜像。 */
function BoltShape({ s }: { s: Strike }) {
  const fx = MOVE_FX[s.kind];
  if (s.kind === 2) {
    const bits = s.bits.slice(0, 4);
    return (
      <div className="flex items-center gap-1" style={{ filter: `drop-shadow(0 0 8px ${fx.color})` }}>
        <span className="h-1 w-8 rounded-full" style={{ background: `linear-gradient(90deg, transparent, ${fx.color})` }} />
        {bits.map((b, i) => (
          <span
            key={i}
            className="grid size-4 place-items-center rounded-[4px] font-mono text-[10px] leading-none font-bold"
            style={b ? { background: fx.color, color: '#fff' } : { background: '#fff', color: fx.color, boxShadow: `inset 0 0 0 1.5px ${fx.color}` }}
          >
            {b}
          </span>
        ))}
      </div>
    );
  }
  return (
    <div className="flex items-center" style={{ filter: `drop-shadow(0 0 9px ${fx.color})` }}>
      <span className="-mr-3 h-1.5 w-12 rounded-full" style={{ background: `linear-gradient(90deg, transparent, ${fx.hi}, ${fx.color})` }} />
      {s.kind === 0 ? (
        <svg viewBox="0 0 44 56" width="44" height="56" className="overflow-visible">
          <path d="M8 2 C38 8 48 40 14 54 C30 40 30 16 8 2 Z" fill={fx.color} stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
          <path d="M18 12 C32 20 34 36 24 46" fill="none" stroke={fx.hi} strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 100 100" width="46" height="46" className="overflow-visible">
          <polygon points={HEX} fill={`${fx.color}40`} stroke={fx.color} strokeWidth="9" strokeLinejoin="round" />
          <polygon points={HEX} fill="none" stroke="#fff" strokeWidth="3" strokeLinejoin="round" transform="translate(50 50) scale(0.55) translate(-50 -50)" />
        </svg>
      )}
    </div>
  );
}

/** 出手：沿着中间那条走线飞向对面。占上风的越飞越大，被克制的飞到一半就蔫了；功率为 0 只冒一缕烟。 */
function Bolt({ side, s }: { side: Side; s: Strike }) {
  const d = side === 'me' ? 1 : -1;
  if (s.power <= 0) {
    return (
      <div className={cn('absolute top-[60%]', side === 'me' ? 'left-[35%]' : 'left-[65%]')}>
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className={cn(CENTER, 'size-5 rounded-full bg-[#9db3aa]/70')}
            initial={{ opacity: 0, scale: 0.3 }}
            animate={{ opacity: [0, 0.8, 0], scale: [0.3, 1, 1.6], x: [0, d * (8 + i * 9)], y: [0, -10 - i * 8] }}
            transition={{ duration: 0.55, delay: BEAT.charge + i * 0.07, ease: 'easeOut' }}
          />
        ))}
      </div>
    );
  }
  const fx = MOVE_FX[s.kind];
  if (s.kind === 3) {
    return (
      <>
        <motion.div
          className="absolute top-[60%] left-[29%] h-8 w-[46%] -translate-y-1/2 rounded-full"
          style={{ originX: 0, background: `linear-gradient(90deg, ${fx.hi}, #fff 35%, #fff 65%, ${fx.color})`, boxShadow: `0 0 26px 6px ${fx.color}` }}
          initial={{ opacity: 0, scaleX: 0, scaleY: 0.3 }}
          animate={{ opacity: [0, 1, 1, 0], scaleX: [0, 1, 1, 1], scaleY: [0.3, 1, 1.35, 0] }}
          transition={{ duration: 0.75, delay: BEAT.charge, times: [0, 0.42, 0.78, 1], ease: 'easeOut' }}
        />
        <motion.svg
          viewBox="0 0 100 20" preserveAspectRatio="none"
          className="absolute top-[60%] left-[29%] h-14 w-[46%] -translate-y-1/2 overflow-visible"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0.2, 1, 0] }}
          transition={{ duration: 0.6, delay: BEAT.charge + 0.12, times: [0, 0.2, 0.45, 0.7, 1] }}
        >
          <polyline points="0,10 12,3 22,15 36,5 48,17 62,4 74,14 88,6 100,10" fill="none" stroke={fx.color} strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          <polyline points="0,10 10,16 24,6 38,15 52,3 66,16 80,7 100,10" fill="none" stroke="#fff" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </motion.svg>
      </>
    );
  }
  const base = 0.72 + s.power * 0.14;
  const end = s.edge === 1 ? base * 1.5 : s.edge === -1 ? base * 0.5 : base;
  const from = side === 'me' ? 31 : 69;
  const to = side === 'me' ? 72 : 28;
  return (
    <motion.div
      className="absolute top-[60%] -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${from}%` }}
      initial={{ opacity: 0, scale: base * 0.4 }}
      animate={{
        left: [`${from}%`, `${to}%`],
        opacity: [0, 1, s.edge === -1 ? 0.75 : 1, 0],
        scale: [base * 0.4, base, end, end * 1.15],
        y: s.kind === 2 ? [0, -9, 9, 0] : 0,
      }}
      transition={{
        delay: BEAT.charge,
        duration: BEAT.fly,
        left: { delay: BEAT.charge, duration: BEAT.fly, ease: 'easeIn' },
        opacity: { delay: BEAT.charge, duration: BEAT.fly + 0.04, times: [0, 0.15, 0.85, 1] },
        scale: { delay: BEAT.charge, duration: BEAT.fly, times: [0, 0.2, 0.9, 1] },
      }}
    >
      <div style={{ transform: `scaleX(${d})` }}><BoltShape s={s} /></div>
    </motion.div>
  );
}

/** 命中：爆点、冲击环、四溅的火花，再叠一层各招自己的痕迹。挂在被打中的一方身上。 */
function Impact({ side, s, n }: { side: Side; s: Strike; n: number }) {
  const fx = MOVE_FX[s.kind];
  const big = s.edge === 1 || s.kind === 3;
  const d = side === 'me' ? -1 : 1;
  const sparks = useMemo(() => {
    const r = rng(n * 31 + (side === 'me' ? 7 : 13));
    const count = Math.min(22, 8 + s.dmg * 2);
    return Array.from({ length: count }, (_, i) => {
      const a = (Math.PI * 2 * i) / count + r() * 0.5;
      const dist = 44 + r() * (big ? 88 : 56);
      return { dx: Math.cos(a) * dist, dy: Math.sin(a) * dist * 0.8, s: 3 + r() * 5, line: i % 3 === 0, rot: (a * 180) / Math.PI, t: 0.4 + r() * 0.3 };
    });
  }, [n, side, s.dmg, big]);
  if (s.dmg <= 0) return null;
  const size = Math.min(172, 84 + s.dmg * 11);
  const colors = [fx.color, fx.hi, '#ffffff', '#ffd76a'];
  return (
    <>
      {s.kind === 3 && (
        <motion.svg
          viewBox="0 0 100 100" preserveAspectRatio="none"
          className={cn('absolute top-0 h-[62%] w-16 -translate-x-1/2 overflow-visible', at(side))}
          style={{ filter: `drop-shadow(0 0 10px ${fx.color})` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0.25, 1, 0] }}
          transition={{ duration: 0.5, delay: BEAT.hit - 0.04, times: [0, 0.15, 0.4, 0.6, 1] }}
        >
          <polyline points="52,0 34,26 58,40 36,66 56,76 46,100" fill="none" stroke={fx.color} strokeWidth="7" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          <polyline points="52,0 34,26 58,40 36,66 56,76 46,100" fill="none" stroke="#fff" strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </motion.svg>
      )}
      <div className={cn('absolute top-[60%]', at(side))}>
        <motion.svg
          viewBox="0 0 100 100" width={size} height={size} className={cn(CENTER, 'overflow-visible')}
          style={{ filter: `drop-shadow(0 0 12px ${fx.color})` }}
          initial={{ opacity: 0, scale: 0.2, rotate: 0 }}
          animate={{ opacity: [0, 1, 1, 0], scale: [0.2, 1.2, 1, 1.1], rotate: 24 }}
          transition={{ duration: 0.45, delay: BEAT.hit, times: [0, 0.3, 0.7, 1], ease: 'easeOut' }}
        >
          <polygon points={BURST} fill="#fff" stroke={fx.color} strokeWidth="5" strokeLinejoin="round" />
          <circle cx="50" cy="50" r="13" fill={fx.hi} />
        </motion.svg>
        {(big ? [0, 1] : [0]).map((i) => (
          <motion.span
            key={i}
            className={cn(CENTER, 'size-24 rounded-full border-[3px]')}
            style={{ borderColor: i ? '#fff' : fx.color, boxShadow: `0 0 14px ${fx.color}` }}
            initial={{ opacity: 0, scale: 0.3 }}
            animate={{ opacity: [0, 0.95, 0], scale: [0.3, 1.2 + i * 0.5, 2 + i * 0.7] }}
            transition={{ duration: 0.55 + i * 0.12, delay: BEAT.hit + i * 0.07, ease: 'easeOut' }}
          />
        ))}
        {sparks.map((p, i) => (
          <motion.i
            key={i}
            className={cn(CENTER, 'block rounded-full')}
            style={{
              width: p.line ? p.s * 3 : p.s, height: p.line ? 2.5 : p.s, rotate: p.line ? `${p.rot}deg` : undefined,
              background: colors[i % 4], boxShadow: `0 0 8px ${fx.color}`,
            }}
            initial={{ opacity: 0, x: 0, y: 0, scale: 0.4 }}
            animate={{ opacity: [0, 1, 0], x: [0, p.dx * 0.75, p.dx], y: [0, p.dy * 0.75, p.dy + 14], scale: [0.4, 1.1, 0.6] }}
            transition={{ duration: p.t, delay: BEAT.hit, ease: 'easeOut' }}
          />
        ))}

        {s.kind === 0 && (
          <motion.svg
            viewBox="0 0 100 100" width={size * 0.95} height={size * 0.95} className={cn(CENTER, 'overflow-visible')}
            style={{ scaleX: d, filter: `drop-shadow(0 0 6px ${fx.color})` }}
            initial={{ opacity: 1 }} animate={{ opacity: [1, 1, 0] }}
            transition={{ duration: 0.6, delay: BEAT.hit, times: [0, 0.6, 1] }}
          >
            {SLASHES.map((p, i) => (
              <g key={i}>
                <motion.path d={p} fill="none" stroke={fx.color} strokeWidth="9" strokeLinecap="round" initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 0.16, delay: BEAT.hit + i * 0.05, ease: 'easeOut' }} />
                <motion.path d={p} fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 0.16, delay: BEAT.hit + i * 0.05, ease: 'easeOut' }} />
              </g>
            ))}
          </motion.svg>
        )}
        {s.kind === 1 && [0, 1].map((i) => (
          <motion.svg
            key={i}
            viewBox="0 0 100 100" width={size * 0.8} height={size * 0.8} className={cn(CENTER, 'overflow-visible')}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: [0, 1, 0], scale: [0.4, 1 + i * 0.3, 1.5 + i * 0.4], rotate: 30 }}
            transition={{ duration: 0.55, delay: BEAT.hit + i * 0.1, ease: 'easeOut' }}
          >
            <polygon points={HEX} fill="none" stroke={i ? fx.hi : fx.color} strokeWidth="6" strokeLinejoin="round" />
          </motion.svg>
        ))}
        {s.kind === 2 && ['1', '0', '✦', '1', '✦', '0'].map((g, i) => {
          const a = -Math.PI / 2 + (i - 2.5) * 0.52;
          return (
            <motion.span
              key={i}
              className={cn(CENTER, 'font-mono text-base leading-none font-bold')}
              style={{ color: i % 2 ? fx.color : '#fff', textShadow: `0 0 8px ${fx.color}, 0 0 2px ${fx.color}` }}
              initial={{ opacity: 0, x: 0, y: 0, scale: 0.4 }}
              animate={{ opacity: [0, 1, 0], x: [0, Math.cos(a) * 70], y: [0, Math.sin(a) * 70], scale: [0.4, 1.3, 0.9], rotate: (i - 2.5) * 30 }}
              transition={{ duration: 0.7, delay: BEAT.hit + i * 0.03, ease: 'easeOut' }}
            >
              {g}
            </motion.span>
          );
        })}
      </div>
    </>
  );
}

/** 场地正中斜着砸下来的大字：克制 / 被克 / 硬碰硬 / 开打 / K.O. */
export function Banner({ text, color, delay = 0, stay = 0.75, big }: { text: string; color: string; delay?: number; stay?: number; big?: boolean }) {
  const dur = 0.3 + stay + 0.25;
  return (
    <motion.div
      className="absolute top-[44%] left-1/2 -translate-x-1/2 -translate-y-1/2"
      initial={{ opacity: 0, scale: 2.6, rotate: -14 }}
      animate={{ opacity: [0, 1, 1, 0], scale: [2.6, 0.92, 1, 1.08], rotate: -7 }}
      transition={{ delay, duration: dur, times: [0, 0.2 / dur, (0.3 + stay) / dur, 1], ease: 'easeOut' }}
    >
      <span
        className={cn('block font-display leading-none font-black whitespace-nowrap italic', big ? 'text-5xl sm:text-7xl' : 'text-3xl sm:text-5xl', OUTLINE)}
        style={{ color }}
      >
        {text}
      </span>
    </motion.div>
  );
}

/** 一回合的全部场地特效，盖在两张角色卡上面。用回合号做 key，换回合时整体重放。 */
export function ArenaFx({ n, me, op, banner }: { n: number; me: Strike; op: Strike; banner: { text: string; color: string } }) {
  const fusion = me.kind === 3;
  const hard = Math.max(me.dmg, op.dmg) >= 4 || me.edge === 1 || op.edge === 1 || fusion;
  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-[1.75rem]"
      aria-hidden
      animate={hard
        ? { x: [0, 0, 0, -5, 6, -4, 3, 0], y: [0, 0, 0, 3, -3, 2, -1, 0] }
        : { x: [0, 0, 0, -2, 2, -1, 0], y: 0 }}
      transition={{ duration: BEAT.total * 0.72, times: [0, 0.28, 0.38, 0.45, 0.55, 0.68, 0.82, 1], ease: 'easeOut' }}
    >
      {/* 出手瞬间的暗角，让招式更跳 */}
      <motion.div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 55% 50% at 50% 58%, transparent 30%, rgb(26 46 40 / 0.28) 100%)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.85, 0.35, 0] }}
        transition={{ duration: BEAT.charge + 0.35, times: [0, 0.45, 0.85, 1] }}
      />

      {/* 中间那条走线：招式就是沿着它送过去的信号 */}
      <motion.div
        className="absolute top-[60%] left-[31%] flex w-[38%] -translate-y-1/2 items-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.9, 0.9, 0] }}
        transition={{ duration: 1.25, times: [0, 0.2, 0.75, 1] }}
      >
        <i className="size-2 shrink-0 rounded-full bg-white ring-2 ring-ink/25" />
        <i className="h-px flex-1 bg-[repeating-linear-gradient(90deg,rgb(26_46_40/0.35)_0_6px,transparent_6px_10px)]" />
        <i className="size-2 shrink-0 rounded-full bg-white ring-2 ring-ink/25" />
      </motion.div>
      {/* 信号沿走线扫过去的光点 */}
      <motion.i
        className="absolute top-[60%] size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-copper-hi"
        style={{ boxShadow: '0 0 12px 4px rgb(224 122 69 / 0.7)' }}
        initial={{ left: '31%', opacity: 0 }}
        animate={{ left: ['31%', '69%'], opacity: [0, 1, 1, 0] }}
        transition={{ duration: BEAT.fly + 0.12, delay: BEAT.charge, times: [0, 0.15, 0.85, 1], ease: 'easeIn' }}
      />

      <Charge side="me" s={me} n={n} />
      <Charge side="op" s={op} n={n} />
      {me.kind === 1 && <Shield side="me" s={me} />}
      {op.kind === 1 && <Shield side="op" s={op} />}
      <Bolt side="op" s={op} />
      <Bolt side="me" s={me} />

      {/* 两道出手在正中撞上 */}
      {me.power > 0 && op.power > 0 && (
        <div className="absolute top-[60%] left-1/2">
          <motion.svg
            viewBox="0 0 100 100" width="76" height="76" className={cn(CENTER, 'overflow-visible')}
            initial={{ opacity: 0, scale: 0.2 }}
            animate={{ opacity: [0, 1, 0], scale: [0.2, 1, 1.3], rotate: 45 }}
            transition={{ duration: 0.28, delay: BEAT.charge + BEAT.fly * 0.45, ease: 'easeOut' }}
          >
            <polygon points={BURST} fill="#fff" stroke="#ffd76a" strokeWidth="4" strokeLinejoin="round" />
          </motion.svg>
          <motion.span
            className={cn(CENTER, 'size-28 rounded-full')}
            style={{ background: 'radial-gradient(circle, #fff 0%, #ffd76a88 35%, transparent 70%)' }}
            initial={{ opacity: 0, scale: 0.2 }}
            animate={{ opacity: [0, 1, 0], scale: [0.2, 1.4, 2] }}
            transition={{ duration: 0.4, delay: BEAT.charge + BEAT.fly * 0.4, ease: 'easeOut' }}
          />
        </div>
      )}

      <Impact side="op" s={me} n={n} />
      <Impact side="me" s={op} n={n} />

      {/* 命中时全场闪一下；合体技更亮 */}
      <motion.div
        className="absolute inset-0"
        style={{ background: fusion ? '#fff' : 'radial-gradient(circle at 50% 60%, #fff 0%, transparent 55%)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: fusion ? [0, 0.8, 0] : hard ? [0, 0.45, 0] : [0, 0.22, 0] }}
        transition={{ duration: fusion ? 0.5 : 0.35, delay: BEAT.hit - 0.04, times: [0, 0.3, 1] }}
      />
      <Banner text={banner.text} color={banner.color} delay={BEAT.hit + 0.02} />
    </motion.div>
  );
}

const CONFETTI = ['#2a9d8f', '#e07a45', '#f2c46d', '#f5a8c0', '#8eb0dc', '#8b6cf0'];

/** 赢了撒一场彩带。 */
export function Confetti({ seed }: { seed: number }) {
  const bits = useMemo(() => {
    const r = rng(seed);
    return Array.from({ length: 34 }, (_, i) => ({
      x: 4 + r() * 92, w: 5 + r() * 6, h: 8 + r() * 8, d: r() * 0.55, t: 1.5 + r() * 0.9,
      sway: (r() - 0.5) * 70, rot: (r() - 0.5) * 900, c: CONFETTI[i % CONFETTI.length]!, round: i % 5 === 0,
    }));
  }, [seed]);
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-[1.75rem]" aria-hidden>
      {bits.map((b, i) => (
        <motion.i
          key={i}
          className={cn('absolute -top-4 block', b.round ? 'rounded-full' : 'rounded-[2px]')}
          style={{ left: `${b.x}%`, width: b.w, height: b.round ? b.w : b.h, background: b.c }}
          initial={{ opacity: 0, y: 0, x: 0, rotate: 0 }}
          animate={{ opacity: [0, 1, 1, 0], y: [0, 120, 250, 340], x: [0, b.sway * 0.5, b.sway, b.sway * 0.8], rotate: b.rot }}
          transition={{ duration: b.t, delay: b.d, times: [0, 0.1, 0.75, 1], ease: 'easeIn' }}
        />
      ))}
    </div>
  );
}

/** 被打趴之后头顶转圈的星星。 */
export function DizzyStars() {
  const xs = [-26, 0, 26, 0, -26];
  const ys = [0, -6, 0, 6, 0];
  const ss = [1, 0.75, 1, 1.25, 1];
  const turn = <T,>(a: T[], k: number) => [...a.slice(k), ...a.slice(1, k + 1)];
  return (
    <span className="pointer-events-none absolute top-[14%] left-1/2 block" aria-hidden>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className={cn(CENTER, 'text-lg leading-none text-[#f2b824] [text-shadow:0_0_6px_#fff,0_1px_0_#a67c0a]')}
          animate={{ x: turn(xs, i), y: turn(ys, i), scale: turn(ss, i) }}
          transition={{ duration: 1.3, repeat: Infinity, ease: 'linear' }}
        >
          ✦
        </motion.span>
      ))}
    </span>
  );
}

/** 赢家身边一闪一闪的小星星。 */
export function Twinkles() {
  const pts = [[-62, -52, 0], [58, -60, 0.3], [-74, 6, 0.6], [70, -2, 0.9], [0, -84, 0.45]] as const;
  return (
    <span className="pointer-events-none absolute top-1/2 left-1/2 block" aria-hidden>
      {pts.map(([x, y, d], i) => (
        <motion.span
          key={i}
          className={cn(CENTER, 'text-base leading-none text-[#f2b824] [text-shadow:0_0_8px_#fff]')}
          style={{ marginLeft: x, marginTop: y }}
          animate={{ opacity: [0, 1, 0], scale: [0.3, 1.25, 0.3], rotate: [0, 90, 180] }}
          transition={{ duration: 1.2, delay: d, repeat: Infinity, ease: 'easeInOut' }}
        >
          ✦
        </motion.span>
      ))}
    </span>
  );
}
