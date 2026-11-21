import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentType } from 'react';
import { motion } from 'motion/react';
import { Egg, Sparkles, Hammer, Swords, BookOpen, ArrowRight, Users, Fish, ListChecks, CircleCheck, Zap, Hand, CalendarCheck, Cable, Cat, Trophy, Coins, FlaskConical, type LucideProps } from 'lucide-react';
import { DataLoading, FeedSkeleton } from '../components/Skeleton.tsx';
import { Button, Panel, Tag, Input, PAGE, SectionTitle, StatBand, Trait, cn } from '../components/ui.tsx';
import { Link, go, useRoute } from '../router.tsx';
import { useApp } from '../state.tsx';
import { both, tr, txt, useLang, useT } from '../i18n.ts';
import { PetAvatar } from '../chipet/PetAvatar.tsx';
import { KittyEgg } from '../chipet/KittyEgg.tsx';
import { FxOverlay, type ChipImpulse } from '../chipet/FxOverlay.tsx';
import { SceneStage } from '../chipet/SceneStage.tsx';
import { hatchChipet, nameAvailable, petsOfOwner } from '@tapearena/chain';
import { getLocalPetsRev, localChipet, subscribeLocalPets } from '../chipet/store.ts';
import { cattributes, petSeed, phenotypeOf, SPECIES_COUNT, typeLabel } from '../chipet/phenotype.ts';
import { heartOf } from '../chipet/heart.ts';
import { ACT_ICON, actTone, PetCard, routeIdOf, timeAgo } from '../chipet/PetCard.tsx';
import { getCloudSyncRev, isPublicLoading, subscribeCloudSync } from '../chipet/cloudSync.ts';
import { getSocialRev, social, subscribeSocial, type QuestId } from '../chipet/social.ts';
import { BEM_SKUS, bem } from '../chipet/bem.ts';

const NAME_INPUT_ID = 'chipet-name';
/** 敲到第 n 下时蛋的反应 */
const eggSays = (n: number) => [tr('咔！', 'Crack!'), tr('咔嚓！', 'Crrrack!'), tr('喵？', 'Meow?')][n] ?? tr('咔！', 'Crack!');
/** 破壳前摇晃的时长，需与 CSS egg-quake 一致 */
const QUAKE_MS = 700;
/** 四步玩法：每一步背后都是同一枚 TapeOut 电路。 */
const STEPS = [
  {
    icon: Egg, n: '01', t: both('孵化', 'Hatch'),
    p: both('起个名字，敲开彩蛋。电路身份哈希出毛色、瞳色和花纹，稀有度决定心脏电路有多大。', 'Pick a name and crack the egg. The circuit identity hashes into coat, eyes and pattern; rarity decides how big the heart circuit is.'),
  },
  {
    icon: Zap, n: '02', t: both('养成', 'Raise'),
    p: both('喂食回能量。通电玩耍里拨动引脚开关，让心脏电路的输出对上目标，涨心情和经验。', 'Feed it to restore energy. In Power Play you flip the pin switches until the heart circuit outputs the target, earning mood and XP.'),
  },
  {
    icon: Swords, n: '03', t: both('对战', 'Battle'),
    p: both('每回合由心脏电路算出三招的功率。进攻、防御、技巧互相克制，去打芯片里的 Bug。', 'Each round the heart circuit computes the power of three moves. Attack, Defend and Trick counter each other as you fight the bugs inside the chip.'),
  },
  {
    icon: Cable, n: '04', t: both('牵线', 'Link'),
    p: both('和邻居牵线，两颗心脏互相引用、串成合体电路，每场对战能放一次无视克制的合体技。', 'Link with a neighbor: the two hearts reference each other as one fusion circuit, good for one triangle-ignoring move per battle.'),
  },
] as const;

const QUEST_ICON: Record<QuestId, ComponentType<LucideProps>> = {
  checkin: CalendarCheck,
  power: Zap,
  battle: Swords,
  visit: Hand,
  lab_peek: FlaskConical,
};

