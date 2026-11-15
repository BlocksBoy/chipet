import { useId } from 'react';
import { cn } from '../components/ui.tsx';
import { tr } from '../i18n.ts';
import { phenotypeOf, type Phenotype, type Rarity } from './phenotype.ts';

/** 带颊毛的宽头：两侧各两撮炸毛。 */
const HEAD =
  'M100 34 C122 34 142 46 148 66 C150 72 151 78 150 82 L164 86 L150 92 L160 100 L144 102 ' +
  'C134 112 118 116 100 116 C82 116 66 112 56 102 L40 100 L50 92 L36 86 L50 82 ' +
  'C49 78 50 72 52 66 C58 46 78 34 100 34 Z';
const BODY =
  'M78 112 C64 128 54 152 58 168 C60 178 70 180 100 180 C130 180 140 178 142 168 C146 152 136 128 122 112 Z';
const BELLY =
  'M100 116 C116 116 123 136 123 154 C123 170 114 178 100 178 C86 178 77 170 77 154 C77 136 84 116 100 116 Z';

/** 尾巴用「粗描边 + 细填色」两层画，天然带轮廓。 */
const TAILS = [
  { d: 'M128 164 C160 174 188 156 184 128 C182 114 170 108 160 114', w: 12.5 },
  { d: 'M128 162 C158 170 182 150 176 114', w: 24 },
  { d: 'M128 166 C150 172 172 164 172 142 C172 126 186 124 188 108', w: 11 },
];

const EYES = [
  { cx: 74, ix: 77, cls: 'pet-eye-l' },
  { cx: 126, ix: 123, cls: 'pet-eye-r' },
];

