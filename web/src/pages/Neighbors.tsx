import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ArrowLeft, Sparkles, Users } from 'lucide-react';
import { PaginationBar } from '../components/Pagination.tsx';
import { DataLoading, PetCardGridSkeleton } from '../components/Skeleton.tsx';
import { Button, Empty, PAGE, PageHeader, Tag, cn } from '../components/ui.tsx';
import { go } from '../router.tsx';
import { PetCard } from '../chipet/PetCard.tsx';
import { heartOf } from '../chipet/heart.ts';
import { petSeed, phenotypeOf } from '../chipet/phenotype.ts';
import { hydrateChainRivals } from '../chipet/rivals.ts';
import { getSocialRev, isOnchainPetKey, social, subscribeSocial } from '../chipet/social.ts';
import { useApp } from '../state.tsx';
import { plural, useT } from '../i18n.ts';

/** 邻居列表每页条数 */
const PAGE_SIZE = 8;

/** 广场「更多邻居」：优先其他人的链上芯喵，再用路过访客 / 固定邻居补位。 */
export function Neighbors() {
  const t = useT();
  const { account } = useApp();
  const socialRev = useSyncExternalStore(subscribeSocial, getSocialRev, getSocialRev);
  const [loading, setLoading] = useState(() => social.chainRivals().length === 0);
  const [page, setPage] = useState(1);
  const neighbors = useMemo(() => {
    const all = social.neighbors();
    // 真人链上猫靠前，固定 NPC / 日替访客垫后
    return [...all].sort((a, b) => Number(isOnchainPetKey(b.key)) - Number(isOnchainPetKey(a.key)));
  }, [socialRev]);
  const pages = Math.max(1, Math.ceil(neighbors.length / PAGE_SIZE));
  const pageItems = useMemo(() => {
    const safe = Math.min(Math.max(1, page), pages);
    const start = (safe - 1) * PAGE_SIZE;
    return neighbors.slice(start, start + PAGE_SIZE);
  }, [neighbors, page, pages]);
  const playerCount = neighbors.filter((p) => isOnchainPetKey(p.key)).length;

  useEffect(() => {
    let alive = true;
    setLoading(social.chainRivals().length === 0);
    void hydrateChainRivals({ exclude: account, limit: 48 }).finally(() => {
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
  }, [account]);

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), pages));
  }, [pages]);

  return (
    <div className={cn(PAGE, 'py-8 sm:py-10')}>
      <PageHeader
        eyebrow={t('广场 · 邻居', 'Plaza · Neighbors')}
        icon={Users}
        title={t('邻居芯喵', 'Neighbor kitties')}
        desc={t(
          neighbors.length > 0
            ? playerCount > 0
              ? `共 ${neighbors.length} 只，其中 ${playerCount} 只来自其他玩家。点开任意一只去串门、摸头或牵线。`
              : `共 ${neighbors.length} 只。点开任意一只去串门、摸头或牵线。`
            : '还没有邻居。去广场逛逛，或等访客路过。',
          neighbors.length > 0
            ? playerCount > 0
              ? `${neighbors.length} in total, ${playerCount} from other players. Open any one to visit, pat, or link up.`
              : `${neighbors.length} in total. Open any one to visit, pat, or link up.`
            : 'No neighbors yet. Browse the Plaza, or wait for passers-by.',
        )}
        right={
          <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={() => go('/plaza')}>
            {t('回广场', 'Back to Plaza')}
          </Button>
        }
      />

      {loading && neighbors.length === 0 ? (
        <DataLoading className="mt-8" label={t('加载邻居…', 'Loading neighbors…')}>
          <PetCardGridSkeleton count={8} cols="grid-cols-2 md:grid-cols-3 lg:grid-cols-4" footer={false} />
        </DataLoading>
      ) : neighbors.length === 0 ? (
        <div className="mt-8">
          <Empty
            icon={Sparkles}
            title={t('还没有邻居', 'No neighbors yet')}
            action={<Button icon={Users} onClick={() => go('/plaza')}>{t('回广场', 'Back to Plaza')}</Button>}
          >
            {t('广场侧栏会列出可以拜访的邻居芯喵。', 'The Plaza sidebar lists neighbor kitties you can visit.')}
          </Empty>
        </div>
      ) : (
        <div className="mt-8 overflow-hidden rounded-3xl border border-line/80 bg-panel shadow-sm shadow-si/5">
          <ul className="grid grid-cols-2 gap-4 p-4 md:grid-cols-3 lg:grid-cols-4">
            {pageItems.map((p) => {
              const ph = phenotypeOf(p.cpu, p.circuitId, p.rarity, petSeed(p));
              const h = heartOf(p.circuitId, p.rarity);
              const fromPlayer = isOnchainPetKey(p.key);
              return (
                <li key={p.key}>
                  <PetCard
                    pet={p}
                    name={p.name}
                    sub={`${p.owner} · ${h.name}`}
                    size={112}
                    tags={(
                      <>
                        {fromPlayer && <Tag tone="si">{t('玩家', 'Player')}</Tag>}
                        <Tag tone="faint">{ph.species}</Tag>
                        <Tag tone="copper">{t(`${p.wins} 胜`, plural(p.wins, 'win'))}</Tag>
                      </>
                    )}
                    onClick={() => go(`/pet/${p.id}`)}
                  />
                </li>
              );
            })}
          </ul>
          <PaginationBar
            page={page}
            pages={pages}
            onChange={setPage}
            label={t('邻居分页', 'Neighbors pagination')}
          />
        </div>
      )}
    </div>
  );
}
