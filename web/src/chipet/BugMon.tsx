import { cn } from '../components/ui.tsx';

const LEGS = [
  // 左三条、右三条：芯片引脚弯成的小腿
  'M54 92 H36 V104', 'M54 116 H32 V128', 'M54 140 H36 V152',
  'M146 92 H164 V104', 'M146 116 H168 V128', 'M146 140 H164 V152',
];

/**
 * 野怪：一只长了脸的芯片（Bug）。方身体是封装，两侧的腿是引脚，头顶两根天线冒着电火花。
 * 画法沿用芯喵的贴纸风：粗深色描边 + 纯色填充。
 */
export function BugMon({ color, dark, size = 160, boss, className }: {
  color: string;
  dark: string;
  size?: number;
  boss?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('bug-mon inline-grid place-items-center', className)} style={{ width: size, height: size }}>
      <svg viewBox="0 0 200 200" width={size} height={size} className="overflow-visible" aria-hidden>
        <ellipse className="bug-shadow" cx="100" cy="186" rx="50" ry="7" fill="#3a2a3a" opacity=".14" />
        <g className="bug-root">
          <g fill="none" stroke={dark} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
            {LEGS.map((d) => <path key={d} d={d} />)}
          </g>

          {/* 天线 */}
          <g className="bug-antenna" fill="none" stroke={dark} strokeWidth="4.5" strokeLinecap="round">
            <path d="M82 60 Q76 38 62 32" />
            <path d="M118 60 Q124 38 138 32" />
          </g>
          <circle className="bug-spark" cx="60" cy="30" r="6.5" fill="#ffd84d" stroke={dark} strokeWidth="3" />
          <circle className="bug-spark is-late" cx="140" cy="30" r="6.5" fill="#ffd84d" stroke={dark} strokeWidth="3" />

          {boss && (
            <path d="M74 60 L70 36 L86 50 L100 30 L114 50 L130 36 L126 60 Z" fill="#ffd84d" stroke={dark} strokeWidth="4" strokeLinejoin="round" />
          )}

          {/* 封装 */}
          <rect x="52" y="58" width="96" height="112" rx="24" fill={color} stroke={dark} strokeWidth="5" />
          <rect x="62" y="68" width="76" height="92" rx="16" fill="#ffffff" opacity=".16" />
          <circle cx="70" cy="76" r="4" fill={dark} opacity=".45" />

          {/* 脸 */}
          <g>
            <circle cx="82" cy="104" r="14" fill="#fff" stroke={dark} strokeWidth="3.5" />
            <circle cx="118" cy="104" r="14" fill="#fff" stroke={dark} strokeWidth="3.5" />
            <circle className="bug-pupil" cx="85" cy="106" r="6.5" fill={boss ? '#d92f2f' : dark} />
            <circle className="bug-pupil" cx="115" cy="106" r="6.5" fill={boss ? '#d92f2f' : dark} />
            <circle cx="87" cy="103" r="2.2" fill="#fff" />
            <circle cx="117" cy="103" r="2.2" fill="#fff" />
            <path d="M64 86 L96 97 M136 86 L104 97" stroke={dark} strokeWidth="5.5" strokeLinecap="round" />
          </g>
          <path d="M80 138 L87 130 L94 138 L100 130 L106 138 L113 130 L120 138" fill="none" stroke={dark} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
          <ellipse cx="68" cy="126" rx="7" ry="4.5" fill="#ff8fa3" opacity=".6" />
          <ellipse cx="132" cy="126" rx="7" ry="4.5" fill="#ff8fa3" opacity=".6" />
        </g>
      </svg>
    </div>
  );
}
