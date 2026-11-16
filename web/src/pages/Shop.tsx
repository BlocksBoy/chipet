import { useEffect, useMemo, useState } from 'react';
import { formatUnits } from 'viem';
import { CHAIN_LABEL, transferErc20 } from '@tapearena/chain';
import {
  ArrowUpRight, Cable, Coins, Egg, Fish, History, Sparkles, Zap,
} from 'lucide-react';
import { Button, PAGE, PageHeader, Panel, SectionTitle, Tag, cn } from '../components/ui.tsx';
import { Link, go } from '../router.tsx';
import { useApp } from '../state.tsx';
import { txt, useT } from '../i18n.ts';
import {
  BEM_BRIDGE_HINT, BEM_BRIDGE_URL, BEM_SKUS, BEM_SKU_LIST, BOND_SLOTS_MAX, FAUCET_AMOUNT,
  bem, bemAmount, type BemSku,
} from '../chipet/bem.ts';
import { localChipet } from '../chipet/store.ts';
import { social } from '../chipet/social.ts';

const SKU_ICON = {
  egg_fancy: Egg,
  energy: Zap,
  fish5: Fish,
  bond_slot: Cable,
} as const;

export function Shop() {
  const t = useT();
  const { chainId, pub, account, connect, signer, run, notify, refreshKey } = useApp();
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState<BemSku | 'faucet' | null>(null);
  const [chainBal, setChainBal] = useState<bigint | null>(null);

  const st = useMemo(() => bem.state(), [tick, refreshKey]);
  const pets = useMemo(() => localChipet.list(), [tick, refreshKey]);
  const bemNet = bem.forChain(chainId);
  const chainLabel = CHAIN_LABEL[chainId] ?? String(chainId);
  const useChainPay = !!bemNet && !!account;

  useEffect(() => {
    if (!account || !bemNet) { setChainBal(null); return; }
    let live = true;
    bem.readBalance(pub, account, chainId).then((b) => { if (live) setChainBal(b); }).catch(() => { if (live) setChainBal(null); });
    return () => { live = false; };
  }, [account, bemNet, chainId, pub, refreshKey, tick]);

  const bump = () => setTick((n) => n + 1);

  const applySku = (sku: BemSku) => {
    if (sku === 'egg_fancy') {
      const n = bem.grantEggCredit();
      notify('ok', t(`限定彩蛋 ×1（待敲 ${n}）· 回家园敲蛋`, `Premium egg ×1 (${n} waiting) · crack it at Home`));
      return;
    }
    if (sku === 'energy') {
      const pet = pets[0];
      if (!pet) throw new Error(t('先孵一只芯喵再快充', 'Hatch a kitty before refilling energy'));
      localChipet.refillEnergy(pet.id);
      notify('ok', t(`「${pet.name}」能量已回满`, `${pet.name}'s energy is full`));
      return;
    }
    if (sku === 'fish5') {
      const n = social.addFish(BEM_SKUS.fish5.fish ?? 5);
      notify('ok', t(`鱼干 +${BEM_SKUS.fish5.fish}，现在有 ${n} 条`, `+${BEM_SKUS.fish5.fish} fish treats · now ${n}`));
      return;
    }
    if (sku === 'bond_slot') {
      const cap = bem.expandBondSlot();
      notify('ok', t(`线友上限扩到 ${cap}`, `Bond slots expanded to ${cap}`));
    }
  };

  const buy = async (sku: BemSku) => {
    const info = BEM_SKUS[sku];
    if (sku === 'bond_slot' && !bem.canExpandBond()) {
      notify('err', t('线友位已经扩到上限了', 'Bond slots are already at the max'));
      return;
    }
    if (sku === 'energy' && pets.length === 0) {
      notify('err', t('先孵一只芯喵再快充', 'Hatch a kitty before refilling energy'));
      return;
    }
    setBusy(sku);
    try {
      if (useChainPay && bemNet) {
        const bal = chainBal ?? 0n;
        const need = bemAmount(info.price, bemNet.decimals);
        if (bal < need) {
          if (chainId === 196) {
            notify('err', t(`X Layer BEM 不足。${BEM_BRIDGE_HINT.zh}`, `Not enough X Layer BEM. ${BEM_BRIDGE_HINT.en}`));
            window.open(BEM_BRIDGE_URL, '_blank', 'noopener,noreferrer');
          } else {
            notify('err', t('链上 BEM 不足，可先切本地 fork 用演示余额', 'Not enough on-chain BEM. Switch to the local fork to use demo balance'));
          }
          return;
        }
        const ok = await run(t(`支付 ${info.price} BEM`, `Pay ${info.price} BEM`), async (step) => {
          const s = await signer();
          await transferErc20(s, bemNet.token, bemNet.treasury, need, step);
          bem.recordChainSpend(sku);
          applySku(sku);
          return true;
        });
        if (ok) bump();
      } else {
        bem.spendDemo(sku);
        applySku(sku);
        bump();
      }
    } catch (e) {
      notify('err', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const claimFaucet = () => {
    setBusy('faucet');
    try {
      const bal = bem.faucet();
      notify('ok', t(`领到 ${FAUCET_AMOUNT} 演示 BEM，余额 ${bal}`, `Claimed ${FAUCET_AMOUNT} demo BEM · balance ${bal}`));
      bump();
    } catch (e) {
      notify('err', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={cn(PAGE, 'py-8 sm:py-10')}>
      <PageHeader
        eyebrow={t('商店 · BEM', 'Shop · BEM')}
        icon={Coins}
        title={t('BEM 商店', 'BEM Shop')}
        desc={t(
          '免费能玩完整闭环。BEM 只买更快、更稀有、多一个坑——不锁核心进度。',
          'The free loop is complete. BEM only buys faster, rarer, or one more slot — never a progress wall.',
        )}
        right={<Button size="sm" variant="ghost" onClick={() => go('/guide/shop')}>{t('看玩法说明', 'Read the playbook')}</Button>}
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Panel className="p-5">
          <div className="font-mono text-[11px] text-faint">{t('演示余额', 'Demo balance')}</div>
          <div className="mt-1 flex items-end gap-2">
            <span className="font-display text-3xl font-bold tabular-nums text-ink">{st.demoBal}</span>
            <span className="mb-1 font-mono text-sm text-mute">BEM</span>
          </div>
          <p className="mt-2 text-xs text-mute">
            {t('本地 fork / 未连钱包时用演示 BEM 购买。', 'Used for purchases on the local fork or when no wallet is connected.')}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" icon={Sparkles} disabled={busy !== null || !bem.canFaucet()} onClick={claimFaucet}>
              {bem.canFaucet() ? t(`领取 ${FAUCET_AMOUNT} 演示 BEM`, `Claim ${FAUCET_AMOUNT} demo BEM`) : t('今日已领', 'Claimed today')}
            </Button>
            {!account && bemNet && (
              <Button size="sm" variant="ghost" onClick={connect}>{t('连接钱包看链上余额', 'Connect to see on-chain balance')}</Button>
            )}
          </div>
        </Panel>
        <Panel className="p-5">
          <div className="font-mono text-[11px] text-faint">
            {bemNet
              ? t(`${chainLabel} 链上 BEM`, `${chainLabel} on-chain BEM`)
              : t('链上 BEM', 'On-chain BEM')}
          </div>
          <div className="mt-1 flex items-end gap-2">
            <span className="font-display text-3xl font-bold tabular-nums text-ink">
              {!bemNet
                ? '—'
                : !account
                  ? '—'
                  : chainBal === null
                    ? '…'
                    : Number(formatUnits(chainBal, bemNet.decimals)).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
            <span className="mb-1 font-mono text-sm text-mute">BEM</span>
          </div>
          <p className="mt-2 text-xs text-mute">
            {useChainPay
              ? t(`当前购买会从钱包转账 ${chainLabel} 上的真实 BEM。`, `Purchases will transfer real BEM on ${chainLabel} from your wallet.`)
              : bemNet
                ? t(`在 ${chainLabel} 连接钱包后，可用真实 BEM 支付。`, `Connect a wallet on ${chainLabel} to pay with real BEM.`)
                : t('切到 X Layer 并连接钱包后，可用真实 BEM 支付。', 'Switch to X Layer and connect a wallet to pay with real BEM.')}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Tag tone="si">{t('线友位', 'Bond slots')} {st.bondSlots}/{BOND_SLOTS_MAX}</Tag>
            <Tag tone="copper">{t('支付方式', 'Pay with')} {useChainPay ? t('链上', 'On-chain') : t('演示', 'Demo')}</Tag>
            {chainId === 196 && (
              <Button
                size="sm"
                variant="ghost"
                icon={ArrowUpRight}
                onClick={() => {
                  window.open(BEM_BRIDGE_URL, '_blank', 'noopener,noreferrer');
                  notify('ok', t(BEM_BRIDGE_HINT.zh, BEM_BRIDGE_HINT.en));
                }}
              >
                {t('去官网跨链充值', 'Top up via official bridge')}
              </Button>
            )}
          </div>
          {chainId === 196 && (
            <p className="mt-3 text-[11px] text-faint">
              {t(
                '官网地址栏不会变。打开 tapeout.net 后，点左侧「BEM 跨链」（或首页「BEM 跨链到 X Layer」），从 BNB Chain 1:1 转入。',
                'The official site keeps one URL. On tapeout.net, open “BEM Bridge” in the left menu (or the home “Bridge BEM to X Layer” card) to move BEM 1:1 from BNB Chain.',
              )}
            </p>
          )}
        </Panel>
      </div>

      <SectionTitle
        className="mt-10"
        icon={Coins}
        title={t('进阶商品', 'Premium items')}
        desc={t('四类商品，价目与玩法手册一致。', 'Four items. Prices match the playbook.')}
      />
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {BEM_SKU_LIST.map((sku) => {
          const I = SKU_ICON[sku.id];
          const disabled = busy !== null
            || (sku.id === 'bond_slot' && !bem.canExpandBond())
            || (sku.id === 'energy' && pets.length === 0)
            || (!useChainPay && st.demoBal < sku.price);
          return (
            <Panel key={sku.id} className="flex flex-col p-5">
              <div className="flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-copper/10 text-copper ring-1 ring-copper/20">
                  <I className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-lg font-bold text-ink">{txt(sku.title)}</h3>
                    <Tag tone="copper">{sku.price} BEM</Tag>
                  </div>
                  <p className="mt-1.5 text-sm text-pretty text-mute">{txt(sku.desc)}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button size="sm" disabled={disabled} onClick={() => void buy(sku.id)}>
                  {busy === sku.id ? t('处理中…', 'Working…') : t('购买', 'Buy')}
                </Button>
                {sku.id === 'egg_fancy' && (
                  <Button size="sm" variant="ghost" onClick={() => go('/')}>{t('去家园敲蛋', 'Crack at Home')}</Button>
                )}
                {sku.id === 'energy' && pets[0] && (
                  <span className="text-[11px] text-faint">{t(`作用于「${pets[0].name}」`, `Applies to ${pets[0].name}`)}</span>
                )}
              </div>
            </Panel>
          );
        })}
      </div>

      <Panel className="mt-8 p-5">
        <SectionTitle icon={History} title={t('最近消费', 'Recent spends')} />
        {st.log.length === 0 ? (
          <p className="mt-3 text-sm text-mute">{t('还没有花过 BEM。先免费玩，上头了再来。', 'No BEM spent yet. Play for free first, then come back when you are hooked.')}</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {st.log.slice(0, 8).map((row, i) => (
              <li key={`${row.at}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line/60 pt-2 first:border-0 first:pt-0">
                <span className="font-semibold text-ink">{row.note ?? row.sku}</span>
                <span className="font-mono text-[11px] text-mute">-{row.price} BEM</span>
                <Tag tone={row.via === 'chain' ? 'si' : 'faint'}>{row.via === 'chain' ? t('链上', 'On-chain') : t('演示', 'Demo')}</Tag>
                <span className="ml-auto font-mono text-[11px] text-faint">{new Date(row.at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs text-mute">
          <Link to="/guide/shop" className="font-semibold text-si-dim no-underline hover:text-si">{t('玩法手册 · 免费与 BEM', 'Playbook · Free & BEM')}</Link>
          {' · '}
          {t('普通孵化、喂食、对战、牵线基础位永远免费。', 'Normal hatch, feed, battles and the base bond slots stay free forever.')}
        </p>
      </Panel>
    </div>
  );
}
