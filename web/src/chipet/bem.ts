/**
 * Chipet 的 BEM 经济：免费闭环之外，用 BEM 买「更快 / 更稀有 / 多一个坑」。
 * 本地演示走 localStorage；切到 X Layer / BSC 并连钱包后读该链真实余额并 transfer 支付。
 */
import { parseUnits, type Address, type PublicClient } from 'viem';
import { bemNetwork, BEM_DECIMALS as CHAIN_BEM_DECIMALS, erc20Abi, XLAYER_BEM } from '@tapearena/chain';
import { both, tr, txt, type Txt } from '../i18n.ts';

const KEY = 'chipet.bem.v1';
/** 演示/链上标价共用；单位是整枚 BEM（链上 X Layer / BSC 均为 8 位小数） */
export const BEM_DECIMALS = CHAIN_BEM_DECIMALS;
export const BOND_SLOTS_DEFAULT = 3;
export const BOND_SLOTS_MAX = 5;
export const FAUCET_AMOUNT = 20;
/** @deprecated 用 bem.forChain(chainId)；保留默认指向 X Layer 以免旧引用炸 */
export const BEM_SHOP_TREASURY = bemNetwork(196)!.treasury;
export const BEM_TOKEN = XLAYER_BEM;

export type BemSku = 'egg_fancy' | 'energy' | 'fish5' | 'bond_slot';

export interface BemSkuInfo {
  id: BemSku;
  price: number;
  title: Txt;
  desc: Txt;
  /** 鱼干礼包份数 */
  fish?: number;
}

/** 价目表：手册与商店共用，避免两处文案打架 */
export const BEM_SKUS: Record<BemSku, BemSkuInfo> = {
  egg_fancy: {
    id: 'egg_fancy',
    price: 8,
    title: both('限定彩蛋', 'Premium egg'),
    desc: both('保底珍奇，限定概率更高。免费普通蛋永远能敲。', 'Guaranteed Fancy, higher Exclusive odds. Free normal eggs stay free.'),
  },
  energy: {
    id: 'energy',
    price: 2,
    title: both('能量快充', 'Energy refill'),
    desc: both('无视喂食冷却，一次把能量回满。', 'Skip the feed cooldown and refill energy to full once.'),
  },
  fish5: {
    id: 'fish5',
    price: 3,
    fish: 5,
    title: both('鱼干礼包 ×5', 'Fish pack ×5'),
    desc: both('直接补 5 条小鱼干，送礼和牵线不用等签到。', 'Get 5 fish treats now — no need to wait on check-ins for gifts or linking up.'),
  },
  bond_slot: {
    id: 'bond_slot',
    price: 5,
    title: both('扩线友位 +1', 'Extra bond slot'),
    desc: both('线友上限 +1，最多扩到 5。基础 3 个永远免费。', '+1 wire-pal slot, up to 5. The base 3 slots stay free.'),
  },
};

export const BEM_SKU_LIST: BemSkuInfo[] = [
  BEM_SKUS.egg_fancy,
  BEM_SKUS.energy,
  BEM_SKUS.fish5,
  BEM_SKUS.bond_slot,
];

interface BemState {
  demoBal: number;
  bondSlots: number;
  /** 已购买、尚未敲开的限定彩蛋次数 */
  eggCredits: number;
  faucetDay: string;
  log: { at: number; sku: BemSku; price: number; via: 'demo' | 'chain'; note?: string }[];
}

function DAY() {
  return new Date().toISOString().slice(0, 10);
}

function load(): BemState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<BemState>;
    return {
      demoBal: Math.max(0, Number(raw.demoBal) || 0),
      bondSlots: Math.min(BOND_SLOTS_MAX, Math.max(BOND_SLOTS_DEFAULT, Number(raw.bondSlots) || BOND_SLOTS_DEFAULT)),
      eggCredits: Math.max(0, Number(raw.eggCredits) || 0),
      faucetDay: typeof raw.faucetDay === 'string' ? raw.faucetDay : '',
      log: Array.isArray(raw.log) ? raw.log.slice(0, 40) : [],
    };
  } catch {
    return { demoBal: 0, bondSlots: BOND_SLOTS_DEFAULT, eggCredits: 0, faucetDay: '', log: [] };
  }
}

