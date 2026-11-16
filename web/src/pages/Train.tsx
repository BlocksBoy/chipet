import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactElement, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight, Cable, ChevronLeft, ChevronRight, Cpu, Egg, Fish, Flag, RotateCcw, ScrollText, Shield, Swords, Trophy, WandSparkles, X, Zap, type LucideProps,
} from 'lucide-react';
import { useAccount } from 'wagmi';
import { fetchRivals } from '../api.ts';
import { Button, Empty, ErrBar, PAGE, PageHeader, Panel, Tag, cn } from '../components/ui.tsx';
import { Link, go, useRoute } from '../router.tsx';
import { PetAvatar } from '../chipet/PetAvatar.tsx';
import { BugMon } from '../chipet/BugMon.tsx';
import { ChipStrip, PowerPips } from '../chipet/ChipStrip.tsx';
import {
  ArenaFx, Banner, BEAT, Confetti, DizzyStars, MOVE_FX, OUTLINE, Twinkles, type Strike,
} from '../chipet/BattleFx.tsx';
import { fuse, heartByKey, heartOf, type Fusion, type Heart } from '../chipet/heart.ts';
import {
  aiPick, clash, favOf, fusionClash, maxHpOf, MOOD_HP, MOVES, roll, rollAll, wildHpOf, WILDS, xpFor,
  type Clash, type Move, type Roll, type Wild,
} from '../chipet/battle.ts';
import { phenotypeOf } from '../chipet/phenotype.ts';
import { BATTLE_ENERGY, isChainPet, localChipet, xpNeed, type LocalPet } from '../chipet/store.ts';
import { isOnchainPetKey, rivalFromArchive, social, type PublicPet } from '../chipet/social.ts';
import { both, plural, tr, txt, useLang, useT, type Txt } from '../i18n.ts';

const MOVE_ICON: ComponentType<LucideProps>[] = [Swords, Shield, WandSparkles];
/** 合体技在招式位里的编号 */
const FUSION = 3;
/** 一回合揭晓动画的时长：跟 BattleFx 的节拍对齐，再留一点余量看清伤害数字 */
const REVEAL_MS = Math.round(BEAT.total * 1000) + 200;
/** 切磋对手每页条数（超过后分页，交互对齐广场动态） */
const SPAR_PAGE = 12;

/** 页码窗口：当前页附近若干号，两端保留首尾 */
function pageWindow(current: number, total: number, radius = 2): (number | '…')[] {
  if (total <= 1) return total === 1 ? [1] : [];
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set<number>([1, total]);
  for (let i = current - radius; i <= current + radius; i++) {
    if (i >= 1 && i <= total) set.add(i);
  }
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const n = sorted[i]!;
    if (i > 0 && n - sorted[i - 1]! > 1) out.push('…');
    out.push(n);
  }
  return out;
}

