import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowRight, Cable, CalendarCheck, Check, Fish, Flame, Hand, Pencil, Sparkles, Swords, ThumbsUp, Trophy, Users } from 'lucide-react';
import {
  DataLoading, FeedSkeleton, PetCardGridSkeleton, PlazaSidebarSkeleton, RankListSkeleton, StatBandSkeleton,
} from '../components/Skeleton.tsx';
import { Button, Input, PAGE, PageHeader, Panel, Segmented, StatBand, Tag, cn } from '../components/ui.tsx';
import { Link, go } from '../router.tsx';
import { useApp } from '../state.tsx';
import { PetAvatar } from '../chipet/PetAvatar.tsx';
import { ACT_ICON, actTone, PetCard, routeIdOf, timeAgo } from '../chipet/PetCard.tsx';
import { heartOf } from '../chipet/heart.ts';
import { petSeed } from '../chipet/phenotype.ts';
import {
  cloudSync, getCachedFeedPage, getCachedLeaderboard, getCloudSyncRev, getFeedTotal, getLeaderboardRev,
  isFeedPageLoading, isLeaderboardLoading, isPublicLoading,
  leaderboardItemToPet, subscribeCloudSync, subscribeLeaderboard,
} from '../chipet/cloudSync.ts';
import { hydrateChainRivals } from '../chipet/rivals.ts';
import { getSocialRev, maxBonds, social, subscribeSocial, type Activity } from '../chipet/social.ts';
import { plural, txt, useLang, useT } from '../i18n.ts';

/** 广场动态每批条数（与后端 offset/limit 对齐） */
const FEED_PAGE = 10;
/** 可视区约 10 行高（与行 min-h-[4.75rem] 对齐） */
const FEED_VIEW_CLASS = 'max-h-[47.5rem]';

