import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  Cat, Check, Coins, Copy, Database, ExternalLink, History, KeyRound, Loader2, LogOut, RefreshCw, RotateCcw, ShieldCheck, Swords, Users,
} from 'lucide-react';
import { CHAINS, CHAIN_LABEL, MAINNET_IDS, bemNetwork } from '@tapearena/chain';
import { Button, PAGE, Panel, Tag, cn } from '../components/ui.tsx';
import { useT } from '../i18n.ts';
import {
  adminLogin, adminLogout, adminSession, adminStartScan, adminStats, adminStatsHistory,
  coalesceAdminStats,
  type AdminScanJob, type AdminStatsPayload,
} from '../adminAuth.ts';
import { short } from '../format.ts';

function addressExplorerUrl(chainId: number, addr: string): string | null {
  const base = CHAINS[chainId as keyof typeof CHAINS]?.blockExplorers?.default.url;
  if (!base) return null;
  return `${base.replace(/\/$/, '')}/address/${addr}`;
}

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

function chainTone(id: number): 'si' | 'gold' {
  return id === 56 ? 'gold' : 'si';
}

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
          const needHistory: number[] = [];
          for (const r of results) {
            if (!r.ok) continue;
            const running = r.s.job?.status === 'running';
            const wasRunning = prev[r.id]?.job?.status === 'running';
            next[r.id] = {
              ...(prev[r.id] ?? emptyBundle()),
              stats: coalesceAdminStats(r.s),
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
            stats: coalesceAdminStats(s),
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
            stats: r.stats ? (coalesceAdminStats(r.stats) ?? prev[id]?.stats ?? null) : (prev[id]?.stats ?? null),
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

  const num = (id: number, key: 'rechargeUsers' | 'registered' | 'players' | 'cats' | 'rechargeTxs') =>
    byChain[id]?.stats?.[key] ?? 0;
  const registeredOnChain = (id: number) =>
    Number(byChain[id]?.stats?.registeredOnChain ?? 0);
  // 注册人数是全局独立地址，不能按链相加
  const registeredTotal = Math.max(0, ...MAINNET_IDS.map((id) =>
    Number(byChain[id]?.stats?.walletRegistered ?? byChain[id]?.stats?.registered ?? 0)));
  const bemSum = (key: 'rechargeBem' | 'treasuryBal') =>
    MAINNET_IDS.reduce((s, id) => s + Number(byChain[id]?.stats?.[key] ?? 0), 0);
  const hasAnyStats = MAINNET_IDS.some((id) => byChain[id]?.stats);
  const progressLines = MAINNET_IDS
    .map((id) => {
      const b = byChain[id];
      if (!b?.progress && !b?.err) return null;
      return { id, progress: b.progress, err: b.err };
    })
    .filter(Boolean) as { id: number; progress: string; err: string }[];

  const historyRows = MAINNET_IDS.flatMap((id) =>
    (byChain[id]?.history ?? []).map((h) => ({ id, h })),
  ).sort((a, b) => (b.h.createdAt ?? 0) - (a.h.createdAt ?? 0)).slice(0, 12);

  const metrics: {
    icon: typeof Coins;
    label: string;
    key: 'rechargeUsers' | 'registered' | 'players' | 'cats';
    swatch: string;
  }[] = [
    { icon: Coins, label: t('充值人数', 'Recharge users'), key: 'rechargeUsers', swatch: 'bg-copper' },
    { icon: Users, label: t('注册人数', 'Registered'), key: 'registered', swatch: 'bg-si' },
    { icon: Swords, label: t('游玩人数', 'Players'), key: 'players', swatch: 'bg-gold' },
    { icon: Cat, label: t('猫咪数量', 'Cats hatched'), key: 'cats', swatch: 'bg-copper-dim' },
  ];

  const pctOf = (part: number, total: number) =>
    total > 0 ? `${((part / total) * 100).toFixed(1)}%` : undefined;

  return (
    <div className={cn(PAGE, 'py-6 sm:py-8')}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <ShieldCheck className="size-5 text-copper" />
            <h1 className="font-display text-2xl font-bold text-balance text-ink">{t('运营看板', 'Ops dashboard')}</h1>
            {scanning && <Tag tone="copper" icon={Loader2}>{t('扫链中', 'Scanning')}</Tag>}
            {!scanning && hasAnyStats && <Tag tone="neutral" icon={Database}>{t('数据库', 'SQLite')}</Tag>}
            {busy && !scanning && <Tag tone="neutral" icon={Loader2}>{t('读取中', 'Loading')}</Tag>}
          </div>
          <p className="mt-1 max-w-xl text-sm text-pretty text-mute">
            {t(
              '默认读库展示合计，下方拆开两条链。服务端每小时自动增量；也可手动增量 / 全量。',
              'Totals load from SQLite by default, with each chain listed underneath. Server auto-syncs hourly; manual incremental / full still available.',
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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

      {progressLines.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {progressLines.map(({ id, progress, err }) => (
            <p key={id} className={cn('flex flex-wrap items-center gap-2 text-sm', err ? 'text-danger' : 'text-mute')}>
              <Tag tone={chainTone(id)}>{CHAIN_LABEL[id]}</Tag>
              {err ? err : (
                <>
                  <Loader2 className="size-3.5 animate-spin text-copper" />
                  {progress}
                </>
              )}
            </p>
          ))}
        </div>
      )}

      {!hasAnyStats && !busy && !scanning && progressLines.length === 0 && (
        <p className="mt-4 text-sm text-mute">
          {t('尚无快照。点「增量入库」开始（首次自动全量分片）。', 'No snapshot yet. Tap “Incremental” (first run is a sliced full scan).')}
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {metrics.map(({ icon: I, label, key, swatch }) => {
          const isReg = key === 'registered';
          const total = isReg ? registeredTotal : MAINNET_IDS.reduce((s, id) => s + num(id, key), 0);
          return (
            <BreakdownCard
              key={key}
              icon={<I className="size-4" />}
              swatch={swatch}
              label={label}
              total={hasAnyStats ? fmt(total) : '—'}
              parts={MAINNET_IDS.map((id) => {
                const n = isReg ? registeredOnChain(id) : num(id, key);
                return {
                  id,
                  label: CHAIN_LABEL[id] ?? String(id),
                  value: hasAnyStats ? fmt(n) : '—',
                  pct: hasAnyStats ? pctOf(n, isReg ? Math.max(total, MAINNET_IDS.reduce((s, cid) => s + registeredOnChain(cid), 0)) : total) : undefined,
                };
              })}
            />
          );
        })}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel title={t('充值明细', 'Recharge detail')} icon={Coins} bodyClass="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          <BreakdownCard
            compact
            swatch="bg-copper"
            label={t('充值笔数', 'Tx count')}
            total={hasAnyStats ? fmt(MAINNET_IDS.reduce((s, id) => s + num(id, 'rechargeTxs'), 0)) : '—'}
            parts={MAINNET_IDS.map((id) => {
              const n = num(id, 'rechargeTxs');
              const total = MAINNET_IDS.reduce((s, cid) => s + num(cid, 'rechargeTxs'), 0);
              return {
                id,
                label: CHAIN_LABEL[id] ?? String(id),
                value: hasAnyStats ? fmt(n) : '—',
                pct: hasAnyStats ? pctOf(n, total) : undefined,
              };
            })}
          />
          <BreakdownCard
            compact
            swatch="bg-si"
            label={t('累计 BEM', 'Total BEM')}
            total={hasAnyStats ? `${fmt(bemSum('rechargeBem'))} BEM` : '—'}
            parts={MAINNET_IDS.map((id) => {
              const n = Number(byChain[id]?.stats?.rechargeBem ?? 0);
              const total = bemSum('rechargeBem');
              return {
                id,
                label: CHAIN_LABEL[id] ?? String(id),
                value: hasAnyStats ? `${fmt(n)} BEM` : '—',
                pct: hasAnyStats ? pctOf(n, total) : undefined,
              };
            })}
          />
          <BreakdownCard
            compact
            swatch="bg-gold"
            label={t('收款钱包余额', 'Treasury balance')}
            total={hasAnyStats ? `${fmt(bemSum('treasuryBal'))} BEM` : '—'}
            parts={MAINNET_IDS.map((id) => {
              const n = Number(byChain[id]?.stats?.treasuryBal ?? 0);
              const total = bemSum('treasuryBal');
              return {
                id,
                label: CHAIN_LABEL[id] ?? String(id),
                value: hasAnyStats ? `${fmt(n)} BEM` : '—',
                pct: hasAnyStats ? pctOf(n, total) : undefined,
              };
            })}
          />
          <TreasuryAddresses />
        </Panel>

        <Panel title={t('快照信息', 'Snapshot')} icon={Database} bodyClass="p-5 space-y-3 text-sm">
          {MAINNET_IDS.map((id) => {
            const s = byChain[id]?.stats;
            return (
              <div key={id} className="space-y-1.5 rounded-2xl bg-panel-2/50 px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Tag tone={chainTone(id)}>{CHAIN_LABEL[id]}</Tag>
                  {byChain[id]?.job?.status === 'running' && (
                    <Tag tone="copper" icon={Loader2}>{t('扫链中', 'Scanning')}</Tag>
                  )}
                </div>
                <Row k={t('入库时间', 'Saved at')} v={when(s?.createdAt)} />
                <Row k={t('扫描模式', 'Scan mode')} v={modeLabel(s?.scanMode)} />
                <Row
                  k={t('进度', 'Progress')}
                  v={s?.scannedTo
                    ? `#${s.scannedTo}${s.head ? ` / #${s.head}` : ''}${s.complete === false ? t('（未完成）', ' (partial)') : ''}`
                    : '—'}
                />
                <Row k={t('扫链 RPC', 'Scan RPC')} v={s?.rpcHost ?? '—'} />
              </div>
            );
          })}
        </Panel>
      </div>

      <Panel className="mt-6" title={t('历史快照', 'History')} icon={History} bodyClass="p-4">
        {historyRows.length === 0 ? (
          <p className="px-1 py-2 text-sm text-mute">{t('还没有快照。', 'No snapshots yet.')}</p>
        ) : (
          <ul className="divide-y divide-line/70">
            {historyRows.map(({ id, h }) => (
              <li key={`${id}-${h.id ?? `${h.createdAt}-${h.scannedTo}`}`} className="flex flex-wrap items-center justify-between gap-2 px-1 py-2.5 text-sm">
                <span className="flex flex-wrap items-center gap-2 font-mono text-[12px] text-mute">
                  <Tag tone={chainTone(id)}>{CHAIN_LABEL[id]}</Tag>
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

function TreasuryAddresses() {
  const t = useT();
  const [copied, setCopied] = useState<string | null>(null);

  const copyAddr = async (addr: string) => {
    try {
      await navigator.clipboard.writeText(addr);
      setCopied(addr);
      window.setTimeout(() => setCopied((c) => (c === addr ? null : c)), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="rounded-2xl border border-line/80 bg-panel px-4 py-3">
      <div className="text-sm font-semibold text-ink">{t('收款地址', 'Treasury')}</div>
      <div className="mt-2 space-y-2 border-t border-dashed border-line/80 pt-2">
        {MAINNET_IDS.map((id) => {
          const bem = bemNetwork(id);
          const addr = bem?.treasury;
          const href = addr ? addressExplorerUrl(id, addr) : null;
          const done = copied === addr;
          return (
            <div key={id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] items-center gap-2 pl-1 text-sm">
              <span className="flex min-w-0 items-center gap-2 text-mute">
                <span className={cn('size-2.5 shrink-0 rounded-sm', id === 56 ? 'bg-gold' : 'bg-si')} />
                <span className="truncate">{CHAIN_LABEL[id]}</span>
              </span>
              {addr ? (
                <span className="flex min-w-0 items-center justify-end gap-1">
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      title={addr}
                      className="inline-flex min-w-0 max-w-full items-center gap-1 font-mono text-[12px] font-semibold text-si-dim no-underline hover:text-si"
                    >
                      <span className="truncate">{short(addr, 8)}</span>
                      <ExternalLink className="size-3 shrink-0 opacity-70" />
                    </a>
                  ) : (
                    <span className="truncate font-mono text-[12px] font-semibold text-ink" title={addr}>{short(addr, 8)}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => void copyAddr(addr)}
                    aria-label={t('复制地址', 'Copy address')}
                    className="grid size-7 shrink-0 place-items-center rounded-lg text-mute transition hover:bg-panel-2 hover:text-ink"
                  >
                    {done ? <Check className="size-3.5 text-si" /> : <Copy className="size-3.5" />}
                  </button>
                </span>
              ) : (
                <span className="text-right font-semibold text-ink">—</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 合计一行 + 虚线下各链分项（对齐参考：总 → 拆链） */
function BreakdownCard({
  label,
  total,
  parts,
  swatch,
  icon,
  compact,
}: {
  label: string;
  total: ReactNode;
  parts: { id: number; label: string; value: ReactNode; pct?: string }[];
  swatch: string;
  icon?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn('rounded-2xl border border-line/80 bg-panel shadow-sm shadow-si/5', compact ? 'px-4 py-3' : 'px-4 py-4 sm:px-5')}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {icon ? (
            <span className={cn('grid shrink-0 place-items-center rounded-md text-white', swatch, compact ? 'size-6' : 'size-8')}>
              {icon}
            </span>
          ) : (
            <span className={cn('size-2.5 shrink-0 rounded-sm', swatch)} />
          )}
          <span className={cn('truncate font-semibold text-ink', compact ? 'text-sm' : 'text-[15px]')}>{label}</span>
        </div>
        <span className={cn('shrink-0 font-display font-bold tabular-nums text-ink', compact ? 'text-lg' : 'text-2xl')}>
          {total}
        </span>
      </div>
      <div className="mt-3 space-y-2 border-t border-dashed border-line/80 pt-3">
        {parts.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-3 pl-1 text-sm">
            <span className="flex min-w-0 items-center gap-2 text-mute">
              <span className={cn('size-2.5 shrink-0 rounded-sm', p.id === 56 ? 'bg-gold' : 'bg-si')} />
              <span className="truncate">{p.label}</span>
            </span>
            <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
              {p.pct && <span className="font-mono text-[11px] text-faint">{p.pct}</span>}
              <span className="font-semibold text-ink">{p.value}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