/** 结算弹框：冲击波 + 星屑 + 标题砸入；胜利再加金光与彩带 */
function BattleResultModal({
  end, petName, canRematch, seed, onRematch, onPick, onVisit, onClose,
}: {
  end: { result: 'win' | 'lose' | 'draw'; xp: number; ups: number; fish: number; level: number };
  petName: string;
  canRematch: boolean;
  seed: number;
  onRematch: () => void;
  onPick: () => void;
  onVisit: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const win = end.result === 'win';
  const lose = end.result === 'lose';
  const accent = win ? '#e8ae14' : lose ? '#7a8b84' : '#2aa6b8';
  const accentHi = win ? '#ffe78f' : lose ? '#c5d0cb' : '#a5e8f1';
  const title = win
    ? t(`「${petName}」赢了！`, `${petName} wins!`)
    : lose
      ? t('这次没打过…', 'Not this time…')
      : t('打成平手', "It's a draw");
  const headline = win ? t('胜利', 'VICTORY') : lose ? t('落败', 'DEFEAT') : t('平手', 'DRAW');
  const tone = win ? 'text-gold-dim' : lose ? 'text-mute' : 'text-si';
  const badge = win ? 'bg-gold/20' : lose ? 'bg-panel-2' : 'bg-si/15';

  const bits = useMemo(() => {
    let a = (seed ^ 0x9e3779b9) | 0;
    const rnd = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return Array.from({ length: win ? 28 : 16 }, (_, i) => {
      const ang = (Math.PI * 2 * i) / (win ? 28 : 16) + rnd() * 0.35;
      const dist = 70 + rnd() * (win ? 110 : 70);
      return {
        id: i,
        kind: i % 5 === 0 ? 'star' : i % 3 === 0 ? 'spark' : 'dot',
        c: [accent, accentHi, '#ffffff', '#e07a45', '#2a9d8f'][i % 5]!,
        s: 3 + rnd() * (win ? 10 : 6),
        dx: Math.cos(ang) * dist,
        dy: Math.sin(ang) * dist * 0.85 - (win ? 24 : 10),
        rot: (rnd() - 0.5) * 420,
        d: rnd() * 0.18,
      };
    });
  }, [seed, win, accent, accentHi]);

  const [xpShown, setXpShown] = useState(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start - 280) / 700);
      setXpShown(p <= 0 ? 0 : Math.round(end.xp * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      cancelAnimationFrame(raf);
    };
  }, [onClose, end.xp]);

  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center overflow-hidden p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.28 }}
      onClick={onClose}
    >
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-[#1a2e28]/45 backdrop-blur-[6px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(circle at 50% 42%, ${accent}55, transparent 42%)` }}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: [0, 1, 0.35], scale: [0.6, 1.15, 1.4] }}
        transition={{ duration: 0.9, times: [0, 0.35, 1], ease: 'easeOut' }}
      />
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          aria-hidden
          className="pointer-events-none absolute top-[42%] left-1/2 size-[min(70vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
          style={{ borderColor: accent }}
          initial={{ opacity: 0.85, scale: 0.15 }}
          animate={{ opacity: 0, scale: 1.55 + i * 0.35 }}
          transition={{ duration: 0.85 + i * 0.12, delay: 0.04 * i, ease: 'easeOut' }}
        />
      ))}

      <motion.div
        role="dialog"
        aria-modal
        aria-labelledby="battle-result-title"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'relative w-full max-w-[420px] overflow-hidden rounded-[1.75rem] border bg-panel/95 px-6 pt-8 pb-5 shadow-2xl',
          win ? 'border-gold/50 shadow-gold/20' : lose ? 'border-line shadow-si/15' : 'border-si/40 shadow-si/20',
        )}
        initial={{ opacity: 0, scale: 0.55, y: 48, rotate: -4 }}
        animate={{ opacity: 1, scale: [0.55, 1.06, 1], y: [48, -8, 0], rotate: [-4, 2, 0] }}
        exit={{ opacity: 0, scale: 0.88, y: 18 }}
        transition={{ duration: 0.55, times: [0, 0.7, 1], ease: 'easeOut' }}
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          {win && (
            <>
              <Confetti seed={seed ^ 0x51} />
              <motion.div
                className="absolute top-1/2 left-1/2 h-[140%] w-[140%] -translate-x-1/2 -translate-y-1/2"
                style={{
                  background: `conic-gradient(from 0deg, transparent 0deg, ${accent}33 18deg, transparent 36deg, transparent 72deg, ${accentHi}28 90deg, transparent 108deg)`,
                }}
                initial={{ opacity: 0, rotate: -30 }}
                animate={{ opacity: [0, 0.9, 0.55], rotate: 360 }}
                transition={{ opacity: { duration: 0.6 }, rotate: { duration: 14, ease: 'linear', repeat: Infinity } }}
              />
            </>
          )}
          {!win && (
            <motion.div
              className="absolute inset-0"
              style={{ background: `radial-gradient(circle at 50% 30%, ${accent}22, transparent 60%)` }}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0.5] }}
              transition={{ duration: 0.8 }}
            />
          )}
          {bits.map((b) => (
            <motion.i
              key={b.id}
              className={cn('absolute top-[38%] left-1/2 block', b.kind === 'star' ? 'font-display leading-none font-bold' : 'rounded-full')}
              style={b.kind === 'star'
                ? { color: b.c, fontSize: b.s * 1.5, textShadow: `0 0 10px ${b.c}`, marginLeft: -b.s / 2, marginTop: -b.s / 2 }
                : b.kind === 'spark'
                  ? { width: b.s * 2.2, height: 2, background: `linear-gradient(90deg, transparent, ${b.c}, transparent)`, boxShadow: `0 0 8px ${b.c}`, marginLeft: -b.s, marginTop: -1 }
                  : { width: b.s, height: b.s, background: b.c, boxShadow: `0 0 8px ${b.c}`, marginLeft: -b.s / 2, marginTop: -b.s / 2 }}
              initial={{ opacity: 1, x: 0, y: 0, scale: 0.3, rotate: 0 }}
              animate={{ opacity: 0, x: b.dx, y: b.dy, scale: b.kind === 'star' ? 1.35 : 1, rotate: b.rot }}
              transition={{ duration: win ? 0.95 : 0.7, delay: 0.12 + b.d, ease: 'easeOut' }}
            >
              {b.kind === 'star' ? '✦' : null}
            </motion.i>
          ))}
          {[0, 1].map((i) => (
            <motion.span
              key={`ring-${i}`}
              className="absolute top-[36%] left-1/2 size-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
              style={{ borderColor: accent }}
              initial={{ opacity: 0.9, scale: 0.2 }}
              animate={{ opacity: 0, scale: 2.8 + i * 0.6 }}
              transition={{ duration: 0.75, delay: 0.08 + i * 0.08, ease: 'easeOut' }}
            />
          ))}
        </div>

        <button
          type="button"
          aria-label={t('关闭', 'Close')}
          onClick={onClose}
          className="absolute top-3 right-3 z-10 rounded-lg p-1.5 text-faint transition-colors hover:bg-panel-2 hover:text-ink"
        >
          <X className="size-4" />
        </button>

        <div className="relative flex flex-col items-center text-center">
          <motion.p
            className={cn('font-display text-[11px] font-bold tracking-[0.28em] uppercase', tone)}
            initial={{ opacity: 0, letterSpacing: '0.6em', y: -8 }}
            animate={{ opacity: 1, letterSpacing: '0.28em', y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
          >
            {t('决斗结果', 'DUEL RESULT')}
          </motion.p>

          <motion.span
            className={cn('relative mt-3 grid size-[4.5rem] place-items-center rounded-[1.35rem]', badge, tone)}
            initial={{ scale: 0.2, rotate: -28, y: 20 }}
            animate={{ scale: [0.2, 1.22, 1], rotate: [-28, 12, 0], y: [20, -6, 0] }}
            transition={{ duration: 0.65, times: [0, 0.65, 1], ease: 'easeOut', delay: 0.1 }}
          >
            <motion.span
              aria-hidden
              className="absolute -inset-1 rounded-[1.45rem]"
              animate={{
                boxShadow: [
                  `0 0 0 0 ${accent}00`,
                  `0 0 0 14px ${accent}00`,
                  `0 0 28px 4px ${accent}55`,
                  `0 0 0 0 ${accent}00`,
                ],
              }}
              transition={{ duration: 1.6, delay: 0.25, repeat: Infinity, repeatDelay: 0.8 }}
            />
            <motion.span
              animate={win ? { y: [0, -3, 0], rotate: [0, -6, 6, 0] } : { y: [0, 1, 0] }}
              transition={{ duration: win ? 1.8 : 2.4, repeat: Infinity, ease: 'easeInOut' }}
            >
              {win ? <Trophy className="relative size-9" /> : lose ? <Flag className="relative size-8" /> : <Swords className="relative size-8" />}
            </motion.span>
          </motion.span>

          <motion.h2
            className={cn('mt-3 font-display text-4xl leading-none font-black italic sm:text-5xl', OUTLINE)}
            style={{ color: accent }}
            initial={{ opacity: 0, scale: 2.4, rotate: -12 }}
            animate={{ opacity: [0, 1, 1], scale: [2.4, 0.92, 1], rotate: [-12, 4, 0] }}
            transition={{ duration: 0.55, delay: 0.22, times: [0, 0.55, 1], ease: 'easeOut' }}
          >
            {headline}
          </motion.h2>

          <motion.h3
            id="battle-result-title"
            className="mt-2 text-lg font-bold text-balance text-ink sm:text-xl"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.38, duration: 0.3 }}
          >
            {title}
          </motion.h3>

          <motion.div
            className="mt-4 flex flex-wrap justify-center gap-1.5"
            initial="hidden"
            animate="show"
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.08, delayChildren: 0.42 } },
            }}
          >
            {([
              <Tag key="xp" tone="si">{t('经验', 'XP')} +{xpShown}</Tag>,
              end.ups > 0 ? <Tag key="lv" tone="gold">{t(`升级到 Lv.${end.level}，体力更厚了`, `Leveled up to Lv.${end.level}: more HP`)}</Tag> : null,
              end.fish > 0 ? <Tag key="fish" tone="copper" icon={Fish}>{t('今日首胜 · 鱼干 +1', 'First win today · +1 fish treat')}</Tag> : null,
              lose ? <Tag key="tip" tone="faint">{t('喂饱、通通电，再来', 'Feed it, power it up, try again')}</Tag> : null,
            ].filter(Boolean) as ReactElement[]).map((node) => (
              <motion.span
                key={node.key}
                variants={{
                  hidden: { opacity: 0, y: 14, scale: 0.85 },
                  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 420, damping: 22 } },
                }}
              >
                {node}
              </motion.span>
            ))}
          </motion.div>

          <motion.div
            className="mt-6 flex w-full flex-wrap justify-center gap-2"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55, duration: 0.3 }}
          >
            <Button icon={RotateCcw} disabled={!canRematch} onClick={onRematch}>
              {canRematch ? t('再来一场', 'Rematch') : t('能量不够了', 'Out of energy')}
            </Button>
            <Button variant="ghost" onClick={onPick}>{t('换个对手', 'Pick another opponent')}</Button>
            <Button variant="ghost" icon={ArrowRight} onClick={onVisit}>{t('去看望它', 'Visit it')}</Button>
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/** 点击处的光电爆发：光晕 + 电弧环 + 火花 */
function PhotoBurst({ x, y, color, hi, onDone }: { x: number; y: number; color: string; hi: string; onDone: () => void }) {
  const sparks = useMemo(() => Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI * 2 * i) / 10 + (i % 2 ? 0.12 : 0);
    const r = i % 2 ? 28 : 42;
    return { a, r, s: 1.5 + (i % 3) };
  }), []);
  return (
    <span className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-[inherit]" aria-hidden>
      <motion.span
        className="absolute size-28 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ left: x, top: y, background: `radial-gradient(circle, ${hi}dd 0%, ${color}66 38%, transparent 72%)` }}
        initial={{ opacity: 1, scale: 0.15 }}
        animate={{ opacity: 0, scale: 2.4 }}
        transition={{ duration: 0.42, ease: 'easeOut' }}
        onAnimationComplete={onDone}
      />
      <motion.span
        className="absolute size-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
        style={{ left: x, top: y, borderColor: hi, boxShadow: `0 0 14px ${color}, inset 0 0 8px ${hi}` }}
        initial={{ opacity: 1, scale: 0.2 }}
        animate={{ opacity: 0, scale: 3 }}
        transition={{ duration: 0.38, ease: 'easeOut' }}
      />
      <motion.span
        className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ left: x, top: y, background: hi, boxShadow: `0 0 10px 3px ${color}` }}
        initial={{ opacity: 1, scale: 1 }}
        animate={{ opacity: 0, scale: 0.2 }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
      />
      {sparks.map((s, i) => (
        <motion.i
          key={i}
          className="absolute block rounded-full"
          style={{
            left: x,
            top: y,
            width: s.s,
            height: s.s,
            marginLeft: -s.s / 2,
            marginTop: -s.s / 2,
            background: i % 2 ? hi : color,
            boxShadow: `0 0 6px ${hi}`,
          }}
          initial={{ opacity: 1, x: 0, y: 0 }}
          animate={{ opacity: 0, x: Math.cos(s.a) * s.r, y: Math.sin(s.a) * s.r }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      ))}
    </span>
  );
}

function strikeOf(kind: 0 | 1 | 2 | 3, roll: Roll, dmg: number, edge: 1 | 0 | -1): Strike {
  return { kind, power: roll.power, dmg, edge, bits: roll.outBits };
}

interface Opp {
  kind: 'wild' | 'npc';
  key: string;
  name: string;
  level: number;
  heart: Heart;
  fav: Move;
  maxHp: number;
  bg: string;
  wild?: Wild;
  pet?: PublicPet;
}

interface Reveal {
  n: number;
  myMove: Move | typeof FUSION;
  opMove: Move;
  myRoll: Roll;
  opRoll: Roll;
  c: Clash;
}

