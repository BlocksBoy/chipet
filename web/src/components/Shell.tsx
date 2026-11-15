import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CHAIN_LABEL, CHAINS, MAINNET_IDS } from '@tapearena/chain';
import {
  Blocks, BookMarked, BookOpen, Check, ChevronDown, CircleAlert, CircleCheck, Code2, Coins, Cpu, ExternalLink, FlaskConical, Home, Loader2, PenTool, Plus, Swords, TriangleAlert, Trophy, Users, Wallet, X,
} from 'lucide-react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import { CHAIN_IDS } from '../env.ts';
import { Link, useRoute } from '../router.tsx';
import { useApp } from '../state.tsx';
import { short } from '../format.ts';
import { both, setLang, txt, useLang, useT } from '../i18n.ts';
import { Button, cn } from './ui.tsx';
import { ChainIcon } from './ChainIcon.tsx';
import { WalletGuide } from './WalletGuide.tsx';
import { bem } from '../chipet/bem.ts';

/** 芯喵头像：芯片当脸，两侧引脚是胡须，额头的走线和过孔是花纹。和 public/favicon.svg 保持同一张图。 */
export function Logo({ className = 'size-7' }: { className?: string }) {
  return (
    <svg className={cn('shrink-0', className)} viewBox="0 0 32 32" aria-hidden>
      <path
        d="M1.7 14.4h4M1.7 18h4M1.7 21.6h4M26.3 14.4h4M26.3 18h4M26.3 21.6h4M11 27.5v2.9M16 27.5v2.9M21 27.5v2.9"
        stroke="#2a9d8f" strokeWidth="1.7" strokeLinecap="round"
      />
      <g fill="#f08b55" stroke="#1a2e28" strokeWidth="1.45" strokeLinejoin="round">
        <path d="M6 12.6 6.9 3.8c.1-.9.9-1.3 1.6-.8L15.2 8z" />
        <path d="M26 12.6 25.1 3.8c-.1-.9-.9-1.3-1.6-.8L16.8 8z" />
      </g>
      <path d="M8.4 9.4 8.8 6l3 2.2zM23.6 9.4 23.2 6l-3 2.2z" fill="#ffd3bd" />
      <rect x="4.6" y="7.6" width="22.8" height="20.4" rx="6.6" fill="#f08b55" stroke="#1a2e28" strokeWidth="1.45" />
      <path d="M16 8.6v2.3M13 8.6v1.2M19 8.6v1.2" stroke="#ffe3d1" strokeWidth="1.1" strokeLinecap="round" />
      <circle cx="16" cy="11.6" r=".9" fill="none" stroke="#ffe3d1" strokeWidth=".9" />
      <g fill="#fff" stroke="#1a2e28" strokeWidth=".95">
        <circle cx="11.2" cy="17" r="3.5" />
        <circle cx="20.8" cy="17" r="3.5" />
      </g>
      <g fill="#2a9d8f">
        <circle cx="11.8" cy="17.3" r="2.2" />
        <circle cx="20.2" cy="17.3" r="2.2" />
      </g>
      <g fill="#1a2e28">
        <circle cx="11.8" cy="17.3" r="1.2" />
        <circle cx="20.2" cy="17.3" r="1.2" />
      </g>
      <g fill="#fff">
        <circle cx="11" cy="16.3" r=".75" />
        <circle cx="19.4" cy="16.3" r=".75" />
      </g>
      <path d="M14.5 20.9h3L16 22.7z" fill="#ff8fb0" stroke="#1a2e28" strokeWidth=".45" strokeLinejoin="round" />
      <path d="M13.8 23.8q1.1 1.2 2.2 0q1.1 1.2 2.2 0" fill="none" stroke="#1a2e28" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

const NAV = [
  { to: '/', key: '', label: both('家园', 'Home'), icon: Home },
  { to: '/plaza', key: 'plaza', label: both('广场', 'Plaza'), icon: Users },
  { to: '/train', key: 'train', label: both('训练场', 'Training'), icon: Swords },
  { to: '/dex', key: 'dex', label: both('图鉴', 'Dex'), icon: BookOpen },
  { to: '/lab', key: 'lab', label: both('实验室', 'Lab'), icon: FlaskConical },
];

/** 中 / EN 两段式切换，选择记在 localStorage。 */
function LangSwitch() {
  const lang = useLang();
  return (
    <div role="group" aria-label={lang === 'zh' ? '语言' : 'Language'} className="flex h-9 shrink-0 items-center rounded-full border border-line bg-panel p-0.5 font-mono text-xs">
      {/* 两段都常驻：不认识当前语言的人也能一眼找到自己的那一段 */}
      {(['zh', 'en'] as const).map((l) => (
        <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)} title={l === 'zh' ? '中文' : 'English'}
          className={cn('h-full rounded-full px-2 transition-colors sm:px-2.5', lang === l ? 'bg-si text-white' : 'text-mute hover:text-ink')}>
          {l === 'zh' ? '中' : 'EN'}
        </button>
      ))}
    </div>
  );
}

