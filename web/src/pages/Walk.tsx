import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Egg, Fish, Footprints, Hand, Heart, MapPin, PawPrint } from 'lucide-react';
import { motion } from 'motion/react';
import { SoundToggle } from '../chipet/SoundToggle.tsx';
import { Button, PAGE, PageHeader, Panel, Tag, cn } from '../components/ui.tsx';
import { go } from '../router.tsx';
import { PetAvatar } from '../chipet/PetAvatar.tsx';
import { WalkCanvas } from '../chipet/WalkCanvas.tsx';
import { getLocalPetsRev, localChipet, MOCK_CPU, subscribeLocalPets, type LocalPet } from '../chipet/store.ts';
import { heartOf } from '../chipet/heart.ts';
import { petSeed, phenotypeOf } from '../chipet/phenotype.ts';
import { social } from '../chipet/social.ts';
import { loadWalkBest, type WalkActor, type WalkCoat, type WalkerKind, type WalkState } from '../chipet/walkGame.ts';
import { useT } from '../i18n.ts';

function coatFromPet(p: { cpu: string; circuitId: bigint; rarity: 0 | 1 | 2; id?: number; name?: string; hatchedAt?: number }): WalkCoat {
  const ph = phenotypeOf(p.cpu, p.circuitId, p.rarity, petSeed(p));
  return {
    body: ph.body,
    belly: ph.belly,
    accent: ph.accent,
    outline: ph.outline,
    eye: ph.eye,
    nose: ph.nose,
    pattern: ph.pattern,
    ear: ph.ear,
    bodyShape: ph.bodyShape,
  };
}

const DEMO_ACTOR: WalkActor = {
  name: '橘子',
  demo: true,
  coat: coatFromPet({ cpu: MOCK_CPU, circuitId: 4242n, rarity: 1, name: '橘子', id: -1 }),
  heart: heartOf(4242n, 1),
};

interface Hud {
  phase: WalkState['phase'];
  distance: number;
  fish: number;
  hits: number;
  maxHits: number;
  best: number;
  greets: number;
  near: { kind: WalkerKind; owner: string; petName: string } | null;
}

