import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  Cat, Coins, Database, History, KeyRound, Loader2, LogOut, RefreshCw, RotateCcw, ShieldCheck, Swords, Users,
} from 'lucide-react';
import { CHAIN_LABEL, MAINNET_IDS, bemNetwork } from '@tapearena/chain';
import { Button, PAGE, Panel, StatBand, Tag, cn } from '../components/ui.tsx';
import { useT } from '../i18n.ts';
import {
  adminLogin, adminLogout, adminSession, adminStats, adminStatsHistory, type AdminStatsPayload,
} from '../adminAuth.ts';
import { short } from '../format.ts';

export function Admin() {
  const t = useT();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [token, setToken] = useState('');
  const [loginErr, setLoginErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [chainId, setChainId] = useState(196);
  const [stats, setStats] = useState<AdminStatsPayload | null>(null);
  const [history, setHistory] = useState<AdminStatsPayload[]>([]);
  const [loadErr, setLoadErr] = useState('');
  const [progress, setProgress] = useState('');

  useEffect(() => {
    let alive = true;
    adminSession().then((ok) => { if (alive) setAuthed(ok); }).catch(() => { if (alive) setAuthed(false); });
    return () => { alive = false; };
  }, []);

  const loadHistory = async (id = chainId) => {
    try {
      const h = await adminStatsHistory(id, 8);
      setHistory(h.items);
    } catch {
      /* ignore history errors */
    }
  };

  const load = async (id = chainId, mode: 'cache' | 'incremental' | 'full' = 'cache') => {
    setLoadErr('');
    setProgress(
      mode === 'full'
        ? t('正在全量扫链并重建游标…', 'Full rescan and rebuilding checkpoint…')
        : mode === 'incremental'
          ? t('正在增量扫链并写入数据库…', 'Incremental scan and saving to SQLite…')
          : t('正在读取数据库快照…', 'Loading SQLite snapshot…'),
    );
    setBusy(true);
    try {
      const s = await adminStats(id, {
        refresh: mode !== 'cache',
        full: mode === 'full',
      });
      setStats(s);
      await loadHistory(id);
      setProgress('');
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.status === 401) {
        setAuthed(false);
        setStats(null);
        setHistory([]);
      }
      setLoadErr(err.message || t('加载失败', 'Load failed'));
      setProgress('');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!authed) return;
    void load(chainId, 'cache');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在登录或切链时拉库
  }, [authed, chainId]);

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
    await adminLogout();
    setAuthed(false);
    setStats(null);
    setHistory([]);
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
              '输入服务端配置的 ADMIN_TOKEN。会话以 HttpOnly Cookie 保存约 8 小时，口令不会写入浏览器存储。',
              'Enter the server ADMIN_TOKEN. The session is stored in an HttpOnly cookie for about 8 hours; the secret is never written to browser storage.',
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

  const bem = bemNetwork(chainId);
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
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-copper" />
            <h1 className="font-display text-2xl font-bold text-ink">{t('运营看板', 'Ops dashboard')}</h1>
            {stats?.source === 'cache' && <Tag tone="si" icon={Database}>{t('数据库', 'SQLite')}</Tag>}
            {stats?.source === 'live' && stats.scanMode === 'incremental' && (
              <Tag tone="copper" icon={RefreshCw}>{t('增量入库', 'Incremental')}</Tag>
            )}
            {stats?.source === 'live' && stats.scanMode === 'full' && (
              <Tag tone="copper" icon={RotateCcw}>{t('全量入库', 'Full scan')}</Tag>
            )}
            {stats?.source === 'live' && stats.scanMode === 'noop' && (
              <Tag tone="si" icon={Database}>{t('无新块', 'No new blocks')}</Tag>
            )}
          </div>
          <p className="mt-1 text-sm text-mute">
            {t(
              '默认读库；「增量入库」只扫上次游标之后的新块。「全量重扫」才从部署起点重建。',
              'Loads SQLite by default. “Incremental” only scans blocks after the last cursor. “Full rescan” rebuilds from genesis.',
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-full border border-line bg-panel p-0.5">
            {MAINNET_IDS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setChainId(id)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-semibold transition',
                  chainId === id ? 'bg-si text-white' : 'text-mute hover:text-ink',
                )}
              >
                {CHAIN_LABEL[id]}
              </button>
            ))}
          </div>
          <Button size="sm" variant="ghost" icon={Database} busy={busy} onClick={() => load(chainId, 'cache')}>
            {t('读库', 'Load DB')}
          </Button>
          <Button size="sm" icon={RefreshCw} busy={busy} onClick={() => load(chainId, 'incremental')}>
            {t('增量入库', 'Incremental')}
          </Button>
          <Button size="sm" variant="ghost" icon={RotateCcw} busy={busy} onClick={() => load(chainId, 'full')}>
            {t('全量重扫', 'Full rescan')}
          </Button>
          <Button size="sm" variant="ghost" icon={LogOut} onClick={onLogout}>
            {t('退出', 'Log out')}
          </Button>
        </div>
      </div>

      {progress && (
        <p className="mt-4 flex items-center gap-2 text-sm text-mute">
          <Loader2 className="size-4 animate-spin text-copper" />{progress}
        </p>
      )}
      {loadErr && <p className="mt-4 text-sm text-danger">{loadErr}</p>}

      <StatBand
        className="mt-6"
        items={[
          { icon: Coins, label: t('充值人数', 'Recharge users'), value: stats ? fmt(stats.rechargeUsers) : '—', tone: 'copper' },
          { icon: Users, label: t('注册人数', 'Registered'), value: stats ? fmt(stats.registered) : '—', tone: 'si' },
          { icon: Swords, label: t('游玩人数', 'Players'), value: stats ? fmt(stats.players) : '—', tone: 'gold' },
          { icon: Cat, label: t('猫咪数量', 'Cats hatched'), value: stats ? fmt(stats.cats) : '—', tone: 'violet' },
        ]}
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Panel title={t('充值明细', 'Recharge detail')} icon={Coins} bodyClass="p-5 space-y-2 text-sm">
          <Row k={t('充值笔数', 'Tx count')} v={stats ? fmt(stats.rechargeTxs) : '—'} />
          <Row k={t('累计 BEM', 'Total BEM')} v={stats ? `${fmt(stats.rechargeBem)} BEM` : '—'} />
          <Row k={t('收款钱包余额', 'Treasury balance')} v={stats ? `${fmt(stats.treasuryBal)} BEM` : '—'} />
          <Row
            k={t('收款地址', 'Treasury')}
            v={bem ? <span className="font-mono text-[12px]" title={bem.treasury}>{short(bem.treasury, 8)}</span> : '—'}
          />
        </Panel>
        <Panel title={t('快照信息', 'Snapshot')} icon={Database} bodyClass="p-5 space-y-2 text-sm">
          <Row k={t('入库时间', 'Saved at')} v={when(stats?.createdAt)} />
          <Row k={t('扫描模式', 'Scan mode')} v={modeLabel(stats?.scanMode)} />
          <Row
            k={t('本次区间', 'This range')}
            v={stats?.scannedFrom && stats?.scannedTo
              ? `#${stats.scannedFrom} → #${stats.scannedTo}`
              : (stats ? `#${stats.scannedTo}` : '—')}
          />
          <Row k={t('扫链 RPC', 'Scan RPC')} v={stats?.rpcHost ?? '—'} />
          <p className="pt-2 text-xs leading-relaxed text-mute">{stats?.note}</p>
        </Panel>
      </div>

      <Panel className="mt-6" title={t('历史快照', 'History')} icon={History} bodyClass="p-4">
        {history.length === 0 ? (
          <p className="px-1 py-2 text-sm text-mute">
            {t('还没有快照。点「增量入库」生成第一条（首次会自动全量）。', 'No snapshots yet. Use “Incremental” — the first run does a full scan.')}
          </p>
        ) : (
          <ul className="divide-y divide-line/70">
            {history.map((h) => (
              <li key={h.id ?? `${h.createdAt}-${h.scannedTo}`} className="flex flex-wrap items-center justify-between gap-2 px-1 py-2.5 text-sm">
                <span className="font-mono text-[12px] text-mute">
                  {when(h.createdAt)}
                  {h.scanMode ? ` · ${modeLabel(h.scanMode)}` : ''}
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
