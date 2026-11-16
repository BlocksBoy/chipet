import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPublicClient, http, type Address, type Chain, type Hex, type PublicClient, type WalletClient } from 'viem';
import { useAccount, useConnectors, useSwitchChain } from 'wagmi';
import { getWalletClient } from 'wagmi/actions';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { CHAINS, ChainLibrary, DEPLOYMENTS, type Deployment, type Signer } from '@tapearena/chain';
import { errMsg } from './format.ts';
import { tr } from './i18n.ts';
import { CHAIN_IDS } from './env.ts';
import { wagmiConfig } from './wallet.tsx';

export interface Toast { id: number; kind: 'busy' | 'ok' | 'err'; text: string; hash?: Hex }

interface Ctx {
  chainId: number;
  chain: Chain;
  setChainId(id: number): void;
  pub: PublicClient;
  lib: ChainLibrary;
  deployment: Deployment | undefined;
  account: Address | null;
  connect(): void;
  walletGuide: boolean;
  closeWalletGuide(): void;
  signer(): Promise<Signer>;
  toasts: Toast[];
  /** 一条几秒后自动消失的轻提示 */
  notify(kind: 'ok' | 'err', text: string): void;
  run<T>(label: string, f: (step: (s: string, hash?: Hex) => void) => Promise<T>): Promise<T | undefined>;
  dismiss(id: number): void;
  explorer(hash: string): string | null;
  refreshKey: number;
  refresh(): void;
}

const C = createContext<Ctx | null>(null);
export const useApp = () => useContext(C)!;

const defaultChain = () => {
  const saved = Number(localStorage.getItem('tapearena.chain'));
  if (CHAIN_IDS.includes(saved)) return saved;
  // 曾选过已隐藏的主网（如 BSC）时回落到默认可见链
  const fallback = Number(import.meta.env.VITE_CHAIN_ID ?? 196);
  const id = CHAIN_IDS.includes(fallback) ? fallback : (CHAIN_IDS[0] ?? 196);
  localStorage.setItem('tapearena.chain', String(id));
  return id;
};

let toastSeq = 0;

export function AppProvider({ children }: { children: ReactNode }) {
  const [chainId, setChainIdRaw] = useState(defaultChain);
  const { address, chainId: walletChainId } = useAccount();
  const account = address ?? null;
  const { switchChainAsync } = useSwitchChain();
  const { openConnectModal } = useConnectModal();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const chain = CHAINS[chainId as keyof typeof CHAINS] as Chain;
  const { pub, lib } = useMemo(() => {
    const rpc = import.meta.env[`VITE_RPC_${chainId}`] as string | undefined;
    const pub = createPublicClient({ chain, transport: http(rpc ?? chain.rpcUrls.default.http[0], { batch: true }) }) as PublicClient;
    return { pub, lib: new ChainLibrary(pub) };
  }, [chainId, chain]);

  const setChainId = (id: number) => {
    if (!CHAIN_IDS.includes(id)) return; // 隐藏主网（如 BSC）不可选
    localStorage.setItem('tapearena.chain', String(id));
    setChainIdRaw(id);
    // 应用内切网时同步钱包，这样原生币余额 / 后续交易都落在同一条链
    if (account && walletChainId !== id) {
      void switchChainAsync({ chainId: id }).catch(() => { /* 用户拒绝或钱包不支持时保留应用侧选择 */ });
    }
  };

  const connectors = useConnectors();
  const [walletGuide, setWalletGuide] = useState(false);
  const closeWalletGuide = useCallback(() => setWalletGuide(false), []);
  const connect = useCallback(() => {
    if (connectors.length) openConnectModal?.();
    else setWalletGuide(true);
  }, [connectors.length, openConnectModal]);

  const signer = useCallback(async (): Promise<Signer> => {
    if (!account) {
      connect();
      throw new Error(tr('请先连接钱包', 'Connect your wallet first'));
    }
    // 钱包不认识这条链时 wagmi 会自动发起 wallet_addEthereumChain
    if (walletChainId !== chainId) await switchChainAsync({ chainId });
    const wallet = (await getWalletClient(wagmiConfig, { chainId, account })) as WalletClient;
    return { pub, wallet, account, chain } as Signer;
  }, [account, walletChainId, chainId, chain, pub, switchChainAsync, connect]);

  const dismiss = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));
  const put = (t: Toast) => setToasts((all) => [...all.filter((x) => x.id !== t.id), t]);

  const notify = useCallback((kind: 'ok' | 'err', text: string) => {
    const id = ++toastSeq;
    put({ id, kind, text });
    setTimeout(() => dismiss(id), 4000);
  }, []);

  const run = useCallback(async <T,>(label: string, f: (step: (s: string, hash?: Hex) => void) => Promise<T>) => {
    const id = ++toastSeq;
    put({ id, kind: 'busy', text: label });
    try {
      const r = await f((s, hash) => put({
        id, kind: 'busy', hash,
        text: hash ? tr(`${s}：已发送，等待确认…`, `${s}: sent, waiting for confirmation…`) : tr(`${s}：请在钱包中确认`, `${s}: confirm in your wallet`),
      }));
      put({ id, kind: 'ok', text: tr(`${label}完成`, `${label}: done`) });
      setTimeout(() => dismiss(id), 5000);
      setRefreshKey((k) => k + 1);
      return r;
    } catch (e) {
      put({ id, kind: 'err', text: tr(`${label}失败：${errMsg(e)}`, `${label} failed: ${errMsg(e)}`) });
      return undefined;
    }
  }, []);

  const explorer = (hash: string) => (chain.blockExplorers ? `${chain.blockExplorers.default.url}/tx/${hash}` : null);

  const value: Ctx = {
    chainId, chain, setChainId, pub, lib, deployment: DEPLOYMENTS[chainId], account, connect, walletGuide, closeWalletGuide, signer,
    toasts, notify, run, dismiss, explorer, refreshKey, refresh: () => setRefreshKey((k) => k + 1),
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}

/** 简单的异步数据钩子：依赖变了或 refreshKey 变了就重取。 */
export function useAsync<T>(f: () => Promise<T>, deps: unknown[]): { data?: T; error?: Error; loading: boolean } {
  const { refreshKey } = useApp();
  const [s, setS] = useState<{ data?: T; error?: Error; loading: boolean }>({ loading: true });
  useEffect(() => {
    let live = true;
    setS((p) => ({ ...p, loading: true }));
    f().then((data) => live && setS({ data, loading: false })).catch((error) => live && setS({ error, loading: false }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, refreshKey]);
  return s;
}
