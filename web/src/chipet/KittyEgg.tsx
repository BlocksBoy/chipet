import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cn } from '../components/ui.tsx';
import { tr } from '../i18n.ts';

/** idle 可敲 · shake 破壳前剧烈摇晃 · open 壳分两半、猫从下半壳里蹦出 */
export type EggPhase = 'idle' | 'shake' | 'open';

const O = '#5a3a2e';
/** 比原来更圆更胖一点的蛋形 */
const EGG =
  'M100 26 C140 26 168 82 168 130 C168 172 138 198 100 198 C62 198 32 172 32 130 C32 82 60 26 100 26 Z';
/** 破壳的锯齿缝 */
const SEAM = 'M30 104 L48 92 L64 106 L82 92 L100 106 L118 92 L136 106 L152 92 L170 104';
const SEAM_BACK = 'L170 104 L152 92 L136 106 L118 92 L100 106 L82 92 L64 106 L48 92 L30 104';
/** 两层错开的奶油花边 */
const bumps = (x: number, y: number, n: number) => `M${x} ${y}${' a10 9 0 0 1 20 0'.repeat(n)}`;
const LACE_BACK = bumps(20, 165, 8);
const LACE_FRONT = bumps(30, 177, 7);

const EAR = 'M50 72 C43 50 43 30 48 20 C50 14 56 13 62 16 C75 22 87 30 95 41 Z';
const EAR_IN = 'M56 50 C53 42 53 33 55 26 C63 29 70 33 76 39 Z';
const HEART = 'M0 5 C-11 -3 -6 -11 0 -5 C6 -11 11 -3 0 5 Z';
const STAR = 'M0 -7 Q1.3 -1.3 7 0 Q1.3 1.3 0 7 Q-1.3 1.3 -7 0 Q-1.3 -1.3 0 -7 Z';

const TEAL = '#35b8a6';
/** 上半壳的电路走线：从壳边或过孔出发，末端接一枚糖果或另一个过孔。 */
const TRACES = [
  'M78 55 V66 L86 74 H95',
  'M118 44.5 L126 52 V63',
  'M165 100 H141 L132 91',
  'M35 109 H60 L68 101',
];
const VIAS: [number, number][] = [[78, 52], [116, 42.5], [130, 89], [70, 99]];
/** 肚子上那枚芯片心往两边引出的走线（相对芯片中心） */
const CORE_TRACES = ['M-10 0 H-25 L-32 -7', 'M10 0 H25 L32 -7'];

/** 走线末端和空白处的糖果：[形状, x, y, 大小, 旋转, 颜色] */
const DECOS: ['heart' | 'star' | 'dot', number, number, number, number, string][] = [
  ['heart', 101, 76, 0.8, 0, '#ff8fbf'],
  ['star', 126, 70, 0.85, 0, '#ffc94d'],
  ['dot', 148, 84, 3.4, 0, '#ffab7a'],
  ['dot', 112, 98, 3.2, 0, '#b79cff'],
  ['star', 97, 44, 0.55, 0, '#8cc4ff'],
];

/** 沿走线跑的一小段「电流」 */
function Flow({ d, color, delay }: { d: string; color: string; delay: number }) {
  return <path d={d} pathLength={1} className="egg-flow" stroke={color} strokeWidth="2.6" style={{ animationDelay: `${delay}s` }} />;
}

/** 逐级加深的裂痕：第 n 级显示前 n 组。 */
const CRACKS = [
  ['M100 28 L94 46 L106 56 L98 70'],
  ['M106 56 L120 62 L116 76', 'M98 70 L86 78 L92 92'],
  // 只往上半壳分叉，别落到眼睛上方变成「怒眉」
  ['M116 76 L130 86 L126 98', 'M92 92 L80 98', 'M94 46 L80 50', 'M120 62 L129 54'],
];

