import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowRight, Cable, CalendarCheck, Check, Fish, Flame, Hand, Loader2, Pencil, RefreshCw, Sparkles, Swords, ThumbsUp, Trophy, Users } from 'lucide-react';
import { fetchChipetFeed } from '../api.ts';
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
  cloudSync, getCachedLeaderboard, getCloudSyncRev, getLeaderboardRev,
  isLeaderboardLoading, isPublicLoading,
  leaderboardItemToPet, subscribeCloudSync, subscribeLeaderboard,
} from '../chipet/cloudSync.ts';
import { hydrateChainRivals } from '../chipet/rivals.ts';
import { getSocialRev, maxBonds, social, subscribeSocial, type Activity } from '../chipet/social.ts';
import { plural, txt, useLang, useT } from '../i18n.ts';

/** 广场动态每批条数（与后端 offset/limit 对齐） */
const FEED_PAGE = 20;
/** 切回动态 Tab / 后台补新：距上次成功拉取不足此时长则不再打网络 */
const FEED_HEAD_STALE_MS = 30_000;
/** 可视区约 10 行高（与行 min-h-[4.75rem] 对齐） */
const FEED_VIEW_CLASS = 'max-h-[47.5rem]';
/** 自定义绿色拇指固定高度（px），故意比原生可视比拇指短 */
const FEED_THUMB_PX = 48;
/** 列表底栏固定高度，避免「加载中 / 到底」切换时撑缩抖动 */
const FEED_FOOTER_H = 'h-10';

type FeedRow = Activity & { likes: number; liked: boolean };

function mergeLikeState(items: Activity[], likesMap: Record<string, number>): FeedRow[] {
  const local = social.activities();
  const byId = new Map(local.map((a) => [a.id, a]));
  return items.map((a) => {
    const hit = byId.get(a.id);
    return {
      ...a,
      likes: hit?.likes ?? likesMap[a.id] ?? (a as { likes?: number }).likes ?? 0,
      liked: hit?.liked ?? false,
    };
  });
}

/** 软合并：新帖插到顶部，已加载的旧页保留，避免轮询把列表裁回首屏导致跳动 */
function softMergeFeedHead(prev: FeedRow[], incoming: FeedRow[]): FeedRow[] {
  if (!prev.length) return incoming;
  const prevById = new Map(prev.map((a) => [a.id, a]));
  const freshById = new Map(incoming.map((a) => [a.id, a]));
  const brandNew = incoming.filter((a) => !prevById.has(a.id));
  const rest = prev.map((a) => {
    const f = freshById.get(a.id);
    return f ? { ...a, likes: f.likes, liked: f.liked || a.liked } : a;
  });
  return brandNew.length ? [...brandNew, ...rest] : rest;
}