interface Fight {
  opp: Opp;
  petId: number;
  petName: string;
  heart: Heart;
  myMax: number;
  seed: number;
  round: number;
  myHp: number;
  opHp: number;
  myRolls: [Roll, Roll, Roll];
  opRolls: [Roll, Roll, Roll];
  fusion?: { partner: PublicPet; f: Fusion; roll: Roll; used: boolean };
  reveal?: Reveal;
  busy: boolean;
  /** 战报存成函数，显示时才取文案：打到一半切换语言，旧战报也跟着变 */
  log: { n: number; say: () => string }[];
  end?: { result: 'win' | 'lose' | 'draw'; xp: number; ups: number; fish: number; level: number };
}

function wildOpp(w: Wild): Opp {
  return { kind: 'wild', key: `wild:${w.id}`, get name() { return w.name; }, level: w.level, heart: heartByKey(w.heartKey), fav: w.fav, maxHp: wildHpOf(w.level), bg: w.bg, wild: w };
}

function npcOpp(p: PublicPet): Opp {
  const ph = phenotypeOf(p.cpu, p.circuitId, p.rarity);
  return { kind: 'npc', key: p.key, get name() { return p.name; }, level: p.level, heart: heartOf(p.circuitId, p.rarity), fav: favOf(ph.speciesId), maxHp: maxHpOf(p.level, p.rarity, p.mood), bg: ph.bg, pet: p };
}

function useWide() {
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 640px)').matches);
  useEffect(() => {
    const m = window.matchMedia('(min-width: 640px)');
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

function HeartLine({ heart, className }: { heart: Heart; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 font-mono text-[11px] text-mute', className)}>
      <Cpu className="size-3 text-copper" />
      {heart.name} · {heart.gates} {tr('门', 'gates')} · {heart.style}
    </span>
  );
}

/** 对战场地正中的 VS 徽章：像一枚小芯片，两边各有铜 / 硅色的针脚。 */
function VsBadge({ busy }: { busy: boolean }) {
  return (
    <motion.div
      className="pointer-events-none absolute top-1/2 left-1/2 z-20 -translate-x-1/2 -translate-y-1/2"
      animate={busy
        ? { scale: [1, 1.12, 0.94, 1.18, 1], rotate: [0, -7, 7, -3, 0] }
        : { scale: [1, 1.04, 1], rotate: 0 }}
      transition={busy
        ? { duration: BEAT.charge + BEAT.fly, ease: 'easeOut' }
        : { duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
      aria-hidden
    >
      {/* 外圈柔光 */}
      <span
        className="absolute top-1/2 left-1/2 size-20 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-80 blur-md"
        style={{ background: 'radial-gradient(circle, rgb(224 122 69 / 0.35) 0%, rgb(42 157 143 / 0.22) 45%, transparent 70%)' }}
      />
      <svg viewBox="0 0 88 88" width="72" height="72" className="relative drop-shadow-[0_8px_18px_rgb(26_46_40/0.22)]">
        <defs>
          <linearGradient id="vs-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f08b55" />
            <stop offset="48%" stopColor="#fff7ef" />
            <stop offset="100%" stopColor="#2a9d8f" />
          </linearGradient>
          <linearGradient id="vs-core" x1="0.2" y1="0" x2="0.8" y2="1">
            <stop offset="0%" stopColor="#243832" />
            <stop offset="100%" stopColor="#15241f" />
          </linearGradient>
          <linearGradient id="vs-face" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ffb08a" />
            <stop offset="55%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#7ed9cd" />
          </linearGradient>
        </defs>

        {/* 左右走线针脚 */}
        <g strokeWidth="2.2" strokeLinecap="round">
          <path d="M6 36 H16 M6 44 H16 M6 52 H16" stroke="#e07a45" />
          <path d="M72 36 H82 M72 44 H82 M72 52 H82" stroke="#2a9d8f" />
          <circle cx="6" cy="36" r="2.2" fill="#e07a45" />
          <circle cx="6" cy="44" r="2.2" fill="#e07a45" />
          <circle cx="6" cy="52" r="2.2" fill="#e07a45" />
          <circle cx="82" cy="36" r="2.2" fill="#2a9d8f" />
          <circle cx="82" cy="44" r="2.2" fill="#2a9d8f" />
          <circle cx="82" cy="52" r="2.2" fill="#2a9d8f" />
        </g>

        {/* 外环 + 芯片本体 */}
        <circle cx="44" cy="44" r="30" fill="url(#vs-ring)" />
        <circle cx="44" cy="44" r="25.5" fill="#f7faf8" />
        <circle cx="44" cy="44" r="22" fill="url(#vs-core)" stroke="#1a2e28" strokeWidth="1.2" />

        {/* 内圈刻度：像封装上的定位点 */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
          const a = (deg * Math.PI) / 180;
          const x1 = 44 + Math.cos(a) * 18.2;
          const y1 = 44 + Math.sin(a) * 18.2;
          const x2 = 44 + Math.cos(a) * 20.6;
          const y2 = 44 + Math.sin(a) * 20.6;
          return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke={deg % 90 === 0 ? '#e07a45' : '#3d5a52'} strokeWidth="1.6" strokeLinecap="round" />;
        })}

        {/* 高光 */}
        <path d="M30 30 A16 16 0 0 1 56 28" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" opacity="0.35" />

        <text
          x="44" y="49"
          textAnchor="middle"
          fontFamily="ui-rounded, system-ui, sans-serif"
          fontSize="18"
          fontWeight="800"
          letterSpacing="1.5"
          fill="url(#vs-face)"
        >
          VS
        </text>
      </svg>

      {/* 出手时两颗信号点沿针脚闪一下 */}
      {busy && (
        <>
          <motion.i
            className="absolute top-1/2 left-1 size-2 -translate-y-1/2 rounded-full bg-copper-hi"
            style={{ boxShadow: '0 0 10px 3px rgb(224 122 69 / 0.7)' }}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: [0, 1, 0], scale: [0.4, 1.2, 0.6] }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
          />
          <motion.i
            className="absolute top-1/2 right-1 size-2 -translate-y-1/2 rounded-full bg-si"
            style={{ boxShadow: '0 0 10px 3px rgb(42 157 143 / 0.7)' }}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: [0, 1, 0], scale: [0.4, 1.2, 0.6] }}
            transition={{ duration: 0.55, delay: 0.08, ease: 'easeOut' }}
          />
        </>
      )}
    </motion.div>
  );
}

