import { defineChain, type Address } from 'viem';
import deployments from './deployments.json' with { type: 'json' };

export const xlayer = defineChain({
  id: 196,
  name: 'X Layer',
  nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.xlayer.tech', 'https://xlayerrpc.okx.com'] } },
  blockExplorers: { default: { name: 'OKLink', url: 'https://www.oklink.com/xlayer' } },
});

export const localFork = defineChain({
  id: 31337,
  name: 'Local X Layer fork',
  nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
});

export interface Deployment {
  chainId: number;
  /** TapeOut 官方工厂（X Layer 主网 0x1f09…0761） */
  factory: Address;
  arena?: Address;
  library?: Address;
  /** 演示/默认流片用的处理器 */
  cpu?: Address;
  deployedAt?: string;
}

/** TapeOut 在 X Layer 主网的工厂地址，来自 TapeKit 内核配置并经链上核对。 */
export const XLAYER_TAPEOUT_FACTORY = '0x1f09daefa827f02cbb40967cc91b259763760761' as Address;
export const XLAYER_BEM = '0x60e62efa9405d6873c5deabd4e6cc91c25363952' as Address;

export const DEPLOYMENTS: Record<number, Deployment> = {
  196: { chainId: 196, factory: XLAYER_TAPEOUT_FACTORY },
  ...(deployments as Record<string, Deployment>),
};

export const CHAINS = { 196: xlayer, 31337: localFork } as const;

export function deploymentFor(chainId: number): Deployment | undefined {
  return DEPLOYMENTS[chainId];
}