function save(s: BemState) {
  localStorage.setItem(KEY, JSON.stringify({ ...s, log: s.log.slice(0, 40) }));
}

export function bemAmount(units: number, decimals = BEM_DECIMALS): bigint {
  return parseUnits(String(units), decimals);
}

export const bem = {
  /** 默认 X Layer（兼容旧调用） */
  token: BEM_TOKEN,
  treasury: BEM_SHOP_TREASURY,
  skus: BEM_SKU_LIST,

  forChain(chainId: number) {
    return bemNetwork(chainId);
  },

  state(): BemState {
    return load();
  },
  demoBal(): number {
    return load().demoBal;
  },
  bondSlots(): number {
    return load().bondSlots;
  },
  eggCredits(): number {
    return load().eggCredits;
  },
  canExpandBond(): boolean {
    return load().bondSlots < BOND_SLOTS_MAX;
  },
  /** 支付限定彩蛋后发放一次敲蛋资格 */
  grantEggCredit(): number {
    const s = load();
    s.eggCredits += 1;
    save(s);
    return s.eggCredits;
  },
  /** 家园敲限定蛋时消耗一次资格 */
  consumeEggCredit(): void {
    const s = load();
    if (s.eggCredits <= 0) throw new Error(tr('没有限定彩蛋次数，先去商店购买', 'No premium egg credit. Buy one in the Shop first'));
    s.eggCredits -= 1;
    save(s);
  },
  canAfford(sku: BemSku): boolean {
    return load().demoBal >= BEM_SKUS[sku].price;
  },
  canFaucet(): boolean {
    return load().faucetDay !== DAY();
  },
  /** 本地演示领 BEM：每天一次 */
  faucet(): number {
    const s = load();
    if (s.faucetDay === DAY()) throw new Error(tr('今天的演示 BEM 已经领过了', "You already claimed today's demo BEM"));
    s.demoBal += FAUCET_AMOUNT;
    s.faucetDay = DAY();
    save(s);
    return s.demoBal;
  },
  /** 扣演示余额并记账；不应用商品效果 */
  spendDemo(sku: BemSku): BemState {
    const info = BEM_SKUS[sku];
    const s = load();
    if (s.demoBal < info.price) throw new Error(tr(`BEM 不够，还差 ${info.price - s.demoBal}`, `Not enough BEM — need ${info.price - s.demoBal} more`));
    if (sku === 'bond_slot' && s.bondSlots >= BOND_SLOTS_MAX) {
      throw new Error(tr('线友位已经扩到上限了', 'Bond slots are already at the max'));
    }
    s.demoBal -= info.price;
    s.log.unshift({ at: Date.now(), sku, price: info.price, via: 'demo', note: txt(info.title) });
    save(s);
    return s;
  },
  /** 链上支付成功后只记账（不扣演示余额） */
  recordChainSpend(sku: BemSku): BemState {
    const info = BEM_SKUS[sku];
    const s = load();
    if (sku === 'bond_slot' && s.bondSlots >= BOND_SLOTS_MAX) {
      throw new Error(tr('线友位已经扩到上限了', 'Bond slots are already at the max'));
    }
    s.log.unshift({ at: Date.now(), sku, price: info.price, via: 'chain', note: txt(info.title) });
    save(s);
    return s;
  },
  /** 扩线友位（支付完成后调用） */
  expandBondSlot(): number {
    const s = load();
    if (s.bondSlots >= BOND_SLOTS_MAX) throw new Error(tr('线友位已经扩到上限了', 'Bond slots are already at the max'));
    s.bondSlots += 1;
    save(s);
    return s.bondSlots;
  },
  async readBalance(pub: PublicClient, account: Address, chainId?: number): Promise<bigint> {
    const net = chainId != null ? bemNetwork(chainId) : undefined;
    const token = net?.token ?? BEM_TOKEN;
    return pub.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [account] });
  },
};
