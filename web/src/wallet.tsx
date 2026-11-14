import '@rainbow-me/rainbowkit/styles.css';
import type { ReactNode } from 'react';
import { http, createConfig, WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { connectorsForWallets, darkTheme, RainbowKitProvider, type Theme, type WalletList } from '@rainbow-me/rainbowkit';
import {
  binanceWallet, bitgetWallet, coinbaseWallet, injectedWallet, metaMaskWallet, okxWallet, oneKeyWallet, rabbyWallet, tokenPocketWallet,
  trustWallet,
} from '@rainbow-me/rainbowkit/wallets';
import type { Chain } from 'viem';
import { CHAINS } from '@tapearena/chain';
import { CHAIN_IDS } from './env.ts';

type CreateWallet = WalletList[number]['wallets'][number];

// 网格里每格很窄，统一用短名
const short = (create: CreateWallet, name: string): CreateWallet => (params) => ({ ...create(params), name });

// 只用插件钱包，不走 WalletConnect，projectId 只是占位
const walletParams = { appName: 'TapeArena', projectId: 'tapearena-local' };

type Eth = { isCoinbaseWallet?: boolean; providers?: Eth[] };
const win = () => window as { ethereum?: Eth; okxwallet?: unknown; coinbaseWalletExtension?: unknown };

const viaFlag = (create: CreateWallet) => () => create(walletParams).installed === true;

// okxWallet 不带 installed 字段；coinbaseWallet 总是报 installed（没插件时走 SDK 弹窗）
const KNOWN: [CreateWallet, () => boolean][] = [
  [short(okxWallet, 'OKX'), () => !!win().okxwallet],
  [metaMaskWallet, viaFlag(metaMaskWallet)],
  [short(rabbyWallet, 'Rabby'), viaFlag(rabbyWallet)],
  [short(binanceWallet, 'Binance'), viaFlag(binanceWallet)],
  [short(bitgetWallet, 'Bitget'), viaFlag(bitgetWallet)],
  [short(trustWallet, 'Trust'), viaFlag(trustWallet)],
  [oneKeyWallet, viaFlag(oneKeyWallet)],
  [tokenPocketWallet, viaFlag(tokenPocketWallet)],
  [short(coinbaseWallet, 'Coinbase'), () => {
    const { ethereum: e, coinbaseWalletExtension } = win();
    return !!(coinbaseWalletExtension || e?.isCoinbaseWallet || e?.providers?.some((p) => p.isCoinbaseWallet));
  }],
];

/**
 * 只列出浏览器里检测到的钱包。没在 KNOWN 里的插件钱包由 wagmi 的 EIP-6963 发现补上，
 * RainbowKit 会把它们并进同名的 Installed 分组。
 */
function installedWallets(): CreateWallet[] {
  const found = KNOWN.filter(([, detect]) => detect()).map(([create]) => create);
  if (!found.length && win().ethereum) found.push(short(injectedWallet, '浏览器钱包'));
  return found;
}

const installed = installedWallets();
const connectors = installed.length ? connectorsForWallets([{ groupName: 'Installed', wallets: installed }], walletParams) : [];

const chains = CHAIN_IDS.map((id) => CHAINS[id as keyof typeof CHAINS]) as unknown as [Chain, ...Chain[]];

export const wagmiConfig = createConfig({
  connectors,
  chains,
  transports: Object.fromEntries(chains.map((c) => [c.id, http((import.meta.env[`VITE_RPC_${c.id}`] as string | undefined) ?? c.rpcUrls.default.http[0])])),
});

const base = darkTheme({ accentColor: '#e08a4c', accentColorForeground: '#1a0f07', borderRadius: 'medium', overlayBlur: 'small' });
const theme: Theme = {
  ...base,
  colors: {
    ...base.colors,
    modalBackground: '#111612',
    modalBorder: '#233027',
    modalText: '#ebe6d9',
    modalTextSecondary: '#8a9389',
    modalTextDim: '#59625a',
    actionButtonSecondaryBackground: '#161d18',
    generalBorder: '#233027',
    generalBorderDim: '#1a231d',
    menuItemBackground: '#161d18',
    profileForeground: '#111612',
    profileAction: '#161d18',
    profileActionHover: '#1d2620',
    closeButtonBackground: '#161d18',
    closeButton: '#8a9389',
    selectedOptionBorder: '#7a4a2a',
    connectButtonBackground: '#111612',
    connectButtonInnerBackground: '#161d18',
    connectButtonText: '#ebe6d9',
  },
  fonts: { body: "'Noto Sans SC', system-ui, -apple-system, 'PingFang SC', sans-serif" },
};

const queryClient = new QueryClient();

export function WalletProvider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={theme} locale="zh-CN" modalSize="compact" appInfo={{ appName: 'TapeArena', learnMoreUrl: 'https://web3.okx.com/zh-hans/xlayer' }}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
