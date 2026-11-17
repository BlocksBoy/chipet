import { useMemo, useSyncExternalStore } from 'react';
import { ArrowLeft, Cat, Egg } from 'lucide-react';
import { DataLoading, PetCardGridSkeleton } from '../components/Skeleton.tsx';
import { Button, Empty, PAGE, PageHeader, Tag, cn } from '../components/ui.tsx';
import { go } from '../router.tsx';
import { PetCard } from '../chipet/PetCard.tsx';
import { heartOf } from '../chipet/heart.ts';
import { getCloudSyncRev, isWalletHydrating, subscribeCloudSync } from '../chipet/cloudSync.ts';
import { getLocalPetsRev, localChipet, subscribeLocalPets } from '../chipet/store.ts';
import { petSeed, phenotypeOf } from '../chipet/phenotype.ts';
import { useApp } from '../state.tsx';
import { useT } from '../i18n.ts';

/** 我持有的芯喵完整列表（家园「查看更多」入口）。 */
export function Kitties() {
  const t = useT();
  const { account } = useApp();
  const cloudRev = useSyncExternalStore(subscribeCloudSync, getCloudSyncRev, getCloudSyncRev);
  const petsRev = useSyncExternalStore(subscribeLocalPets, getLocalPetsRev, getLocalPetsRev);
  const pets = useMemo(() => localChipet.list(), [petsRev, cloudRev]);
  const waitingCloud = !!account && isWalletHydrating() && pets.length === 0;

  return (
    <div className={cn(PAGE, 'py-8 sm:py-10')}>
      <PageHeader
        eyebrow={t('家园 · 持有', 'Home · Owned')}
        icon={Cat}
        title={t('我的芯喵', 'My kitties')}
        desc={t(
          pets.length > 0
            ? `共 ${pets.length} 只。点开任意一只，看它的心脏电路与养成。`
            : waitingCloud
              ? '正在同步云端芯喵…'
              : '还没有芯喵。回家园敲开第一枚蛋吧。',
          pets.length > 0
            ? `${pets.length} in total. Open any one to see its heart circuit and care.`
            : waitingCloud
              ? 'Syncing your Chipets from the cloud…'
              : 'No kitties yet. Crack your first egg at Home.',
        )}
        right={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={() => go('/')}>{t('回家园', 'Home')}</Button>
            <Button size="sm" icon={Egg} onClick={() => go('/')}>{t('去敲蛋', 'Crack an egg')}</Button>
          </div>
        }
      />

      {waitingCloud ? (
        <DataLoading className="mt-8" label={t('同步芯喵…', 'Syncing Chipets…')}>
          <PetCardGridSkeleton count={4} cols="grid-cols-2 md:grid-cols-3 lg:grid-cols-4" footer={false} />
        </DataLoading>
      ) : pets.length === 0 ? (
        <div className="mt-8">
          <Empty
            icon={Egg}
            title={t('还没有芯喵', 'No kitties yet')}
            action={<Button icon={Egg} onClick={() => go('/')}>{t('去敲蛋', 'Crack an egg')}</Button>}
          >
            {t('回家园起个名字，敲开第一枚蛋。', 'Pick a name at Home and crack your first egg.')}
          </Empty>
        </div>
      ) : (
        <ul className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {pets.map((p) => {
            const petPh = phenotypeOf(p.cpu, p.circuitId, p.rarity, petSeed(p));
            const h = heartOf(p.circuitId, p.rarity);
            return (
              <li key={p.id}>
                <PetCard
                  pet={p}
                  name={p.name}
                  sub={`${petPh.species} · ${h.name}`}
                  badge={`#${String(p.id).padStart(4, '0')}`}
                  tags={(
                    <>
                      <Tag tone="faint">{petPh.coat}</Tag>
                      <Tag tone="copper">{t(`${h.gates} 门`, `${h.gates} gates`)}</Tag>
                      <Tag tone="si">{t(`Lv.${p.level}`, `Lv.${p.level}`)}</Tag>
                    </>
                  )}
                  onClick={() => go(`/pet/${p.id}`)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