export function Home() {
  const { deployment, chain, account, connect, run, notify, signer, pub, refreshKey } = useApp();
  const t = useT();
  const lang = useLang();
  const chipet = deployment?.chipet;
  const onChain = !!chipet;
  const [name, setName] = useState('');
  const [hatched, setHatched] = useState<ReturnType<typeof localChipet.hatch> | null>(null);
  const [phase, setPhase] = useState<'egg' | 'cracking' | 'kitty'>('egg');
  const [cracks, setCracks] = useState(0);
  const [eggKey, setEggKey] = useState(0);
  const [eggSay, setEggSay] = useState('');
  const [tick, setTick] = useState(0);
  const [impulse, setImpulse] = useState<ChipImpulse>('idle');
  const [fxNonce, setFxNonce] = useState(0);
  const pulseSeq = useRef(0);
  const timers = useRef<number[]>([]);
  const route = useRoute();
  const socialRev = useSyncExternalStore(subscribeSocial, getSocialRev, getSocialRev);
  const cloudRev = useSyncExternalStore(subscribeCloudSync, getCloudSyncRev, getCloudSyncRev);
  const petsRev = useSyncExternalStore(subscribeLocalPets, getLocalPetsRev, getLocalPetsRev);
  const feedLoading = isPublicLoading();
  void cloudRev;
  const pets = useMemo(() => localChipet.list(), [tick, refreshKey, petsRev]);
  // 路由回到家园 / 社交存档变更时都重算，避免任务进度卡住
  const profile = useMemo(() => social.profile(), [tick, socialRev, route.path]);
  const quests = useMemo(() => social.quests(), [tick, socialRev, route.path]);
  const feed = useMemo(() => social.activities(), [tick, socialRev, route.path]);
  const speciesSeen = useMemo(() => new Set(pets.map((p) => phenotypeOf(p.cpu, p.circuitId, p.rarity).speciesId)).size, [pets]);
  const totalWins = pets.reduce((n, p) => n + p.wins, 0);
  const ph = useMemo(
    () => (hatched ? phenotypeOf(hatched.cpu, hatched.circuitId, hatched.rarity, petSeed(hatched)) : null),
    [hatched],
  );
  const traits = useMemo(() => (ph ? cattributes(ph) : []), [ph, lang]);
  const showKitty = phase === 'kitty' && !!hatched;

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  /** 钱包连上且合约已部署时，把链上宠物拉进本地缓存。 */
  useEffect(() => {
    if (!chipet || !account) return;
    let live = true;
    petsOfOwner(pub, chipet, account).then((list) => {
      if (!live) return;
      localChipet.syncChainPets(list);
      setTick((n) => n + 1);
    }).catch(() => { /* 读失败时保留本地缓存 */ });
    return () => { live = false; };
  }, [chipet, account, pub, refreshKey]);
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  /** 连敲时每一下都重新触发特效；只有最后一次脉冲负责收尾，免得旧定时器掐掉新特效。 */
  const pulse = (kind: ChipImpulse) => {
    const seq = ++pulseSeq.current;
    setFxNonce(seq);
    setImpulse(kind);
    later(() => {
      if (pulseSeq.current === seq) setImpulse('idle');
    }, kind === 'hatch' ? 1100 : 900);
  };

  /** 先摇晃蓄力，再破壳：猫、图鉴、收藏列表都等到这一刻才揭晓。 */
  const reveal = (p: ReturnType<typeof localChipet.hatch>) => {
    social.announceHatch(p);
    setHatched(p);
    setName('');
    setCracks(3);
    setPhase('cracking');
    later(() => {
      setPhase('kitty');
      setTick((t) => t + 1);
      pulse('hatch');
    }, QUAKE_MS);
  };

  const hatch = async (fancy = false) => {
    const n = name.trim();
    if (!n || phase !== 'egg') return;
    try {
      if (fancy) {
        if (bem.eggCredits() > 0) bem.consumeEggCredit();
        else if (bem.canAfford('egg_fancy')) bem.spendDemo('egg_fancy');
        else {
          notify('err', t('BEM 不够，去商店领取演示 BEM 或购买限定彩蛋', 'Not enough BEM. Claim demo BEM or buy a premium egg in the Shop'));
          go('/shop');
          return;
        }
      }
      // 免费普通蛋永远可本地敲，不强制连钱包；已连接且合约在线时才上链铸造
      if (onChain && chipet && account) {
        if (!(await nameAvailable(pub, chipet, n))) {
          notify('err', t('这个名字已被占用，换一个吧', 'That name is taken — pick another'));
          return;
        }
        await run(t('孵化芯宠', 'Hatch'), async (step) => {
          const s = await signer();
          const hatchedOn = await hatchChipet(s, chipet, n, undefined, step);
          const p = localChipet.upsertChain({
            id: hatchedOn.petId,
            name: hatchedOn.name || n,
            cpu: hatchedOn.cpu,
            circuitId: hatchedOn.circuitId,
            rarity: hatchedOn.rarity,
            energy: 80,
            mood: 70,
            intimacy: 0,
            level: 1,
            lastFeed: 0,
            lastPlay: 0,
          });
          reveal(p);
          return p;
        });
        return;
      }
      if (fancy && onChain && chipet && !account) return connect();
      reveal(localChipet.hatch(n, fancy ? { guarantee: 'fancy' } : undefined));
    } catch (e) {
      notify('err', e instanceof Error ? e.message : String(e));
    }
  };

  /** 敲三下裂到底；再敲一下，有名字就直接破壳，没名字就提醒起名。 */
  const tapEgg = () => {
    if (cracks >= 3) {
      if (name.trim()) {
        void hatch();
        return;
      }
      document.getElementById(NAME_INPUT_ID)?.focus();
      setEggSay(t('先起个名字～', 'Name it first~'));
      pulse('pat');
      return;
    }
    setEggSay(eggSays(cracks));
    setCracks(cracks + 1);
    pulse('pat');
  };

  const resetHatch = () => {
    setHatched(null);
    setPhase('egg');
    setCracks(0);
    setEggKey((k) => k + 1);
    setImpulse('idle');
  };

  const hint =
    phase === 'cracking'
      ? t('咔嚓咔嚓——要出来了！', 'Crack, crack… here it comes!')
      : showKitty
        ? t('摸摸它，尾巴会摇哦', 'Pat it and its tail will wag')
        : cracks >= 3
          ? name.trim() ? t('它等不及了！再敲一下就破壳', "It can't wait! One more tap to hatch") : t('它等不及了！先给它起个名字', "It can't wait! Give it a name first")
          : cracks > 0
            ? t('再敲敲，裂缝变大了…', 'Keep tapping, the crack is growing…')
            : t('点一点彩蛋，把它敲醒', 'Tap the egg to wake it up');

  const checkin = () => {
    if (!account) {
      notify('err', t('请先连接钱包再签到', 'Connect a wallet to check in'));
      connect();
      return;
    }
    try {
      social.checkin();
      setTick((t) => t + 1);
    } catch (e) {
      notify('err', e instanceof Error ? e.message : String(e));
    }
  };

  const claim = (id: QuestId) => {
    try {
      social.claimQuest(id);
      setTick((t) => t + 1);
    } catch (e) {
      notify('err', e instanceof Error ? e.message : String(e));
    }
  };

  /** 「去完成」把人带到对应的玩法入口。 */
  const doQuest = (id: QuestId) => {
    if (id === 'checkin') return checkin();
    if (id === 'battle') return go('/train');
    if (id === 'visit') return go('/neighbors');
    if (id === 'lab_peek') return go('/lab');
    const first = pets[0];
    if (first) return go(`/pet/${first.id}`);
    document.getElementById(NAME_INPUT_ID)?.focus();
  };

  return (
    <div className={cn(PAGE, 'py-8 sm:py-10')}>
      <section className="relative overflow-hidden rounded-[2rem] border border-line/80 bg-panel px-4 pb-6 pt-4 shadow-sm shadow-si/5 sm:px-8 sm:pb-8 sm:pt-5 lg:pl-8 lg:pr-10">
        <div className="pointer-events-none absolute -top-24 right-0 size-72 rounded-full bg-[#f7d6df]/80 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-10 size-64 rounded-full bg-si/10 blur-3xl" />

        <div className="relative grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-stretch lg:gap-8">
          <div className="flex min-w-0 flex-col lg:h-full lg:max-w-xl">
            <Tag tone="si" icon={Egg} className="w-fit self-start">{t('Chipet · 芯宠', 'Chipet · chip pets')}</Tag>
            <h1 className="mt-8 max-w-xl text-[1.85rem] leading-[1.15] text-ink sm:mt-10 sm:text-[2.75rem] lg:mt-12">
              {t('敲开彩蛋', 'Crack the egg,')}<br />
              <span className="text-si">{t('遇见你的芯喵', 'meet your chip kitty')}</span>
            </h1>

            <div className="mt-5 flex flex-wrap items-center gap-2 sm:mt-6">
              <Tag tone="si" icon={Fish}>{t('小鱼干', 'Treats')} {profile.fish}</Tag>
              <Tag tone="copper">{t(`连续签到 ${profile.streak} 天`, `${profile.streak}-day streak`)}</Tag>
              <Button size="sm" variant="ghost" disabled={!account || profile.checkedIn} onClick={checkin}>
                {profile.checkedIn ? t('今日已签到', 'Checked in') : t('每日签到领鱼干', 'Daily check-in')}
              </Button>
            </div>

            <div className="mt-5 max-w-md sm:mt-6">
              <p className="text-sm text-pretty text-mute sm:text-base">
                {t(
                  '像加密猫一样：每只芯喵都有独特毛色、瞳色与花纹。心脏是一枚 TapeOut 电路——给它通电、带它对战，每一步都是这枚电路算出来的。',
                  'Like CryptoKitties, every kitty has its own coat, eye color and pattern. Its heart is a TapeOut circuit: power it up, take it into battle, and every step is computed by that circuit.',
                )}
              </p>
              {!onChain && (
                <p className="mt-1.5 text-xs text-pretty text-faint">
                  {t(
                    `本地演示模式 · ${chain.name} 上还没有部署 Chipet 合约，芯宠先存在这个浏览器里，刷新不会丢`,
                    `Local demo mode · the Chipet contract isn't deployed on ${chain.name} yet, so your pets are kept in this browser and survive a refresh`,
                  )}
                </p>
              )}
            </div>
            <ol
              className={cn(
                'mt-5 grid w-full max-w-xl grid-cols-2 gap-2.5',
                'sm:mt-6 sm:flex sm:w-fit sm:grid-cols-none sm:items-center sm:gap-1 sm:rounded-full sm:border sm:border-line sm:bg-panel-2/80 sm:p-1.5',
              )}
              aria-label={t('四步玩法', 'Four-step loop')}
            >
              {STEPS.map(({ icon: I, n, t: title }, i) => {
                const first = pets[0];
                const goStep = () => {
                  if (i === 0) document.getElementById(NAME_INPUT_ID)?.focus();
                  else if (i === 1) first ? go(`/pet/${first.id}`) : document.getElementById(NAME_INPUT_ID)?.focus();
                  else if (i === 2) go('/train');
                  else go('/plaza');
                };
                return (
                  <li key={n} className="min-w-0 sm:flex sm:items-center sm:gap-1">
                    {i > 0 && <span className="mx-0.5 hidden size-1 shrink-0 rounded-full bg-si/35 sm:block" aria-hidden />}
                    <button
                      type="button"
                      onClick={goStep}
                      className={cn(
                        // 手机：疏朗方卡；描边用 border（overflow 父级会裁掉 ring 上沿）
                        'flex w-full items-center gap-3 rounded-2xl border border-line bg-panel p-3.5 text-left shadow-sm shadow-si/5 transition',
                        'hover:-translate-y-0.5 hover:border-si/50 active:translate-y-0',
                        // 桌面：收回胶囊条
                        'sm:inline-flex sm:w-auto sm:gap-1.5 sm:rounded-full sm:border-line sm:p-0 sm:px-2.5 sm:py-1.5 sm:shadow-none',
                        'sm:hover:border-si/50',
                      )}
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-si/10 text-si sm:size-5 sm:rounded-full">
                        <I className="size-4 sm:size-3" />
                      </span>
                      <span className="min-w-0 flex-1 sm:flex sm:flex-none sm:items-center sm:gap-1.5">
                        <span className="block font-mono text-[10px] font-medium tabular-nums text-faint sm:inline">{n}</span>
                        <span className="mt-0.5 block text-[15px] font-semibold text-ink sm:mt-0 sm:text-[12px]">{txt(title)}</span>
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-faint sm:hidden" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ol>
            <p className="mt-3 max-w-md text-xs text-pretty text-faint">
              {t('外形由电路身份派生 · 对战功率由电路逐门算出', 'Looks from circuit identity · battle power computed gate by gate')}
            </p>
          </div>

          <SceneStage
            className="mx-auto w-full max-w-[min(100%,340px)] sm:max-w-[360px] lg:justify-self-center"
            bg={showKitty && ph ? ph.bg : undefined}
            hint={hint}
          >
            {!showKitty && (
              <div
                className="absolute inset-x-0 top-0 z-20 px-3 pt-3 sm:px-4 sm:pt-4"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="flex min-w-0 items-center gap-2 rounded-2xl bg-white/80 p-1.5 shadow-sm ring-1 ring-white/70 backdrop-blur-md">
                  <Input
                    id={NAME_INPUT_ID}
                    className="h-9 min-w-0 w-0 flex-1 border-0 bg-transparent px-2.5 shadow-none focus:ring-0 focus-visible:ring-0"
                    value={name}
                    maxLength={32}
                    placeholder={t('起名，如：青豆', 'Name, e.g. Mochi')}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void hatch()}
                  />
                  <Button size="sm" className="shrink-0" icon={Hammer} disabled={!name.trim()} onClick={() => void hatch()}>
                    {t('免费敲蛋', 'Free hatch')}
                  </Button>
                </div>
              </div>
            )}
            {/* 起名条占位：蛋、锤子、提示都落在条下方，避免被挡住 */}
            <div className={cn('absolute inset-0', !showKitty && 'top-[3.75rem] sm:top-16')}>
              {showKitty && <div className="hatch-rays" />}
              <KittyEgg
                key={eggKey}
                phase={phase === 'egg' ? 'idle' : phase === 'cracking' ? 'shake' : 'open'}
                cracks={cracks}
                onTap={tapEgg}
              >
                {showKitty && hatched && (
                  // 先从下半壳里蹦出来悬一下，等壳掉了再落回正中
                  <motion.div
                    initial={{ opacity: 0, scale: 0.25, y: 70 }}
                    animate={{ opacity: [0, 1, 1, 1, 1], scale: [0.25, 1.1, 1, 1, 1], y: [70, -34, -18, -18, 0] }}
                    transition={{ duration: 1.5, times: [0, 0.28, 0.42, 0.7, 1], ease: 'easeOut' }}
                  >
                    <PetAvatar
                      cpu={hatched.cpu}
                      circuitId={hatched.circuitId}
                      rarity={hatched.rarity}
                      mood={Math.max(80, hatched.mood)}
                      size={250}
                      interactive
                      seed={petSeed(hatched)}
                      onPat={() => pulse('pat')}
                    />
                  </motion.div>
                )}
              </KittyEgg>
              <FxOverlay
                impulse={impulse}
                nonce={fxNonce}
                label={
                  impulse === 'hatch'
                    ? t('破壳啦！', 'Hatched!')
                    : impulse === 'pat' && phase === 'egg'
                      ? eggSay
                      : undefined
                }
              />
            </div>
          </SceneStage>
        </div>

        {showKitty && hatched && ph && (
          <motion.div
            className="relative mt-10 flex flex-col items-center gap-4 rounded-3xl px-5 py-5 sm:flex-row sm:justify-between"
            style={{ backgroundColor: ph.bg }}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 1.1, ease: 'easeOut' }}
          >
            <div className="text-center sm:text-left">
              <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <h2 className="text-xl">{hatched.name}</h2>
                <Tag tone={hatched.rarity === 2 ? 'gold' : hatched.rarity === 1 ? 'si' : 'neutral'}>{typeLabel(hatched.rarity)}</Tag>
                <Tag tone="faint">{ph.species}</Tag>
              </div>
              <div className="mt-2 flex flex-wrap justify-center gap-1.5 sm:justify-start">
                {traits.map((t) => (
                  <Trait key={t.id} label={t.label} value={t.value} className="bg-white/90" />
                ))}
              </div>
              <p className="mt-2 text-sm text-mute">{t('破壳成功！去摸摸它、给它的心脏通通电。', 'It hatched! Go pat it and power up its heart.')}</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => go(`/pet/${hatched.id}`)} icon={ArrowRight}>{t('去看望', 'Visit')}</Button>
              <Button variant="ghost" onClick={resetHatch}>{t('继续孵化', 'Hatch another')}</Button>
            </div>
          </motion.div>
        )}
      </section>

      <StatBand className="mt-6" items={[
        { icon: Cat, label: t('我的芯喵', 'My kitties'), value: pets.length, tone: 'si' },
        { icon: BookOpen, label: t('已遇见物种', 'Species met'), value: `${speciesSeen}/${SPECIES_COUNT}`, tone: 'gold' },
        { icon: Trophy, label: t('对战胜场', 'Battle wins'), value: totalWins, tone: 'copper' },
        { icon: Fish, label: t(`小鱼干 · 连续签到 ${profile.streak} 天`, `Fish treats · ${profile.streak}-day streak`), value: profile.fish, tone: 'violet' },
      ]} />

      <Panel className="mt-6 overflow-hidden border-si/25 bg-gradient-to-br from-si/10 via-panel to-gold/5 p-0" bodyClass="p-0">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-si/15 px-2.5 py-1 font-mono text-[11px] font-semibold text-si-dim">
              <FlaskConical className="size-3.5" />
              {t('新玩法 · 实验室合流', 'New · Lab crossover')}
            </div>
            <h3 className="mt-2 font-display text-lg font-bold text-ink sm:text-xl">
              {t('擂台冠军电路，可焊进芯喵副心脏', 'Weld bounty-winning circuits onto your Chipet')}
            </h3>
            <p className="mt-1 max-w-xl text-sm text-pretty text-mute">
              {t(
                '打开自家芯喵详情 →「副心脏 · 擂台纹」可先演示焊入；对战普通出招功率 +1。今日任务多了一项「逛擂台 / 设计器仿真」。',
                'Open your kitty → “Aux heart · Arena crest” to try a demo weld; +1 power on normal battle moves. Daily quests now include browsing a bounty or simulating in Studio.',
              )}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              size="sm"
              variant="si"
              icon={Cat}
              onClick={() => {
                const first = pets[0];
                if (first) go(`/pet/${first.id}`);
                else document.getElementById(NAME_INPUT_ID)?.focus();
              }}
            >
              {pets[0] ? t('去焊入演示纹', 'Try demo crest') : t('先孵一只', 'Hatch first')}
            </Button>
            <Button size="sm" variant="ghost" icon={FlaskConical} onClick={() => go('/lab')}>
              {t('去实验室', 'Open Lab')}
            </Button>
          </div>
        </div>
      </Panel>

      <Panel
        title={t('今日任务', 'Daily quests')}
        icon={ListChecks}
        className="mt-6"
        bodyClass="p-4"
        right={<span className="font-mono text-[11px] text-mute">{t('每完成一项，领 1 条小鱼干', '1 fish treat per quest')}</span>}
      >
        <ul className="grid gap-2 sm:grid-cols-2">
          {quests.map((q) => {
            const I = QUEST_ICON[q.id];
            return (
              <li key={q.id} className="flex items-center gap-3 rounded-2xl bg-panel-2/60 px-4 py-3">
                <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${q.done ? 'bg-si text-white' : 'bg-panel text-si'}`}>
                  {q.done ? <CircleCheck className="size-4" /> : <I className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink">{q.label}</div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel">
                      <div className="h-full rounded-full bg-si transition-[width] duration-500 ease-out" style={{ width: `${(q.progress / q.goal) * 100}%` }} />
                    </div>
                    <span className="font-mono text-[11px] tabular-nums text-mute">{q.progress}/{q.goal}</span>
                  </div>
                </div>
                {q.claimed ? (
                  <Tag tone="faint">{t('已领取', 'Claimed')}</Tag>
                ) : q.done ? (
                  <Button size="sm" icon={Fish} onClick={() => claim(q.id)}>{t('领取', 'Claim')}</Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => doQuest(q.id)}>{t('去完成', 'Go')}</Button>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel className="mt-10 overflow-hidden bg-gradient-to-br from-copper/10 via-panel to-si/5 p-0 ring-1 ring-copper/20">
        <div className="grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="flex flex-col justify-between gap-5 p-5 sm:p-6">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-copper/15 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-copper-dim">
                <Coins className="size-3.5" />
                BEM
              </div>
              <h3 className="mt-3 font-display text-xl font-bold text-balance text-ink sm:text-2xl">
                {t('免费玩上头了？用 BEM 开限定', 'Hooked? Unlock more with BEM')}
              </h3>
              <p className="mt-2 max-w-md text-sm text-pretty text-mute">
                {t('核心养成永远免费。右边四样才花 BEM——买的是更快、更稀有、多一个坑。', 'Core raising stays free. Only the four on the right spend BEM — faster, rarer, one more slot.')}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" icon={Coins} onClick={() => go('/shop')}>{t('打开商店', 'Open Shop')}</Button>
              <Button size="sm" variant="ghost" onClick={() => go('/guide/shop')}>{t('看说明', 'Playbook')}</Button>
            </div>
          </div>
          <ul className="grid grid-cols-2 gap-px border-t border-copper/15 bg-copper/10 lg:border-t-0 lg:border-l">
            {([
              { sku: BEM_SKUS.egg_fancy, icon: Egg },
              { sku: BEM_SKUS.energy, icon: Zap },
              { sku: BEM_SKUS.fish5, icon: Fish },
              { sku: BEM_SKUS.bond_slot, icon: Users },
            ] as const).map(({ sku, icon: I }) => (
              <li key={sku.id}>
                <button
                  type="button"
                  onClick={() => go('/shop')}
                  className="flex h-full w-full flex-col gap-2 bg-panel/90 p-4 text-left transition-colors hover:bg-copper/10"
                >
                  <span className="grid size-8 place-items-center rounded-xl bg-copper/12 text-copper"><I className="size-4" /></span>
                  <span className="font-display text-sm font-semibold text-ink">{txt(sku.title)}</span>
                  <span className="mt-auto font-mono text-xs tabular-nums text-copper-dim">{sku.price} BEM</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </Panel>

      <SectionTitle className="mt-12" icon={Sparkles} title={t('怎么玩', 'How it works')}
        desc={t('四步上手。每一步背后，都是同一枚 TapeOut 电路在算。', 'Four steps to get going. Behind every one of them, the same TapeOut circuit is doing the math.')}
        right={<Link to="/guide" className="inline-flex items-center gap-1 text-sm font-semibold text-si-dim no-underline hover:text-si"><BookOpen className="size-4" />{t('玩法手册', 'Playbook')}<ArrowRight className="size-4" /></Link>} />
      <ol className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map(({ icon: I, n, t: title, p }, i) => {
          const first = pets[0];
          const [cta, act] = i === 0
            ? [t('给它起名', 'Name your egg'), () => { document.getElementById(NAME_INPUT_ID)?.focus(); }] as const
            : i === 1
              ? [first ? t(`去看「${first.name}」`, `Visit ${first.name}`) : t('先孵一只', 'Hatch one first'), () => (first ? go(`/pet/${first.id}`) : document.getElementById(NAME_INPUT_ID)?.focus())] as const
              : i === 2
                ? [t('去训练场', 'Go to Train'), () => go('/train')] as const
                : [t('去广场', 'Go to Plaza'), () => go('/plaza')] as const;
          return (
            <li key={n} className="flex flex-col rounded-3xl border border-line/80 bg-panel p-5 shadow-sm shadow-si/5">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-2xl bg-si/10 text-si"><I className="size-5" /></span>
                <span className="font-mono text-xs text-faint">{n}</span>
              </div>
              <h3 className="mt-4 text-lg">{txt(title)}</h3>
              <p className="mt-1.5 flex-1 text-sm text-pretty text-mute">{txt(p)}</p>
              <button type="button" onClick={act} className="group mt-4 inline-flex w-fit items-center gap-1 text-sm font-semibold text-si-dim transition-colors hover:text-si">
                {cta}<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </button>
            </li>
          );
        })}
      </ol>

      <div className="mt-12 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <SectionTitle icon={Cat} title={t('我的芯喵', 'My kitties')}
            desc={pets.length > 0 ? t(`共 ${pets.length} 只，点开看它的心脏电路。`, `${pets.length} in total. Open one to see its heart circuit.`) : undefined}
            right={<Link to="/dex" className="inline-flex items-center gap-1 text-sm font-semibold text-si-dim no-underline hover:text-si">{t('打开图鉴', 'Open the Dex')}<ArrowRight className="size-4" /></Link>} />
          {pets.length === 0 ? (
            <div className="mt-5 rounded-3xl border border-dashed border-line-2 bg-panel/60 px-6 py-14 text-center">
              <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-panel-2 text-copper ring-1 ring-line-2"><Egg className="size-7" /></span>
              <p className="mt-4 text-sm text-mute">{t('还没有芯喵。上面起个名字，敲开第一枚蛋吧。', 'No kitties yet. Pick a name above and crack your first egg.')}</p>
            </div>
          ) : (
            <ul className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-3">
              {(pets.length > 6 ? pets.slice(0, 5) : pets).map((p) => {
                const petPh = phenotypeOf(p.cpu, p.circuitId, p.rarity, petSeed(p));
                const h = heartOf(p.circuitId, p.rarity);
                const auxOn = localChipet.hasAuxHeart(p);
                return (
                  <li key={p.id}>
                    <PetCard
                      pet={p}
                      name={p.name}
                      sub={`${petPh.species} · ${h.name}`}
                      badge={`#${String(p.id).padStart(4, '0')}`}
                      tags={(
                        <>
                          <Tag tone="faint">{petPh.coat}</Tag>
                          <Tag tone="copper">{t(`${h.gates} 门`, `${h.gates} gates`)}</Tag>
                          {auxOn && <Tag tone="gold">{t('擂台纹', 'Arena crest')}</Tag>}
                        </>
                      )}
                      onClick={() => go(`/pet/${p.id}`)}
                    />
                  </li>
                );
              })}
              {pets.length > 6 && (
                <li>
                  <button
                    type="button"
                    onClick={() => go('/kitties')}
                    className="group flex h-full min-h-[220px] w-full flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-line-2 bg-panel/70 px-4 py-8 text-center shadow-sm shadow-si/5 transition duration-200 hover:-translate-y-0.5 hover:border-si/40 hover:bg-panel hover:shadow-md hover:shadow-si/10"
                  >
                    <span className="grid size-12 place-items-center rounded-2xl bg-si/10 text-si transition group-hover:bg-si/15">
                      <ArrowRight className="size-5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                    <span className="font-display text-[17px] font-bold text-ink">{t('查看更多', 'View more')}</span>
                    <span className="text-xs text-mute">
                      {t(`还有 ${pets.length - 5} 只`, `${pets.length - 5} more`)}
                    </span>
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>

        <Panel title={t('广场动态', 'Plaza feed')} icon={Users} bodyClass="p-4"
          right={<Link to="/plaza" className="inline-flex items-center gap-1 text-xs font-semibold text-si-dim no-underline hover:text-si">{t('全部', 'All')}<ArrowRight className="size-3.5" /></Link>}>
          {feedLoading && feed.length === 0 ? (
            <DataLoading label={t('加载动态…', 'Loading feed…')}>
              <FeedSkeleton rows={5} />
            </DataLoading>
          ) : feed.length === 0 ? (
            <p className="px-1 py-2 text-sm text-mute">{t('还没有动态，去孵化或摸摸邻居吧。', 'Nothing here yet. Hatch a kitty or go pat a neighbor.')}</p>
          ) : (
            <ul className="space-y-1">
              {feed.slice(0, 10).map((a) => {
                const I = ACT_ICON[a.kind] ?? Sparkles;
                return (
                  <li key={a.id} className="min-h-[3.35rem]">
                    <button type="button" onClick={() => (a.petKey ? go(`/pet/${routeIdOf(a.petKey)}`) : go('/plaza'))}
                      className="flex w-full items-start gap-3 rounded-2xl px-2 py-2 text-left transition hover:bg-panel-2/60">
                      <span className={cn('mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl', actTone(a.kind))}><I className="size-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-pretty text-ink">{txt(a.text)}</span>
                        <span className="block text-[11px] text-faint">{txt(a.actor)} · {timeAgo(a.at)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
