import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight, Cable, Cpu, Egg, Fish, Flag, RotateCcw, Shield, Swords, Trophy, WandSparkles, Zap, type LucideProps,
} from 'lucide-react';
import { Button, Empty, ErrBar, PAGE, PageHeader, Panel, Tag, cn } from '../components/ui.tsx';
import { Link, go, useRoute } from '../router.tsx';
import { PetAvatar } from '../chipet/PetAvatar.tsx';
import { BugMon } from '../chipet/BugMon.tsx';
import { ChipStrip, PowerPips } from '../chipet/ChipStrip.tsx';
import {
  ArenaFx, Banner, BEAT, Confetti, DizzyStars, MOVE_FX, Twinkles, type Strike,
} from '../chipet/BattleFx.tsx';
import { fuse, heartByKey, heartOf, type Fusion, type Heart } from '../chipet/heart.ts';
import {
  aiPick, clash, favOf, fusionClash, maxHpOf, MOOD_HP, MOVES, roll, rollAll, wildHpOf, WILDS, xpFor,
  type Clash, type Move, type Roll, type Wild,
} from '../chipet/battle.ts';
import { phenotypeOf } from '../chipet/phenotype.ts';
import { BATTLE_ENERGY, localChipet, xpNeed, type LocalPet } from '../chipet/store.ts';
import { social, type PublicPet } from '../chipet/social.ts';
import { both, plural, tr, txt, useLang, useT, type Txt } from '../i18n.ts';

const MOVE_ICON: ComponentType<LucideProps>[] = [Swords, Shield, WandSparkles];
/** 合体技在招式位里的编号 */
const FUSION = 3;
/** 一回合揭晓动画的时长：跟 BattleFx 的节拍对齐，再留一点余量看清伤害数字 */
const REVEAL_MS = Math.round(BEAT.total * 1000) + 200;

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
  [Cpu, both('电路出功率', 'Circuits make the power'), both(
    '每回合，随机位流进心脏电路，三招各算出一个功率——亮几盏灯就是几点。',
    'Each round random bits flow into the heart circuit and every move gets a power value: the more lamps light up, the harder it hits.',
  )],
  [Swords, both('你来选招', 'You pick the move'), both(
    '进攻克技巧、技巧克防御、防御克进攻。你看得见自己的功率，看不见对手要出什么。',
    'Attack beats Trick, Trick beats Defend, Defend beats Attack. You can see your own power, but not what your opponent will play.',
  )],
  [Zap, both('克制翻倍', 'Counters hit double'), both(
    '克制对手，伤害翻倍、对手减半。牵过线的线友还能帮你放一次合体技。',
    'Counter your opponent to deal double damage and take half. A linked wire pal can also fire one fusion move for you.',
  )],
];

