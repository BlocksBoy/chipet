import { useMemo, useSyncExternalStore } from 'react';
import { BookOpen, Cat, Cpu, Crown, Egg, Gem, Lock } from 'lucide-react';
import { DataLoading, PetCardGridSkeleton, StatBandSkeleton } from '../components/Skeleton.tsx';
import { Button, PAGE, PageHeader, SectionTitle, StatBand, Tag, Trait, cn } from '../components/ui.tsx';
import { go } from '../router.tsx';
import { PetCard, rarityTone } from '../chipet/PetCard.tsx';
import { allHearts, heartOf } from '../chipet/heart.ts';
import { getCloudSyncRev, isWalletHydrating, subscribeCloudSync } from '../chipet/cloudSync.ts';
import { getLocalPetsRev, localChipet, subscribeLocalPets } from '../chipet/store.ts';
import { cattributes, petSeed, phenotypeOf, rarityLabel, speciesList } from '../chipet/phenotype.ts';
import { useApp } from '../state.tsx';
import { useT } from '../i18n.ts';

const DEMO_CPU = '0x000000000000000000000000000000000000c111';

/** 给每个物种找一枚长成它的电路号，没遇见的物种用它画剪影。 */
function sampleIds(n: number): bigint[] {
  const out: (bigint | undefined)[] = Array.from({ length: n });
  for (let cid = 1n, left = n; left > 0 && cid < 4000n; cid++) {
    const sp = phenotypeOf(DEMO_CPU, cid).speciesId;
    if (out[sp] === undefined) { out[sp] = cid; left--; }
  }
  return out.map((x) => x ?? 1n);
}

