import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Cat, Database, Filter, Gauge, Loader2, RefreshCw, ShieldCheck, Sparkles, Zap,
} from 'lucide-react';
import { CHAINS, CHAIN_LABEL } from '@tapearena/chain';
import { PaginationBar } from '../components/Pagination.tsx';
import { Button, Field, PAGE, Panel, Select, Tag, cn } from '../components/ui.tsx';
import { useT } from '../i18n.ts';
import { go, Link } from '../router.tsx';
import { short } from '../format.ts';
import {
  adminCats, adminSession, adminSyncCats,
  type AdminCatsFilter,
  type ArchivedPet,
} from '../adminAuth.ts';

const PAGE_SIZE = 10;

type EnergyBand = 'all' | 'low' | 'mid' | 'high';
type LevelBand = 'all' | '1-3' | '4-6' | '7+';
type RarityBand = 'all' | '0' | '1' | '2';

function rarityLabel(r: number, t: (zh: string, en: string) => string) {
  if (r === 2) return t('限定', 'Exclusive');
  if (r === 1) return t('珍奇', 'Fancy');
  return t('普通', 'Common');
}

function rarityTone(r: number): 'copper' | 'gold' | 'si' | 'neutral' {
  if (r === 2) return 'copper';
  if (r === 1) return 'gold';
  return 'neutral';
}

function when(ms?: number) {
  return ms ? new Date(ms).toLocaleString() : '—';
}

function explorer(chainId: number, addr: string) {
  const base = CHAINS[chainId as keyof typeof CHAINS]?.blockExplorers?.default.url;
  if (!base) return null;
  return `${base.replace(/\/$/, '')}/address/${addr}`;
}

function toApiFilter(energy: EnergyBand, level: LevelBand, rarity: RarityBand): AdminCatsFilter {
  const f: AdminCatsFilter = {};
  if (rarity !== 'all') f.rarity = Number(rarity);
  if (level === '1-3') { f.levelMin = 1; f.levelMax = 3; }
  else if (level === '4-6') { f.levelMin = 4; f.levelMax = 6; }
  else if (level === '7+') { f.levelMin = 7; }
  if (energy === 'low') { f.energyMin = 0; f.energyMax = 39; }
  else if (energy === 'mid') { f.energyMin = 40; f.energyMax = 70; }
  else if (energy === 'high') { f.energyMin = 71; }
  return f;
}

