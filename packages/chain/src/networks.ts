import { defineChain, type Address } from 'viem';
import deployments from './deployments.json' with { type: 'json' };

export const xlayer = defineChain({
  id: 196,
  name: 'X Layer',
  nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.xlayer.tech', 'https://xlayerrpc.okx.com'] } },
  blockExplorers: { default: { name: 'OKLink', url: 'https://www.oklink.com/xlayer' } },
});

export const bsc = defineChain({
  id: 56,
  name: 'BNB Smart Chain',
  nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  rpcUrls: { default: { http: ['https://bsc-dataseed.bnbchain.org', 'https://bsc-dataseed1.binance.org', 'https://bsc-rpc.publicnode.com'] } },
  blockExplorers: { default: { name: 'BscScan', url: 'https://bscscan.com' } },
});

export const localFork = defineChain({
  id: 31337,
  name: 'Local X Layer fork',
  nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
});

export interface Deployment {
  chainId: number;
  /** TapeOut 官方工厂（X Layer `0x1f09…0761` / BSC `0x6822…F7e2`）。 */
  factory?: Address;
  arena?: Address;
  library?: Address;
  /** 演示/默认流片用的处理器 */
  cpu?: Address;
  /** Chipet 芯宠合约（当前可孵化） */
  chipet?: Address;
  /** 历史 Chipet：只读展示/喂玩，不再 hatch */
  chipetLegacy?: Address[];
  deployedAt?: string;
}

/** 本地路由 id：旧合约 tokenId 加此前缀，避免与新合约 #1/#2 撞车。 */
export const LEGACY_PET_ID_BASE = 1_000_000;

/** 当前链上要读的全部 Chipet（新在前，旧在后）。 */
export function chipetAddresses(d: Deployment | undefined | null): Address[] {
  if (!d?.chipet) return [];
  const seen = new Set<string>();
  const out: Address[] = [];
  for (const a of [d.chipet, ...(d.chipetLegacy ?? [])]) {
    const k = a.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(a);
  }
  return out;
}

export function isLegacyChipet(d: Deployment | undefined | null, chipet: Address): boolean {
  if (!d?.chipet) return false;
  if (chipet.toLowerCase() === d.chipet.toLowerCase()) return false;
  return (d.chipetLegacy ?? []).some((a) => a.toLowerCase() === chipet.toLowerCase());
}

/** 链上 tokenId → 本地/路由 id */
export function toLocalPetId(tokenId: number, chipet: Address, primary: Address): number {
  return chipet.toLowerCase() === primary.toLowerCase() ? tokenId : tokenId + LEGACY_PET_ID_BASE;
}

/** 本地/路由 id → 链上 tokenId */
export function toChainTokenId(localId: number): number {
  return localId >= LEGACY_PET_ID_BASE ? localId - LEGACY_PET_ID_BASE : localId;
}

/** TapeOut 在 X Layer 主网的工厂地址，来自 TapeKit 内核配置并经链上核对。 */
export const XLAYER_TAPEOUT_FACTORY = '0x1f09daefa827f02cbb40967cc91b259763760761' as Address;
export const XLAYER_BEM = '0x60e62efa9405d6873c5deabd4e6cc91c25363952' as Address;
/** TapeOut 在 BSC 主网的工厂（Genesis Circuits 见 BSC_GENESIS_CPU）。 */
export const BSC_TAPEOUT_FACTORY = '0x68224f668083c29e9800be2a646d42d18cedf7e2' as Address;
export const BSC_GENESIS_CPU = '0x50a994e71615474b55559ff4f500928fbc339dd9' as Address;
/** BSC 主网 BEM（与工厂 `bem()` 一致；8 位小数）。 */
export const BSC_BEM = '0x5ce033b2bfca3af30b3e8c8457deaf776a8b695a' as Address;
/** X Layer / BSC 上 BEM 均为 8 位小数。 */
export const BEM_DECIMALS = 8;

/** Chipet 商店收款：各链 Chipet 部署人钱包（EOA，BEM 直接进账可转出，不经工厂锁仓）。 */
export const XLAYER_CHIPET_TREASURY = '0xBd435f285916F437A2971D62233F08d1f1434e00' as Address;
export const BSC_CHIPET_TREASURY = '0x231705a35dB8A4264742d9660F8b45Ad7A4966d5' as Address;

/** 运营后台白名单：两链 Chipet 部署人。 */
export const CHIPET_ADMINS: readonly Address[] = [XLAYER_CHIPET_TREASURY, BSC_CHIPET_TREASURY];

export function isChipetAdmin(addr?: Address | null): boolean {
  if (!addr) return false;
  const a = addr.toLowerCase();
  return CHIPET_ADMINS.some((x) => x.toLowerCase() === a);
}

export interface BemNetwork {
  token: Address;
  /** 商店收款地址：Chipet 部署人钱包 */
  treasury: Address;
  decimals: number;
}

export const BEM_BY_CHAIN: Partial<Record<number, BemNetwork>> = {
  196: { token: XLAYER_BEM, treasury: XLAYER_CHIPET_TREASURY, decimals: BEM_DECIMALS },
  56: { token: BSC_BEM, treasury: BSC_CHIPET_TREASURY, decimals: BEM_DECIMALS },
};

export function bemNetwork(chainId: number): BemNetwork | undefined {
  return BEM_BY_CHAIN[chainId];
}

export const DEPLOYMENTS: Record<number, Deployment> = {
  196: { chainId: 196, factory: XLAYER_TAPEOUT_FACTORY },
  56: { chainId: 56, factory: BSC_TAPEOUT_FACTORY, cpu: BSC_GENESIS_CPU },
  ...(deployments as Record<string, Deployment>),
};

export const CHAINS = { 196: xlayer, 56: bsc, 31337: localFork } as const;

/** 面向用户的两条主网：X Layer 和 BSC。本地 fork 只在有部署记录时才出现在选择器里。 */
export const MAINNET_IDS: readonly number[] = [196, 56];

/** 网络选择器里用的短名 */
export const CHAIN_LABEL: Record<number, string> = { 196: 'X Layer', 56: 'BSC', 31337: 'Local fork' };

export function deploymentFor(chainId: number): Deployment | undefined {
  return DEPLOYMENTS[chainId];
}
