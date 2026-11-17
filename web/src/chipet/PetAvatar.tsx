import { useId } from 'react';
import { cn } from '../components/ui.tsx';
import { tr } from '../i18n.ts';
import { phenotypeOf, type Phenotype, type Rarity } from './phenotype.ts';

/** 体态：头 / 身 / 肚皮路径 */
const BODIES = [
  {
    // 标准
    head: 'M100 34 C122 34 142 46 148 66 C150 72 151 78 150 82 L164 86 L150 92 L160 100 L144 102 C134 112 118 116 100 116 C82 116 66 112 56 102 L40 100 L50 92 L36 86 L50 82 C49 78 50 72 52 66 C58 46 78 34 100 34 Z',
    body: 'M78 112 C64 128 54 152 58 168 C60 178 70 180 100 180 C130 180 140 178 142 168 C146 152 136 128 122 112 Z',
    belly: 'M100 116 C116 116 123 136 123 154 C123 170 114 178 100 178 C86 178 77 170 77 154 C77 136 84 116 100 116 Z',
    pawY: 175, pawRx: 15, frontY: 178, frontRx: 12.5,
  },
  {
    // 圆墩
    head: 'M100 30 C128 30 150 44 156 68 C158 76 158 84 156 88 L172 92 L156 98 L168 108 L148 110 C136 122 118 128 100 128 C82 128 64 122 52 110 L32 108 L44 98 L28 92 L44 88 C42 84 42 76 44 68 C50 44 72 30 100 30 Z',
    body: 'M70 120 C52 138 44 158 50 172 C54 184 70 188 100 188 C130 188 146 184 150 172 C156 158 148 138 130 120 Z',
    belly: 'M100 124 C122 124 130 146 130 164 C130 180 118 186 100 186 C82 186 70 180 70 164 C70 146 78 124 100 124 Z',
    pawY: 182, pawRx: 18, frontY: 185, frontRx: 14,
  },
  {
    // 瘦高
    head: 'M100 28 C118 28 134 40 140 58 C142 64 142 70 140 74 L152 78 L140 84 L148 92 L134 94 C126 104 114 108 100 108 C86 108 74 104 66 94 L52 92 L60 84 L48 78 L60 74 C58 70 58 64 60 58 C66 40 82 28 100 28 Z',
    body: 'M84 106 C72 124 66 150 70 168 C72 176 80 178 100 178 C120 178 128 176 130 168 C134 150 128 124 116 106 Z',
    belly: 'M100 110 C112 110 118 132 118 150 C118 166 110 174 100 174 C90 174 82 166 82 150 C82 132 88 110 100 110 Z',
    pawY: 172, pawRx: 12, frontY: 175, frontRx: 10,
  },
  {
    // 吐司蹲：几乎无腿
    head: 'M100 36 C124 36 144 48 150 68 C152 74 152 80 150 84 L164 88 L150 94 L160 102 L144 104 C134 114 118 118 100 118 C82 118 66 114 56 104 L40 102 L50 94 L36 88 L50 84 C48 80 48 74 50 68 C56 48 76 36 100 36 Z',
    body: 'M62 114 C48 130 46 158 58 174 C66 184 82 186 100 186 C118 186 134 184 142 174 C154 158 152 130 138 114 Z',
    belly: 'M100 120 C120 120 128 144 128 162 C128 176 116 182 100 182 C84 182 72 176 72 162 C72 144 80 120 100 120 Z',
    pawY: 180, pawRx: 10, frontY: 183, frontRx: 9,
  },
  {
    // 豆袋：更扁更宽
    head: 'M100 38 C126 38 148 50 152 72 C154 80 154 86 152 90 L168 94 L152 100 L164 110 L146 112 C134 120 118 124 100 124 C82 124 66 120 54 112 L36 110 L48 100 L32 94 L48 90 C46 86 46 80 48 72 C52 50 74 38 100 38 Z',
    body: 'M58 120 C42 136 40 162 56 178 C68 188 84 190 100 190 C116 190 132 188 144 178 C160 162 158 136 142 120 Z',
    belly: 'M100 126 C122 126 130 148 128 168 C120 180 80 180 72 168 C70 148 78 126 100 126 Z',
    pawY: 184, pawRx: 16, frontY: 186, frontRx: 13,
  },
];