export function Plaza() {
  const t = useT();
  const lang = useLang();
  const { account, notify } = useApp();
  const [tab, setTab] = useState<'feed' | 'hot' | 'rank'>('feed');
  const [rankKind, setRankKind] = useState<'pats' | 'wins' | 'intimacy' | 'level'>('pats');
  const [name, setName] = useState(() => social.profile().displayName);
  const [editing, setEditing] = useState(false);
  const [tick, setTick] = useState(0);
  /** 广场列表：组件内直打 API，不走本地页缓存 */
  const [feedItems, setFeedItems] = useState<FeedRow[]>([]);
  const [feedTotal, setFeedTotal] = useState(0);
  const [feedHeadLoading, setFeedHeadLoading] = useState(true);
  const [feedMoreLoading, setFeedMoreLoading] = useState(false);
  const feedItemsRef = useRef<FeedRow[]>([]);
  const feedTotalRef = useRef(0);
  const feedMoreLoadingRef = useRef(false);
  const feedHeadLoadingRef = useRef(true);
  /** DOM 提交后再钉住/补偿 scrollTop，避免加载时视口跳动 */
  const feedScrollBoostRef = useRef<number | null>(null);
  const lastScrollTop = useRef(0);
  const nextOffset = useRef(0);
  const headPending = useRef(false);
  const lastHeadAt = useRef(0);
  const nextPage = useRef<{ offset: number; request: ReturnType<typeof fetchChipetFeed> } | null>(null);
  const feedScrollRef = useRef<HTMLDivElement>(null);
  const feedSentinelRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const socialRev = useSyncExternalStore(subscribeSocial, getSocialRev, getSocialRev);
  const boardRev = useSyncExternalStore(subscribeLeaderboard, getLeaderboardRev, getLeaderboardRev);
  useSyncExternalStore(subscribeCloudSync, getCloudSyncRev, getCloudSyncRev);
  const bootLoading = isPublicLoading();
  const boardLoading = isLeaderboardLoading();
  const profile = useMemo(() => social.profile(), [tick, lang, socialRev]);
  feedItemsRef.current = feedItems;
  feedTotalRef.current = feedTotal;
  feedMoreLoadingRef.current = feedMoreLoading;
  feedHeadLoadingRef.current = feedHeadLoading;
  // 点赞态跟 social 刷新
  const feed = useMemo(() => {
    const local = social.activities();
    const byId = new Map(local.map((a) => [a.id, a]));
    return feedItems.map((a) => {
      const hit = byId.get(a.id);
      return hit
        ? { ...a, likes: hit.likes, liked: hit.liked }
        : a;
    });
  }, [feedItems, tick, socialRev]);
  const feedHasMore = nextOffset.current < feedTotal;
  const feedLoadingMore = feedMoreLoading;
  const feedInitialPending = feedHeadLoading && feedItems.length === 0;
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
  const showFeedSkeleton = feedInitialPending;
  const showHotSkeleton = (bootLoading || boardLoading) && hot.length === 0;
  const showRankSkeleton = (bootLoading || boardLoading) && ranks.length === 0;

  const boardRequests = useRef(new Map<string, number>());
  useEffect(() => {
    if (tab === 'feed') return;
    const kind = tab === 'hot' ? 'heat' : rankKind;
    if (Date.now() - (boardRequests.current.get(kind) ?? 0) < 15_000) return;
    boardRequests.current.set(kind, Date.now());
    void cloudSync.refreshLeaderboard(kind);
  }, [tab, rankKind]);

  const requestPage = useCallback((offset: number) => {
    if (nextPage.current?.offset === offset) return nextPage.current.request;
    const request = fetchChipetFeed({ limit: FEED_PAGE, offset });
    nextPage.current = { offset, request };
    void request.then(result => {
      if (!result && nextPage.current?.request === request) nextPage.current = null;
    });
    return request;
  }, []);

  /** replace：手动刷新整表对齐；默认 soft 合并，避免轮询裁掉已加载页 */
  const loadFeedHead = useCallback(async (opts?: { replace?: boolean }) => {
    if (headPending.current || feedMoreLoadingRef.current) return;
    headPending.current = true;
    const hadItems = feedItemsRef.current.length > 0;
    const replace = !!opts?.replace || !hadItems;
    if (replace) setFeedHeadLoading(true);
    try {
      const r = await fetchChipetFeed({ limit: FEED_PAGE, offset: 0 });
      if (!r) return;
      const items = (r.items ?? []) as Activity[];
      const likes = r.likes ?? {};
      const next = mergeLikeState(items, likes);
      setFeedTotal(Math.max(0, Number(r.total) || items.length));
      if (!replace && hadItems) {
        const existing = new Set(feedItemsRef.current.map(row => row.id));
        const added = next.filter(row => !existing.has(row.id)).length;
        if (added) {
          nextOffset.current += added;
          nextPage.current = null;
        }
        const scroller = feedScrollRef.current;
        const prevTop = scroller?.scrollTop ?? 0;
        const prevHeight = scroller?.scrollHeight ?? 0;
        setFeedItems((prev) => softMergeFeedHead(prev, next));
        // 顶部插入新帖：记下高度差，layout 后再补偿
        if (prevTop > 0) feedScrollBoostRef.current = prevHeight;
      } else {
        nextOffset.current = next.length;
        nextPage.current = null;
        setFeedItems(next);
        lastScrollTop.current = 0;
        if (feedScrollRef.current) feedScrollRef.current.scrollTop = 0;
      }
      if (items.length) social.applyCloudFeed(items, likes, false);
      // 首屏 / 整表刷新后立刻预取第 2 页，滚动时不卡在跨洋 RTT
      lastHeadAt.current = Date.now();
      if (replace && next.length < Number(r.total)) void requestPage(next.length);
    } finally {
      headPending.current = false;
      setFeedHeadLoading(false);
    }
  }, [requestPage]);

  const refreshFeedManual = useCallback(() => {
    // 手动刷新：打穿 30s 节流，整表重拉
    lastHeadAt.current = 0;
    void loadFeedHead({ replace: true });
  }, [loadFeedHead]);

  /** 触底时复用同一页的预取请求 */
  const loadFeedMore = useCallback(async () => {
    if (feedMoreLoadingRef.current || feedHeadLoadingRef.current) return;
    const offset = nextOffset.current;
    const total = feedTotalRef.current;
    if (offset >= total && total > 0) return;
    feedMoreLoadingRef.current = true;
    setFeedMoreLoading(true);
    let nextPrefetchAt: number | null = null;
    try {
      const r = await requestPage(offset);
      if (!r || offset !== nextOffset.current) return;
      const items = (r.items ?? []) as Activity[];
      const likes = r.likes ?? {};
      const pageItems = mergeLikeState(items, likes);
      const pageTotal = r.total ?? total;
      setFeedTotal(pageTotal);
      if (items.length) social.applyCloudFeed(items, likes, false);
      if (!pageItems.length) {
        setFeedTotal((prev) => Math.min(prev, offset));
        return;
      }

      nextOffset.current = offset + pageItems.length;
      setFeedItems((prev) => {
        const seen = new Set(prev.map((a) => a.id));
        return [...prev, ...pageItems.filter((a) => !seen.has(a.id))];
      });
      if (offset + pageItems.length < pageTotal) nextPrefetchAt = offset + pageItems.length;
    } finally {
      feedMoreLoadingRef.current = false;
      setFeedMoreLoading(false);
    }
    // finally 清掉 loading 后再预取，避免被 moreLoading 挡掉
    if (nextPrefetchAt != null) void requestPage(nextPrefetchAt);
  }, [requestPage]);

  useLayoutEffect(() => {
    const el = feedScrollRef.current;
    if (!el) return;
    if (feedScrollBoostRef.current != null) {
      const prevHeight = feedScrollBoostRef.current;
      feedScrollBoostRef.current = null;
      const delta = el.scrollHeight - prevHeight;
      if (delta > 0) el.scrollTop += delta;
    }
  }, [feedItems]);

  // 返回动态时保留分页；距上次拉取不足 30s 不重打网络
  useEffect(() => {
    if (tab !== 'feed') return;
    if (Date.now() - lastHeadAt.current >= FEED_HEAD_STALE_MS) void loadFeedHead();
    const timer = window.setInterval(() => {
      if (Date.now() - lastHeadAt.current >= FEED_HEAD_STALE_MS) void loadFeedHead();
    }, FEED_HEAD_STALE_MS);
    return () => window.clearInterval(timer);
  }, [tab, loadFeedHead]);

  const syncFeedThumb = useCallback(() => {
    const el = feedScrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const thumb = thumbRef.current;
    if (!thumb) return;
    lastScrollTop.current = scrollTop;
    const track = Math.max(0, clientHeight - 16);
    if (scrollHeight <= clientHeight + 1 || track <= FEED_THUMB_PX) {
      thumb.style.visibility = 'hidden';
      return;
    }
    const maxTop = track - FEED_THUMB_PX;
    const ratio = scrollTop / Math.max(1, scrollHeight - clientHeight);
    thumb.style.transform = `translateY(${ratio * maxTop}px)`;
    thumb.style.visibility = 'visible';
  }, []);

  useLayoutEffect(() => {
    if (tab === 'feed' && feedScrollRef.current) feedScrollRef.current.scrollTop = lastScrollTop.current;
  }, [tab]);

  useEffect(() => {
    if (tab !== 'feed') return;
    syncFeedThumb();
    const el = feedScrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => syncFeedThumb());
    ro.observe(el);
    return () => ro.disconnect();
  }, [tab, feed.length, feedLoadingMore, syncFeedThumb]);

  // 触底哨兵：再抓下一批（依赖尽量少，避免反复 disconnect 造成抖动）
  useEffect(() => {
    if (tab !== 'feed') return;
    const root = feedScrollRef.current;
    const sentinel = feedSentinelRef.current;
    if (!root || !sentinel) return;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      if (feedMoreLoadingRef.current || feedHeadLoadingRef.current) return;
      if (nextOffset.current >= feedTotalRef.current && feedTotalRef.current > 0) return;
      void loadFeedMore();
    }, { root, rootMargin: '120px 0px', threshold: 0 });
    io.observe(sentinel);
    return () => io.disconnect();
  }, [tab, showFeedSkeleton, feedTotal > 0, loadFeedMore]);

  // 侧栏邻居 /「更多邻居」混入其他玩家的链上芯喵
  useEffect(() => {
    void hydrateChainRivals({ exclude: account, limit: 48 });
  }, [account]);

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
          <div className="flex items-center gap-3">
            <Segmented value={tab} onChange={setTab} options={[
              ['feed', t('动态', 'Feed'), Users],
              ['hot', t('热门', 'Hot'), Sparkles],
              ['rank', t('排行', 'Ranks'), Trophy],
            ]} />
            {tab === 'feed' && !showFeedSkeleton && feedTotal > 0 && (
              <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 font-mono text-[11px] tabular-nums text-mute">
                <button
                  type="button"
                  aria-label={t('刷新动态', 'Refresh feed')}
                  disabled={feedHeadLoading || feedMoreLoading}
                  onClick={refreshFeedManual}
                  className={cn(
                    'grid size-6 place-items-center rounded-lg text-faint transition',
                    'hover:bg-panel-2 hover:text-copper-dim disabled:opacity-40',
                  )}
                >
                  <RefreshCw className={cn('size-3.5', feedHeadLoading && 'animate-spin text-copper')} />
                </button>
                {t(`共 ${feedTotal} 条动态`, `${plural(feedTotal, 'post')} in total`)}
              </span>
            )}
          </div>

          {tab === 'feed' && (
            <>
              <Panel className="mt-4" bodyClass="p-0">
                {showFeedSkeleton ? (
                  <DataLoading label={t('加载广场动态…', 'Loading plaza feed…')}>
                    <FeedSkeleton rows={10} />
                  </DataLoading>
                ) : feedTotal === 0 ? (
                  <p className="p-10 text-center text-sm text-mute">{t('还没有动态，去孵化或摸摸邻居吧。', 'Nothing here yet. Hatch a kitty or go pat a neighbor.')}</p>
                ) : (
                  <div className={cn('flex min-h-0 items-stretch overflow-hidden', FEED_VIEW_CLASS)}>
                    <div
                      ref={feedScrollRef}
                      onScroll={syncFeedThumb}
                      className="chip-scroll-feed min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain"
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
                      {/* 固定底栏高度：加载中 / 到底文案切换不撑缩 */}
                      <div className={cn(FEED_FOOTER_H, 'flex items-center justify-center px-5')}>
                        {feedLoadingMore ? (
                          <p className="flex items-center justify-center gap-2 text-[12px] leading-relaxed text-mute" role="status" aria-live="polite">
                            <span className="h-px w-8 bg-line/80" aria-hidden />
                            <Loader2 className="size-3.5 shrink-0 animate-spin text-copper" aria-hidden />
                            <span className="animate-pulse">{t('加载更多动态…', 'Loading more…')}</span>
                            <span className="h-px w-8 bg-line/80" aria-hidden />
                          </p>
                        ) : !feedHasMore && feed.length > 0 ? (
                          <p className="flex items-center justify-center gap-2 text-[12px] leading-relaxed text-faint">
                            <span className="h-px w-8 bg-line/80" aria-hidden />
                            <span>{t('已经到底了', 'You\'re all caught up')}</span>
                            <span className="h-px w-8 bg-line/80" aria-hidden />
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div
                      className="chip-scroll-feed-track"
                      aria-hidden
                    >
                      <div className="chip-scroll-feed-thumb" ref={thumbRef} />
                    </div>
                  </div>
                )}
              </Panel>
              {feedTotal > 0 && !showFeedSkeleton && (
                <p className="mt-3 flex items-center justify-center gap-2 text-center text-[12px] leading-relaxed text-mute">
                  <span className="h-px w-8 bg-line/80" aria-hidden />
                  <span>
                    {t(
                      '列表内下拉滚动，触底后自动加载下一批动态',
                      'Scroll inside the list — more posts load as you reach the bottom',
                    )}
                  </span>
                  <span className="h-px w-8 bg-line/80" aria-hidden />
                </p>
              )}
            </>
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
