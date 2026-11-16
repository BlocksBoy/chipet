import '@rainbow-me/rainbowkit/styles.css';
import type { ReactNode } from 'react';
import { http, createConfig, WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { connectorsForWallets, lightTheme, RainbowKitProvider, type Theme, type WalletList } from '@rainbow-me/rainbowkit';
import {
  binanceWallet, bitgetWallet, coinbaseWallet, injectedWallet, metaMaskWallet, okxWallet, oneKeyWallet, rabbyWallet, tokenPocketWallet,
  trustWallet,
} from '@rainbow-me/rainbowkit/wallets';
import type { Chain } from 'viem';
import { CHAINS } from '@tapearena/chain';
import { CHAIN_IDS } from './env.ts';
import { both, tr, useLang, type Txt } from './i18n.ts';

type CreateWallet = WalletList[number]['wallets'][number];

// 网格里每格很窄，统一用短名
const short = (create: CreateWallet, name: string): CreateWallet => (params) => ({ ...create(params), name });

// 只用插件钱包，不走 WalletConnect，projectId 只是占位
const walletParams = { appName: 'Chipet', projectId: 'chipet-local' };

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
  if (!found.length && win().ethereum) found.push(short(injectedWallet, tr('浏览器钱包', 'Browser Wallet')));
  return found;
}

const installed = installedWallets();
const connectors = installed.length ? connectorsForWallets([{ groupName: 'Installed', wallets: installed }], walletParams) : [];

export interface GuideWallet { id: string; name: string; note: Txt; url: string; background: string; icon: () => Promise<string> }

const guide = (create: CreateWallet, name: string, note: Txt): GuideWallet => {
  const w = create(walletParams);
  const d = w.downloadUrls ?? {};
  return {
    id: w.id, name, note, background: w.iconBackground,
    url: d.browserExtension ?? d.chrome ?? d.qrCode ?? '#',
    icon: typeof w.iconUrl === 'string' ? async () => w.iconUrl as string : w.iconUrl,
  };
};

/** 一个钱包都没检测到时，引导用户安装的常用钱包。 */
export const GUIDE_WALLETS: GuideWallet[] = [
  guide(okxWallet, 'OKX Wallet', both('X Layer 官方钱包，推荐', 'Official X Layer wallet, recommended')),
  guide(binanceWallet, 'Binance Wallet', both('币安 Web3 钱包', 'Binance Web3 wallet')),
  guide(metaMaskWallet, 'MetaMask', both('最常用的以太坊钱包', 'The most widely used EVM wallet')),
  guide(rabbyWallet, 'Rabby', both('多链插件，交易前预览', 'Multi-chain, previews every transaction')),
  guide(bitgetWallet, 'Bitget Wallet', both('多链 Web3 钱包', 'Multi-chain Web3 wallet')),
  guide(coinbaseWallet, 'Coinbase Wallet', both('Coinbase 自托管钱包', 'Coinbase self-custody wallet')),
];

const chains = CHAIN_IDS.map((id) => CHAINS[id as keyof typeof CHAINS]) as unknown as [Chain, ...Chain[]];

export const wagmiConfig = createConfig({
  connectors,
  chains,
  transports: Object.fromEntries(chains.map((c) => [c.id, http((import.meta.env[`VITE_RPC_${c.id}`] as string | undefined) ?? c.rpcUrls.default.http[0])])),
});

const base = lightTheme({ accentColor: '#e07a45', accentColorForeground: '#ffffff', borderRadius: 'large', overlayBlur: 'small' });
const theme: Theme = {
  ...base,
  colors: {
    ...base.colors,
    modalBackground: '#ffffff',
    modalBorder: '#d3e5dc',
    modalText: '#1a2e28',
    modalTextSecondary: '#5a736a',
    modalTextDim: '#8aa399',
    actionButtonSecondaryBackground: '#e8f3ee',
    generalBorder: '#d3e5dc',
    generalBorderDim: '#e8f3ee',
    menuItemBackground: '#e8f3ee',
    profileForeground: '#ffffff',
    profileAction: '#e8f3ee',
    profileActionHover: '#d3e5dc',
    closeButtonBackground: '#e8f3ee',
    closeButton: '#5a736a',
    selectedOptionBorder: '#2a9d8f',
    connectButtonBackground: '#ffffff',
    connectButtonInnerBackground: '#e8f3ee',
    connectButtonText: '#1a2e28',
  },
  fonts: { body: "'Noto Sans SC', 'Outfit', system-ui, -apple-system, 'PingFang SC', sans-serif" },
};

const queryClient = new QueryClient();

export function WalletProvider({ children }: { children: ReactNode }) {
  const lang = useLang();
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={theme} locale={lang === 'zh' ? 'zh-CN' : 'en-US'} modalSize="compact"
          appInfo={{ appName: 'Chipet', learnMoreUrl: lang === 'zh' ? 'https://web3.okx.com/zh-hans/xlayer' : 'https://web3.okx.com/xlayer' }}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