export function AdminCats() {
  const t = useT();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [err, setErr] = useState('');
  const [items, setItems] = useState<ArchivedPet[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [archived, setArchived] = useState(0);
  const [energy, setEnergy] = useState<EnergyBand>('all');
  const [level, setLevel] = useState<LevelBand>('all');
  const [rarity, setRarity] = useState<RarityBand>('all');
  const autoSyncTried = useRef(false);

  const filter = useMemo(
    () => toApiFilter(energy, level, rarity),
    [energy, level, rarity],
  );

  useEffect(() => {
    let alive = true;
    void adminSession().then((ok) => {
      if (!alive) return;
      if (!ok) {
        go('/admin');
        return;
      }
      setAuthed(true);
    });
    return () => { alive = false; };
  }, []);

  const load = useCallback(async (p: number, f: AdminCatsFilter) => {
    setBusy(true);
    setErr('');
    try {
      const data = await adminCats(p, PAGE_SIZE, f);
      setItems(data.items);
      setTotal(data.total);
      setPages(data.pages);
      setPage(data.page);
      setArchived(data.archived);
      return data;
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.status === 401) {
        go('/admin');
        return null;
      }
      setErr(err.message || t('加载失败', 'Load failed'));
      setItems([]);
      return null;
    } finally {
      setBusy(false);
    }
  }, [t]);

  const onSync = useCallback(async () => {
    setSyncing(true);
    setErr('');
    try {
      const r = await adminSyncCats();
      setArchived(r.archived);
      await load(1, filter);
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.status === 401) {
        go('/admin');
        return;
      }
      setErr(err.message || t('同步失败', 'Sync failed'));
    } finally {
      setSyncing(false);
    }
  }, [load, filter, t]);

  useEffect(() => {
    if (!authed) return;
    void load(page, filter);
  }, [authed, page, filter, load]);

  // 库空时自动全量同步一次（链上已有猫、部署后尚未入库）
  useEffect(() => {
    if (!authed || autoSyncTried.current) return;
    autoSyncTried.current = true;
    void (async () => {
      try {
        const probe = await adminCats(1, 1);
        if (probe.archived === 0) await onSync();
      } catch {
        /* ignore */
      }
    })();
  }, [authed, onSync]);

  if (authed === null) {
    return (
      <div className={cn(PAGE, 'grid min-h-[50vh] place-items-center py-16')}>
        <Loader2 className="size-6 animate-spin text-copper" />
      </div>
    );
  }

  return (
    <div className={cn(PAGE, 'py-6 sm:py-8')}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-ink">
            <ArrowLeft className="size-4" />
            {t('返回运营看板', 'Back to admin')}
          </Link>
          <div className="mt-3 flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-copper to-copper-dim text-white shadow-md shadow-copper/25">
              <Cat className="size-5" />
            </span>
            <div>
              <h1 className="font-display text-2xl font-bold text-ink">{t('猫咪存档', 'Cat archive')}</h1>
              <p className="mt-0.5 text-sm text-mute">
                {t(
                  '全链芯宠属性一张表；可按能量、等级、稀有度筛选。每页 10 条。',
                  'All-chain Chipet archive; filter by energy, level, rarity. 10 per page.',
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center gap-2 rounded-full border border-si/25 bg-gradient-to-r from-si/10 to-transparent px-3 py-1.5 shadow-sm shadow-si/10">
            <span className="grid size-6 place-items-center rounded-full bg-si/15 text-si">
              <ShieldCheck className="size-3.5" />
            </span>
            <span className="text-xs font-semibold text-si">{t('已登录', 'Signed in')}</span>
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gradient-to-r from-gold/15 to-transparent px-3 py-1.5 shadow-sm shadow-gold/10">
            <span className="grid size-6 place-items-center rounded-full bg-gold/20 text-gold">
              <Database className="size-3.5" />
            </span>
            <span className="text-xs font-semibold tabular-nums text-ink">
              {t('存档', 'Archived')}
              <span className="ml-1.5 font-mono text-gold">{archived}</span>
            </span>
          </span>
          <Button
            size="sm"
            variant="primary"
            disabled={syncing || busy}
            onClick={() => void onSync()}
            className="shadow-md shadow-copper/20"
          >
            {syncing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            {t('从链上同步入库', 'Sync from chain')}
          </Button>
        </div>
      </div>

      {err && (
        <p className="mt-4 rounded-xl bg-copper/10 px-3 py-2 text-sm text-copper">{err}</p>
      )}

      <Panel className="mt-5 overflow-hidden" bodyClass="p-0">
        <div className="flex flex-wrap items-end gap-3 border-b border-line/70 bg-gradient-to-r from-panel-2/80 via-panel to-panel px-4 py-3.5">
          <span className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wide text-faint">
            <Filter className="size-3.5" />
            {t('筛选', 'Filters')}
          </span>
          <Field label={t('能量', 'Energy')} icon={Zap} className="min-w-[140px] flex-1 sm:flex-none">
            <Select
              value={energy}
              onChange={(e) => { setEnergy(e.target.value as EnergyBand); setPage(1); }}
              className="h-9 min-w-[140px] text-[13px]"
            >
              <option value="all">{t('全部能量', 'All energy')}</option>
              <option value="low">{t('低 · 0–39', 'Low · 0–39')}</option>
              <option value="mid">{t('中 · 40–70', 'Mid · 40–70')}</option>
              <option value="high">{t('高 · 71+', 'High · 71+')}</option>
            </Select>
          </Field>
          <Field label={t('等级', 'Level')} icon={Gauge} className="min-w-[140px] flex-1 sm:flex-none">
            <Select
              value={level}
              onChange={(e) => { setLevel(e.target.value as LevelBand); setPage(1); }}
              className="h-9 min-w-[140px] text-[13px]"
            >
              <option value="all">{t('全部等级', 'All levels')}</option>
              <option value="1-3">Lv.1–3</option>
              <option value="4-6">Lv.4–6</option>
              <option value="7+">Lv.7+</option>
            </Select>
          </Field>
          <Field label={t('稀有度', 'Rarity')} icon={Sparkles} className="min-w-[140px] flex-1 sm:flex-none">
            <Select
              value={rarity}
              onChange={(e) => { setRarity(e.target.value as RarityBand); setPage(1); }}
              className="h-9 min-w-[140px] text-[13px]"
            >
              <option value="all">{t('全部稀有度', 'All rarities')}</option>
              <option value="0">{t('普通', 'Common')}</option>
              <option value="1">{t('珍奇', 'Fancy')}</option>
              <option value="2">{t('限定', 'Exclusive')}</option>
            </Select>
          </Field>
          <p className="mb-2 ml-auto text-xs text-mute tabular-nums">
            {busy ? t('加载中…', 'Loading…') : t(`匹配 ${total} / 存档 ${archived}`, `Match ${total} / archived ${archived}`)}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-line/80 bg-panel-2/60 text-[11px] font-mono uppercase tracking-wide text-faint">
              <tr>
                <th className="px-4 py-3 font-medium">ID</th>
                <th className="px-4 py-3 font-medium">{t('名字', 'Name')}</th>
                <th className="px-4 py-3 font-medium">{t('稀有度', 'Rarity')}</th>
                <th className="px-4 py-3 font-medium">{t('主人', 'Owner')}</th>
                <th className="px-4 py-3 font-medium">{t('属性', 'Stats')}</th>
                <th className="px-4 py-3 font-medium">{t('电路', 'Circuit')}</th>
                <th className="px-4 py-3 font-medium">{t('更新', 'Updated')}</th>
                <th className="px-4 py-3 font-medium">{t('链', 'Chain')}</th>
              </tr>
            </thead>
            <tbody>
              {busy && items.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-mute">
                    <Loader2 className="mx-auto size-5 animate-spin text-copper" />
                  </td>
                </tr>
              )}
              {!busy && items.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-mute">
                    {archived === 0
                      ? t('尚无存档。点「从链上同步入库」拉取全量猫咪。', 'No archive yet. Tap “Sync from chain” to pull all cats.')
                      : t('当前筛选无结果，试试放宽条件。', 'No matches for these filters — try widening them.')}
                  </td>
                </tr>
              )}
              {items.map((p) => {
                const url = explorer(p.chainId, p.owner);
                return (
                  <tr key={`${p.chainId}-${p.petId}`} className="border-b border-line/50 last:border-0 hover:bg-panel-2/40">
                    <td className="px-4 py-3 font-mono tabular-nums text-ink">#{p.petId}</td>
                    <td className="px-4 py-3 font-semibold text-ink">{p.name || '—'}</td>
                    <td className="px-4 py-3">
                      <Tag tone={rarityTone(p.rarity)}>{rarityLabel(p.rarity, t)}</Tag>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-mute">
                      {url ? (
                        <a href={url} target="_blank" rel="noreferrer" className="hover:text-ink">{short(p.owner, 5)}</a>
                      ) : short(p.owner, 5)}
                    </td>
                    <td className="px-4 py-3 text-xs text-mute">
                      <span className="tabular-nums">
                        Lv{p.level} · E{p.energy} · M{p.mood} · I{p.intimacy}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-faint">
                      #{p.circuitId}
                      {p.gates != null ? ` · ${p.gates}g` : ''}
                      {p.nIn != null && p.nOut != null ? ` · ${p.nIn}→${p.nOut}` : ''}
                    </td>
                    <td className="px-4 py-3 text-xs text-faint">{when(p.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <Tag tone={p.chainId === 56 ? 'gold' : 'si'}>
                        {CHAIN_LABEL[p.chainId] ?? p.chainId}
                      </Tag>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <PaginationBar
          page={page}
          pages={pages}
          onChange={setPage}
          label={t('猫咪存档分页', 'Cat archive pagination')}
          hideWhenSingle={false}
        />
      </Panel>
    </div>
  );
}