export function Dex() {
  const t = useT();
  const { account } = useApp();
  const cloudRev = useSyncExternalStore(subscribeCloudSync, getCloudSyncRev, getCloudSyncRev);
  const petsRev = useSyncExternalStore(subscribeLocalPets, getLocalPetsRev, getLocalPetsRev);
  const pets = useMemo(() => localChipet.list(), [petsRev, cloudRev]);
  const waitingCloud = !!account && isWalletHydrating() && pets.length === 0;
  const species = speciesList();
  const samples = useMemo(() => sampleIds(species.length), [species.length]);
  const hearts = allHearts();

  /** 物种号 → 这个物种里最稀有的那只，以及一共孵了几只 */
  const seen = new Map<number, { best: (typeof pets)[0]; n: number }>();
  /** 已经拥有的心脏模板 */
  const ownedHearts = new Set<string>();
  for (const p of pets) {
    const key = phenotypeOf(p.cpu, p.circuitId, p.rarity).speciesId;
    const hit = seen.get(key);
    seen.set(key, { best: !hit || hit.best.rarity < p.rarity ? p : hit.best, n: (hit?.n ?? 0) + 1 });
    ownedHearts.add(heartOf(p.circuitId, p.rarity).key);
  }
  const pct = Math.round((seen.size / species.length) * 100);

  return (
    <div className={cn(PAGE, 'py-8 sm:py-10')}>
      <PageHeader
        eyebrow={t('收藏 · Collection', 'Collection')} icon={BookOpen}
        title={t('图鉴', 'Dex')}
        desc={t(
          '每只芯喵的物种、毛色和花纹都由电路身份决定。类型对齐加密猫：普通 Normal、珍奇 Fancy、限定 Exclusive。',
          'Species, coat and pattern all come from the circuit identity. Types follow CryptoKitties: Normal, Fancy and Exclusive.',
        )}
        right={<Button icon={Egg} onClick={() => go('/')}>{t('去敲蛋', 'Crack an egg')}</Button>}
      />

      {waitingCloud ? (
        <>
          <DataLoading className="mt-6" label={t('同步图鉴…', 'Syncing dex…')}>
            <StatBandSkeleton />
            <PetCardGridSkeleton className="mt-10" count={8} cols="grid-cols-2 md:grid-cols-3 lg:grid-cols-4" footer={false} />
          </DataLoading>
        </>
      ) : (
      <>
      <StatBand className="mt-6" items={[
        { icon: BookOpen, label: t(`物种收集 · ${pct}%`, `Species collected · ${pct}%`), value: `${seen.size}/${species.length}`, tone: 'si' },
        { icon: Cat, label: t('已孵化', 'Hatched'), value: pets.length, tone: 'copper' },
        { icon: Gem, label: t('珍奇 Fancy', 'Fancy'), value: pets.filter((p) => p.rarity === 1).length, tone: 'violet' },
        { icon: Crown, label: t('限定 Exclusive', 'Exclusive'), value: pets.filter((p) => p.rarity === 2).length, tone: 'gold' },
      ]} />

      <SectionTitle className="mt-10" icon={Cat} title={t('物种', 'Species')}
        desc={t('没遇见的物种只露一个剪影。多敲几枚蛋，把它们凑齐。', 'Species you haven\'t met show up as silhouettes. Crack more eggs to complete the set.')} />
      <ul className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {species.map((sp) => {
          const hit = seen.get(sp.id);
          if (!hit) {
            return (
              <li key={sp.id}>
                <PetCard
                  locked
                  pet={{ cpu: DEMO_CPU, circuitId: samples[sp.id]!, rarity: 0 }}
                  name="???"
                  sub={t(`性格：${sp.vibe}`, `Vibe: ${sp.vibe}`)}
                  badge={`No.${String(sp.id + 1).padStart(2, '0')}`}
                  corner={<Lock className="size-3.5" />}
                  size={112}
                  tags={<Tag tone="faint">{t('未遇见', 'Not met yet')}</Tag>}
                />
              </li>
            );
          }
          const p = hit.best;
          const ph = phenotypeOf(p.cpu, p.circuitId, p.rarity, petSeed(p));
          return (
            <li key={sp.id}>
              <PetCard
                pet={{ ...p, level: undefined }}
                mood={80}
                name={sp.name}
                sub={`${sp.vibe} · ${sp.blurb}`}
                badge={`No.${String(sp.id + 1).padStart(2, '0')}`}
                corner={`×${hit.n}`}
                size={112}
                tags={cattributes(ph).slice(0, 2).map((g) => <Trait key={g.id} value={g.value} />)}
                onClick={() => go(`/pet/${p.id}`)}
              />
            </li>
          );
        })}
      </ul>

      <SectionTitle className="mt-12" icon={Cpu} title={t('心脏电路', 'Heart circuits')}
        desc={t('孵化时按稀有度抽一枚心脏：越稀有，电路越大。对战和通电玩耍都靠它来算。', 'Each hatch draws a heart by rarity: the rarer the kitty, the bigger the circuit. Battles and Power Play both run on it.')} />
      <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {hearts.map((h) => {
          const own = ownedHearts.has(h.key);
          return (
            <li key={h.key} className={cn('flex items-start gap-3.5 rounded-3xl border border-line/80 bg-panel p-4 shadow-sm shadow-si/5', !own && 'opacity-70')}>
              <span className={cn('grid size-11 shrink-0 place-items-center rounded-2xl', own ? 'bg-copper/10 text-copper' : 'bg-panel-2 text-faint')}><Cpu className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-display text-[17px] font-bold text-ink">{h.name}</span>
                  <Tag tone={rarityTone(h.rarity)}>{rarityLabel(h.rarity)}</Tag>
                </div>
                <p className="mt-0.5 text-xs text-pretty text-mute">{h.tagline}</p>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-mute">
                  <span>{t(`${h.gates} 门`, `${h.gates} gates`)}</span>
                  <span>{t(`${h.nIn} 进 ${h.nOut} 出`, `${h.nIn} in / ${h.nOut} out`)}</span>
                  <span>{h.style}</span>
                  <span className={own ? 'text-si-dim' : 'text-faint'}>{own ? t('已拥有', 'Owned') : t('未拥有', 'Not owned')}</span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      </>
      )}
    </div>
  );
}