export function Walk() {
  const t = useT();
  const petsRev = useSyncExternalStore(subscribeLocalPets, getLocalPetsRev, getLocalPetsRev);
  const pets = useMemo(() => localChipet.list(), [petsRev]);
  const [petId, setPetId] = useState<number | 'demo' | null>(null);
  const [hud, setHud] = useState<Hud>({
    phase: 'ready', distance: 0, fish: 0, hits: 0, maxHits: 3, best: loadWalkBest(), greets: 0, near: null,
  });
  const [greetTick, setGreetTick] = useState(0);
  const [reduce, setReduce] = useState(false);
  const [paidRun, setPaidRun] = useState('');

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduce(mq.matches);
    const on = () => setReduce(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const chosen = petId ?? pets[0]?.id ?? 'demo';
  const selected: LocalPet | null = typeof chosen === 'number' ? pets.find((p) => p.id === chosen) ?? null : null;
  const actor: WalkActor = useMemo(
    () => (selected ? { name: selected.name, demo: false, coat: coatFromPet(selected), heart: heartOf(selected.circuitId, selected.rarity) } : DEMO_ACTOR),
    [selected],
  );

  // 结算：本局鱼干入账（每局一次，最多 5 条）
  useEffect(() => {
    if (hud.phase !== 'over' || hud.fish <= 0) return;
    const runKey = `${Math.floor(hud.distance)}:${hud.fish}:${hud.greets}`;
    if (runKey === paidRun) return;
    setPaidRun(runKey);
    try {
      social.addFish(Math.min(5, hud.fish));
    } catch {
      /* ignore */
    }
  }, [hud.phase, hud.fish, hud.distance, hud.greets, paidRun]);

  const near = hud.phase === 'running' ? hud.near : null;
  const nearLabel = near
    ? near.kind === 'dog'
      ? t(`${near.owner} 正在遛狗「${near.petName}」`, `${near.owner} is walking ${near.petName} the dog`)
      : near.kind === 'cat'
        ? t(`${near.owner} 也在遛猫「${near.petName}」`, `${near.owner} is walking ${near.petName} the cat`)
        : near.kind === 'flowers'
          ? t(`${near.owner} 刚从花店出来`, `${near.owner} just left the florist`)
          : t(`${near.owner} 端着咖啡路过`, `${near.owner} strolls by with a coffee`)
    : '';

  return (
    <div className={cn(PAGE, 'py-8 sm:py-10')}>
      <PageHeader
        eyebrow={t('城市中心广场', 'City plaza')}
        icon={Footprints}
        title={t('遛猫大道', 'Cat Boulevard')}
        desc={t(
          '人人都能来遛的林荫大道：咖啡馆、书店、花店和花鸟虫鱼市沿街排开，街上全是出来散步的人和他们的猫狗。',
          'A tree-lined boulevard open to everyone — cafés, bookshops, florists and a bird-and-fish market, full of people out walking their cats and dogs.',
        )}
        right={(
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone="si">{t(`最佳 ${hud.best}`, `Best ${hud.best}`)}</Tag>
            {actor.demo && <Tag tone="faint">{t('演示猫', 'Demo cat')}</Tag>}
          </div>
        )}
      />

      <div className="relative mt-6 overflow-hidden rounded-3xl bg-[#d8cdb8] shadow-lg ring-1 ring-line/70">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-center gap-1.5 p-3 sm:gap-2">
          <HudChip icon={<MapPin className="size-3.5" />} pop={false} value={t(`${Math.floor(hud.distance)} 米`, `${Math.floor(hud.distance)} m`)} />
          <HudChip icon={<Fish className="size-3.5" />} value={String(hud.fish)} />
          <HudChip icon={<Hand className="size-3.5" />} value={String(hud.greets)} />
          <HudChip
            icon={<Heart className="size-3.5" />}
            value={`${Math.max(0, hud.maxHits - hud.hits)}/${hud.maxHits}`}
          />
        </div>
        <div className="absolute top-0 right-0 z-10 p-3">
          <SoundToggle tone="glass" />
        </div>

        <WalkCanvas
          actor={actor}
          greetTick={greetTick}
          reducedMotion={reduce}
          onHud={(s) => setHud({
            phase: s.phase,
            distance: s.distance,
            fish: s.fish,
            hits: s.hits,
            maxHits: s.maxHits,
            best: s.best,
            greets: s.greets,
            near: s.nearWalker ? { kind: s.nearWalker.kind, owner: s.nearWalker.owner, petName: s.nearWalker.petName } : null,
          })}
        />

        {near && (
          <div className="absolute inset-x-0 bottom-0 z-10 flex justify-center p-3">
            <button
              type="button"
              onClick={() => setGreetTick((n) => n + 1)}
              className="flex max-w-full items-center gap-2 rounded-full bg-panel/95 py-1.5 pr-4 pl-1.5 text-sm text-ink shadow-md ring-1 ring-line/80 backdrop-blur-sm transition active:scale-[0.97]"
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-copper text-white">
                <Hand className="size-4" />
              </span>
              <span className="truncate">{nearLabel}</span>
              <span className="shrink-0 font-semibold text-copper">{t('打招呼', 'Say hi')}</span>
            </button>
          </div>
        )}
      </div>
      <p className="mt-2 px-1 text-[12px] text-pretty text-faint">
        {t(
          '点按画面或空格：跳跃；走到长椅、花箱前再点可以跳上去；撞到花箱会扣心情。遇到路人点「打招呼」（或按 E），遛宠的人会回礼小鱼干。',
          'Tap or press Space to jump; tap in front of a bench or planter to hop on. Bumping a planter costs a heart. Hit “Say hi” (or E) near walkers — pet owners return a fish treat.',
        )}
      </p>

      <Panel title={t('今天牵谁出门', 'Who’s coming along')} icon={PawPrint} className="mt-6" bodyClass="p-4">
        {pets.length === 0 ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-pretty text-mute">
              {t('还没有芯喵也能先来逛：牵上演示橘猫上街；想遛自己的，去家园敲个蛋。', 'No Chipet yet? Walk the demo ginger cat. Hatch your own at Home anytime.')}
            </p>
            <Button size="sm" icon={Egg} onClick={() => go('/')}>{t('去敲蛋', 'Crack an egg')}</Button>
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {pets.map((p) => (
              <PetPick key={p.id} on={chosen === p.id} onClick={() => setPetId(p.id)} label={p.name}>
                <PetAvatar cpu={p.cpu} circuitId={p.circuitId} rarity={p.rarity} mood={p.mood} size={44} seed={petSeed(p)} />
              </PetPick>
            ))}
            <PetPick on={chosen === 'demo'} onClick={() => setPetId('demo')} label={t('演示橘猫', 'Demo cat')}>
              <span className="grid size-11 place-items-center rounded-full bg-[#f0a24a]/20 text-[#c46a1c]"><PawPrint className="size-5" /></span>
            </PetPick>
          </div>
        )}
        <p className="mt-3 text-[12px] text-pretty text-faint">
          {t('出门的猫会按芯喵毛色上色；换猫会在下一圈生效。', 'Your cat is recolored to match your Chipet’s coat; switching takes effect next lap.')}
        </p>
      </Panel>
    </div>
  );
}

function PetPick({ on, onClick, label, children }: { on: boolean; onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        'flex shrink-0 items-center gap-2 rounded-2xl border px-2.5 py-2 text-left transition',
        on ? 'border-si bg-si/10 shadow-sm' : 'border-line bg-panel hover:border-si/50',
      )}
    >
      {children}
      <span className="max-w-[6rem] truncate text-sm font-semibold text-ink">{label}</span>
    </button>
  );
}

function HudChip({ icon, value, pop = true }: { icon: ReactNode; value: string; pop?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-black/35 px-2.5 py-1 font-mono text-[11px] font-semibold text-white tabular-nums backdrop-blur-sm">
      {icon}
      <motion.span
        key={pop ? value : undefined}
        className="inline-block"
        initial={pop ? { scale: 1.45, color: '#ffe08a' } : false}
        animate={{ scale: 1, color: '#ffffff' }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      >
        {value}
      </motion.span>
    </span>
  );
}