export function Plaza() {
  const t = useT();
  const lang = useLang();
  const { account, notify } = useApp();
  const [tab, setTab] = useState<'feed' | 'hot' | 'rank'>('feed');
  const [rankKind, setRankKind] = useState<'pats' | 'wins' | 'intimacy' | 'level'>('pats');
  const [name, setName] = useState(social.profile().displayName);
  const [editing, setEditing] = useState(false);
  const [tick, setTick] = useState(0);
  /** 已拼进列表的批次数（滚动触底 +1） */
  const [feedLoadedPages, setFeedLoadedPages] = useState(1);
  const feedScrollRef = useRef<HTMLDivElement>(null);
  const feedSentinelRef = useRef<HTMLDivElement>(null);
  const socialRev = useSyncExternalStore(subscribeSocial, getSocialRev, getSocialRev);
  const boardRev = useSyncExternalStore(subscribeLeaderboard, getLeaderboardRev, getLeaderboardRev);
  const cloudRev = useSyncExternalStore(subscribeCloudSync, getCloudSyncRev, getCloudSyncRev);
  const bootLoading = isPublicLoading();
  const boardLoading = isLeaderboardLoading();
  const feedTotal = getFeedTotal();
  void cloudRev;
  const profile = useMemo(() => social.profile(), [tick, lang, socialRev]);
  const feedPages = Math.max(1, Math.ceil(Math.max(0, feedTotal) / FEED_PAGE));
  const safeLoadedPages = Math.min(Math.max(1, feedLoadedPages), feedPages);
  const firstPage = getCachedFeedPage(1);
  const firstFetching = isFeedPageLoading(1);
  // 累积 1..safeLoadedPages；点赞态跟 social
  const feed = useMemo(() => {
    type FeedRow = Activity & { likes: number; liked: boolean };
    const liked = social.activities() as FeedRow[];
    const byId = new Map(liked.map((a) => [a.id, a]));
    const out: FeedRow[] = [];
    for (let p = 1; p <= safeLoadedPages; p++) {
      const page = getCachedFeedPage(p);
      if (!page) continue;
      for (const a of page) {
        const local = byId.get(a.id);
        out.push(local
          ? { ...a, likes: local.likes, liked: local.liked }
          : { ...a, likes: (a as { likes?: number }).likes ?? 0, liked: false });
      }
    }
    return out;
  }, [safeLoadedPages, tick, socialRev, cloudRev]);
  const feedInitialPending = firstPage === undefined && (firstFetching || bootLoading);
  const nextFeedPage = safeLoadedPages + 1;
  const feedLoadingMore = nextFeedPage <= feedPages && (
    isFeedPageLoading(nextFeedPage)
    || (getCachedFeedPage(safeLoadedPages) === undefined && isFeedPageLoading(safeLoadedPages))
  );
  const feedHasMore = feedTotal > 0 && safeLoadedPages < feedPages;
  // 热门 / 排行：优先读库缓存；找不到/已消失的宠直接丢掉
  const hot = useMemo(() => {
    const cloud = getCachedLeaderboard('heat');
    if (cloud?.length) {
      return cloud
        .map((row) => {
          const pet = leaderboardItemToPet(row);
          return pet ? { pet, score: row.score, pats: row.pats, visits: row.visits } : null;
        })
        .filter((x): x is NonNullable<typeof x> => !!x)
        .slice(0, 6);
    }
    return social.leaderboard('heat').slice(0, 6);
  }, [tick, socialRev, boardRev]);
  const ranks = useMemo(() => {
    const cloud = getCachedLeaderboard(rankKind);
    if (cloud?.length) {
      return cloud
        .map((row) => {
          const pet = leaderboardItemToPet(row);
          return pet ? { pet, score: row.score, pats: row.pats, visits: row.visits } : null;
        })
        .filter((x): x is NonNullable<typeof x> => !!x);
    }
    return social.leaderboard(rankKind);
  }, [tick, socialRev, boardRev, rankKind]);
  const bonds = useMemo(() => social.bonds(), [tick, socialRev]);
  const neighbors = useMemo(() => {
    const all = social.neighbors();
    // 侧栏预览：真人猫优先
    return [...all].sort((a, b) => {
      const ao = a.key.startsWith('onchain:') ? 1 : 0;
      const bo = b.key.startsWith('onchain:') ? 1 : 0;
      return bo - ao;
    });
  }, [tick, socialRev]);
  const top = ranks[0]?.score || 1;
  const showFeedSkeleton = feedInitialPending && !firstPage;
  const showHotSkeleton = (bootLoading || boardLoading) && hot.length === 0;
  const showRankSkeleton = (bootLoading || boardLoading) && ranks.length === 0;

  useEffect(() => {
    if (tab === 'hot' || tab === 'rank') void cloudSync.refreshLeaderboards();
  }, [tab, tick, socialRev]);

  // 已打开的批次：按页打后端
  useEffect(() => {
    if (tab !== 'feed') return;
    for (let p = 1; p <= safeLoadedPages; p++) {
      void cloudSync.loadFeedPage(p, FEED_PAGE);
    }
  }, [tab, safeLoadedPages]);

  // 触底哨兵：滚动区固定约 10 行高，到底再拼下一批
  useEffect(() => {
    if (tab !== 'feed') return;
    const root = feedScrollRef.current;
    const sentinel = feedSentinelRef.current;
    if (!root || !sentinel) return;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      setFeedLoadedPages((prev) => {
        const capped = Math.min(Math.max(1, prev), feedPages);
        if (capped >= feedPages) return capped;
        if (getCachedFeedPage(capped) === undefined) return capped;
        if (isFeedPageLoading(capped + 1)) return capped;
        return capped + 1;
      });
    }, { root, rootMargin: '120px 0px', threshold: 0 });
    io.observe(sentinel);
    return () => io.disconnect();
  }, [tab, feedPages, safeLoadedPages, feed.length, cloudRev]);

  // 侧栏邻居 /「更多邻居」混入其他玩家的链上芯喵
  useEffect(() => {
    void hydrateChainRivals({ exclude: account, limit: 48 });
  }, [account]);

  useEffect(() => { setFeedLoadedPages(1); }, [tab]);
  useEffect(() => {
    setFeedLoadedPages((p) => Math.min(Math.max(1, p), feedPages));
  }, [feedPages]);
  // 切钱包后主人名可能变了；非编辑中时跟档
  useEffect(() => {
    if (!editing) setName(profile.displayName);
  }, [profile.displayName, editing]);

  const saveName = () => {
    social.setName(name);
    setEditing(false);
    setTick((t) => t + 1);
  };

  const checkin = () => {
    try {
      social.checkin();
      setTick((t) => t + 1);
      notify('ok', t('签到成功，小鱼干到手', 'Checked in. Fish treats collected'));
    } catch (e) {
      notify('err', e instanceof Error ? e.message : String(e));
    }
  };

  const like = (id: string) => {
    social.like(id);
    setTick((t) => t + 1);
  };

  return (
    <div className={cn(PAGE, 'py-8 sm:py-10')}>
      <PageHeader
        eyebrow={t('社交 · Social', 'Social')} icon={Users}
        title={t('广场', 'Plaza')}
        desc={t('摸邻居的芯宠、牵线组合体电路、切磋一场，比一比谁更受欢迎。', 'Pat your neighbors\' Chipets, link up into fusion circuits, spar, and see who\'s the most popular.')}
        right={
          <Button icon={CalendarCheck} variant={profile.checkedIn ? 'ghost' : 'primary'} disabled={profile.checkedIn} onClick={checkin}>
            {profile.checkedIn ? t('今日已签到', 'Checked in') : t('每日签到领鱼干', 'Daily check-in')}
          </Button>
        }
      />

      {bootLoading && neighbors.length === 0 ? (
        <StatBandSkeleton className="mt-6" />
      ) : (
        <StatBand className="mt-6" items={[
          { icon: Users, label: t('邻居芯喵', 'Neighbor kitties'), value: neighbors.length, tone: 'si' },
          { icon: Cable, label: t('我的线友', 'My wire pals'), value: `${bonds.length}/${maxBonds()}`, tone: 'gold' },
          { icon: Flame, label: t('连续签到（天）', 'Check-in streak (days)'), value: profile.streak, tone: 'copper' },
          { icon: Fish, label: t('小鱼干', 'Fish treats'), value: profile.fish, tone: 'violet' },
        ]} />
      )}
      <p className="mt-2 text-right text-xs text-mute">
        <button type="button" className="font-semibold text-copper-dim hover:text-copper" onClick={() => go('/shop')}>
          {t('鱼干不够？BEM 商店补一包 →', 'Low on treats? Buy a pack in the BEM Shop →')}
        </button>
      </p>

      <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <Segmented value={tab} onChange={setTab} options={[
            ['feed', t('动态', 'Feed'), Users],
            ['hot', t('热门', 'Hot'), Sparkles],
            ['rank', t('排行', 'Ranks'), Trophy],
          ]} />

          {tab === 'feed' && (
            <Panel className="mt-4" bodyClass="p-0">
              {showFeedSkeleton ? (
                <DataLoading label={t('加载广场动态…', 'Loading plaza feed…')}>
                  <FeedSkeleton rows={10} />
                </DataLoading>
              ) : feedTotal === 0 ? (
                <p className="p-10 text-center text-sm text-mute">{t('还没有动态，去孵化或摸摸邻居吧。', 'Nothing here yet. Hatch a kitty or go pat a neighbor.')}</p>
              ) : (
                <div
                  ref={feedScrollRef}
                  className={cn('chip-scroll overflow-y-auto overscroll-contain', FEED_VIEW_CLASS)}
                >
                  <div className="divide-y divide-line/70">
                    {feed.map((a) => {
                      const I = ACT_ICON[a.kind] ?? Sparkles;
                      return (
                        <div key={a.id} className="flex min-h-[4.75rem] items-center gap-2 pr-4 transition hover:bg-panel-2/50">
                          <button type="button" onClick={() => a.petKey && go(`/pet/${routeIdOf(a.petKey)}`)}
                            className="flex min-w-0 flex-1 items-start gap-3 py-4 pl-5 text-left">
                            <span className={cn('mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl', actTone(a.kind))}>
                              <I className="size-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm text-pretty text-ink">{txt(a.text)}</span>
                              <span className="mt-1 block text-xs text-faint">{txt(a.actor)} · {timeAgo(a.at)}</span>
                            </span>
                          </button>
                          <button type="button" onClick={() => like(a.id)} aria-pressed={a.liked} aria-label={t('击掌', 'High five')}
                            className={cn('flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 font-mono text-xs transition active:scale-95', a.liked ? 'bg-copper/10 text-copper-dim ring-1 ring-copper/40' : 'text-faint ring-1 ring-line hover:text-copper-dim hover:ring-copper/40')}>
                            <ThumbsUp className={cn('size-3.5', a.liked && 'fill-copper/30')} />
                            {a.likes > 0 ? a.likes : t('击掌', 'High five')}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <div ref={feedSentinelRef} className="h-px w-full" aria-hidden />
                  {feedLoadingMore && (
                    <p className="px-5 py-3 text-center text-xs text-mute">
                      {t('加载更多动态…', 'Loading more…')}
                    </p>
                  )}
                  {!feedHasMore && feed.length > 0 && !feedLoadingMore && (
                    <p className="px-5 py-3 text-center text-xs text-faint">
                      {t('已经到底了', 'You\'re all caught up')}
                    </p>
                  )}
                </div>
              )}
            </Panel>
          )}

          {tab === 'hot' && (
            <div className="mt-4">
              {showHotSkeleton ? (
                <DataLoading label={t('加载热门芯喵…', 'Loading hot Chipets…')}>
                  <PetCardGridSkeleton count={6} />
                </DataLoading>
              ) : (
              <ul className="grid grid-cols-2 gap-4 md:grid-cols-3">
                {hot.map(({ pet, score, pats }, i) => (
                  <li key={pet.key}>
                    <PetCard
                      pet={pet}
                      name={pet.name}
                      sub={`${pet.owner} · ${heartOf(pet.circuitId, pet.rarity).name}`}
                      badge={`#${i + 1}`}
                      size={112}
                      tags={(
                        <>
                          <Tag tone="copper" icon={Flame}>{t(`热度 ${score}`, `Heat ${score}`)}</Tag>
                          <Tag tone="faint" icon={Hand}>{pats}</Tag>
                          <Tag tone="gold" icon={Trophy}>{t(`${pet.wins} 胜`, plural(pet.wins, 'win'))}</Tag>
                        </>
                      )}
                      onClick={() => go(`/pet/${pet.id}`)}
                      footer={
                        <>
                          <Button size="sm" variant="ghost" className="flex-1" onClick={() => go(`/pet/${pet.id}`)}>{t('串门', 'Visit')}</Button>
                          {!pet.mine && <Button size="sm" className="flex-1" icon={Swords} onClick={() => go(`/train?vs=${pet.id}`)}>{t('切磋', 'Spar')}</Button>}
                        </>
                      }
                    />
                  </li>
                ))}
              </ul>
              )}
            </div>
          )}

          {tab === 'rank' && (
            <Panel className="mt-4" bodyClass="p-4 sm:p-5">
              <Segmented size="sm" value={rankKind} onChange={setRankKind} options={[
                ['pats', t('被摸次数', 'Pats')],
                ['wins', t('对战胜场', 'Battle wins')],
                ['intimacy', t('亲密度', 'Affection')],
                ['level', t('等级', 'Level')],
              ]} />
              {showRankSkeleton ? (
                <DataLoading className="mt-4" label={t('加载排行榜…', 'Loading ranks…')}>
                  <RankListSkeleton rows={8} />
                </DataLoading>
              ) : (
              <ol className="mt-4 space-y-1.5">
                {ranks.map(({ pet, score }, i) => (
                  <li key={pet.key}>
                    <button type="button" onClick={() => go(`/pet/${pet.id}`)}
                      className={cn('flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition hover:bg-panel-2/70', pet.mine && 'bg-si/5 ring-1 ring-si/30')}>
                      <span className={cn('grid size-7 shrink-0 place-items-center rounded-full font-display text-sm font-bold', i === 0 ? 'bg-gold/20 text-gold-dim' : i < 3 ? 'bg-copper/10 text-copper-dim' : 'text-faint')}>{i + 1}</span>
                      <PetAvatar cpu={pet.cpu} circuitId={pet.circuitId} rarity={pet.rarity} mood={pet.mood} size={40} lively={false} seed={petSeed(pet)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">{pet.name}{pet.mine && <span className="ml-1.5 text-[11px] font-normal text-si-dim">{t('我的', 'mine')}</span>}</span>
                        <span className="block truncate text-[11px] text-mute">{pet.owner} · Lv.{pet.level}</span>
                      </span>
                      <span className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-panel-2 sm:block">
                        <span className="block h-full rounded-full bg-si" style={{ width: `${Math.max(4, (score / top) * 100)}%` }} />
                      </span>
                      <span className="w-10 text-right font-mono text-sm tabular-nums text-si-dim">{score}</span>
                    </button>
                  </li>
                ))}
              </ol>
              )}
            </Panel>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          {bootLoading && neighbors.length === 0 ? (
            <PlazaSidebarSkeleton />
          ) : (
          <>
          <Panel title={t('我的名片', 'My card')} icon={Users} bodyClass="p-5">
            <div className="flex items-center gap-3.5">
              <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-si/10 font-display text-2xl font-bold text-si">{profile.displayName.slice(0, 1).toUpperCase()}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-display text-lg font-bold text-ink">{profile.displayName}</div>
                <div className="font-mono text-xs text-mute">{t('好友码', 'Friend code')} {profile.friendCode}</div>
              </div>
              {!editing && (
                <button type="button" aria-label={t('修改显示名', 'Edit display name')} onClick={() => setEditing(true)}
                  className="grid size-8 shrink-0 place-items-center rounded-xl text-faint ring-1 ring-line transition hover:text-ink hover:ring-si/40">
                  <Pencil className="size-3.5" />
                </button>
              )}
            </div>
            {editing && (
              <div className="mt-4">
                <span className="mb-1.5 block font-mono text-xs text-mute">{t('显示名（留言时用）', 'Display name (shown on your notes)')}</span>
                <div className="flex gap-2">
                  <Input className="min-w-0 flex-1" autoFocus value={name} maxLength={16} onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveName()} placeholder={t('给你自己起个昵称', 'Pick a nickname')} />
                  <Button icon={Check} onClick={saveName}>{t('保存', 'Save')}</Button>
                </div>
              </div>
            )}
            <p className="mt-4 text-xs text-pretty text-faint">
              {t('连续签到 3 天起，每天多领 1 条小鱼干。鱼干可以送给邻居，也是牵线的见面礼。', 'From a 3-day streak on, you get 1 extra fish treat per day. Treats can be gifted to neighbors and are the gift for linking up.')}
            </p>
          </Panel>

          <Panel title={t('我的线友', 'My wire pals')} icon={Cable} bodyClass="p-4"
            right={<span className="font-mono text-[11px] text-mute">{bonds.length}/{maxBonds()}</span>}>
            {bonds.length === 0 ? (
              <p className="px-1 py-2 text-sm text-pretty text-mute">
                {t('去邻居家点「牵线」：两颗心脏电路串成一枚合体电路，对战时能放合体技。', 'Tap "Link up" on a neighbor\'s page: two heart circuits get wired into one fusion circuit, which unlocks a fusion move in battle.')}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {bonds.map((b) => (
                  <li key={b.key}>
                    <button type="button" onClick={() => go(`/pet/${b.id}`)}
                      className="flex w-full items-center gap-3 rounded-2xl px-2 py-1.5 text-left transition hover:bg-panel-2/70">
                      <PetAvatar cpu={b.cpu} circuitId={b.circuitId} rarity={b.rarity} mood={b.mood} size={40} lively={false} seed={petSeed(b)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">{b.name}</span>
                        <span className="block truncate font-mono text-[11px] text-mute">{b.owner} · {heartOf(b.circuitId, b.rarity).name}</span>
                      </span>
                      <Tag tone="gold" icon={Cable}>{t('已牵线', 'Linked')}</Tag>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title={t('邻居', 'Neighbors')}
            icon={Sparkles}
            bodyClass="p-4"
            right={
              neighbors.length > 0 ? (
                <Link
                  to="/neighbors"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-si-dim no-underline hover:text-si"
                >
                  {t('更多邻居', 'More neighbors')}
                  <ArrowRight className="size-3.5" />
                </Link>
              ) : null
            }
          >
            <ul className="space-y-1.5">
              {neighbors.slice(0, 5).map((p) => (
                <li key={p.key}>
                  <button type="button" onClick={() => go(`/pet/${p.id}`)}
                    className="flex w-full items-center gap-3 rounded-2xl px-2 py-1.5 text-left transition hover:bg-panel-2/70">
                    <PetAvatar cpu={p.cpu} circuitId={p.circuitId} rarity={p.rarity} mood={p.mood} size={40} lively={false} seed={petSeed(p)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{p.name}</span>
                      <span className="block truncate text-[11px] text-mute">{p.owner} · Lv.{p.level}</span>
                    </span>
                    <span className="font-mono text-[11px] text-mute">{t(`${p.wins} 胜`, plural(p.wins, 'win'))}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
          </>
          )}
        </aside>
      </div>
    </div>
  );
}