/** 尾巴用「粗描边 + 细填色」两层画，天然带轮廓。 */
const TAILS = [
  { d: 'M128 164 C160 174 188 156 184 128 C182 114 170 108 160 114', w: 12.5 },
  { d: 'M128 162 C158 170 182 150 176 114', w: 24 },
  { d: 'M128 166 C150 172 172 164 172 142 C172 126 186 124 188 108', w: 11 },
  { d: 'M128 168 C148 172 158 168 156 150', w: 16 },
  { d: 'M128 164 C152 176 178 170 182 148 C184 136 176 130 168 136 C162 140 168 148 174 146', w: 11 },
  { d: 'M128 166 C146 158 168 148 174 128 C176 118 168 112 160 118', w: 13 },
  { d: 'M128 168 C142 180 166 184 178 170 C186 160 180 148 168 152 C158 156 162 168 170 166', w: 12 },
];

const EYES = [
  { cx: 74, ix: 77, cls: 'pet-eye-l' },
  { cx: 126, ix: 123, cls: 'pet-eye-r' },
];

function Ear({
  side, style, body, belly, accent, outline, calico,
}: {
  side: 'l' | 'r';
  style: number;
  body: string;
  belly: string;
  accent: string;
  outline: string;
  calico: boolean;
}) {
  const ox = side === 'r' ? 130 : 70;
  const fillOuter = calico && side === 'l' ? accent : body;
  const gProps = {
    className: side === 'l' ? 'pet-ear-l' : 'pet-ear-r',
    style: { transformOrigin: `${ox}px 52px` } as const,
  };
  if (style === 1) {
    // 圆耳
    return (
      <g {...gProps}>
        {side === 'l' ? (
          <>
            <ellipse cx="62" cy="42" rx="18" ry="22" fill={fillOuter} stroke={outline} strokeWidth="3.2" />
            <ellipse cx="64" cy="44" rx="10" ry="13" fill={belly} />
          </>
        ) : (
          <>
            <ellipse cx="138" cy="42" rx="18" ry="22" fill={body} stroke={outline} strokeWidth="3.2" />
            <ellipse cx="136" cy="44" rx="10" ry="13" fill={belly} />
          </>
        )}
      </g>
    );
  }
  if (style === 2) {
    // 折耳
    return (
      <g {...gProps}>
        {side === 'l' ? (
          <>
            <path d="M56 70 L44 38 L88 48 L78 72 Z" fill={fillOuter} stroke={outline} strokeWidth="3.2" strokeLinejoin="round" />
            <path d="M58 62 L52 44 L76 50 Z" fill={belly} />
          </>
        ) : (
          <>
            <path d="M144 70 L156 38 L112 48 L122 72 Z" fill={body} stroke={outline} strokeWidth="3.2" strokeLinejoin="round" />
            <path d="M142 62 L148 44 L124 50 Z" fill={belly} />
          </>
        )}
      </g>
    );
  }
  if (style === 3) {
    // 长耳（兔感）
    return (
      <g {...gProps}>
        {side === 'l' ? (
          <>
            <path d="M66 68 C52 40 48 8 62 4 C78 0 86 28 84 56 Z" fill={fillOuter} stroke={outline} strokeWidth="3.2" strokeLinejoin="round" />
            <path d="M68 60 C58 36 58 14 66 12 C74 10 78 30 76 52 Z" fill={belly} />
          </>
        ) : (
          <>
            <path d="M134 68 C148 40 152 8 138 4 C122 0 114 28 116 56 Z" fill={body} stroke={outline} strokeWidth="3.2" strokeLinejoin="round" />
            <path d="M132 60 C142 36 142 14 134 12 C126 10 122 30 124 52 Z" fill={belly} />
          </>
        )}
      </g>
    );
  }
  if (style === 4) {
    // 翅耳（小翼）
    return (
      <g {...gProps}>
        {side === 'l' ? (
          <>
            <path d="M58 66 L36 28 L42 66 L28 52 L48 76 Z" fill={fillOuter} stroke={outline} strokeWidth="3" strokeLinejoin="round" />
            <path d="M56 62 L48 16 L90 40 Z" fill={fillOuter} stroke={outline} strokeWidth="3.2" strokeLinejoin="round" />
            <path d="M60 52 L56 28 L78 41 Z" fill={belly} />
          </>
        ) : (
          <>
            <path d="M142 66 L164 28 L158 66 L172 52 L152 76 Z" fill={body} stroke={outline} strokeWidth="3" strokeLinejoin="round" />
            <path d="M144 62 L152 16 L110 40 Z" fill={body} stroke={outline} strokeWidth="3.2" strokeLinejoin="round" />
            <path d="M140 52 L144 28 L122 41 Z" fill={belly} />
          </>
        )}
      </g>
    );
  }
  if (style === 5) {
    // 簇耳：尖耳 + 耳尖毛簇
    return (
      <g {...gProps}>
        {side === 'l' ? (
          <>
            <path d="M56 62 L48 16 L90 40 Z" fill={fillOuter} stroke={outline} strokeWidth="3.2" strokeLinejoin="round" />
            <path d="M60 52 L56 28 L78 41 Z" fill={belly} />
            <path d="M48 18 L42 4 L54 14 L50 2 L58 14" fill="none" stroke={outline} strokeWidth="2.4" strokeLinecap="round" />
          </>
        ) : (
          <>
            <path d="M144 62 L152 16 L110 40 Z" fill={body} stroke={outline} strokeWidth="3.2" strokeLinejoin="round" />
            <path d="M140 52 L144 28 L122 41 Z" fill={belly} />
            <path d="M152 18 L158 4 L146 14 L150 2 L142 14" fill="none" stroke={outline} strokeWidth="2.4" strokeLinecap="round" />
          </>
        )}
      </g>
    );
  }
  // 默认尖耳
  return (
    <g {...gProps}>
      {side === 'l' ? (
        <>
          <path d="M56 62 L48 16 L90 40 Z" fill={fillOuter} stroke={outline} strokeWidth="3.2" strokeLinejoin="round" />
          <path d="M60 52 L56 28 L78 41 Z" fill={belly} />
        </>
      ) : (
        <>
          <path d="M144 62 L152 16 L110 40 Z" fill={body} stroke={outline} strokeWidth="3.2" strokeLinejoin="round" />
          <path d="M140 52 L144 28 L122 41 Z" fill={belly} />
        </>
      )}
    </g>
  );
}

