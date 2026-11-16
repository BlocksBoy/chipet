import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Cat, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { CHAINS, CHAIN_LABEL } from '@tapearena/chain';
import { PaginationBar } from '../components/Pagination.tsx';
import { Button, PAGE, Panel, Tag, cn } from '../components/ui.tsx';
import { useT } from '../i18n.ts';
import { go, Link } from '../router.tsx';
import { short } from '../format.ts';
import {
  adminCats, adminSession, adminSyncCats,
  type ArchivedPet,
} from '../adminAuth.ts';

const PAGE_SIZE = 20;

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
  const autoSyncTried = useRef(false);

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

  const load = useCallback(async (p: number) => {
    setBusy(true);
    setErr('');
    try {
      const data = await adminCats(p, PAGE_SIZE);
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
      await load(1);
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
  }, [load, t]);

  useEffect(() => {
    if (!authed) return;
    void load(page);
  }, [authed, page, load]);

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
            <span className="grid size-10 place-items-center rounded-xl bg-copper-dim text-white">
              <Cat className="size-5" />
            </span>
            <div>
              <h1 className="font-display text-2xl font-bold text-ink">{t('猫咪存档', 'Cat archive')}</h1>
              <p className="mt-0.5 text-sm text-mute">
                {t(
                  '全链芯宠属性一张表；「链」列区分来源。每页 20 条。',
                  'All-chain Chipet archive in one table; Chain column marks the source. 20 per page.',
                )}
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tag tone="neutral" icon={ShieldCheck}>{t('已登录', 'Signed in')}</Tag>
          <Tag tone="neutral">{t(`存档 ${archived}`, `Archived ${archived}`)}</Tag>
          <Button size="sm" variant="ghost" disabled={syncing || busy} onClick={() => void onSync()}>
            {syncing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            {t('从链上同步入库', 'Sync from chain')}
          </Button>
        </div>
      </div>

      {err && (
        <p className="mt-4 rounded-xl bg-copper/10 px-3 py-2 text-sm text-copper">{err}</p>
      )}

      <Panel className="mt-5 overflow-hidden" bodyClass="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-line/80 bg-panel-2/60 text-[11px] font-mono uppercase tracking-wide text-faint">
              <tr>
                <th className="px-4 py-3 font-medium">{t('链', 'Chain')}</th>
                <th className="px-4 py-3 font-medium">ID</th>
                <th className="px-4 py-3 font-medium">{t('名字', 'Name')}</th>
                <th className="px-4 py-3 font-medium">{t('稀有度', 'Rarity')}</th>
                <th className="px-4 py-3 font-medium">{t('主人', 'Owner')}</th>
                <th className="px-4 py-3 font-medium">{t('属性', 'Stats')}</th>
                <th className="px-4 py-3 font-medium">{t('电路', 'Circuit')}</th>
                <th className="px-4 py-3 font-medium">{t('更新', 'Updated')}</th>
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
                    {t('尚无存档。点「从链上同步入库」拉取全量猫咪。', 'No archive yet. Tap “Sync from chain” to pull all cats.')}
                  </td>
                </tr>
              )}
              {items.map((p) => {
                const url = explorer(p.chainId, p.owner);
                return (
                  <tr key={`${p.chainId}-${p.petId}`} className="border-b border-line/50 last:border-0 hover:bg-panel-2/40">
                    <td className="px-4 py-3">
                      <Tag tone={p.chainId === 56 ? 'gold' : 'si'}>
                        {CHAIN_LABEL[p.chainId] ?? p.chainId}
                      </Tag>
                    </td>
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

      <p className="mt-3 text-sm text-mute">
        {t(`共 ${total} 只`, `${total} cats`)}
      </p>
    </div>
  );
}
