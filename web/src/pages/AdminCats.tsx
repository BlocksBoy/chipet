import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft, Cat, ChevronLeft, ChevronRight, Loader2, RefreshCw, ShieldCheck,
} from 'lucide-react';
import { CHAINS, CHAIN_LABEL, MAINNET_IDS } from '@tapearena/chain';
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
  const [chainId, setChainId] = useState(MAINNET_IDS[0] ?? 196);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [err, setErr] = useState('');
  const [items, setItems] = useState<ArchivedPet[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [archived, setArchived] = useState(0);

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

  const load = useCallback(async (cid: number, p: number) => {
    setBusy(true);
    setErr('');
    try {
      const data = await adminCats(cid, p, PAGE_SIZE);
      setItems(data.items);
      setTotal(data.total);
      setPages(data.pages);
      setPage(data.page);
      setArchived(data.archived);
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.status === 401) {
        go('/admin');
        return;
      }
      setErr(err.message || t('加载失败', 'Load failed'));
      setItems([]);
    } finally {
      setBusy(false);
    }
  }, [t]);

  useEffect(() => {
    if (!authed) return;
    void load(chainId, page);
  }, [authed, chainId, page, load]);

  const onSync = async () => {
    setSyncing(true);
    setErr('');
    try {
      const r = await adminSyncCats(chainId);
      setArchived(r.archived);
      await load(chainId, 1);
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
  };

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
                  '链上芯宠全量属性入库；每页 20 条，按 petId 倒序。',
                  'Full on-chain Chipet attributes archived. 20 per page, newest petId first.',
                )}
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tag tone="neutral" icon={ShieldCheck}>{t('已登录', 'Signed in')}</Tag>
          <Tag tone="neutral">{t(`存档 ${archived}`, `Archived ${archived}`)}</Tag>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {MAINNET_IDS.map((id) => (
          <Button
            key={id}
            size="sm"
            variant={chainId === id ? 'primary' : 'ghost'}
            onClick={() => { setChainId(id); setPage(1); }}
          >
            {CHAIN_LABEL[id] ?? id}
          </Button>
        ))}
        <Button size="sm" variant="ghost" disabled={syncing || busy} onClick={() => void onSync()}>
          {syncing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          {t('从链上同步入库', 'Sync from chain')}
        </Button>
      </div>

      {err && (
        <p className="mt-4 rounded-xl bg-copper/10 px-3 py-2 text-sm text-copper">{err}</p>
      )}

      <Panel className="mt-5 overflow-hidden" bodyClass="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="border-b border-line/80 bg-panel-2/60 text-[11px] font-mono uppercase tracking-wide text-faint">
              <tr>
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
                  <td colSpan={7} className="px-4 py-12 text-center text-mute">
                    <Loader2 className="mx-auto size-5 animate-spin text-copper" />
                  </td>
                </tr>
              )}
              {!busy && items.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-mute">
                    {t('尚无存档。点「从链上同步入库」拉取全量猫咪。', 'No archive yet. Tap “Sync from chain” to pull all cats.')}
                  </td>
                </tr>
              )}
              {items.map((p) => {
                const url = explorer(chainId, p.owner);
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-mute">
          {t(
            `共 ${total} 只 · 第 ${page} / ${pages} 页`,
            `${total} cats · page ${page} / ${pages}`,
          )}
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={busy || page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="size-4" />
            {t('上一页', 'Prev')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy || page >= pages}
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
          >
            {t('下一页', 'Next')}
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
