import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  Cat, Coins, Database, History, KeyRound, Loader2, LogOut, RefreshCw, RotateCcw, ShieldCheck, Swords, Users,
} from 'lucide-react';
import { CHAIN_LABEL, MAINNET_IDS, bemNetwork } from '@tapearena/chain';
import { Button, PAGE, Panel, StatBand, Tag, cn } from '../components/ui.tsx';
import { useT } from '../i18n.ts';
import {
  adminLogin, adminLogout, adminSession, adminStartScan, adminStats, adminStatsHistory,
  type AdminScanJob, type AdminStatsPayload,
} from '../adminAuth.ts';
import { short } from '../format.ts';

type ChainBundle = {
  stats: AdminStatsPayload | null;
  job: AdminScanJob | null;
  history: AdminStatsPayload[];
  err: string;
  progress: string;
};

const emptyBundle = (): ChainBundle => ({
  stats: null, job: null, history: [], err: '', progress: '',
});

export function Admin() {
  const t = useT();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [token, setToken] = useState('');
  const [loginErr, setLoginErr] = useState('');
  const [busy, setBusy] = useState(false);
  /** 正在发起 / 运行中的扫链类型，用于只亮对应按钮的加载态 */
  const [scanKind, setScanKind] = useState<'inc' | 'full' | null>(null);
  const [byChain, setByChain] = useState<Record<number, ChainBundle>>(() =>
    Object.fromEntries(MAINNET_IDS.map((id) => [id, emptyBundle()])));
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let alive = true;
    adminSession().then((ok) => { if (alive) setAuthed(ok); }).catch(() => { if (alive) setAuthed(false); });
    return () => { alive = false; };
  }, []);

  const stopPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const patchChain = (id: number, patch: Partial<ChainBundle>) => {
    setByChain((prev) => ({ ...prev, [id]: { ...(prev[id] ?? emptyBundle()), ...patch } }));
  };

  const loadHistory = async (id: number) => {
    try {
      const h = await adminStatsHistory(id, 6);
      patchChain(id, { history: h.items });
    } catch {
      /* ignore */
    }
  };

  const anyRunning = (map: Record<number, ChainBundle> = byChain) =>
    MAINNET_IDS.some((id) => map[id]?.job?.status === 'running');

  const syncScanKind = (map: Record<number, ChainBundle>) => {
    const running = MAINNET_IDS.map((id) => map[id]?.job).find((j) => j?.status === 'running');
    if (!running) setScanKind(null);
    else setScanKind(running.full ? 'full' : 'inc');
  };

  const startPoll = () => {
    stopPoll();
    pollRef.current = setInterval(() => {
      void (async () => {
        const results = await Promise.all(MAINNET_IDS.map(async (id) => {
          try {
            const s = await adminStats(id);
            return { id, s, ok: true as const };
          } catch {
            return { id, ok: false as const };
          }
        }));
        setByChain((prev) => {
          const next = { ...prev };
          let needHistory: number[] = [];
          for (const r of results) {
            if (!r.ok) continue;
            const running = r.s.job?.status === 'running';
            const wasRunning = prev[r.id]?.job?.status === 'running';
            next[r.id] = {
              ...(prev[r.id] ?? emptyBundle()),
              stats: r.s.empty ? null : r.s,
              job: r.s.job ?? null,
              err: r.s.job?.status === 'error' ? (r.s.job.error || t('扫链失败', 'Scan failed')) : '',
              progress: running
                ? t(
                  `后台扫链中… #${r.s.job?.scannedTo ?? r.s.scannedTo ?? '?'} / #${r.s.job?.head ?? r.s.head ?? '?'}`,
                  `Scanning… #${r.s.job?.scannedTo ?? r.s.scannedTo ?? '?'} / #${r.s.job?.head ?? r.s.head ?? '?'}`,
                )
                : '',
            };
            if (wasRunning && !running) needHistory.push(r.id);
          }
          for (const id of needHistory) void loadHistory(id);
          if (!anyRunning(next)) {
            stopPoll();
            setScanKind(null);
          } else {
            syncScanKind(next);
          }
          return next;
        });
      })();
    }, 2500);
  };

  const loadAll = async () => {
    setBusy(true);
    setByChain((prev) => {
      const next = { ...prev };
      for (const id of MAINNET_IDS) {
        next[id] = {
          ...(prev[id] ?? emptyBundle()),
          err: '',
          progress: t('正在读取数据库快照…', 'Loading SQLite snapshot…'),
        };
      }
      return next;
    });
    try {
      const results = await Promise.all(MAINNET_IDS.map(async (id) => {
        const [s, h] = await Promise.all([adminStats(id), adminStatsHistory(id, 6).catch(() => null)]);
        return { id, s, history: h?.items ?? [] };
      }));
      let running = false;
      setByChain((prev) => {
        const next = { ...prev };
        for (const { id, s, history } of results) {
          const isRunning = s.job?.status === 'running';
          if (isRunning) running = true;
          next[id] = {
            ...(prev[id] ?? emptyBundle()),
            stats: s.empty ? null : s,
            job: s.job ?? null,
            history,
            err: s.job?.status === 'error' ? (s.job.error || t('扫链失败', 'Scan failed')) : '',
            progress: isRunning
              ? t(
                `后台扫链中… #${s.job?.scannedTo ?? s.scannedTo ?? '?'} / #${s.job?.head ?? s.head ?? '?'}`,
                `Scanning… #${s.job?.scannedTo ?? s.scannedTo ?? '?'} / #${s.job?.head ?? s.head ?? '?'}`,
              )
              : '',
          };
        }
        if (running) syncScanKind(next);
        return next;
      });
      if (running) startPoll();
      else {
        stopPoll();
        setScanKind(null);
      }
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.status === 401) {
        setAuthed(false);
        setByChain(Object.fromEntries(MAINNET_IDS.map((id) => [id, emptyBundle()])));
        setScanKind(null);
        stopPoll();
      } else {
        setByChain((prev) => {
          const next = { ...prev };
          for (const id of MAINNET_IDS) {
            next[id] = {
              ...(prev[id] ?? emptyBundle()),
              err: err.message || t('加载失败', 'Load failed'),
              progress: '',
            };
          }
          return next;
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const startScanAll = async (full = false) => {
    setScanKind(full ? 'full' : 'inc');
    const starting = full
      ? t('已启动全量后台扫链…', 'Full background scan started…')
      : t('已启动增量后台扫链…', 'Incremental background scan started…');
    setByChain((prev) => {
      const next = { ...prev };
      for (const id of MAINNET_IDS) {
        next[id] = { ...(prev[id] ?? emptyBundle()), err: '', progress: starting };
      }
      return next;
    });
    try {
      const results = await Promise.all(MAINNET_IDS.map(async (id) => {
        const r = await adminStartScan(id, { full });
        return { id, r };
      }));
      let running = false;
      setByChain((prev) => {
        const next = { ...prev };
        for (const { id, r } of results) {
          if (r.job.status === 'running') running = true;
          next[id] = {
            ...(prev[id] ?? emptyBundle()),
            job: r.job,
            stats: r.stats && !r.stats.empty ? r.stats : (prev[id]?.stats ?? null),
            progress: r.job.status === 'running' ? starting : '',
            err: '',
          };
        }
        return next;
      });
      if (running) startPoll();
      else setScanKind(null);
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.status === 401) {
        setAuthed(false);
        setByChain(Object.fromEntries(MAINNET_IDS.map((id) => [id, emptyBundle()])));
        stopPoll();
      } else {
        setByChain((prev) => {
          const next = { ...prev };
          for (const id of MAINNET_IDS) {
            next[id] = {
              ...(prev[id] ?? emptyBundle()),
              err: err.message || t('启动扫链失败', 'Failed to start scan'),
              progress: '',
            };
          }
          return next;
        });
      }
      setScanKind(null);
    }
  };

  useEffect(() => {
    if (!authed) return;
    void loadAll();
    return () => stopPoll();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在登录后拉双链
  }, [authed]);

  const onLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoginErr('');
    setBusy(true);
    try {
      await adminLogin(token.trim());
      setToken('');
      setAuthed(true);
    } catch (err) {
      setLoginErr((err as Error).message || t('登录失败', 'Login failed'));
    } finally {
      setBusy(false);
    }
  };

  const onLogout = async () => {
    stopPoll();
    await adminLogout();
    setAuthed(false);
    setByChain(Object.fromEntries(MAINNET_IDS.map((id) => [id, emptyBundle()])));
    setScanKind(null);
  };

  if (authed === null) {
    return (
      <div className={cn(PAGE, 'grid min-h-[50vh] place-items-center py-16')}>
        <Loader2 className="size-6 animate-spin text-copper" />
      </div>
    );
  }

  if (!authed) {
    return (
      <div className={cn(PAGE, 'py-10 sm:py-16')}>
        <section className="mx-auto max-w-md rounded-3xl border border-line bg-panel p-8 shadow-sm shadow-si/10">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-2xl bg-copper/10 text-copper">
              <ShieldCheck className="size-6" />
            </span>
            <h1 className="font-display text-2xl font-bold text-ink">{t('运营后台', 'Admin')}</h1>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-mute">
            {t(
              '输入服务端配置的 ADMIN_TOKEN。会话以 HttpOnly Cookie 保存约 48 小时，口令不会写入浏览器存储。',
              'Enter the server ADMIN_TOKEN. The session is stored in an HttpOnly cookie for about 48 hours; the secret is never written to browser storage.',
            )}
          </p>
          <form className="mt-6 flex flex-col gap-3" onSubmit={onLogin}>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-mute">{t('管理口令', 'Admin token')}</span>
              <input
                type="password"
                name="token"
                required
                autoComplete="current-password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="ADMIN_TOKEN"
                className="h-11 rounded-2xl border border-line bg-panel px-3.5 text-sm outline-none focus:border-si focus:ring-4 focus:ring-si/15"
              />
            </label>
            {loginErr && <p className="text-xs text-danger">{loginErr}</p>}
            <Button type="submit" icon={KeyRound} busy={busy} className="w-full">
              {t('进入后台', 'Enter admin')}
            </Button>
          </form>
        </section>
      </div>
    );
  }

  const scanning = anyRunning();
  const fmt = (n: number | string) =>
    typeof n === 'number' ? n.toLocaleString() : Number(n).toLocaleString(undefined, { maximumFractionDigits: 4 });
  const when = (ms?: number) => (ms ? new Date(ms).toLocaleString() : '—');
  const modeLabel = (m?: AdminStatsPayload['scanMode']) => {
    if (m === 'incremental') return t('增量', 'Incremental');
    if (m === 'noop') return t('无新块', 'No new blocks');
    if (m === 'full') return t('全量', 'Full');
    return '—';
  };

  return (
    <div className={cn(PAGE, 'py-6 sm:py-8')}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <ShieldCheck className="size-5 text-copper" />
            <h1 className="font-display text-2xl font-bold text-ink">{t('运营看板', 'Ops dashboard')}</h1>
            {MAINNET_IDS.map((id) => (
              <Tag key={id} tone={id === 56 ? 'gold' : 'si'}>{CHAIN_LABEL[id]}</Tag>
            ))}
            {scanning && <Tag tone="copper" icon={Loader2}>{t('扫链中', 'Scanning')}</Tag>}
            {!scanning && MAINNET_IDS.some((id) => byChain[id]?.stats) && (
              <Tag tone="neutral" icon={Database}>{t('数据库', 'SQLite')}</Tag>
            )}
          </div>
          <p className="mt-1 text-sm text-mute">
            {t(
              'X Layer 与 BSC 同屏对照。服务端每小时自动增量同步；读库 / 增量 / 全量仍可手动对两条链一并执行。',
              'X Layer and BSC side by side. Server auto-syncs incrementally every hour; Load / Incremental / Full still run both chains together.',
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" icon={Database} busy={busy} disabled={scanning} onClick={() => void loadAll()}>
            {t('读库', 'Load DB')}
          </Button>
          <Button size="sm" icon={RefreshCw} busy={scanKind === 'inc'} disabled={scanning || busy} onClick={() => void startScanAll(false)}>
            {t('增量入库', 'Incremental')}
          </Button>
          <Button size="sm" variant="ghost" icon={RotateCcw} busy={scanKind === 'full'} disabled={scanning || busy} onClick={() => void startScanAll(true)}>
            {t('全量重扫', 'Full rescan')}
          </Button>
          <Button size="sm" variant="ghost" icon={LogOut} onClick={() => void onLogout()}>
            {t('退出', 'Log out')}
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        {MAINNET_IDS.map((id) => {
          const b = byChain[id] ?? emptyBundle();
          const bem = bemNetwork(id);
          const chainScanning = b.job?.status === 'running';
          return (
            <section
              key={id}
              className={cn(
                'min-w-0 rounded-3xl border bg-panel/80 p-4 shadow-sm shadow-si/5 sm:p-5',
                id === 56 ? 'border-gold/35' : 'border-si/30',
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Tag tone={id === 56 ? 'gold' : 'si'} className="text-[12px] font-semibold">
                  {CHAIN_LABEL[id]}
                </Tag>
                <span className="font-mono text-[11px] text-faint">chainId {id}</span>
                {chainScanning && <Tag tone="copper" icon={Loader2}>{t('扫链中', 'Scanning')}</Tag>}
              </div>

              {b.progress && (
                <p className="mt-3 flex items-center gap-2 text-sm text-mute">
                  <Loader2 className="size-4 animate-spin text-copper" />{b.progress}
                </p>
              )}
              {b.err && <p className="mt-3 text-sm text-danger">{b.err}</p>}
              {!b.stats && !b.err && !chainScanning && (
                <p className="mt-3 text-sm text-mute">
                  {t('尚无快照。点顶部「增量入库」开始（首次自动全量分片）。', 'No snapshot yet. Use “Incremental” above (first run is a sliced full scan).')}
                </p>
              )}

              <StatBand
                className="mt-4"
                items={[
                  { icon: Coins, label: t('充值人数', 'Recharge users'), value: b.stats ? fmt(b.stats.rechargeUsers) : '—', tone: 'copper' },
                  { icon: Users, label: t('注册人数', 'Registered'), value: b.stats ? fmt(b.stats.registered) : '—', tone: 'si' },
                  { icon: Swords, label: t('游玩人数', 'Players'), value: b.stats ? fmt(b.stats.players) : '—', tone: 'gold' },
                  { icon: Cat, label: t('猫咪数量', 'Cats hatched'), value: b.stats ? fmt(b.stats.cats) : '—', tone: 'violet' },
                ]}
              />

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Panel title={t('充值明细', 'Recharge detail')} icon={Coins} bodyClass="p-4 space-y-2 text-sm">
                  <Row k={t('充值笔数', 'Tx count')} v={b.stats ? fmt(b.stats.rechargeTxs) : '—'} />
                  <Row k={t('累计 BEM', 'Total BEM')} v={b.stats ? `${fmt(b.stats.rechargeBem)} BEM` : '—'} />
                  <Row k={t('收款钱包余额', 'Treasury balance')} v={b.stats ? `${fmt(b.stats.treasuryBal)} BEM` : '—'} />
                  <Row
                    k={t('收款地址', 'Treasury')}
                    v={bem ? <span className="font-mono text-[12px]" title={bem.treasury}>{short(bem.treasury, 8)}</span> : '—'}
                  />
                </Panel>
                <Panel title={t('快照信息', 'Snapshot')} icon={Database} bodyClass="p-4 space-y-2 text-sm">
                  <Row k={t('入库时间', 'Saved at')} v={when(b.stats?.createdAt)} />
                  <Row k={t('扫描模式', 'Scan mode')} v={modeLabel(b.stats?.scanMode)} />
                  <Row
                    k={t('进度', 'Progress')}
                    v={b.stats?.scannedTo
                      ? `#${b.stats.scannedTo}${b.stats.head ? ` / #${b.stats.head}` : ''}${b.stats.complete === false ? t('（未完成）', ' (partial)') : ''}`
                      : '—'}
                  />
                  <Row k={t('扫链 RPC', 'Scan RPC')} v={b.stats?.rpcHost ?? '—'} />
                  {b.stats?.note && <p className="pt-1 text-xs leading-relaxed text-mute">{b.stats.note}</p>}
                </Panel>
              </div>

              <Panel className="mt-4" title={t('历史快照', 'History')} icon={History} bodyClass="p-3">
                {b.history.length === 0 ? (
                  <p className="px-1 py-2 text-sm text-mute">{t('还没有快照。', 'No snapshots yet.')}</p>
                ) : (
                  <ul className="divide-y divide-line/70">
                    {b.history.map((h) => (
                      <li key={h.id ?? `${h.createdAt}-${h.scannedTo}`} className="flex flex-wrap items-center justify-between gap-2 px-1 py-2 text-sm">
                        <span className="font-mono text-[12px] text-mute">
                          {when(h.createdAt)}
                          {h.scanMode ? ` · ${modeLabel(h.scanMode)}` : ''}
                          {h.complete === false ? t(' · 分片', ' · partial') : ''}
                        </span>
                        <span className="tabular-nums text-ink">
                          {t('猫', 'cats')} {fmt(h.cats)} · {t('注册', 'reg')} {fmt(h.registered)} · {t('玩', 'play')} {fmt(h.players)} · {t('充', 'pay')} {fmt(h.rechargeUsers)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-mute">{k}</span>
      <span className="font-semibold tabular-nums text-ink">{v}</span>
    </div>
  );
}