function Ear({ id, flip }: { id: string; flip?: boolean }) {
  return (
    <g transform={flip ? 'translate(200 0) scale(-1 1)' : undefined}>
      <g className={cn('egg-ear', flip && 'is-right')}>
        <path d={EAR} fill={`url(#${id}-body)`} stroke={O} strokeWidth="4.5" strokeLinejoin="round" />
        <path d={EAR_IN} fill="#ffa6cc" />
      </g>
    </g>
  );
}

/** 猫耳彩蛋：奶油蛋壳上印着电路走线，肚子里嵌一枚会跳的「芯片心」。 */
function Shell({ id }: { id: string }) {
  return (
    <>
      <Ear id={id} />
      <Ear id={id} flip />

      <path d={EGG} fill={`url(#${id}-body)`} />
      <g clipPath={`url(#${id}-egg)`}>
        <path d={`${LACE_BACK} V220 H20 Z`} fill="#ffcbe0" />
        <path d={`${LACE_FRONT} V220 H30 Z`} fill={`url(#${id}-lace)`} />
        <path d={LACE_FRONT} fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" opacity=".6" />

        {/* 电路走线 + 过孔 */}
        <g fill="none" stroke={TEAL} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          {TRACES.map((d) => <path key={d} d={d} />)}
        </g>
        {TRACES.map((d, i) => <Flow key={d} d={d} color="#ffe27a" delay={i * 0.55} />)}
        {VIAS.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="3.2" fill="#fffaf0" stroke={TEAL} strokeWidth="2.2" />)}
        <rect x="85" y="92" width="11" height="5.6" rx="2.8" fill="#8cc4ff" />

        {DECOS.map(([kind, x, y, size, rot, c]) =>
          kind === 'dot'
            ? <circle key={`${x}-${y}`} cx={x} cy={y} r={size} fill={c} />
            : <path key={`${x}-${y}`} d={kind === 'heart' ? HEART : STAR} transform={`translate(${x} ${y}) rotate(${rot}) scale(${size})`} fill={c} />,
        )}

        {/* 芯片心：这枚蛋里装着一颗电路心脏 */}
        <g transform="translate(100 184)">
          <g fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M-10 -5 H-14 M-10 5 H-14 M10 -5 H14 M10 5 H14 M-4 -10 V-13 M4 -10 V-13" />
            {CORE_TRACES.map((d) => <path key={d} d={d} />)}
          </g>
          {CORE_TRACES.map((d, i) => <Flow key={d} d={d} color="#ffe27a" delay={0.3 + i * 1.1} />)}
          <circle cx="-34" cy="-9" r="3" fill="#fff" />
          <circle cx="34" cy="-9" r="3" fill="#fff" />
          <g className="egg-core">
            <rect x="-10" y="-10" width="20" height="20" rx="5" fill="#fff" />
            <path d={HEART} transform="translate(0 1.6) scale(.82)" fill="#ff6fa8" />
          </g>
        </g>

        <path d="M100 26 C140 26 168 82 168 130 C168 172 138 198 100 198 C152 184 156 70 100 26 Z" fill="#e8926b" opacity=".15" />
        <ellipse cx="55" cy="88" rx="7" ry="17" transform="rotate(18 55 88)" fill="#fff" opacity=".95" />
        <circle cx="66" cy="68" r="3" fill="#fff" opacity=".9" />
      </g>
      <path d={EGG} fill="none" stroke={O} strokeWidth="4.5" strokeLinejoin="round" />

      <g transform="translate(147 59) rotate(24) scale(.92)">
        <g className="egg-bow">
          <path d="M0 0 C-5 -10 -17 -11 -16 0 C-17 11 -5 10 0 0 Z" fill="#ff7fb5" stroke={O} strokeWidth="3.2" strokeLinejoin="round" />
          <path d="M0 0 C5 -10 17 -11 16 0 C17 11 5 10 0 0 Z" fill="#ff7fb5" stroke={O} strokeWidth="3.2" strokeLinejoin="round" />
          <path d="M-12 -3.5 Q-10 -6.5 -6.5 -5.5 M7 -5.5 Q10 -6.5 12 -4" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" opacity=".85" />
          <circle r="4.8" fill="#ffa6cc" stroke={O} strokeWidth="3.2" />
        </g>
      </g>
    </>
  );
}