export function Train() {
  const t = useT();
  const lang = useLang();
  const r = useRoute();
  const wide = useWide();
  const [tick, setTick] = useState(0);
  const [err, setErr] = useState('');
  const [fight, setFight] = useState<Fight | null>(null);
  const [myId, setMyId] = useState<number | null>(() => (r.query.get('me') ? Number(r.query.get('me')) : null));
  const [partnerKey, setPartnerKey] = useState('');
  const timers = useRef<number[]>([]);

  const pets = useMemo(() => localChipet.list(), [tick]);
  const neighbors = useMemo(() => social.neighbors(), [tick]);
  const bonds = useMemo(() => social.bonds(), [tick]);
  const me: LocalPet | undefined = pets.find((p) => p.id === myId) ?? pets[0];
  const myHeart = me ? heartOf(me.circuitId, me.rarity) : undefined;
  const partner = bonds.find((b) => b.key === partnerKey) ?? bonds[0];

  const vs = r.query.get('vs');
  const challenge = useMemo(() => {
    if (!vs) return undefined;
    const p = social.getByRouteId(Number(vs));
    return p && !p.mine ? npcOpp(p) : undefined;
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

  const play = (move: Move | typeof FUSION) => {
    if (!fight || fight.busy || fight.end) return;
    const opMove = aiPick(fight.opRolls, fight.opp.fav);
    const opRoll = fight.opRolls[opMove];
    let myRoll: Roll;
    let c: Clash;
    let say: () => string;
    if (move === FUSION) {
      if (!fight.fusion || fight.fusion.used) return;
      const { partner, f } = fight.fusion;
      myRoll = fight.fusion.roll;
      const hit = fusionClash(myRoll.power, opRoll.power);
      c = hit;
      say = () => tr(
        `合体技！和「${partner.name}」串成的 ${f.gates} 门电路打出 ${hit.myDmg}，挨了 ${hit.opDmg}`,
        `Fusion move! The ${f.gates}-gate circuit wired with ${partner.name} dealt ${hit.myDmg} and took ${hit.opDmg}`,
      );
    } else {
      myRoll = fight.myRolls[move];
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
    const next: Fight = {
      ...fight,
      myHp: Math.max(0, fight.myHp - c.opDmg),
      opHp: Math.max(0, fight.opHp - c.myDmg),
      busy: true,
      reveal: { n: fight.round, myMove: move, opMove, myRoll, opRoll, c },
      log: [{ n: fight.round, say }, ...fight.log].slice(0, 4),
      fusion: fight.fusion && move === FUSION ? { ...fight.fusion, used: true } : fight.fusion,
    };
    setFight(next);
    later(() => {
      if (next.myHp <= 0 || next.opHp <= 0) {
        finish(next);
        return;
      }
      const round = next.round + 1;
      setFight({
        ...next,
        busy: false,
        round,
        myRolls: rollAll(next.heart, next.seed, 'me', round),
        opRolls: rollAll(next.opp.heart, next.seed, 'op', round),
        fusion: next.fusion && { ...next.fusion, roll: roll(next.fusion.f, next.seed, 'fuse', round, FUSION) },
      });
    }, REVEAL_MS);
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
      <div className={cn(PAGE, 'max-w-[920px] py-6 sm:py-8')}>
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
            <motion.div key={reveal.n} className="mt-3 grid gap-2" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
              <ChipStrip
                who={fight.petName}
                chip={reveal.myMove === FUSION && fight.fusion ? `${fight.heart.name} ⟶ ${fight.fusion.f.b.name}` : fight.heart.name}
                gates={reveal.myMove === FUSION && fight.fusion ? fight.fusion.f.gates : fight.heart.gates}
                inBits={reveal.myRoll.inBits} outBits={reveal.myRoll.outBits} power={reveal.myRoll.power}
              />
              <ChipStrip who={opp.name} chip={opp.heart.name} gates={opp.heart.gates} inBits={reveal.opRoll.inBits} outBits={reveal.opRoll.outBits} power={reveal.opRoll.power} />
              <p className="text-center text-sm font-semibold text-ink">{verdict}</p>
            </motion.div>
          )}

          {end ? (
            <motion.div
              className={cn('mt-4 flex flex-col items-center rounded-3xl px-5 py-6 text-center', end.result === 'win' ? 'bg-gold/10' : 'bg-panel-2/70')}
              initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            >
              <span className={cn('grid size-12 place-items-center rounded-2xl', end.result === 'win' ? 'bg-gold/20 text-gold-dim' : 'bg-panel text-mute')}>
                <Trophy className="size-6" />
              </span>
              <h2 className="mt-3 text-2xl">
                {end.result === 'win' ? t(`「${fight.petName}」赢了！`, `${fight.petName} wins!`) : end.result === 'lose' ? t('这次没打过…', 'Not this time…') : t('打成平手', 'It\'s a draw')}
              </h2>
              <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                <Tag tone="si">{t('经验', 'XP')} +{end.xp}</Tag>
                {end.ups > 0 && <Tag tone="gold">{t(`升级到 Lv.${end.level}，体力更厚了`, `Leveled up to Lv.${end.level}: more HP`)}</Tag>}
                {end.fish > 0 && <Tag tone="copper" icon={Fish}>{t('今日首胜 · 鱼干 +1', 'First win today · +1 fish treat')}</Tag>}
                {end.result === 'lose' && <Tag tone="faint">{t('喂饱、通通电，再来', 'Feed it, power it up, try again')}</Tag>}
              </div>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Button icon={RotateCcw} disabled={!localChipet.canBattle(myPet)} onClick={() => start(opp)}>
                  {localChipet.canBattle(myPet) ? t('再来一场', 'Rematch') : t('能量不够了', 'Out of energy')}
                </Button>
                <Button variant="ghost" onClick={() => setFight(null)}>{t('换个对手', 'Pick another opponent')}</Button>
                <Button variant="ghost" icon={ArrowRight} onClick={() => go(`/pet/${fight.petId}`)}>{t('去看望它', 'Visit it')}</Button>
              </div>
            </motion.div>
          ) : (
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
                  return (
                    <motion.button
                      key={i}
                      type="button"
                      disabled={fight.busy}
                      onClick={() => play(i as Move)}
                      animate={picked ? { scale: [1, 1.06, 1], y: [0, -4, 0] } : { scale: 1, y: 0 }}
                      transition={picked ? { duration: 0.45, ease: 'easeOut' } : undefined}
                      className={cn(
                        'move-btn group flex flex-col items-center gap-1 rounded-3xl border bg-panel px-2 py-3 shadow-sm transition hover:-translate-y-0.5 hover:border-copper/60 hover:shadow-md active:translate-y-px disabled:pointer-events-none',
                        picked ? 'border-copper ring-2 ring-copper/30 opacity-100' : 'border-line/80 disabled:opacity-45',
                      )}
                    >
                      <span className={cn('grid size-10 place-items-center rounded-2xl transition', picked ? 'bg-copper text-white' : 'bg-copper/10 text-copper group-hover:bg-copper group-hover:text-white')}><I className="size-5" /></span>
                      <span className="font-display text-base font-bold text-ink">{m.name}</span>
                      <PowerPips power={p} className="text-mute" />
                      <span className="text-[11px] text-faint">{m.tip}</span>
                    </motion.button>
                  );
                })}
              </div>
              {fight.fusion && (
                <motion.button
                  type="button"
                  disabled={fight.busy || fight.fusion.used}
                  onClick={() => play(FUSION)}
                  animate={fight.busy && reveal?.myMove === FUSION ? { scale: [1, 1.03, 1], boxShadow: ['0 0 0 0 rgba(232,174,20,0)', '0 0 0 8px rgba(232,174,20,0.25)', '0 0 0 0 rgba(232,174,20,0)'] } : undefined}
                  className={cn(
                    'mt-2 flex w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-3xl border border-gold/50 bg-gold/10 px-4 py-2.5 text-sm font-semibold text-gold-dim transition hover:-translate-y-0.5 hover:bg-gold/20 disabled:pointer-events-none disabled:opacity-45',
                    fight.busy && reveal?.myMove === FUSION && 'ring-2 ring-gold/40',
                  )}
                >
                  <Cable className="size-4" />
                  {fight.fusion.used ? t('合体技已用过', 'Fusion move used') : t(`合体技 · 接上线友「${fight.fusion.partner.name}」`, `Fusion move · wire in ${fight.fusion.partner.name}`)}
                  {!fight.fusion.used && (
                    <span className="flex items-center gap-1 font-mono text-[11px] font-normal">
                      <PowerPips power={fight.fusion.roll.power} /> {t('+2 · 无视克制 · 每场 1 次', '+2 · ignores the triangle · once per battle')}
                    </span>
                  )}
                </motion.button>
              )}
            </>
          )}

          {fight.log.length > 0 && (
            <ul className="mt-4 space-y-1 border-t border-line/70 pt-3 text-xs text-mute">
              {fight.log.map((l, i) => <li key={l.n} className={i === 0 ? 'text-ink' : undefined}>{t(`第 ${l.n} 回合 · ${l.say()}`, `Round ${l.n} · ${l.say()}`)}</li>)}
            </ul>
          )}
        </div>

        <p className="mt-3 text-center text-[11px] text-faint">
          {t(
            '本地演示：浏览器按 TapeOut 网表规则逐门仿真（与链上 eval 同一套规则）。上链后由合约求值并用区块随机数出题。',
            'Local demo: the browser simulates the TapeOut netlist gate by gate (the same rules as on-chain eval). On-chain, the contract will evaluate it and draw the inputs from block randomness.',
          )}
        </p>
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

      <Panel title={t('邻居切磋', 'Spar with neighbors')} icon={Trophy} className="mt-6" bodyClass="p-4">
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {neighbors.map((p) => {
            const o = npcOpp(p);
            const ph = phenotypeOf(p.cpu, p.circuitId, p.rarity);
            return (
              <li key={p.key} className={cn('flex flex-col overflow-hidden rounded-3xl border', challenge?.key === p.key ? 'border-copper ring-2 ring-copper/30' : 'border-line/70')}>
                <div className="relative grid place-items-center pt-3 pb-1" style={{ backgroundColor: ph.bg }}>
                  <span className="absolute top-2 left-3 font-mono text-[11px] text-mute">Lv.{p.level}</span>
                  <span className="absolute top-2 right-3 font-mono text-[11px] text-mute">{t(`${p.wins} 胜`, plural(p.wins, 'win'))}</span>
                  <PetAvatar cpu={p.cpu} circuitId={p.circuitId} rarity={p.rarity} mood={p.mood} size={104} />
                </div>
                <div className="flex flex-1 flex-col bg-panel px-3 py-3">
                  <div className="truncate font-semibold text-ink">{p.name} <span className="text-[11px] font-normal text-mute">{p.owner}</span></div>
                  <HeartLine heart={o.heart} className="mt-1" />
                  <div className="mt-1 font-mono text-[11px] text-mute">{t(`体力 ${o.maxHp} · ${ph.vibe}，爱出${MOVES[o.fav]!.name}`, `HP ${o.maxHp} · ${ph.vibe}, likes ${MOVES[o.fav]!.name}`)}</div>
                  <Button size="sm" variant="si" className="mt-2.5 w-full" icon={Swords} disabled={tired} onClick={() => start(o)}>{t('切磋', 'Spar')}</Button>
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