/** CryptoKitties 风芯喵：头身分离、颊毛、大眼、胡须，Cattributes 决定配色与五官。 */
export function PetAvatar({
  cpu, circuitId, rarity = 0, mood = 70, size = 160, className, phenotype, interactive,
  onPat, lively = true,
}: {
  cpu: string;
  circuitId: bigint | number | string;
  rarity?: Rarity;
  mood?: number;
  size?: number;
  className?: string;
  phenotype?: Phenotype;
  interactive?: boolean;
  onPat?: () => void;
  /** 关闭闲置动画 */
  lively?: boolean;
}) {
  const p = phenotype ?? phenotypeOf(cpu, circuitId, rarity);
  const sleepy = mood < 35;
  const excited = mood >= 75;
  const uid = useId().replace(/:/g, '');
  const o = p.outline;
  const tail = TAILS[p.tail] ?? TAILS[0]!;
  const calico = p.pattern === 3;

  return (
    <div
      className={cn(
        'pet-avatar relative inline-grid place-items-center',
        interactive && 'cursor-pointer',
        lively && !sleepy && 'is-lively',
        lively && sleepy && 'is-sleepy',
        lively && excited && 'is-excited',
        className,
      )}
      style={{ width: size, height: size }}
      onPointerDown={interactive ? onPat : undefined}
      role={interactive ? 'button' : undefined}
      aria-label={interactive ? tr('摸摸这只芯喵', 'Pat this kitty') : undefined}
    >
      <svg viewBox="0 0 200 200" width={size} height={size} className="overflow-visible" aria-hidden>
        <defs>
          <clipPath id={`${uid}-head`}><path d={HEAD} /></clipPath>
          <clipPath id={`${uid}-body`}><path d={BODY} /></clipPath>
        </defs>

        <ellipse className="pet-shadow" cx="100" cy="187" rx="56" ry="7" fill="#3a2a3a" opacity=".14" />

        <g className="pet-root">
          {/* 尾巴 */}
          <g className="pet-tail" style={{ transformOrigin: '128px 166px' }} fill="none" strokeLinecap="round">
            <path d={tail.d} stroke={o} strokeWidth={tail.w + 6} />
            <path d={tail.d} stroke={p.body} strokeWidth={tail.w} />
            {p.pattern === 1 && (
              <path d={tail.d} stroke={p.accent} strokeWidth={tail.w} strokeDasharray="5 13" strokeLinecap="butt" opacity=".55" />
            )}
            {p.pattern === 2 && (
              <path d={tail.d} stroke={p.accent} strokeWidth="6" strokeDasharray="0.1 15" opacity=".6" />
            )}
          </g>

          {/* 身体 */}
          <g className="pet-body" style={{ transformOrigin: '100px 180px' }}>
            <ellipse cx="60" cy="175" rx="15" ry="8" fill={p.body} stroke={o} strokeWidth="3" />
            <ellipse cx="140" cy="175" rx="15" ry="8" fill={p.body} stroke={o} strokeWidth="3" />
            <path d={BODY} fill={p.body} stroke={o} strokeWidth="3.2" strokeLinejoin="round" />

            <g clipPath={`url(#${uid}-body)`}>
              {p.pattern === 1 && (
                <path
                  d="M58 138 L74 143 M56 153 L73 157 M142 138 L126 143 M144 153 L127 157"
                  stroke={p.accent} strokeWidth="4.5" strokeLinecap="round" opacity=".55"
                />
              )}
              {p.pattern === 2 && (
                <g fill={p.accent} opacity=".55">
                  <circle cx="68" cy="142" r="5" />
                  <circle cx="132" cy="146" r="4.5" />
                  <circle cx="66" cy="161" r="3.5" />
                  <circle cx="135" cy="163" r="3.5" />
                  <circle cx="74" cy="127" r="3" />
                </g>
              )}
              {calico && <ellipse cx="140" cy="156" rx="19" ry="24" fill={p.accent} opacity=".8" />}
              <path d={BELLY} fill={p.belly} />
            </g>

            {/* 前爪 */}
            <ellipse cx="87" cy="178" rx="12.5" ry="8" fill={p.body} stroke={o} strokeWidth="3" />
            <ellipse cx="113" cy="178" rx="12.5" ry="8" fill={p.body} stroke={o} strokeWidth="3" />
            <path
              d="M82 177 v5 M87 176.5 v6 M92 177 v5 M108 177 v5 M113 176.5 v6 M118 177 v5"
              stroke={o} strokeWidth="1.8" strokeLinecap="round" opacity=".45"
            />
          </g>

          {/* 头 */}
          <g className="pet-head" style={{ transformOrigin: '100px 116px' }}>
            <g className="pet-ear-l" style={{ transformOrigin: '70px 52px' }}>
              <path d="M56 62 L48 16 L90 40 Z" fill={calico ? p.accent : p.body} stroke={o} strokeWidth="3.2" strokeLinejoin="round" />
              <path d="M60 52 L56 28 L78 41 Z" fill={p.belly} />
            </g>
            <g className="pet-ear-r" style={{ transformOrigin: '130px 52px' }}>
              <path d="M144 62 L152 16 L110 40 Z" fill={p.body} stroke={o} strokeWidth="3.2" strokeLinejoin="round" />
              <path d="M140 52 L144 28 L122 41 Z" fill={p.belly} />
            </g>

            <path d={HEAD} fill={p.body} stroke={o} strokeWidth="3.2" strokeLinejoin="round" />

            <g clipPath={`url(#${uid}-head)`}>
              {p.pattern === 1 && (
                <path
                  d="M86 44 L89 57 M100 42 V57 M114 44 L111 57 M38 88 L56 90 M42 99 L58 97 M162 88 L144 90 M158 99 L142 97"
                  stroke={p.accent} strokeWidth="4.5" strokeLinecap="round" opacity=".55"
                />
              )}
              {p.pattern === 2 && (
                <g fill={p.accent} opacity=".55">
                  <circle cx="100" cy="47" r="5" />
                  <circle cx="87" cy="53" r="3" />
                  <circle cx="114" cy="51" r="3.5" />
                  <circle cx="47" cy="92" r="3.2" />
                  <circle cx="153" cy="92" r="3.2" />
                </g>
              )}
              {calico && (
                <ellipse cx="62" cy="54" rx="31" ry="23" transform="rotate(-18 62 54)" fill={p.accent} opacity=".8" />
              )}
              {/* 口鼻白区，深色毛也看得清表情 */}
              <ellipse cx="100" cy="102" rx="20" ry="13" fill={p.belly} />
            </g>

            {/* 头顶一撮毛 */}
            <path
              d="M88 41 L93 25 L100 35 L108 23 L112 41"
              fill={p.body} stroke={o} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"
            />

            {/* 腮红 */}
            <ellipse cx="59" cy="97" rx="8.5" ry="5.5" fill={p.cheek} opacity=".75" />
            <ellipse cx="141" cy="97" rx="8.5" ry="5.5" fill={p.cheek} opacity=".75" />

            {/* 眼睛 */}
            {sleepy ? (
              <g fill="none" stroke={o} strokeWidth="3.4" strokeLinecap="round">
                <path d="M58 76 Q74 88 90 76" />
                <path d="M110 76 Q126 88 142 76" />
              </g>
            ) : (
              <>
                {EYES.map((e) => (
                  <g key={e.cls} className={e.cls} style={{ transformOrigin: `${e.cx}px 74px` }}>
                    <circle cx={e.cx} cy="74" r="20" fill="#fff" stroke={o} strokeWidth="3.2" />
                    <g className="pet-pupil">
                      <circle cx={e.ix} cy="77" r="12.5" fill={p.eye} stroke={o} strokeWidth="1" strokeOpacity=".3" />
                      <circle cx={e.ix} cy="77" r="8" fill="#2e2230" />
                      <circle cx={e.ix - 4.5} cy="71.5" r="4.4" fill="#fff" />
                      <circle cx={e.ix + 4} cy="81.5" r="1.9" fill="#fff" opacity=".85" />
                    </g>
                    {p.eyeShape === 2 && (
                      <path
                        d={`M${e.cx - 19.1} 68 A20 20 0 0 1 ${e.cx + 19.1} 68 Z`}
                        fill={p.body} stroke={o} strokeWidth="3" strokeLinejoin="round"
                      />
                    )}
                  </g>
                ))}
                {p.eyeShape === 1 && (
                  <path
                    d="M57 62 L50 56 M61 57.5 L56 50 M143 62 L150 56 M139 57.5 L144 50"
                    stroke={o} strokeWidth="2.6" strokeLinecap="round"
                  />
                )}
              </>
            )}

            {/* 嘴 */}
            {!sleepy && p.mouth === 1 && (
              <path d="M95.5 105 Q95 115 100 115 Q105 115 104.5 105 Z" fill="#ff7fa5" stroke={o} strokeWidth="1.8" strokeLinejoin="round" />
            )}
            {!sleepy && p.mouth === 2 ? (
              <>
                <path d="M100 97 V101" stroke={o} strokeWidth="2.4" strokeLinecap="round" />
                <path d="M90 102 Q100 99 110 102 Q109 116 100 116 Q91 116 90 102 Z" fill="#4a2a36" stroke={o} strokeWidth="2.2" strokeLinejoin="round" />
                <path d="M94 111 Q100 106 106 111 Q104 115.5 100 115.5 Q96 115.5 94 111 Z" fill="#ff7fa5" />
                <path d="M97.5 101.5 h5 v3.6 h-5 Z" fill="#fff" />
              </>
            ) : (
              <path
                d="M100 97 V101 M100 101 Q95 108 88 103 M100 101 Q105 108 112 103"
                fill="none" stroke={o} strokeWidth="2.4" strokeLinecap="round"
              />
            )}
            {!sleepy && p.mouth === 3 && (
              <path d="M104 104.5 L106 109.5 L108 104" fill="#fff" stroke={o} strokeWidth="1.4" strokeLinejoin="round" />
            )}

            {/* 鼻 */}
            <path d="M94 90 Q100 87 106 90 Q104 96 100 97 Q96 96 94 90 Z" fill="#f28ba8" stroke={o} strokeWidth="1.6" strokeLinejoin="round" />

            {/* 胡须 */}
            <g fill="none" stroke={o} strokeWidth="1.6" strokeLinecap="round" opacity=".75">
              <g className="pet-whisk-l" style={{ transformOrigin: '70px 100px' }}>
                <path d="M70 98 Q52 94 34 97" />
                <path d="M70 103 Q54 105 38 112" />
              </g>
              <g className="pet-whisk-r" style={{ transformOrigin: '130px 100px' }}>
                <path d="M130 98 Q148 94 166 97" />
                <path d="M130 103 Q146 105 162 112" />
              </g>
            </g>

            {sleepy && (
              <g fill={o} fontFamily="Outfit, sans-serif" fontWeight="700" opacity=".7">
                <text className="pet-zzz" x="150" y="44" fontSize="16">z</text>
                <text className="pet-zzz is-late" x="163" y="30" fontSize="12">z</text>
              </g>
            )}
          </g>

          {rarity > 0 && (
            <g transform="translate(30,34)">
              <circle r="14" fill={rarity === 2 ? '#ffd24d' : '#ff8fbf'} stroke={o} strokeWidth="3" />
              <text textAnchor="middle" y="5.5" fontSize="15" fontFamily="Outfit, sans-serif" fill={o}>
                {rarity === 2 ? '★' : '◆'}
              </text>
            </g>
          )}
        </g>
      </svg>
    </div>
  );
}