export function KittyEgg({
  phase, cracks = 0, onTap, children,
}: {
  phase: EggPhase;
  /** 裂痕等级 0–3 */
  cracks?: number;
  onTap?: () => void;
  /** 破壳后的猫，夹在后层与下半壳之间 */
  children?: ReactNode;
}) {
  const id = useId().replace(/:/g, '');
  const [taps, setTaps] = useState(0);
  const [squint, setSquint] = useState(false);
  const timer = useRef(0);
  const idle = phase === 'idle';
  const level = Math.min(3, Math.max(0, cracks));

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const tap = () => {
    if (!idle) return;
    setTaps((n) => n + 1);
    setSquint(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSquint(false), 420);
    onTap?.();
  };

  return (
    <div
      className={cn('egg-scene', `is-${phase}`, idle && level >= 3 && 'is-ready')}
      onPointerDown={tap}
      role={idle ? 'button' : undefined}
      aria-label={idle ? tr('轻敲彩蛋', 'Tap the egg') : undefined}
    >
      <svg className="egg-layer" viewBox="0 0 200 220" aria-hidden>
        <defs>
          <clipPath id={`${id}-egg`}><path d={EGG} /></clipPath>
          <clipPath id={`${id}-top`}><path d={`M0 0 H200 V104 ${SEAM_BACK} H0 Z`} /></clipPath>
          <clipPath id={`${id}-bottom`}><path d={`M0 220 H200 V104 ${SEAM_BACK} H0 Z`} /></clipPath>
          <radialGradient id={`${id}-body`} gradientUnits="userSpaceOnUse" cx="78" cy="78" r="140">
            <stop offset="0" stopColor="#fffdf6" />
            <stop offset=".5" stopColor="#fff1d0" />
            <stop offset="1" stopColor="#ffd9bf" />
          </radialGradient>
          <linearGradient id={`${id}-lace`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffa3cb" />
            <stop offset="1" stopColor="#ff7fb0" />
          </linearGradient>
          <radialGradient id={`${id}-eye`} cx=".5" cy=".28" r=".85">
            <stop offset="0" stopColor="#2e2029" />
            <stop offset=".62" stopColor="#3b2a35" />
            <stop offset="1" stopColor="#3fc4b2" />
          </radialGradient>
          <radialGradient id={`${id}-halo`}>
            <stop offset=".35" stopColor="#fff" stopOpacity=".75" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>

        {phase !== 'open' && (
          <>
            <circle className="egg-halo" cx="100" cy="116" r="118" fill={`url(#${id}-halo)`} />
            {/* 绕着蛋慢慢转的一圈焊点 */}
            <circle className="egg-orbit" cx="100" cy="116" r="108" fill="none" stroke={TEAL} strokeWidth="2.4" strokeLinecap="round" strokeDasharray="0.1 13.47" opacity=".5" />
          </>
        )}
        <ellipse className="egg-shadow" cx="100" cy="205" rx="54" ry="8" fill="#7a4a6a" opacity=".18" />

        {phase !== 'open' ? (
          <g key={taps} className={cn('egg-whole', taps > 0 && 'is-bonk')}>
            <g className="egg-rock">
              <Shell id={id} />

              {/* 裂痕 */}
              {[true, false].map((glow) =>
                CRACKS.slice(0, level).map((group, i) =>
                  group.map((d) => (
                    <path
                      key={`${glow}${d}`}
                      d={d}
                      pathLength={1}
                      className={cn('egg-crack', glow && 'is-glow', i === level - 1 && 'is-new')}
                      stroke={O}
                    />
                  )),
                ),
              )}

              {/* 脸 */}
              {[57, 143].map((cx) => (
                <g key={cx}>
                  <ellipse cx={cx} cy="143" rx="10.5" ry="6.5" fill="#ff9fbd" opacity=".8" />
                  <path d={`M${cx - 4} 145 l2.4 -4 M${cx + 1} 145 l2.4 -4`} fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity=".8" />
                </g>
              ))}
              {squint ? (
                <>
                  <path
                    d="M69 121 L84 128 L69 135 M131 121 L116 128 L131 135"
                    fill="none" stroke={O} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"
                  />
                  <ellipse cx="100" cy="144" rx="5" ry="6.5" fill="#4a2a36" />
                  <ellipse cx="100" cy="147" rx="3" ry="2.6" fill="#ff7fa5" />
                </>
              ) : (
                <>
                  {[78, 122].map((cx) => (
                    <g key={cx} className="egg-eye">
                      <circle cx={cx} cy="128" r="11.5" fill={`url(#${id}-eye)`} />
                      <circle cx={cx - 3.8} cy="123.6" r="4.2" fill="#fff" />
                      <circle cx={cx + 4} cy="132.4" r="2" fill="#fff" />
                      <circle cx={cx - 5.6} cy="131.6" r="1.1" fill="#fff" opacity=".8" />
                    </g>
                  ))}
                  <path
                    d="M90 141 Q95 148.5 100 141 Q105 148.5 110 141"
                    fill="none" stroke={O} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"
                  />
                </>
              )}
            </g>
          </g>
        ) : (
          <g className="egg-top">
            <g clipPath={`url(#${id}-top)`}><Shell id={id} /></g>
            <path d={SEAM} clipPath={`url(#${id}-egg)`} fill="none" stroke={O} strokeWidth="4.5" strokeLinejoin="round" />
          </g>
        )}
      </svg>

      {phase !== 'open' && (
        <>
          <span className="egg-spark s1">✦</span>
          <span className="egg-spark s2">✦</span>
          <span className="egg-spark s3">✦</span>
          <span className="egg-spark s4">✦</span>
          <span className="egg-heart h1">♥</span>
          <span className="egg-heart h2">♥</span>
        </>
      )}

      {/* 每次敲击挥下一记锤子，key 换新以重播动画 */}
      {idle && taps > 0 && (
        <svg key={taps} className="egg-hammer" viewBox="0 0 96 96" aria-hidden>
          <g className="egg-hammer-swing">
            <g transform="translate(58 22) rotate(-18)">
              <rect x="-5" y="14" width="10" height="48" rx="4" fill="#c48a52" stroke={O} strokeWidth="3.2" strokeLinejoin="round" />
              <rect x="-3.2" y="18" width="3" height="40" rx="1.5" fill="#e8c08a" opacity=".7" />
              <rect x="-18" y="-2" width="36" height="22" rx="6" fill="#8b6a4a" stroke={O} strokeWidth="3.2" strokeLinejoin="round" />
              <rect x="-14" y="1" width="28" height="8" rx="3" fill="#d4b08a" opacity=".55" />
              <circle cx="0" cy="62" r="4.5" fill="#5a3a2e" />
            </g>
          </g>
          <g className="egg-hammer-spark">
            <path d="M28 58 l4 -10 M34 52 l10 -2 M32 56 l8 6" fill="none" stroke="#ffd24d" strokeWidth="3" strokeLinecap="round" />
            <circle cx="30" cy="54" r="2.2" fill="#fff" />
          </g>
        </svg>
      )}

      <div className="egg-slot">{children}</div>

      {phase === 'open' && (
        <svg className="egg-layer egg-front" viewBox="0 0 200 220" aria-hidden>
          <g className="egg-bottom">
            <g clipPath={`url(#${id}-bottom)`}><Shell id={id} /></g>
            <path d={SEAM} clipPath={`url(#${id}-egg)`} fill="none" stroke={O} strokeWidth="4.5" strokeLinejoin="round" />
          </g>
        </svg>
      )}
    </div>
  );
}
