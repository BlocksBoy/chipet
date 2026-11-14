import type { ReactNode } from 'react';
import { CHAINS } from '@tapearena/chain';
import {
  BookOpen, ChevronDown, CircleAlert, CircleCheck, Code2, Cpu, ExternalLink, Globe, Loader2, PenTool, Plus, Swords, TriangleAlert, Wallet, X,
} from 'lucide-react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import { CHAIN_IDS } from '../env.ts';
import { Link, useRoute } from '../router.tsx';
import { useApp } from '../state.tsx';
import { short } from '../format.ts';
import { Button, cn } from './ui.tsx';

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <path
        d="M11 2.5v3.5M16 2.5v3.5M21 2.5v3.5M11 26v3.5M16 26v3.5M21 26v3.5M2.5 11h3.5M2.5 16h3.5M2.5 21h3.5M26 11h3.5M26 21h3.5"
        stroke="#7a4a2a" strokeWidth="1.6" strokeLinecap="round"
      />
      <path d="M26 16h3.5" stroke="#7fd1b9" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="6" y="6" width="20" height="20" rx="4" fill="#0e1310" stroke="#e08a4c" strokeWidth="1.6" />
      <rect x="8.6" y="8.6" width="14.8" height="14.8" rx="2" fill="none" stroke="#2f4034" strokeWidth="0.8" />
      <path d="M8.6 14.3h2.8M8.6 17.7h2.8" stroke="#ffb27a" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M11.4 12.2h3a3.8 3.8 0 0 1 0 7.6h-3z" fill="#e08a4c" fillOpacity=".16" stroke="#ffb27a" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="19.4" cy="16" r="1.1" fill="none" stroke="#7fd1b9" strokeWidth="1.2" />
      <path d="M20.5 16H26" stroke="#7fd1b9" strokeWidth="1.1" strokeLinecap="round" />
      <circle cx="10.2" cy="10.2" r="0.75" fill="#7fd1b9" />
    </svg>
  );
}

const NAV = [
  { to: '/', key: '', label: '擂台', icon: Swords },
  { to: '/studio', key: 'studio', label: '设计器', icon: PenTool },
  { to: '/library', key: 'library', label: '组件库', icon: BookOpen },
  { to: '/new', key: 'new', label: '发布悬赏', icon: Plus },
];

function WalletButton() {
  const { connector } = useAccount();
  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted, openConnectModal, openAccountModal, openChainModal }) => {
        if (!mounted) return <span className="h-8 w-28" aria-hidden />;
        if (!account) return <Button size="sm" icon={Wallet} onClick={openConnectModal}>连接钱包</Button>;
        if (chain?.unsupported) return <Button size="sm" variant="danger" icon={TriangleAlert} onClick={openChainModal}>切换网络</Button>;
        return (
          <button type="button" onClick={openAccountModal} title={account.address}
            className="flex h-8 items-center gap-2 rounded-lg bg-panel pr-2.5 pl-1.5 font-mono text-xs text-ink ring-1 ring-line-2 transition hover:ring-copper-dim">
            {connector?.icon
              ? <img src={connector.icon} alt={connector.name} className="size-5 rounded" />
              : <span className="grid size-5 place-items-center rounded bg-panel-2"><Wallet className="size-3.5 text-copper" /></span>}
            {account.displayBalance && <span className="hidden text-mute tabular-nums lg:inline">{account.displayBalance}</span>}
            <span className="size-1.5 rounded-full bg-si shadow-[0_0_6px_var(--color-si)]" />
            {account.displayName}
            <ChevronDown className="size-3.5 text-mute" />
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { chainId, setChainId, toasts, dismiss, explorer } = useApp();
  const r = useRoute();
  const here = r.parts[0] ?? '';

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-substrate/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-6 px-4 sm:px-7">
          <Link to="/" className="flex items-center gap-2.5 font-display text-[19px] font-extrabold text-ink no-underline">
            <Logo /> TapeArena
            <span className="hidden rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[10px] font-normal text-mute ring-1 ring-line-2 lg:inline">X LAYER</span>
          </Link>
          <nav className="flex gap-1">
            {NAV.map(({ to, key, label, icon: I }) => (
              <Link key={key} to={to} className={cn(
                'relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm whitespace-nowrap no-underline transition-colors',
                here === key ? 'bg-panel-2 text-ink after:absolute after:inset-x-3 after:-bottom-[13px] after:h-0.5 after:rounded-full after:bg-copper' : 'text-mute hover:bg-panel-2/70 hover:text-ink',
              )}>
                <I className={cn('size-4', here === key && 'text-copper')} /><span className="hidden md:inline">{label}</span>
              </Link>
            ))}
          </nav>
          <div className="flex-1" />
          <label className="relative hidden items-center sm:flex">
            <Globe className="pointer-events-none absolute left-2.5 size-3.5 text-si" />
            <select aria-label="网络" value={chainId} onChange={(e) => setChainId(Number(e.target.value))}
              className="h-8 cursor-pointer appearance-none rounded-lg border border-line-2 bg-panel pr-9 pl-8 font-mono text-xs text-ink outline-none hover:border-copper-dim">
              {CHAIN_IDS.map((id) => <option key={id} value={id}>{CHAINS[id as keyof typeof CHAINS].name}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 size-3.5 text-mute" />
          </label>
          <WalletButton />
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-7 font-mono text-xs text-faint sm:px-7">
          <span className="flex items-center gap-1.5"><Cpu className="size-3.5 text-copper" />判题完全在链上：合约直接调用 TapeOut 处理器的 eval 跑测试向量</span>
          <div className="flex-1" />
          <a href="https://web3.okx.com/zh-hans/xlayer/build-x-series" target="_blank" rel="noreferrer" className="flex items-center gap-1 text-faint hover:text-mute">X Layer TapeOut<ExternalLink className="size-3" /></a>
          <a href="https://github.com/TapeOutProtocol/TapeKit" target="_blank" rel="noreferrer" className="flex items-center gap-1 text-faint hover:text-mute"><Code2 className="size-3.5" />TapeKit</a>
        </div>
      </footer>

      <div className="fixed right-5 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-50 flex w-[360px] max-w-[calc(100vw-2.5rem)] flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} role="status" className={cn(
            'flex animate-rise items-start gap-3 rounded-xl border bg-panel-2 px-4 py-3 text-[13px] shadow-2xl shadow-black/50',
            t.kind === 'err' ? 'border-danger-dim' : t.kind === 'ok' ? 'border-si-dim' : 'border-line-2',
          )}>
            {t.kind === 'busy' ? <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-copper" />
              : t.kind === 'ok' ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-si" />
              : <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" />}
            <div className="min-w-0 flex-1 text-pretty">
              {t.text}
              {t.hash && explorer(t.hash) && (
                <a href={explorer(t.hash)!} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 font-mono text-xs">
                  {short(t.hash, 8)}<ExternalLink className="size-3" />
                </a>
              )}
            </div>
            <button type="button" aria-label="关闭" onClick={() => dismiss(t.id)} className="text-faint transition-colors hover:text-ink"><X className="size-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
