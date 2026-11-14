import '@rainbow-me/rainbowkit/styles.css';
import type { ReactNode } from 'react';
import { http, createConfig, WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { connectorsForWallets, darkTheme, RainbowKitProvider, type Theme } from '@rainbow-me/rainbowkit';
import {
  binanceWallet, bitgetWallet, coinbaseWallet, injectedWallet, metaMaskWallet, okxWallet, oneKeyWallet, rabbyWallet, tokenPocketWallet,
  trustWallet, walletConnectWallet,
} from '@rainbow-me/rainbowkit/wallets';
import type { Chain } from 'viem';
import { CHAINS } from '@tapearena/chain';
import { CHAIN_IDS } from './env.ts';

// WalletConnect 扫码需要在 cloud.reown.com 申请项目 ID；没配时只提供浏览器插件钱包。
const projectId = (import.meta.env.VITE_WC_PROJECT_ID as string | undefined) ?? '';

const connectors = connectorsForWallets(
  [
    { groupName: '推荐', wallets: [okxWallet, metaMaskWallet, rabbyWallet, binanceWallet, bitgetWallet] },
    { groupName: '更多', wallets: [coinbaseWallet, trustWallet, oneKeyWallet, tokenPocketWallet, injectedWallet, ...(projectId ? [walletConnectWallet] : [])] },
  ],
  { appName: 'TapeArena', projectId: projectId || 'tapearena-local' },
);

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
