import { useEffect, useMemo, useState } from 'react';
import { Cable, CalendarCheck, Check, ChevronLeft, ChevronRight, Fish, Flame, Hand, Pencil, Sparkles, Swords, ThumbsUp, Trophy, Users } from 'lucide-react';
import { Button, Input, PAGE, PageHeader, Panel, Segmented, StatBand, Tag, cn } from '../components/ui.tsx';
import { go } from '../router.tsx';
import { useApp } from '../state.tsx';
import { PetAvatar } from '../chipet/PetAvatar.tsx';
import { ACT_ICON, actTone, PetCard, routeIdOf, timeAgo } from '../chipet/PetCard.tsx';
import { heartOf } from '../chipet/heart.ts';
import { maxBonds, social } from '../chipet/social.ts';
import { plural, txt, useLang, useT } from '../i18n.ts';

/** 广场动态每页条数 */
const FEED_PAGE = 20;

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

export function Plaza() {
  const t = useT();
  const lang = useLang();
  const { notify } = useApp();
  const [tab, setTab] = useState<'feed' | 'hot' | 'rank'>('feed');
  const [rankKind, setRankKind] = useState<'pats' | 'wins' | 'intimacy' | 'level'>('pats');
  const [name, setName] = useState(social.profile().displayName);
  const [editing, setEditing] = useState(false);
  const [tick, setTick] = useState(0);
  const [feedPage, setFeedPage] = useState(1);
  const profile = useMemo(() => social.profile(), [tick, lang]);
  const activities = useMemo(() => social.activities(), [tick]);
  const feedPages = Math.max(1, Math.ceil(activities.length / FEED_PAGE));
  const feed = useMemo(() => {
    const page = Math.min(Math.max(1, feedPage), feedPages);
    const start = (page - 1) * FEED_PAGE;
    return activities.slice(start, start + FEED_PAGE);
  }, [activities, feedPage, feedPages]);
  const hot = useMemo(() => social.leaderboard('pats').slice(0, 6), [tick]);
  const ranks = useMemo(() => social.leaderboard(rankKind), [tick, rankKind]);
  const bonds = useMemo(() => social.bonds(), [tick]);
  const neighbors = useMemo(() => social.neighbors(), [tick]);
  const top = ranks[0]?.score || 1;

  useEffect(() => { setFeedPage(1); }, [tick, tab]);
  useEffect(() => {
    setFeedPage((p) => Math.min(Math.max(1, p), feedPages));
  }, [feedPages]);

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
            {profile.checkedIn ? t('今日已签到', 'Checked in today') : t('每日签到领鱼干', 'Check in for fish treats')}
          </Button>
        }
      />

      <StatBand className="mt-6" items={[
        { icon: Users, label: t('邻居芯喵', 'Neighbor kitties'), value: neighbors.length, tone: 'si' },
        { icon: Cable, label: t('我的线友', 'My wire pals'), value: `${bonds.length}/${maxBonds()}`, tone: 'gold' },
        { icon: Flame, label: t('连续签到（天）', 'Check-in streak (days)'), value: profile.streak, tone: 'copper' },
        { icon: Fish, label: t('小鱼干', 'Fish treats'), value: profile.fish, tone: 'violet' },
      ]} />
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
              {activities.length === 0 ? (
                <p className="p-10 text-center text-sm text-mute">{t('还没有动态，去孵化或摸摸邻居吧。', 'Nothing here yet. Hatch a kitty or go pat a neighbor.')}</p>
              ) : (
                <>
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
                  {feedPages > 1 && (
                    <nav
                      aria-label={t('动态分页', 'Feed pagination')}
                      className="flex flex-wrap items-center justify-end gap-1.5 border-t border-line/70 px-4 py-3"
                    >
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={ChevronLeft}
                        disabled={feedPage <= 1}
                        onClick={() => setFeedPage((p) => Math.max(1, p - 1))}
                        aria-label={t('上一页', 'Previous page')}
                      >
                        {t('上一页', 'Prev')}
                      </Button>
                      {pageWindow(feedPage, feedPages).map((item, i) => (
                        item === '…' ? (
                          <span key={`e${i}`} className="px-1 font-mono text-xs text-faint" aria-hidden>…</span>
                        ) : (
                          <button
                            key={item}
                            type="button"
                            aria-label={t(`第 ${item} 页`, `Page ${item}`)}
                            aria-current={item === feedPage ? 'page' : undefined}
                            onClick={() => setFeedPage(item)}
                            className={cn(
                              'grid min-w-8 place-items-center rounded-full px-2.5 py-1.5 font-mono text-xs tabular-nums transition',
                              item === feedPage
                                ? 'bg-copper text-white shadow-sm'
                                : 'text-mute ring-1 ring-line hover:text-ink hover:ring-copper/40',
                            )}
                          >
                            {item}
                          </button>
                        )
                      ))}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={feedPage >= feedPages}
                        onClick={() => setFeedPage((p) => Math.min(feedPages, p + 1))}
                        aria-label={t('下一页', 'Next page')}
                      >
                        {t('下一页', 'Next')}
                        <ChevronRight className="size-4" />
                      </Button>
                    </nav>
                  )}
                </>
              )}
            </Panel>
          )}

          {tab === 'hot' && (
            <ul className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3">
              {hot.map(({ pet, score }, i) => (
                <li key={pet.key}>
                  <PetCard
                    pet={pet}
                    name={pet.name}
                    sub={`${pet.owner} · ${heartOf(pet.circuitId, pet.rarity).name}`}
                    badge={`#${i + 1}`}
                    size={112}
                    tags={<><Tag tone="copper" icon={Hand}>{score}</Tag><Tag tone="gold" icon={Trophy}>{t(`${pet.wins} 胜`, plural(pet.wins, 'win'))}</Tag></>}
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

          {tab === 'rank' && (
            <Panel className="mt-4" bodyClass="p-4 sm:p-5">
              <Segmented size="sm" value={rankKind} onChange={setRankKind} options={[
                ['pats', t('被摸次数', 'Pats')],
                ['wins', t('对战胜场', 'Battle wins')],
                ['intimacy', t('亲密度', 'Affection')],
                ['level', t('等级', 'Level')],
              ]} />
              <ol className="mt-4 space-y-1.5">
                {ranks.map(({ pet, score }, i) => (
                  <li key={pet.key}>
                    <button type="button" onClick={() => go(`/pet/${pet.id}`)}
                      className={cn('flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition hover:bg-panel-2/70', pet.mine && 'bg-si/5 ring-1 ring-si/30')}>
                      <span className={cn('grid size-7 shrink-0 place-items-center rounded-full font-display text-sm font-bold', i === 0 ? 'bg-gold/20 text-gold-dim' : i < 3 ? 'bg-copper/10 text-copper-dim' : 'text-faint')}>{i + 1}</span>
                      <PetAvatar cpu={pet.cpu} circuitId={pet.circuitId} rarity={pet.rarity} mood={pet.mood} size={40} lively={false} />
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
            </Panel>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
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
                      <PetAvatar cpu={b.cpu} circuitId={b.circuitId} rarity={b.rarity} mood={b.mood} size={40} lively={false} />
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

          <Panel title={t('邻居', 'Neighbors')} icon={Sparkles} bodyClass="p-4">
            <ul className="space-y-1.5">
              {neighbors.slice(0, 5).map((p) => (
                <li key={p.key}>
                  <button type="button" onClick={() => go(`/pet/${p.id}`)}
                    className="flex w-full items-center gap-3 rounded-2xl px-2 py-1.5 text-left transition hover:bg-panel-2/70">
                    <PetAvatar cpu={p.cpu} circuitId={p.circuitId} rarity={p.rarity} mood={p.mood} size={40} lively={false} />
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
        </aside>
      </div>
    </div>
  );
}