function FighterCard({ side, name, level, hp, max, bg, reveal, dmg, move, power, edge, down, glow, children }: {
  side: 'me' | 'op';
  name: string;
  level: number;
  hp: number;
  max: number;
  bg: string;
  reveal?: number;
  dmg: number;
  move?: string;
  power?: number;
  /** 这一方本回合是否占了克制的上风 */
  edge?: boolean;
  /** 被打趴：头顶转星星 */
  down?: boolean;
  /** 赢家：身边闪星星 */
  glow?: boolean;
  children: ReactNode;
}) {
  const [bar, setBar] = useState(hp);
  const [hitFlash, setHitFlash] = useState(false);
  useEffect(() => {
    if (reveal === undefined) {
      setBar(hp);
      return;
    }
    const t = window.setTimeout(() => {
      setBar(hp);
      if (dmg > 0) {
        setHitFlash(true);
        window.setTimeout(() => setHitFlash(false), 480);
      }
    }, Math.round(BEAT.hit * 1000));
    return () => window.clearTimeout(t);
  }, [hp, reveal, dmg]);

  const pct = Math.max(0, Math.round((bar / max) * 100));
  const lunge = side === 'me' ? 30 : -30;
  const hitAt = BEAT.hit / BEAT.total;
  const chargeAt = BEAT.charge / BEAT.total;
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[1.75rem] px-3 pt-3 pb-2 sm:px-4 transition-[filter] duration-500',
        down && 'grayscale-[0.35]',
      )}
      style={{ backgroundColor: bg }}
    >
      <div className="pointer-events-none absolute inset-0 fight-stage-grid opacity-50" />
      <div className="relative flex items-baseline justify-between gap-2">
        <span className="truncate font-display font-bold text-ink">{name}</span>
        <span className="shrink-0 font-mono text-[11px] text-mute">Lv.{level}</span>
      </div>
      <div className="relative mt-1.5 flex items-center gap-2">
        <div className="h-3.5 flex-1 overflow-hidden rounded-full bg-white/70 ring-1 ring-black/5">
          {/* 受伤时底下留一截旧血，被上面的真血条盖住，制造「削血」感；hp 已是扣完后的值 */}
          <div className="relative h-full w-full">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-danger/35"
              style={{ width: `${Math.max(pct, Math.round(((hp + (reveal !== undefined ? dmg : 0)) / max) * 100))}%` }}
            />
            <div
              className={cn('hp-chip absolute inset-y-0 left-0 rounded-full', pct > 35 ? 'bg-si' : 'bg-danger', hitFlash && 'is-hit')}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <span className="w-11 text-right font-mono text-[11px] tabular-nums text-ink">{bar}/{max}</span>
      </div>

      <div className="relative grid h-44 place-items-center sm:h-56">
        {glow && <Twinkles />}
        {down && <DizzyStars />}
        <motion.div
          key={reveal ?? 'idle'}
          className="relative"
          animate={reveal
            ? {
                x: dmg > 0
                  ? [0, 0, lunge, 0, -9, 9, -5, 0]
                  : [0, 0, lunge * 0.75, 0, 0, 0, 0, 0],
                y: dmg > 0 ? [0, 0, -4, 0, 2, -2, 1, 0] : [0, -6, -2, 0, 0, 0, 0, 0],
                scale: dmg > 0 ? [1, 1.04, 1.08, 1, 0.9, 1.06, 0.97, 1] : [1, 1.06, 1.1, 1, 1, 1, 1, 1],
                rotate: dmg > 0 ? [0, 0, side === 'me' ? -3 : 3, 0, side === 'me' ? 4 : -4, side === 'me' ? -3 : 3, 0, 0] : 0,
                filter: dmg > 0 ? ['brightness(1)', 'brightness(1.08)', 'brightness(1.12)', 'brightness(1)', 'brightness(1.35)', 'brightness(1)', 'brightness(1)', 'brightness(1)'] : 'brightness(1)',
              }
            : { x: 0, y: 0, scale: 1, rotate: 0 }}
          transition={{
            duration: BEAT.total * 0.9,
            times: [0, chargeAt * 0.7, chargeAt, hitAt, hitAt + 0.06, hitAt + 0.14, hitAt + 0.24, 1],
            ease: 'easeOut',
          }}
        >
          {children}
        </motion.div>

        {reveal !== undefined && move && (
          <motion.div
            key={`m${reveal}`}
            className={cn(
              'absolute top-1 z-20 flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold shadow-md',
              side === 'me' ? 'left-0' : 'right-0',
              edge ? 'bg-ink text-white' : 'bg-white/90 text-ink',
            )}
            initial={{ opacity: 0, scale: 0.5, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 18, delay: 0.05 }}
          >
            {move}
            {power !== undefined && <PowerPips power={power} />}
          </motion.div>
        )}

        {reveal !== undefined && dmg > 0 && (
          <>
            <motion.div
              key={`f${reveal}`}
              className="pointer-events-none absolute inset-0 rounded-3xl"
              style={{ background: 'radial-gradient(circle at 50% 55%, #fff 0%, transparent 65%)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.85, 0] }}
              transition={{ duration: 0.38, delay: BEAT.hit }}
            />
            <motion.span
              key={`d${reveal}`}
              className="pointer-events-none absolute top-1/3 z-20 font-display text-4xl font-black text-danger sm:text-5xl [text-shadow:0_2px_0_#fff,0_-2px_0_#fff,2px_0_0_#fff,-2px_0_0_#fff,0_6px_14px_rgb(26_46_40/0.25)]"
              initial={{ opacity: 0, y: 12, scale: 0.45 }}
              animate={{ opacity: [0, 1, 1, 0], y: [12, -8, -28, -52], scale: [0.45, 1.35, 1.05, 1], rotate: [0, -8, 4, 0] }}
              transition={{ duration: 1.15, delay: BEAT.hit, ease: 'easeOut' }}
            >
              -{dmg}
            </motion.span>
            {edge && (
              <motion.span
                key={`e${reveal}`}
                className="pointer-events-none absolute bottom-3 z-20 rounded-full bg-ink px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-white"
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: [0, 1, 1, 0], scale: [0.6, 1.1, 1, 1] }}
                transition={{ duration: 1.1, delay: BEAT.hit + 0.12 }}
              >
                {tr('克制!', 'COUNTER!')}
              </motion.span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const RULES: [ComponentType<LucideProps>, Txt, Txt][] = [
  [Cpu, both('电路出功率', 'Circuit power'), both(
    '每回合，随机位流进心脏电路，三招各算出一个功率——亮几盏灯就是几点。',
    'Each round random bits flow into the heart circuit and every move gets a power value: the more lamps light up, the harder it hits.',
  )],
  [Swords, both('你来选招', 'Pick a move'), both(
    '进攻克技巧、技巧克防御、防御克进攻。你看得见自己的功率，看不见对手要出什么。',
    'Attack beats Trick, Trick beats Defend, Defend beats Attack. You can see your own power, but not what your opponent will play.',
  )],
  [Zap, both('克制翻倍', 'Counters double'), both(
    '克制对手，伤害翻倍、对手减半。牵过线的线友还能帮你放一次合体技。',
    'Counter your opponent to deal double damage and take half. A linked wire pal can also fire one fusion move for you.',
  )],
];

export function Train() {
  const t = useT();
  const lang = useLang();
  const r = useRoute();
  const wide = useWide();
  const { address } = useAccount();
  const [tick, setTick] = useState(0);
  const [rivalPage, setRivalPage] = useState(1);
  const [err, setErr] = useState('');
  const [fight, setFight] = useState<Fight | null>(null);
  const [myId, setMyId] = useState<number | null>(() => (r.query.get('me') ? Number(r.query.get('me')) : null));
  const [partnerKey, setPartnerKey] = useState('');
  const timers = useRef<number[]>([]);
  /** 动画播放中再点一招时排队，揭晓结束后自动打出 */
  const pendingMove = useRef<Move | typeof FUSION | null>(null);
  const flashSeq = useRef(0);
  const [flashes, setFlashes] = useState<{ id: number; slot: number; x: number; y: number }[]>([]);
  const [showResult, setShowResult] = useState(false);

  /** 拉其他玩家的链上猫进切磋池；API 已按钱包排除，本地再挡同 id+同名的自家宠。 */
  useEffect(() => {
    let alive = true;
    fetchRivals({ exclude: address, limit: 24 }).then((items) => {
      if (!alive) return;
      const localChain = localChipet.list().filter(isChainPet);
      const pets = items.map(rivalFromArchive).filter((p) => {
        const petId = Number(p.key.split(':')[2]);
        return !localChain.some((lp) => lp.id === petId && lp.name === p.name);
      });
      social.setChainRivals(pets);
      setTick((n) => n + 1);
    });
    return () => { alive = false; };
  }, [address]);

  const sparkAt = (slot: number, e: { currentTarget: HTMLElement; clientX: number; clientY: number }) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const id = ++flashSeq.current;
    setFlashes((list) => [...list.slice(-8), { id, slot, x: e.clientX - rect.left, y: e.clientY - rect.top }]);
  };

  useEffect(() => {
    if (!fight?.end) {
      setShowResult(false);
      return;
    }
    const id = window.setTimeout(() => setShowResult(true), 720);
    return () => window.clearTimeout(id);
  }, [fight?.end]);

  const pets = useMemo(() => localChipet.list(), [tick]);
  const bonds = useMemo(() => social.bonds(), [tick]);
  const me: LocalPet | undefined = pets.find((p) => p.id === myId) ?? pets[0];
  const rivals = useMemo(() => social.sparTargets(), [tick]);
  const rivalPages = Math.max(1, Math.ceil(rivals.length / SPAR_PAGE));
  const rivalsPage = useMemo(() => {
    const page = Math.min(Math.max(1, rivalPage), rivalPages);
    const start = (page - 1) * SPAR_PAGE;
    return rivals.slice(start, start + SPAR_PAGE);
  }, [rivals, rivalPage, rivalPages]);
  const myHeart = me ? heartOf(me.circuitId, me.rarity) : undefined;
  const partner = bonds.find((b) => b.key === partnerKey) ?? bonds[0];

  useEffect(() => { setRivalPage(1); }, [me?.id]);
  useEffect(() => {
    setRivalPage((p) => Math.min(Math.max(1, p), rivalPages));
  }, [rivalPages]);

  const vs = r.query.get('vs');
  const challenge = useMemo(() => {
    if (!vs) return undefined;
    const p = social.getByRouteId(Number(vs));
    // 只能切磋别人的芯宠（链上玩家 / 邻居 / 访客）
    if (!p || p.mine) return undefined;
    return npcOpp(p);
  }, [vs, tick]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };

  const start = (opp: Opp) => {
    if (!me || !myHeart) return;
    try {
      localChipet.startBattle(me.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      return;
    }
    setErr('');
    pendingMove.current = null;
    const seed = Math.floor(Math.random() * 0xffffffff) >>> 0;
    const f = partner ? fuse(myHeart, heartOf(partner.circuitId, partner.rarity)) : undefined;
    const myMax = maxHpOf(me.level, me.rarity, me.mood);
    setFight({
      opp,
      petId: me.id,
      petName: me.name,
      heart: myHeart,
      myMax,
      seed,
      round: 1,
      myHp: myMax,
      opHp: opp.maxHp,
      myRolls: rollAll(myHeart, seed, 'me', 1),
      opRolls: rollAll(opp.heart, seed, 'op', 1),
      fusion: f && partner ? { partner, f, roll: roll(f, seed, 'fuse', 1, FUSION), used: false } : undefined,
      busy: false,
      log: [],
    });
    setTick((t) => t + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const finish = (f: Fight, forced?: 'lose') => {
    pendingMove.current = null;
    const result = forced ?? (f.myHp <= 0 && f.opHp <= 0 ? 'draw' : f.opHp <= 0 ? 'win' : 'lose');
    const xp = xpFor(result, f.opp.level);
    const { pet, ups } = localChipet.finishBattle(f.petId, result, xp);
    const { fish } = social.recordBattle({
      myId: f.petId,
      myName: f.petName,
      opKey: f.opp.kind === 'npc' ? f.opp.key : '',
      wildId: f.opp.wild?.id,
      result,
      rounds: f.round,
    });
    setFight({ ...f, busy: false, end: { result, xp, ups, fish, level: pet.level } });
    setTick((t) => t + 1);
  };

  const resolveMove = (f: Fight, move: Move | typeof FUSION): Fight | null => {
    if (f.end) return null;
    const opMove = aiPick(f.opRolls, f.opp.fav);
    const opRoll = f.opRolls[opMove];
    let myRoll: Roll;
    let c: Clash;
    let say: () => string;
    if (move === FUSION) {
      if (!f.fusion || f.fusion.used) return null;
      const { partner: pal, f: fused } = f.fusion;
      myRoll = f.fusion.roll;
      const hit = fusionClash(myRoll.power, opRoll.power);
      c = hit;
      say = () => tr(
        `合体技！和「${pal.name}」串成的 ${fused.gates} 门电路打出 ${hit.myDmg}，挨了 ${hit.opDmg}`,
        `Fusion move! The ${fused.gates}-gate circuit wired with ${pal.name} dealt ${hit.myDmg} and took ${hit.opDmg}`,
      );
    } else {
      myRoll = f.myRolls[move];
      const hit = clash({ move, power: myRoll.power }, { move: opMove, power: opRoll.power });
      c = hit;
      const a = MOVES[move]!;
      const b = MOVES[opMove]!;
      say = () => (hit.edge === 1
        ? tr(`你的${a.name}克制了对手的${b.name}：打出 ${hit.myDmg}，只挨 ${hit.opDmg}`, `Your ${a.name} countered their ${b.name}: dealt ${hit.myDmg}, took only ${hit.opDmg}`)
        : hit.edge === -1
          ? tr(`你的${a.name}被对手的${b.name}克制：只打出 ${hit.myDmg}，挨了 ${hit.opDmg}`, `Your ${a.name} got countered by their ${b.name}: dealt only ${hit.myDmg}, took ${hit.opDmg}`)
          : tr(`双方都出${a.name}，硬碰硬：打出 ${hit.myDmg}，挨了 ${hit.opDmg}`, `Both played ${a.name}, head-on: dealt ${hit.myDmg}, took ${hit.opDmg}`));
    }
    return {
      ...f,
      myHp: Math.max(0, f.myHp - c.opDmg),
      opHp: Math.max(0, f.opHp - c.myDmg),
      busy: true,
      reveal: { n: f.round, myMove: move, opMove, myRoll, opRoll, c },
      log: [{ n: f.round, say }, ...f.log],
      fusion: f.fusion && move === FUSION ? { ...f.fusion, used: true } : f.fusion,
    };
  };

  const advanceAfterReveal = (done: Fight) => {
    if (done.myHp <= 0 || done.opHp <= 0) {
      finish(done);
      return;
    }
    const round = done.round + 1;
    const advanced: Fight = {
      ...done,
      busy: false,
      round,
      myRolls: rollAll(done.heart, done.seed, 'me', round),
      opRolls: rollAll(done.opp.heart, done.seed, 'op', round),
      fusion: done.fusion && { ...done.fusion, roll: roll(done.fusion.f, done.seed, 'fuse', round, FUSION) },
    };
    const queued = pendingMove.current;
    pendingMove.current = null;
    if (queued !== null) {
      const next = resolveMove(advanced, queued);
      if (next) {
        setFight(next);
        later(() => advanceAfterReveal(next), REVEAL_MS);
        return;
      }
    }
    setFight(advanced);
  };

  const play = (move: Move | typeof FUSION) => {
    if (!fight || fight.end) return;
    if (fight.busy) {
      pendingMove.current = move;
      return;
    }
    const next = resolveMove(fight, move);
    if (!next) return;
    setFight(next);
    later(() => advanceAfterReveal(next), REVEAL_MS);
  };

  if (pets.length === 0) {
    return (
      <div className={cn(PAGE, 'max-w-[720px] py-16')}>
        <Panel>
          <Empty icon={Egg} title={t('先孵一只芯喵', 'Hatch a kitty first')} action={<Button onClick={() => go('/')}>{t('去敲蛋', 'Crack an egg')}</Button>}>
            {t('训练场里是电路对战：每只芯喵用自己的心脏电路出招。先回家园敲开一枚蛋吧。', 'The training ground is all circuit battles: every kitty fights with its own heart circuit. Head home and crack an egg first.')}
          </Empty>
        </Panel>
      </div>
    );
  }

  // ── 对战中 ─────────────────────────────────────────
  if (fight && me) {
    const { opp, reveal, end } = fight;
    const size = wide ? 190 : 130;
    const myPet = pets.find((p) => p.id === fight.petId) ?? me;
    const myPh = phenotypeOf(myPet.cpu, myPet.circuitId, myPet.rarity);
    const verdict = !reveal ? ''
      : reveal.myMove === FUSION ? t('合体技无视克制！', 'The fusion move ignores the triangle!')
        : reveal.c.edge === 1 ? t(`${MOVES[reveal.myMove]!.name}克${MOVES[reveal.opMove]!.name}，伤害翻倍！`, `${MOVES[reveal.myMove]!.name} beats ${MOVES[reveal.opMove]!.name}: double damage!`)
          : reveal.c.edge === -1 ? t(`被${MOVES[reveal.opMove]!.name}克制了…`, `Countered by ${MOVES[reveal.opMove]!.name}…`)
            : t('同招硬碰硬，比功率', 'Same move: raw power decides');
    const myKind = (reveal?.myMove === FUSION ? 3 : reveal?.myMove ?? 0) as 0 | 1 | 2 | 3;
    const banner = !reveal ? { text: '', color: '#000' }
      : reveal.myMove === FUSION ? { text: t('合体技!', 'FUSION!'), color: MOVE_FX[3].color }
        : reveal.c.edge === 1 ? { text: t('克制!', 'COUNTER!'), color: MOVE_FX[myKind].color }
          : reveal.c.edge === -1 ? { text: t('被克…', 'COUNTERED'), color: '#7a8b84' }
            : { text: t('硬碰硬!', 'CLASH!'), color: '#ef6a4c' };
    const endBanner = !end ? null
      : end.result === 'win' ? { text: t('胜利!', 'WIN!'), color: '#e8ae14' }
        : end.result === 'lose' ? { text: t('落败', 'DEFEAT'), color: '#7a8b84' }
          : { text: t('平手', 'DRAW'), color: '#2aa6b8' };
    return (
      <div className={cn(PAGE, 'max-w-[920px] overflow-x-clip py-6 sm:py-8')}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Tag tone="copper" icon={Swords}>{end ? t('对战结束', 'Battle over') : t(`第 ${fight.round} 回合`, `Round ${fight.round}`)}</Tag>
            <span className="font-mono text-[11px] text-faint" title={t('本场的随机种子；上链后改用区块随机数', 'Random seed for this battle; on-chain it will come from block randomness')}>seed 0x{fight.seed.toString(16).padStart(8, '0')}</span>
          </div>
          {!end && <Button size="sm" variant="ghost" icon={Flag} disabled={fight.busy} onClick={() => finish(fight, 'lose')}>{t('认输', 'Surrender')}</Button>}
        </div>

        <div className="rounded-[2rem] border border-line/80 bg-panel p-3 shadow-sm shadow-si/5 sm:p-5">
          <div className={cn('fight-stage relative overflow-hidden rounded-[1.85rem] p-2 sm:p-3', fight.busy && 'is-busy')}>
            <div className="fight-stage-grid pointer-events-none absolute inset-0 opacity-70" />
            {reveal && fight.busy && (
              <ArenaFx
                key={reveal.n}
                n={reveal.n + fight.seed}
                me={strikeOf(myKind, reveal.myRoll, reveal.c.myDmg, reveal.myMove === FUSION ? 1 : reveal.c.edge)}
                op={strikeOf(reveal.opMove, reveal.opRoll, reveal.c.opDmg, reveal.myMove === FUSION ? 0 : (reveal.c.edge === 1 ? -1 : reveal.c.edge === -1 ? 1 : 0))}
                banner={banner}
              />
            )}
            {end?.result === 'win' && <Confetti seed={fight.seed} />}
            {endBanner && (
              <Banner key={`end-${end!.result}`} text={endBanner.text} color={endBanner.color} delay={0.05} stay={1.1} big />
            )}
            <div className="relative grid grid-cols-2 gap-3">
              <FighterCard
                side="me" name={fight.petName} level={myPet.level} hp={fight.myHp} max={fight.myMax} bg={myPh.bg}
                reveal={reveal?.n} dmg={reveal?.c.opDmg ?? 0}
                move={reveal ? (reveal.myMove === FUSION ? t('合体技', 'Fusion') : MOVES[reveal.myMove]!.name) : undefined}
                power={reveal?.myRoll.power} edge={reveal ? reveal.myMove === FUSION || reveal.c.edge === 1 : false}
                down={!!end && end.result === 'lose'} glow={!!end && end.result === 'win'}
              >
                <PetAvatar cpu={myPet.cpu} circuitId={myPet.circuitId} rarity={myPet.rarity} mood={end?.result === 'lose' ? 20 : 90} size={size} />
              </FighterCard>
              <FighterCard
                side="op" name={opp.name} level={opp.level} hp={fight.opHp} max={opp.maxHp} bg={opp.bg}
                reveal={reveal?.n} dmg={reveal?.c.myDmg ?? 0}
                move={reveal ? MOVES[reveal.opMove]!.name : undefined}
                power={reveal?.opRoll.power} edge={reveal ? reveal.c.edge === -1 : false}
                down={!!end && end.result === 'win'} glow={!!end && end.result === 'lose'}
              >
                {opp.wild
                  ? <BugMon color={opp.wild.color} dark={opp.wild.dark} size={size} boss={opp.wild.id === 'boss'} />
                  : <PetAvatar cpu={opp.pet!.cpu} circuitId={opp.pet!.circuitId} rarity={opp.pet!.rarity} mood={end?.result === 'win' ? 20 : 90} size={size} />}
              </FighterCard>
              <VsBadge busy={fight.busy} />
            </div>
          </div>

          {reveal && (
            <motion.div key={reveal.n} className="mt-3 space-y-2" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <ChipStrip
                  who={fight.petName}
                  chip={reveal.myMove === FUSION && fight.fusion ? `${fight.heart.name} ⟶ ${fight.fusion.f.b.name}` : fight.heart.name}
                  gates={reveal.myMove === FUSION && fight.fusion ? fight.fusion.f.gates : fight.heart.gates}
                  inBits={reveal.myRoll.inBits} outBits={reveal.myRoll.outBits} power={reveal.myRoll.power}
                />
                <ChipStrip who={opp.name} chip={opp.heart.name} gates={opp.heart.gates} inBits={reveal.opRoll.inBits} outBits={reveal.opRoll.outBits} power={reveal.opRoll.power} />
              </div>
              <p className="text-center text-sm font-semibold text-ink">{verdict}</p>
            </motion.div>
          )}

          {end && !showResult && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <Button size="sm" onClick={() => setShowResult(true)}>{t('查看结果', 'View result')}</Button>
              <Button size="sm" variant="ghost" icon={RotateCcw} disabled={!localChipet.canBattle(myPet)} onClick={() => start(opp)}>
                {localChipet.canBattle(myPet) ? t('再来一场', 'Rematch') : t('能量不够了', 'Out of energy')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setFight(null)}>{t('换个对手', 'Pick another opponent')}</Button>
            </div>
          )}

          {!end && (
            <>
              <p className="mt-4 text-center text-xs text-mute">
                {lang === 'zh'
                  ? <>{opp.name}偏爱<b className="font-semibold text-ink">{MOVES[opp.fav]!.name}</b> · 选一招，功率是你的{fight.heart.name}这回合算出来的</>
                  : <>{opp.name} favors <b className="font-semibold text-ink">{MOVES[opp.fav]!.name}</b> · pick a move; the power is what your {fight.heart.name} computed this round</>}
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2 sm:gap-3">
                {MOVES.map((m, i) => {
                  const I = MOVE_ICON[i]!;
                  const p = fight.myRolls[i]!.power;
                  const picked = fight.busy && reveal?.myMove === i;
                  const fx = MOVE_FX[i]!;
                  return (
                    <motion.button
                      key={i}
                      type="button"
                      onClick={(e) => { sparkAt(i, e); play(i as Move); }}
                      onMouseDown={(e) => e.preventDefault()}
                      aria-label={t(`出招：${m.name}，功率 ${p}`, `Play ${m.name}, power ${p}`)}
                      animate={picked ? { scale: [1, 1.06, 1], y: [0, -4, 0] } : { scale: 1, y: 0 }}
                      transition={picked ? { duration: 0.45, ease: 'easeOut' } : undefined}
                      className={cn(
                        'move-btn group relative isolate flex h-full w-full cursor-pointer select-none flex-col items-center gap-1 overflow-hidden rounded-3xl border bg-panel px-2 py-3 pt-3.5 shadow-sm transition-[transform,box-shadow,border-color,background-color] duration-150 hover:-translate-y-0.5 hover:border-copper/55 hover:bg-panel-2 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper/40 active:translate-y-px active:shadow-sm [&_*]:pointer-events-none',
                        picked ? 'border-copper ring-2 ring-copper/30' : 'border-line/80',
                      )}
                    >
                      {flashes.filter((f) => f.slot === i).map((f) => (
                        <PhotoBurst
                          key={f.id}
                          x={f.x}
                          y={f.y}
                          color={fx.color}
                          hi={fx.hi}
                          onDone={() => setFlashes((list) => list.filter((x) => x.id !== f.id))}
                        />
                      ))}
                      <span
                        aria-hidden
                        className="absolute top-2 right-2 size-1.5 rounded-full bg-copper/35 opacity-70 transition group-hover:bg-copper group-hover:opacity-100 group-focus-visible:bg-copper"
                      />
                      <span className={cn('relative grid size-10 place-items-center rounded-2xl transition', picked ? 'bg-copper text-white' : 'bg-copper/10 text-copper group-hover:bg-copper group-hover:text-white')}><I className="size-5" /></span>
                      <span className="relative max-w-full truncate font-display text-sm font-bold text-ink sm:text-base">{m.name}</span>
                      <PowerPips power={p} className="relative text-mute" />
                      <span className="relative line-clamp-2 text-center text-[10px] text-faint sm:text-[11px]">{m.tip}</span>
                      <span className="relative mt-0.5 text-[10px] font-medium text-copper/45 transition group-hover:text-copper sm:text-[11px]">
                        {picked ? t('已选', 'Picked') : t('点选出招', 'Tap to play')}
                      </span>
                    </motion.button>
                  );
                })}
              </div>
              {fight.fusion && (
                <motion.button
                  type="button"
                  disabled={fight.fusion.used}
                  onClick={(e) => { if (!fight.fusion?.used) { sparkAt(FUSION, e); play(FUSION); } }}
                  onMouseDown={(e) => e.preventDefault()}
                  animate={fight.busy && reveal?.myMove === FUSION ? { scale: [1, 1.03, 1], boxShadow: ['0 0 0 0 rgba(232,174,20,0)', '0 0 0 8px rgba(232,174,20,0.25)', '0 0 0 0 rgba(232,174,20,0)'] } : undefined}
                  className={cn(
                    'relative isolate mt-2 flex w-full cursor-pointer select-none flex-wrap items-center justify-center gap-x-2 gap-y-1 overflow-hidden rounded-3xl border border-gold/50 bg-gold/10 px-4 py-2.5 text-sm font-semibold text-gold-dim transition hover:-translate-y-0.5 hover:bg-gold/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40 disabled:cursor-not-allowed disabled:opacity-45 [&_*]:pointer-events-none',
                    fight.busy && reveal?.myMove === FUSION && 'ring-2 ring-gold/40',
                  )}
                >
                  {flashes.filter((f) => f.slot === FUSION).map((f) => (
                    <PhotoBurst
                      key={f.id}
                      x={f.x}
                      y={f.y}
                      color={MOVE_FX[FUSION]!.color}
                      hi={MOVE_FX[FUSION]!.hi}
                      onDone={() => setFlashes((list) => list.filter((x) => x.id !== f.id))}
                    />
                  ))}
                  <Cable className="relative size-4" />
                  <span className="relative">{fight.fusion.used ? t('合体技已用过', 'Fusion move used') : t(`合体技 · 接上线友「${fight.fusion.partner.name}」`, `Fusion move · wire in ${fight.fusion.partner.name}`)}</span>
                  {!fight.fusion.used && (
                    <span className="relative flex items-center gap-1 font-mono text-[11px] font-normal">
                      <PowerPips power={fight.fusion.roll.power} /> {t('+2 · 无视克制 · 每场 1 次', '+2 · ignores the triangle · once per battle')}
                    </span>
                  )}
                </motion.button>
              )}
            </>
          )}

          {fight.log.length > 0 && (
            <div className="mt-4 rounded-2xl border border-line/70 bg-panel-2/70 p-3 sm:p-4">
              <div className="mb-2.5 flex items-center gap-1.5 font-mono text-[11px] text-faint">
                <ScrollText className="size-3.5 shrink-0 text-si" />
                {t('战报', 'Battle log')}
                <span className="text-line">·</span>
                <span>{t(`${fight.log.length} 回合`, `${fight.log.length} rounds`)}</span>
              </div>
              <ol className="space-y-1.5">
                {fight.log.map((l, i) => (
                  <li
                    key={l.n}
                    className={cn(
                      'flex gap-2.5 rounded-xl px-2.5 py-2 text-sm leading-snug',
                      i === 0 ? 'bg-panel text-ink shadow-sm ring-1 ring-line/70' : 'text-mute',
                    )}
                  >
                    <span className={cn(
                      'mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums',
                      i === 0 ? 'bg-copper/15 text-copper' : 'bg-panel text-faint',
                    )}>
                      {t(`第 ${l.n} 回合`, `R${l.n}`)}
                    </span>
                    <span className="min-w-0 flex-1">{l.say()}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        <p className="mt-3 text-center text-[11px] text-faint">
          {t(
            '浏览器按 TapeOut 网表规则逐门仿真（与链上 eval 同一套规则）。上链后由合约求值并用区块随机数出题。',
            'The browser simulates the TapeOut netlist gate by gate (the same rules as on-chain eval). On-chain, the contract will evaluate it and draw the inputs from block randomness.',
          )}
        </p>

        <AnimatePresence>
          {end && showResult && (
            <BattleResultModal
              key="battle-result"
              end={end}
              petName={fight.petName}
              canRematch={localChipet.canBattle(myPet)}
              seed={fight.seed}
              onRematch={() => start(opp)}
              onPick={() => setFight(null)}
              onVisit={() => go(`/pet/${fight.petId}`)}
              onClose={() => setShowResult(false)}
            />
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ── 选对手 ─────────────────────────────────────────
  const tired = me ? !localChipet.canBattle(me) : true;
  return (
    <div className={cn(PAGE, 'py-8 sm:py-10')}>
      <PageHeader
        eyebrow={t('对战 · Battle', 'Battle')} icon={Swords}
        title={t('训练场', 'Training Ground')}
        desc={t('电路对战：每只芯喵用自己的心脏电路出招，胜负是算出来的。', 'Circuit battles: every kitty fights with its own heart circuit, and the outcome is computed.')}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => go('/guide/battle')}>{t('对战说明', 'Battle rules')}</Button>
            <Tag tone="copper" icon={Zap} className="px-3 py-1 text-xs">{t(`每场消耗 ${BATTLE_ENERGY} 能量`, `${BATTLE_ENERGY} energy per battle`)}</Tag>
          </div>
        }
      />

      <ol className="mt-6 grid gap-4 sm:grid-cols-3">
        {RULES.map(([I, title, text], i) => (
          <li key={i} className="rounded-3xl border border-line/80 bg-panel p-5 shadow-sm shadow-si/5">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-2xl bg-si/10 text-si"><I className="size-5" /></span>
              <span className="font-mono text-xs text-faint">0{i + 1}</span>
            </div>
            <h3 className="mt-4 text-lg">{txt(title)}</h3>
            <p className="mt-1.5 text-sm text-pretty text-mute">{txt(text)}</p>
          </li>
        ))}
      </ol>

      {err && <div className="mt-4 overflow-hidden rounded-2xl"><ErrBar>{err}</ErrBar></div>}

      <Panel title={t('出战芯喵', 'Your fighter')} icon={Swords} className="mt-6" bodyClass="p-4">
        <ul className="flex flex-wrap gap-2">
          {pets.map((p) => {
            const on = me?.id === p.id;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setMyId(p.id)}
                  aria-pressed={on}
                  className={cn('flex items-center gap-2 rounded-2xl py-1.5 pr-4 pl-1.5 text-left transition', on ? 'bg-si/10 ring-2 ring-si' : 'bg-panel-2/60 ring-1 ring-line hover:ring-si/50')}
                >
                  <PetAvatar cpu={p.cpu} circuitId={p.circuitId} rarity={p.rarity} mood={p.mood} size={52} lively={false} />
                  <span>
                    <span className="block text-sm font-semibold text-ink">{p.name} <span className="font-mono text-[11px] font-normal text-mute">Lv.{p.level}</span></span>
                    <span className="block font-mono text-[11px] text-mute">{t(`能量 ${p.energy} · ${p.wins} 胜`, `Energy ${p.energy} · ${plural(p.wins, 'win')}`)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {me && myHeart && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-panel-2/60 px-4 py-3 text-xs text-mute">
            <HeartLine heart={myHeart} />
            <span className="font-mono">{t('体力', 'HP')} {maxHpOf(me.level, me.rarity, me.mood)}{me.mood >= 80 ? t(`（心情好 +${MOOD_HP}）`, ` (good mood +${MOOD_HP})`) : ''}</span>
            <span className="font-mono">{t('平均功率', 'Avg power')} {myHeart.avgPower.toFixed(1)}</span>
            <span className="font-mono">{t('经验', 'XP')} {me.xp}/{xpNeed(me.level)}</span>
            {tired && <Link to={`/pet/${me.id}`} className="font-semibold text-copper-dim">{t('能量不足，去喂食 →', 'Low energy. Go feed it →')}</Link>}
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-mute">
          <span className="flex items-center gap-1.5 font-semibold text-ink"><Cable className="size-3.5 text-gold-dim" />{t('助战线友', 'Wire pal')}</span>
          {bonds.length === 0 ? (
            lang === 'zh'
              ? <span>还没有线友。去<Link to="/plaza" className="mx-1 font-semibold">广场</Link>找邻居牵线，对战时就能放合体技。</span>
              : <span>No wire pals yet. Find a neighbor in the<Link to="/plaza" className="mx-1 font-semibold">Plaza</Link>to link up with and unlock a fusion move.</span>
          ) : bonds.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => setPartnerKey(b.key)}
              aria-pressed={partner?.key === b.key}
              className={cn('flex items-center gap-1.5 rounded-full py-0.5 pr-3 pl-0.5 transition', partner?.key === b.key ? 'bg-gold/15 text-gold-dim ring-2 ring-gold/60' : 'bg-panel-2/60 ring-1 ring-line hover:ring-gold/50')}
            >
              <PetAvatar cpu={b.cpu} circuitId={b.circuitId} rarity={b.rarity} mood={b.mood} size={28} lively={false} />
              {b.name}
            </button>
          ))}
          {partner && myHeart && (
            <span className="font-mono text-[11px]">
              {t('合体电路', 'Fusion circuit')} {myHeart.gates} + {heartOf(partner.circuitId, partner.rarity).gates} = {fuse(myHeart, heartOf(partner.circuitId, partner.rarity)).gates} {t('门', 'gates')}
            </span>
          )}
        </div>
      </Panel>

      {challenge && (
        <div className="mt-6 flex flex-wrap items-center gap-4 rounded-3xl border border-copper/40 bg-copper/5 px-5 py-4">
          <div className="grid size-16 shrink-0 place-items-center rounded-2xl" style={{ backgroundColor: challenge.bg }}>
            <PetAvatar cpu={challenge.pet!.cpu} circuitId={challenge.pet!.circuitId} rarity={challenge.pet!.rarity} mood={challenge.pet!.mood} size={60} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display text-lg font-bold text-ink">{t('挑战书', 'Challenge')} · {challenge.name} <span className="font-mono text-xs font-normal text-mute">Lv.{challenge.level} · {challenge.pet!.owner}</span></div>
            <HeartLine heart={challenge.heart} />
          </div>
          <Button icon={Swords} disabled={tired} onClick={() => start(challenge)}>{t('开打', 'Fight')}</Button>
        </div>
      )}

      <Panel title={t('野怪 · 芯片里的 Bug', 'Wild bugs · the bugs inside the chip')} icon={Zap} className="mt-6" bodyClass="p-4">
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {WILDS.map((w) => {
            const o = wildOpp(w);
            return (
              <li key={w.id} className="flex flex-col overflow-hidden rounded-3xl border border-line/70">
                <div className="relative grid place-items-center pt-3 pb-1" style={{ backgroundColor: w.bg }}>
                  <span className="absolute top-2 left-3 font-mono text-[11px] text-mute">Lv.{w.level}</span>
                  <BugMon color={w.color} dark={w.dark} size={104} boss={w.id === 'boss'} />
                </div>
                <div className="flex flex-1 flex-col bg-panel px-3 py-3">
                  <div className="font-semibold text-ink">{w.name} {lang === 'zh' && <span className="font-mono text-[10px] font-normal text-faint">{w.names.en}</span>}</div>
                  <p className="mt-0.5 flex-1 text-[11px] text-pretty text-mute">{w.line}</p>
                  <HeartLine heart={o.heart} className="mt-1.5" />
                  <div className="mt-1 font-mono text-[11px] text-mute">{t(`体力 ${o.maxHp} · 爱出${MOVES[w.fav]!.name}`, `HP ${o.maxHp} · likes ${MOVES[w.fav]!.name}`)}</div>
                  {social.wildBounty(w.id) && <Tag tone="copper" icon={Fish} className="mt-2 w-fit">{t('今日首胜 +1', 'First win today +1')}</Tag>}
                  <Button size="sm" className="mt-2.5 w-full" icon={Swords} disabled={tired} onClick={() => start(o)}>{t('挑战', 'Fight')}</Button>
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel title={t('切磋对手', 'Spar rivals')} icon={Trophy} className="mt-6" bodyClass="p-0">
        <div className="px-4 pt-4">
          <p className="mb-3 text-[12px] text-pretty text-mute">
            {t('优先展示其他玩家的链上芯宠；人少时再用路过访客和邻居补位。只能和别人的芯宠切磋。', 'Other players’ on-chain Chipets come first; passers-by and neighbors fill in when the list is short. You can only spar with others’ Chipets.')}
          </p>
        </div>
        <ul className="grid grid-cols-2 gap-3 px-4 pb-4 md:grid-cols-3">
          {rivalsPage.map((p) => {
            const o = npcOpp(p);
            const ph = phenotypeOf(p.cpu, p.circuitId, p.rarity);
            const onchain = isOnchainPetKey(p.key);
            const visitor = !p.mine && !onchain && p.id <= -101;
            return (
              <li key={p.key} className={cn('flex flex-col overflow-hidden rounded-3xl border', challenge?.key === p.key ? 'border-copper ring-2 ring-copper/30' : 'border-line/70')}>
                <div className="relative grid place-items-center pt-3 pb-1" style={{ backgroundColor: ph.bg }}>
                  <span className="absolute top-2 left-3 font-mono text-[11px] text-mute">Lv.{p.level}</span>
                  <span className="absolute top-2 right-3 font-mono text-[11px] text-mute">{t(`${p.wins} 胜`, plural(p.wins, 'win'))}</span>
                  {onchain && <Tag tone="si" className="absolute bottom-2 left-2">{t('链上', 'On-chain')}</Tag>}
                  {visitor && <Tag className="absolute bottom-2 left-2">{t('今日路过', 'Passing')}</Tag>}
                  <PetAvatar cpu={p.cpu} circuitId={p.circuitId} rarity={p.rarity} mood={p.mood} size={104} />
                </div>
                <div className="flex flex-1 flex-col bg-panel px-3 py-3">
                  <div className="truncate font-semibold text-ink">{p.name} <span className="text-[11px] font-normal text-mute">{p.owner}</span></div>
                  <HeartLine heart={o.heart} className="mt-1" />
                  <div className="mt-1 font-mono text-[11px] text-mute">{t(`体力 ${o.maxHp} · 心情 ${p.mood} · 能量 ${p.energy}`, `HP ${o.maxHp} · mood ${p.mood} · energy ${p.energy}`)}</div>
                  <div className="mt-0.5 font-mono text-[11px] text-faint">{t(`${ph.vibe}，爱出${MOVES[o.fav]!.name}`, `${ph.vibe}, likes ${MOVES[o.fav]!.name}`)}</div>
                  <Button size="sm" variant="si" className="mt-2.5 w-full" icon={Swords} disabled={tired} onClick={() => start(o)}>{t('切磋', 'Spar')}</Button>
                </div>
              </li>
            );
          })}
        </ul>
        {rivalPages > 1 && (
          <nav
            aria-label={t('切磋对手分页', 'Spar rivals pagination')}
            className="flex flex-wrap items-center justify-end gap-3 border-t border-line/70 bg-substrate/40 px-4 py-3"
          >
            <span className="mr-auto font-mono text-[11px] tabular-nums text-faint">
              {t(`第 ${Math.min(rivalPage, rivalPages)} / ${rivalPages} 页`, `Page ${Math.min(rivalPage, rivalPages)} / ${rivalPages}`)}
            </span>
            <div className="inline-flex items-center gap-0.5 rounded-full bg-panel p-1 shadow-sm ring-1 ring-line/80">
              <button
                type="button"
                disabled={rivalPage <= 1}
                onClick={() => setRivalPage((p) => Math.max(1, p - 1))}
                aria-label={t('上一页', 'Previous page')}
                className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[12px] font-semibold text-mute transition enabled:hover:bg-panel-2 enabled:hover:text-ink disabled:cursor-not-allowed disabled:opacity-35"
              >
                <ChevronLeft className="size-3.5" />
                {t('上一页', 'Prev')}
              </button>
              <div className="flex items-center gap-0.5 px-0.5">
                {pageWindow(Math.min(rivalPage, rivalPages), rivalPages).map((item, i) => (
                  item === '…' ? (
                    <span key={`e${i}`} className="grid size-8 place-items-center font-mono text-xs text-faint" aria-hidden>…</span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      aria-label={t(`第 ${item} 页`, `Page ${item}`)}
                      aria-current={item === rivalPage ? 'page' : undefined}
                      onClick={() => setRivalPage(item)}
                      className={cn(
                        'grid size-8 place-items-center rounded-full font-mono text-[12px] tabular-nums transition',
                        item === rivalPage
                          ? 'bg-copper font-bold text-white shadow-sm shadow-copper/30'
                          : 'text-mute hover:bg-panel-2 hover:text-ink',
                      )}
                    >
                      {item}
                    </button>
                  )
                ))}
              </div>
              <button
                type="button"
                disabled={rivalPage >= rivalPages}
                onClick={() => setRivalPage((p) => Math.min(rivalPages, p + 1))}
                aria-label={t('下一页', 'Next page')}
                className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[12px] font-semibold text-mute transition enabled:hover:bg-panel-2 enabled:hover:text-ink disabled:cursor-not-allowed disabled:opacity-35"
              >
                {t('下一页', 'Next')}
                <ChevronRight className="size-3.5" />
              </button>
            </div>
          </nav>
        )}
      </Panel>
    </div>
  );
}