const chainLabel = (id: number) => CHAIN_LABEL[id] ?? CHAINS[id as keyof typeof CHAINS].name;

/** 网络切换：原生 select 的选项里放不了图标，所以自己画一个下拉。 */
function NetworkSwitch() {
  const { chainId, setChainId } = useApp();
  const t = useT();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    // 打开时把焦点放到当前网络上；preventScroll 免得页面跟着跳
    box.current?.querySelector<HTMLButtonElement>('[aria-selected=true]')?.focus({ preventScroll: true });
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  /** 上下键在选项间移动，和原生下拉的手感一致。 */
  const move = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...(box.current?.querySelectorAll<HTMLButtonElement>('[role=option]') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  };

  return (
    <div ref={box} className="relative shrink-0" onKeyDown={move}>
      <button ref={trigger} type="button" aria-haspopup="listbox" aria-expanded={open} aria-label={`${t('网络', 'Network')}: ${chainLabel(chainId)}`}
        onClick={() => setOpen((o) => !o)}
        className={cn('flex h-9 items-center gap-1.5 rounded-full border bg-panel pr-2 pl-1.5 font-mono text-xs text-ink transition-colors hover:border-si sm:pr-2.5', open ? 'border-si' : 'border-line')}>
        <ChainIcon id={chainId} className="size-6" />
        <span className="whitespace-nowrap">{chainLabel(chainId)}</span>
        <ChevronDown className={cn('size-3.5 text-mute transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div role="listbox" aria-label={t('网络', 'Network')} className="absolute top-full left-0 z-30 mt-2 min-w-[196px] sm:right-0 sm:left-auto animate-rise rounded-2xl border border-line bg-panel p-1.5 shadow-lg shadow-si/10">
          {CHAIN_IDS.map((id) => (
            <button key={id} type="button" role="option" aria-selected={id === chainId}
              onClick={() => { setChainId(id); setOpen(false); trigger.current?.focus(); }}
              className={cn('flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm outline-none transition-colors hover:bg-panel-2 focus-visible:bg-panel-2', id === chainId && 'bg-panel-2/70')}>
              <ChainIcon id={id} className="size-7" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink">{chainLabel(id)}</span>
                <span className="block font-mono text-[11px] text-faint">{CHAINS[id as keyof typeof CHAINS].nativeCurrency.symbol} · {id}</span>
              </span>
              {id === chainId && <Check className="size-4 shrink-0 text-si" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function WalletButton() {
  const { connector } = useAccount();
  const { connect } = useApp();
  const t = useT();
  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted, openAccountModal, openChainModal }) => {
        if (!mounted) return <span className="h-8 w-28" aria-hidden />;
        if (!account) return <Button size="sm" icon={Wallet} onClick={connect}>{t('连接钱包', 'Connect')}</Button>;
        if (chain?.unsupported) return <Button size="sm" variant="danger" icon={TriangleAlert} onClick={openChainModal}>{t('切换网络', 'Switch network')}</Button>;
        return (
          <button type="button" onClick={openAccountModal} title={account.address}
            className="flex h-9 shrink-0 items-center gap-2 rounded-full bg-panel pr-3 pl-1.5 font-mono text-xs text-ink shadow-sm ring-1 ring-line transition hover:ring-si">
            {connector?.icon
              ? <img src={connector.icon} alt={connector.name} className="size-6 rounded-full" />
              : <span className="grid size-6 place-items-center rounded-full bg-panel-2"><Wallet className="size-3.5 text-si" /></span>}
            {account.displayBalance && <span className="hidden text-mute tabular-nums xl:inline">{account.displayBalance}</span>}
            <span className="size-1.5 rounded-full bg-si" />
            <span className="hidden sm:inline">{account.displayName}</span>
            <ChevronDown className="size-3.5 text-mute" />
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}

const LAB_NAV = [
  { to: '/lab', key: '', label: both('擂台', 'Arena'), icon: Trophy },
  { to: '/lab/studio', key: 'studio', label: both('设计器', 'Studio'), icon: PenTool },
  { to: '/lab/library', key: 'library', label: both('组件库', 'Library'), icon: Blocks },
  { to: '/lab/new', key: 'new', label: both('发布悬赏', 'Post a bounty'), icon: Plus },
];

/** 实验室二级导航：桌面左侧栏，手机顶部横滑。 */
function LabNav({ sub }: { sub: string }) {
  const t = useT();
  // 擂台详情页归在「擂台」下
  const at = sub === 'bounty' ? '' : sub;
  return (
    <nav aria-label={t('实验室导航', 'Lab navigation')} className="lg:sticky lg:top-20 lg:self-start">
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:items-stretch lg:overflow-visible lg:rounded-3xl lg:border lg:border-line/80 lg:bg-panel lg:p-2 lg:pb-2 lg:shadow-sm lg:shadow-si/5">
        <div className="mb-1 hidden items-center gap-1.5 px-2.5 py-2 font-mono text-[11px] text-faint lg:flex">
          <FlaskConical className="size-3.5" />TapeArena
        </div>
        {LAB_NAV.map(({ to, key, label, icon: I }) => (
          <Link key={key} to={to} aria-current={at === key ? 'page' : undefined} className={cn(
            'flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-[13px] whitespace-nowrap no-underline transition-colors lg:rounded-2xl',
            at === key ? 'bg-si/15 font-semibold text-si-dim' : 'bg-panel text-mute ring-1 ring-line/70 lg:bg-transparent lg:ring-0 hover:bg-panel-2/70 hover:text-ink',
          )}>
            <I className="size-3.5 shrink-0" />{txt(label)}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { toasts, dismiss, explorer, walletGuide, closeWalletGuide } = useApp();
  const r = useRoute();
  const t = useT();
  const here = r.parts[0] ?? '';

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-line/70 bg-panel/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1180px] items-center gap-2 px-4 sm:gap-3 sm:px-7">
          <Link to="/" aria-label="Chipet" className="flex shrink-0 items-center gap-2.5 font-display text-[20px] font-bold text-ink no-underline">
            <Logo className="size-7 sm:size-[34px]" /><span className="hidden sm:inline">Chipet</span>
            <span className="hidden rounded-full bg-si/10 px-2 py-0.5 font-sans text-[11px] font-medium text-si-dim xl:inline">{t('芯宠', 'chip pets')}</span>
          </Link>
          {/* 桌面端导航在页头；手机上五个入口放到底部标签栏 */}
          <nav className="hidden gap-0.5 rounded-full bg-panel-2/70 p-1 md:flex">
            {NAV.map(({ to, key, label, icon: I }) => (
              <Link key={key} to={to} title={txt(label)} aria-label={txt(label)} className={cn(
                'flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm whitespace-nowrap no-underline transition-colors xl:px-3',
                here === key ? 'bg-panel text-ink shadow-sm' : 'text-mute hover:text-ink',
              )}>
                <I className={cn('size-4', here === key && 'text-si')} /><span className="hidden lg:inline">{txt(label)}</span>
              </Link>
            ))}
          </nav>
          <div className="flex-1" />
          <Link
            to="/guide"
            title={t('玩法手册', 'Playbook')}
            aria-label={t('玩法手册', 'Playbook')}
            aria-current={here === 'guide' ? 'page' : undefined}
            className={cn(
              'grid size-9 shrink-0 place-items-center rounded-full border transition-colors',
              here === 'guide' ? 'border-si bg-si/10 text-si' : 'border-line bg-panel text-mute hover:border-si hover:text-ink',
            )}
          >
            <BookMarked className="size-4" />
          </Link>
          <Link
            to="/shop"
            title={t('BEM 商店', 'BEM Shop')}
            aria-label={t('BEM 商店', 'BEM Shop')}
            aria-current={here === 'shop' ? 'page' : undefined}
            className={cn(
              'flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-2.5 font-mono text-xs transition-colors',
              here === 'shop' ? 'border-copper bg-copper/10 text-copper' : 'border-line bg-panel text-mute hover:border-copper hover:text-ink',
            )}
          >
            <Coins className="size-3.5" />
            <span className="tabular-nums">{bem.demoBal()}</span>
            <span className="hidden sm:inline">BEM</span>
          </Link>
          <NetworkSwitch />
          <LangSwitch />
          <WalletButton />
        </div>
      </header>

      {here === 'lab' ? (
        <div className="mx-auto grid w-full max-w-[1180px] flex-1 grid-cols-1 items-start gap-5 px-4 pt-4 sm:px-7 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-6 lg:pt-6">
          <LabNav sub={r.parts[1] ?? ''} />
          <main className="min-w-0">{children}</main>
        </div>
      ) : (
        <main className="flex-1">{children}</main>
      )}

      <nav aria-label={t('主导航', 'Main')} className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line/70 bg-panel/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        {NAV.map(({ to, key, label, icon: I }) => (
          <Link key={key} to={to} aria-current={here === key ? 'page' : undefined} className={cn(
            'flex min-w-0 flex-1 flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] no-underline transition-colors',
            here === key ? 'font-semibold text-ink' : 'text-mute',
          )}>
            <I className={cn('size-5', here === key && 'text-si')} />
            <span className="max-w-full truncate">{txt(label)}</span>
          </Link>
        ))}
      </nav>

      <footer className="mt-10 border-t border-line/70 bg-panel/50 pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
        <div className="mx-auto grid max-w-[1180px] gap-8 px-4 py-10 sm:px-7 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <div className="flex items-center gap-2.5 font-display text-lg font-bold text-ink"><Logo className="size-7" />Chipet</div>
            <p className="mt-3 max-w-sm text-sm text-pretty text-mute">
              {t('每只芯宠的心脏是一枚 TapeOut 电路。通电、对战、合体，都由这张网表逐门算出。', 'Every Chipet\'s heart is a TapeOut circuit. Power-ups, battles and fusions are all evaluated gate by gate on its netlist.')}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2 font-mono text-[11px] text-mute">
              {CHAIN_IDS.filter((id) => MAINNET_IDS.includes(id)).map((id) => (
                <span key={id} className="flex items-center gap-1.5 rounded-full bg-panel py-1 pr-2.5 pl-1 ring-1 ring-line"><ChainIcon id={id} className="size-4" />{chainLabel(id)}</span>
              ))}
            </div>
          </div>
          <div>
            <div className="font-mono text-[11px] text-faint">{t('玩法', 'Play')}</div>
            <ul className="mt-3 space-y-2 text-sm">
              {NAV.map(({ to, key, label }) => (
                <li key={key}><Link to={to} className="text-mute no-underline transition-colors hover:text-ink">{txt(label)}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <div className="font-mono text-[11px] text-faint">{t('资源', 'Resources')}</div>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link to="/guide" className="inline-flex items-center gap-1.5 text-mute no-underline transition-colors hover:text-ink"><BookMarked className="size-3.5" />{t('玩法手册', 'Playbook')}</Link></li>
              <li><Link to="/shop" className="inline-flex items-center gap-1.5 text-mute no-underline transition-colors hover:text-ink"><Coins className="size-3.5" />{t('BEM 商店', 'BEM Shop')}</Link></li>
              <li><a href={t('https://web3.okx.com/zh-hans/xlayer/build-x-series', 'https://web3.okx.com/xlayer/build-x-series')} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-mute no-underline transition-colors hover:text-ink">X Layer TapeOut<ExternalLink className="size-3.5" /></a></li>
              <li><a href="https://github.com/TapeOutProtocol/TapeKit" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-mute no-underline transition-colors hover:text-ink"><Code2 className="size-3.5" />TapeKit</a></li>
              <li><Link to="/lab/studio" className="inline-flex items-center gap-1.5 text-mute no-underline transition-colors hover:text-ink"><PenTool className="size-3.5" />{t('电路设计器', 'Circuit Studio')}</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-line/60">
          <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-4 font-mono text-[11px] text-faint sm:px-7">
            <span className="flex items-center gap-1.5"><Cpu className="size-3.5 text-si" />Chipet · X Layer TapeOut Accelerate</span>
            <span className="ml-auto">{t('外形由电路身份派生 · 对战功率由电路逐门算出', 'Looks derive from the circuit identity · battle power is computed gate by gate')}</span>
          </div>
        </div>
      </footer>

      <div className="fixed right-5 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 flex w-[360px] max-w-[calc(100vw-2.5rem)] flex-col gap-2 md:bottom-[max(1.25rem,env(safe-area-inset-bottom))]">
        {toasts.map((toast) => (
          <div key={toast.id} role="status" className={cn(
            'flex animate-rise items-start gap-3 rounded-2xl border bg-panel px-4 py-3 text-[13px] shadow-lg shadow-si/10',
            toast.kind === 'err' ? 'border-danger/40' : toast.kind === 'ok' ? 'border-si/40' : 'border-line',
          )}>
            {toast.kind === 'busy' ? <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-copper" />
              : toast.kind === 'ok' ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-si" />
              : <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" />}
            <div className="min-w-0 flex-1 text-pretty">
              {toast.text}
              {toast.hash && explorer(toast.hash) && (
                <a href={explorer(toast.hash)!} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 font-mono text-xs">
                  {short(toast.hash, 8)}<ExternalLink className="size-3" />
                </a>
              )}
            </div>
            <button type="button" aria-label={t('关闭', 'Close')} onClick={() => dismiss(toast.id)} className="text-faint transition-colors hover:text-ink"><X className="size-4" /></button>
          </div>
        ))}
      </div>

      <WalletGuide open={walletGuide} onClose={closeWalletGuide} />
    </div>
  );
}