/** CryptoKitties 风芯喵：头身分离、颊毛、大眼、胡须，Cattributes 决定配色与五官。 */
export function PetAvatar({
  cpu, circuitId, rarity = 0, mood = 70, size = 160, className, phenotype, interactive,
  onPat, lively = true, seed,
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
  /** 个体盐：同电路不同宠的细微差（id/名/孵化时间） */
  seed?: string | number | null;
}) {
  const p = phenotype ?? phenotypeOf(cpu, circuitId, rarity, seed);
  const sleepy = mood < 35;
  const excited = mood >= 75;
  const uid = useId().replace(/:/g, '');
  const o = p.outline;
  const shape = BODIES[p.bodyShape] ?? BODIES[0]!;
  const tail = TAILS[p.tail] ?? TAILS[0]!;
  const calico = p.pattern === 3;
  const tuxedo = p.pattern === 4;
  const mask = p.pattern === 5;
  const traces = p.pattern === 6;
  const hearts = p.pattern === 7;
  const diamonds = p.pattern === 8;
  const loaf = p.bodyShape === 3 || p.bodyShape === 4;
  const cheekR = 7.5 + (p.whisker === 2 ? 1.5 : 0);
  const j = p.markJitter;

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
          <clipPath id={`${uid}-head`}><path d={shape.head} /></clipPath>
          <clipPath id={`${uid}-body`}><path d={shape.body} /></clipPath>
        </defs>

        <ellipse className="pet-shadow" cx="100" cy="187" rx={loaf ? 64 : 56} ry="7" fill="#3a2a3a" opacity=".14" />

        <g className="pet-root">
          {/* 尾巴 */}
          <g className="pet-tail" style={{ transformOrigin: '128px 166px' }} fill="none" strokeLinecap="round">
            <path d={tail.d} stroke={o} strokeWidth={tail.w + 6} />
            <path d={tail.d} stroke={p.body} strokeWidth={tail.w} />
            {(p.pattern === 1 || traces) && (
              <path d={tail.d} stroke={p.accent} strokeWidth={tail.w} strokeDasharray="5 13" strokeLinecap="butt" opacity=".55" />
            )}
            {p.pattern === 2 && (
              <path d={tail.d} stroke={p.accent} strokeWidth="6" strokeDasharray="0.1 15" opacity=".6" />
            )}
          </g>

          {/* 身体 */}
          <g className="pet-body" style={{ transformOrigin: '100px 180px' }}>
            {!loaf && (
              <>
                <ellipse cx="60" cy={shape.pawY} rx={shape.pawRx} ry="8" fill={p.body} stroke={o} strokeWidth="3" />
                <ellipse cx="140" cy={shape.pawY} rx={shape.pawRx} ry="8" fill={p.body} stroke={o} strokeWidth="3" />
              </>
            )}
            <path d={shape.body} fill={p.body} stroke={o} strokeWidth="3.2" strokeLinejoin="round" />

            <g clipPath={`url(#${uid}-body)`}>
              {p.pattern === 1 && (
                <path
                  d={`M${58 + j} ${138 + (j % 3)} L${74 + j} ${143 + (j % 3)} M${56 + j} ${153} L${73 + j} 157 M${142 - j} 138 L${126 - j} 143 M${144 - j} 153 L${127 - j} 157`}
                  stroke={p.accent} strokeWidth="4.5" strokeLinecap="round" opacity=".55"
                />
              )}
              {p.pattern === 2 && (
                <g fill={p.accent} opacity=".55">
                  <circle cx={68 + j} cy={142 - (j % 2)} r="5" />
                  <circle cx={132 - j} cy="146" r="4.5" />
                  <circle cx="66" cy={161 + (j % 3)} r="3.5" />
                  <circle cx="135" cy="163" r="3.5" />
                  <circle cx={74 + (j % 4)} cy="127" r="3" />
                </g>
              )}
              {calico && <ellipse cx={140 - j} cy={156 + (j % 2)} rx="19" ry="24" fill={p.accent} opacity=".8" />}
              {tuxedo && (
                <path d="M100 118 C118 118 124 140 122 168 C110 176 90 176 78 168 C76 140 82 118 100 118 Z" fill="#fff" opacity=".92" />
              )}
              {traces && (
                <path
                  d={`M${70 + j} 130 H${90 + j} V150 H${110 + j} V135 H${130 + j} M${75 + j} 160 H${125 + j}`}
                  fill="none" stroke={p.accent} strokeWidth="3.2" strokeLinecap="square" opacity=".5"
                />
              )}
              {hearts && (
                <g fill={p.accent} opacity=".55" transform={`translate(${j - 3},0)`}>
                  <path d="M72 140 C72 134 80 134 80 140 C80 134 88 134 88 140 C88 148 80 154 80 154 C80 154 72 148 72 140 Z" />
                  <path d="M118 150 C118 145 124 145 124 150 C124 145 130 145 130 150 C130 156 124 160 124 160 C124 160 118 156 118 150 Z" />
                </g>
              )}
              {diamonds && (
                <g fill={p.accent} opacity=".5" transform={`translate(${(j % 3) - 1},${j % 2})`}>
                  <path d="M70 138 L78 148 L70 158 L62 148 Z" />
                  <path d="M130 142 L136 150 L130 158 L124 150 Z" />
                  <path d="M100 128 L106 136 L100 144 L94 136 Z" />
                </g>
              )}
              <path d={shape.belly} fill={tuxedo ? '#fff' : p.belly} />
            </g>

            {/* 前爪 */}
            {!loaf && (
              <>
                <ellipse cx="87" cy={shape.frontY} rx={shape.frontRx} ry="8" fill={p.body} stroke={o} strokeWidth="3" />
                <ellipse cx="113" cy={shape.frontY} rx={shape.frontRx} ry="8" fill={p.body} stroke={o} strokeWidth="3" />
                {p.pawPads && (
                  <g fill={p.cheek} opacity=".7">
                    <ellipse cx="87" cy={shape.frontY + 1} rx="4" ry="2.6" />
                    <ellipse cx="113" cy={shape.frontY + 1} rx="4" ry="2.6" />
                  </g>
                )}
                <path
                  d={`M82 ${shape.frontY - 1} v5 M87 ${shape.frontY - 1.5} v6 M92 ${shape.frontY - 1} v5 M108 ${shape.frontY - 1} v5 M113 ${shape.frontY - 1.5} v6 M118 ${shape.frontY - 1} v5`}
                  stroke={o} strokeWidth="1.8" strokeLinecap="round" opacity=".45"
                />
              </>
            )}

            {/* 项圈 / 围巾挂在脖子 */}
            {p.accessory === 1 && (
              <path d="M78 118 C90 128 110 128 122 118" fill="none" stroke={p.accent} strokeWidth="5" strokeLinecap="round" />
            )}
            {p.accessory === 5 && (
              <>
                <path d="M78 118 C90 128 110 128 122 118" fill="none" stroke={p.accent} strokeWidth="4" strokeLinecap="round" />
                <circle cx="100" cy="130" r="6" fill="#ffd24d" stroke={o} strokeWidth="2" />
              </>
            )}
            {p.accessory === 6 && (
              <path d="M72 116 C88 132 112 132 128 116 L124 138 C110 146 90 146 76 138 Z" fill={p.accent} stroke={o} strokeWidth="2.4" strokeLinejoin="round" opacity=".9" />
            )}
          </g>

          {/* 头 */}
          <g className="pet-head" style={{ transformOrigin: '100px 116px' }}>
            <Ear side="l" style={p.ear} body={p.body} belly={p.belly} accent={p.accent} outline={o} calico={calico} />
            <Ear side="r" style={p.ear} body={p.body} belly={p.belly} accent={p.accent} outline={o} calico={calico} />

            <path d={shape.head} fill={p.body} stroke={o} strokeWidth="3.2" strokeLinejoin="round" />

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
              {mask && (
                <ellipse cx="100" cy="72" rx="48" ry="28" fill={p.accent} opacity=".55" />
              )}
              {traces && (
                <path
                  d="M70 50 H130 M100 42 V70 M55 90 H80 M120 90 H145"
                  fill="none" stroke={p.accent} strokeWidth="3" strokeLinecap="square" opacity=".45"
                />
              )}
              {hearts && (
                <g fill={p.accent} opacity=".5">
                  <path d="M88 48 C88 44 94 44 94 48 C94 44 100 44 100 48 C100 54 94 58 94 58 C94 58 88 54 88 48 Z" />
                  <path d="M108 56 C108 53 112 53 112 56 C112 53 116 53 116 56 C116 60 112 63 112 63 C112 63 108 60 108 56 Z" />
                </g>
              )}
              {diamonds && (
                <g fill={p.accent} opacity=".5">
                  <path d="M100 44 L106 52 L100 60 L94 52 Z" />
                  <path d="M70 70 L74 76 L70 82 L66 76 Z" />
                  <path d="M130 70 L134 76 L130 82 L126 76 Z" />
                </g>
              )}
              {/* 口鼻白区，深色毛也看得清表情 */}
              <ellipse cx="100" cy="102" rx="20" ry="13" fill={p.belly} />
              {p.freckles && (
                <g fill={o} opacity=".35">
                  <circle cx="78" cy="98" r="1.6" />
                  <circle cx="84" cy="102" r="1.3" />
                  <circle cx="116" cy="98" r="1.6" />
                  <circle cx="122" cy="102" r="1.3" />
                  <circle cx="90" cy="94" r="1.1" />
                  <circle cx="110" cy="94" r="1.1" />
                </g>
              )}
            </g>

            {/* 头顶毛 */}
            {p.tuft === 0 && (
              <path
                d="M88 41 L93 25 L100 35 L108 23 L112 41"
                fill={p.body} stroke={o} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"
              />
            )}
            {p.tuft === 2 && (
              <path
                d="M82 44 L86 22 L94 38 L100 18 L106 38 L114 20 L118 44"
                fill={p.body} stroke={o} strokeWidth="2.8" strokeLinejoin="round" strokeLinecap="round"
              />
            )}
            {p.tuft === 3 && (
              <path
                d="M94 42 L97 14 L100 36 L103 12 L106 42"
                fill={p.accent} stroke={o} strokeWidth="2.8" strokeLinejoin="round" strokeLinecap="round"
              />
            )}
            {p.tuft === 4 && (
              <path
                d="M90 40 C92 22 98 28 100 38 C102 28 108 22 110 40"
                fill="none" stroke={p.accent} strokeWidth="3.2" strokeLinecap="round"
              />
            )}

            {/* 蝴蝶结 / 天线 */}
            {p.accessory === 2 && (
              <g transform="translate(100,28)">
                <path d="M-14 0 C-18 -10 -4 -12 0 -2 C4 -12 18 -10 14 0 C8 4 4 4 0 2 C-4 4 -8 4 -14 0 Z" fill={p.accent} stroke={o} strokeWidth="2.2" strokeLinejoin="round" />
                <circle r="3.5" fill={p.belly} stroke={o} strokeWidth="1.8" />
              </g>
            )}
            {p.accessory === 3 && (
              <g>
                <path d="M100 34 V12" stroke={o} strokeWidth="2.6" strokeLinecap="round" />
                <rect x="92" y="4" width="16" height="10" rx="2" fill={p.accent} stroke={o} strokeWidth="2" />
                <circle cx="100" cy="9" r="2.2" fill="#fff" opacity=".85" />
              </g>
            )}

            {/* 腮红 */}
            <ellipse cx="59" cy="97" rx={cheekR} ry="5.5" fill={p.cheek} opacity={p.blush} />
            <ellipse cx="141" cy="97" rx={cheekR} ry="5.5" fill={p.cheek} opacity={p.blush} />

            {/* 眼睛 */}
            {sleepy ? (
              <g fill="none" stroke={o} strokeWidth="3.4" strokeLinecap="round">
                <path d="M58 76 Q74 88 90 76" />
                <path d="M110 76 Q126 88 142 76" />
              </g>
            ) : (
              <>
                {EYES.map((e, i) => {
                  const ix = (p.eyeShape === 3 ? e.ix + (i === 0 ? -2 : 2) : e.ix) + p.gaze;
                  return (
                    <g key={e.cls} className={e.cls} style={{ transformOrigin: `${e.cx}px 74px` }}>
                      <circle cx={e.cx} cy="74" r="20" fill="#fff" stroke={o} strokeWidth="3.2" />
                      <g className="pet-pupil">
                        <circle cx={ix} cy="77" r="12.5" fill={p.eye} stroke={o} strokeWidth="1" strokeOpacity=".3" />
                        <circle cx={ix} cy="77" r="8" fill="#2e2230" />
                        <circle cx={ix - 4.5} cy="71.5" r="4.4" fill="#fff" />
                        <circle cx={ix + 4} cy="81.5" r="1.9" fill="#fff" opacity=".85" />
                      </g>
                      {p.eyeShape === 2 && (
                        <path
                          d={`M${e.cx - 19.1} 68 A20 20 0 0 1 ${e.cx + 19.1} 68 Z`}
                          fill={p.body} stroke={o} strokeWidth="3" strokeLinejoin="round"
                        />
                      )}
                    </g>
                  );
                })}
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
            <path d="M94 90 Q100 87 106 90 Q104 96 100 97 Q96 96 94 90 Z" fill={p.nose} stroke={o} strokeWidth="1.6" strokeLinejoin="round" />

            {/* 圆眼镜 */}
            {p.accessory === 4 && (
              <g fill="none" stroke={o} strokeWidth="2.4">
                <circle cx="74" cy="74" r="16" />
                <circle cx="126" cy="74" r="16" />
                <path d="M90 74 H110" />
              </g>
            )}

            {/* 胡须 */}
            <g fill="none" stroke={o} strokeWidth={p.whisker === 0 ? 1.3 : 1.6} strokeLinecap="round" opacity=".75">
              <g className="pet-whisk-l" style={{ transformOrigin: '70px 100px' }}>
                <path d={p.whisker === 2 ? 'M70 98 Q48 92 26 96' : p.whisker === 0 ? 'M70 98 Q56 96 44 98' : 'M70 98 Q52 94 34 97'} />
                <path d={p.whisker === 2 ? 'M70 103 Q50 108 30 118' : p.whisker === 0 ? 'M70 103 Q58 104 48 108' : 'M70 103 Q54 105 38 112'} />
                {p.whisker === 2 && <path d="M70 100 Q50 100 28 106" />}
              </g>
              <g className="pet-whisk-r" style={{ transformOrigin: '130px 100px' }}>
                <path d={p.whisker === 2 ? 'M130 98 Q152 92 174 96' : p.whisker === 0 ? 'M130 98 Q144 96 156 98' : 'M130 98 Q148 94 166 97'} />
                <path d={p.whisker === 2 ? 'M130 103 Q150 108 170 118' : p.whisker === 0 ? 'M130 103 Q142 104 152 108' : 'M130 103 Q146 105 162 112'} />
                {p.whisker === 2 && <path d="M130 100 Q150 100 172 106" />}
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

          {/* 限定：额外小闪光 */}
          {rarity === 2 && (
            <g fill="#ffd24d" opacity=".85">
              <circle cx="168" cy="48" r="2.2" />
              <circle cx="34" cy="70" r="1.6" />
              <circle cx="160" cy="120" r="1.8" />
            </g>
          )}
        </g>
      </svg>
    </div>
  );
}
