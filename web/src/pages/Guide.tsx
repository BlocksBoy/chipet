import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import {
  BookOpen, Cable, Cat, Coins, Cpu, Egg, ExternalLink, Fish, FlaskConical, Hand, Sparkles, Swords, Users, Zap,
  type LucideProps,
} from 'lucide-react';
import { Button, PAGE, PageHeader, Panel, SectionTitle, Tag, cn } from '../components/ui.tsx';
import { Link, go, useRoute } from '../router.tsx';
import { both, txt, useT, type Txt } from '../i18n.ts';
import { BATTLE_ENERGY } from '../chipet/store.ts';
import { MOOD_HP, MOVES } from '../chipet/battle.ts';
import { BEM_SKU_LIST, BOND_SLOTS_DEFAULT, BOND_SLOTS_MAX, FAUCET_AMOUNT } from '../chipet/bem.ts';

type SecId = 'overview' | 'hatch' | 'raise' | 'battle' | 'plaza' | 'dex' | 'lab' | 'shop' | 'network';

const TOC: { id: SecId; label: Txt; icon: ComponentType<LucideProps> }[] = [
  { id: 'overview', label: both('总览', 'Overview'), icon: BookOpen },
  { id: 'hatch', label: both('孵化', 'Hatch'), icon: Egg },
  { id: 'raise', label: both('养成', 'Raise'), icon: Zap },
  { id: 'battle', label: both('对战', 'Battle'), icon: Swords },
  { id: 'plaza', label: both('广场', 'Plaza'), icon: Users },
  { id: 'dex', label: both('图鉴', 'Dex'), icon: Cat },
  { id: 'lab', label: both('实验室', 'Lab'), icon: FlaskConical },
  { id: 'shop', label: both('免费与 BEM', 'Free & BEM'), icon: Coins },
  { id: 'network', label: both('网络', 'Network'), icon: Cpu },
];

function scrollTo(id: SecId) {
  go(`/guide/${id}`);
  requestAnimationFrame(() => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function Sec({ id, icon: I, title, lead, children, action }: {
  id: SecId;
  icon: ComponentType<LucideProps>;
  title: string;
  lead: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28">
      <Panel className="p-5 sm:p-7">
        <SectionTitle icon={I} title={title} desc={lead} right={action} />
        <div className="mt-5 space-y-4 text-sm leading-relaxed text-ink/90">{children}</div>
      </Panel>
    </section>
  );
}

function Bullet({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-si" />
      <span className="min-w-0 text-pretty">{children}</span>
    </li>
  );
}

function Callout({ tone = 'si', children }: { tone?: 'si' | 'copper' | 'gold'; children: ReactNode }) {
  const ring = tone === 'copper' ? 'border-copper/25 bg-copper/5' : tone === 'gold' ? 'border-gold/30 bg-gold/10' : 'border-si/25 bg-si/5';
  return <div className={cn('rounded-2xl border px-4 py-3 text-pretty text-mute', ring)}>{children}</div>;
}

export function Guide() {
  const t = useT();
  const r = useRoute();
  const active = (TOC.find((s) => s.id === r.parts[1])?.id ?? 'overview') as SecId;
  const [here, setHere] = useState<SecId>(active);

  useEffect(() => {
    const id = (TOC.find((s) => s.id === r.parts[1])?.id ?? 'overview') as SecId;
    setHere(id);
    if (r.parts[1]) {
      const t0 = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
      return () => window.clearTimeout(t0);
    }
  }, [r.parts[1]]);

  useEffect(() => {
    const els = TOC.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    if (!els.length) return;
    const io = new IntersectionObserver((entries) => {
      const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (top?.target.id) setHere(top.target.id as SecId);
    }, { rootMargin: '-20% 0px -65% 0px', threshold: [0, 0.2, 0.6] });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const triangle = useMemo(() => ([
    { from: MOVES[0]!.name, to: MOVES[2]!.name },
    { from: MOVES[2]!.name, to: MOVES[1]!.name },
    { from: MOVES[1]!.name, to: MOVES[0]!.name },
  ]), [t]);

  return (
    <div className={cn(PAGE, 'py-8 sm:py-10')}>
      <PageHeader
        eyebrow={t('文档 · Playbook', 'Docs · Playbook')}
        icon={BookOpen}
        title={t('玩法手册', 'Playbook')}
        desc={t(
          'Chipet 把 TapeOut 电路当成芯喵的心脏：外形、通电、对战和合体，都由同一张网表确定性算出。',
          'In Chipet, a TapeOut circuit is each kitty\'s heart: looks, power-ups, battles and fusions are all computed deterministically from the same netlist.',
        )}
        right={<Button size="sm" variant="ghost" icon={Egg} onClick={() => go('/')}>{t('去敲蛋', 'Crack an egg')}</Button>}
      />

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav
          aria-label={t('目录', 'Contents')}
          className="sticky top-20 z-10 min-w-0 max-w-full lg:overflow-visible"
        >
          <ul className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap lg:flex-col lg:rounded-3xl lg:border lg:border-line/80 lg:bg-panel lg:p-2 lg:shadow-sm lg:shadow-si/5">
            {TOC.map(({ id, label, icon: I }) => (
              <li key={id} className="min-w-0">
                <button
                  type="button"
                  onClick={() => scrollTo(id)}
                  aria-current={here === id ? 'true' : undefined}
                  className={cn(
                    'flex w-full min-w-0 items-center justify-center gap-1.5 rounded-2xl px-2.5 py-2 text-[12px] transition-colors sm:justify-start sm:rounded-full sm:px-3 sm:text-[13px] lg:rounded-2xl',
                    here === id ? 'bg-si/15 font-semibold text-si-dim' : 'bg-panel text-mute ring-1 ring-line/70 lg:bg-transparent lg:ring-0 hover:text-ink',
                  )}
                >
                  <I className="size-3.5 shrink-0" />
                  <span className="truncate">{txt(label)}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-5">
          <Sec
            id="overview"
            icon={BookOpen}
            title={t('Chipet 是什么', 'What Chipet is')}
            lead={t('一只芯喵 = 一枚可求值的 TapeOut 电路 + 由它派生出的外形。', 'One Chipet = one evaluable TapeOut circuit + looks derived from it.')}
            action={<Tag tone="si" icon={Cpu}>{t('确定性', 'Deterministic')}</Tag>}
          >
            <p>
              {t(
                '敲开彩蛋时，系统会给这只芯喵一枚心脏电路。电路身份哈希出毛色、瞳色、花纹和物种；稀有度决定心脏有多大、对战里身板有多厚。',
                'When you crack an egg, the kitty gets a heart circuit. That circuit identity hashes into coat, eyes, pattern and species; rarity decides how big the heart is and how much HP it brings into battle.',
              )}
            </p>
            <ul className="space-y-2">
              <Bullet>{t('家园：孵化、喂食、通电玩耍', 'Home: hatch, feed, Power Play')}</Bullet>
              <Bullet>{t('广场：拜访邻居、送鱼干、牵线合体', 'Plaza: visit neighbors, gift fish treats, link up')}</Bullet>
              <Bullet>{t('训练场：用心脏电路算出的功率打 Bug / 邻居', 'Training: fight bugs or neighbors with circuit-computed power')}</Bullet>
              <Bullet>{t('图鉴：收集物种与心脏电路', 'Dex: collect species and heart circuits')}</Bullet>
              <Bullet>{t('实验室：写 TapeHDL、打擂台悬赏（偏黑客松赛道）', 'Lab: write TapeHDL and compete on bounties (the hackathon track)')}</Bullet>
            </ul>
            <Callout>
              {t(
                '本地演示里，浏览器按与链上 eval 同一套规则逐门仿真。换到 X Layer 并连接钱包后，实验室的悬赏会走合约。',
                'In the local demo the browser simulates gate by gate with the same rules as on-chain eval. On X Layer with a wallet connected, Lab bounties go through the contract.',
              )}
            </Callout>
          </Sec>

          <Sec
            id="hatch"
            icon={Egg}
            title={t('孵化：敲开一枚彩蛋', 'Hatch: crack an egg')}
            lead={t('起名 → 连敲几下 → 破壳。外形由电路身份决定，不会随机换脸。', 'Name it → tap a few times → hatch. Looks come from the circuit identity, not a random redraw.')}
            action={<Button size="sm" onClick={() => go('/')}>{t('去家园', 'Go Home')}</Button>}
          >
            <ol className="list-decimal space-y-2 pl-5">
              <li>{t('在家园输入名字（可留空用默认名）。', 'Enter a name on Home (leave blank for a default).')}</li>
              <li>{t('点蛋或点「敲一下」：裂纹会越积越多，到点后剧烈摇晃再破壳。', 'Tap the egg or "Crack once": cracks build up, then it quakes and opens.')}</li>
              <li>{t('破壳后能看到物种、稀有度（普通 / 珍奇 / 限定）和心脏电路摘要。', 'After hatching you see species, rarity (Normal / Fancy / Exclusive) and a heart-circuit summary.')}</li>
            </ol>
            <Callout tone="copper">
              {t(
                '同一枚电路永远是同一张脸；稀有度越高，心脏门数通常更大，对战体力也更厚。普通孵化永远免费；想保底珍奇见',
                'The same circuit always maps to the same face. Higher rarity usually means a larger heart and more battle HP. Normal hatch stays free; for a guaranteed Fancy see ',
              )}
              <button type="button" className="font-semibold text-copper-dim hover:text-copper" onClick={() => scrollTo('shop')}>{t('免费与 BEM', 'Free & BEM')}</button>
              {t('。', '.')}
            </Callout>
          </Sec>

          <Sec
            id="raise"
            icon={Zap}
            title={t('养成：喂食与通电', 'Raise: feed and power up')}
            lead={t('能量用来对战；心情影响体力；经验升级涨等级。', 'Energy fuels battles; mood boosts HP; XP levels the kitty up.')}
            action={<Button size="sm" variant="ghost" onClick={() => go('/')}>{t('打开我的芯喵', 'Open my kitties')}</Button>}
          >
            <ul className="space-y-2">
              <Bullet>
                <b className="font-semibold text-ink">{t('喂食', 'Feed')}</b>
                {' · '}
                {t('回能量。能量不够时不能进训练场。冷却中可用 BEM 快充，见', 'Restores energy. You cannot enter Training without enough energy. During cooldown you can BEM-refill — see ')}
                <button type="button" className="font-semibold text-si-dim hover:text-si" onClick={() => scrollTo('shop')}>{t('免费与 BEM', 'Free & BEM')}</button>
                {t('。', '.')}
              </Bullet>
              <Bullet>
                <b className="font-semibold text-ink">{t('通电玩耍', 'Power Play')}</b>
                {' · '}
                {t('拨动输入引脚开关，让心脏电路的输出对上目标灯。对上了涨心情和经验；全对还能额外领鱼干。', 'Flip the input pin switches until the heart circuit matches the target lamps. Hits raise mood and XP; a perfect match also awards a fish treat.')}
              </Bullet>
              <Bullet>
                <b className="font-semibold text-ink">{t('摸头 / 说话', 'Pat / Talk')}</b>
                {' · '}
                {t('轻互动，涨一点亲密和心情。', 'Light interactions that bump intimacy and mood.')}
              </Bullet>
              <Bullet>
                <b className="font-semibold text-ink">{t('心情加成', 'Mood bonus')}</b>
                {' · '}
                {t(`心情 ≥ 80 时，对战体力额外 +${MOOD_HP}。`, `At mood ≥ 80, battle HP gets +${MOOD_HP}.`)}
              </Bullet>
            </ul>
          </Sec>

          <Sec
            id="battle"
            icon={Swords}
            title={t('对战：电路算功率', 'Battle: circuits make the power')}
            lead={t(`每场消耗 ${BATTLE_ENERGY} 点能量。胜负由心脏电路的输出与克制关系算出。`, `Each battle costs ${BATTLE_ENERGY} energy. Outcomes come from heart-circuit outputs and the move triangle.`)}
            action={<Button size="sm" icon={Swords} onClick={() => go('/train')}>{t('去训练场', 'Training Ground')}</Button>}
          >
            <p>
              {t(
                '每回合，随机位流进心脏电路，进攻 / 防御 / 技巧各算出一个功率——输出亮几盏灯就是几点。你看得见自己的功率，看不见对手要出什么。',
                'Each round, random bits flow into the heart circuit and Attack / Defend / Trick each get a power value from how many output lamps light up. You see your own power, not what the opponent will play.',
              )}
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {MOVES.map((m) => (
                <div key={m.name} className="rounded-2xl bg-panel-2/70 px-3 py-3">
                  <div className="font-display font-bold text-ink">{m.name}</div>
                  <div className="mt-1 text-xs text-mute">{m.tip}</div>
                </div>
              ))}
            </div>
            <ul className="space-y-2">
              {triangle.map((x) => (
                <Bullet key={x.from}>
                  {t(`${x.from} 克 ${x.to}：伤害翻倍，自己只挨一半`, `${x.from} beats ${x.to}: double damage dealt, half damage taken`)}
                </Bullet>
              ))}
              <Bullet>
                {t('同招硬碰硬时，比功率高低。', 'Same move: raw power decides.')}
              </Bullet>
              <Bullet>
                {t('野怪（芯片里的 Bug）偏脆，适合练手；也可以去广场切磋邻居的芯喵。', 'Wild bugs inside the chip are a bit fragile and good for practice; you can also spar with neighbors\' kitties from the Plaza.')}
              </Bullet>
              <Bullet>
                {t('牵过线的线友可放一次合体技：两颗心脏串成合体电路，功率 +2 且无视克制，每场限一次。', 'A linked wire pal unlocks one fusion move: two hearts wired into one circuit, +2 power and ignores the triangle, once per battle.')}
              </Bullet>
            </ul>
            <Callout tone="copper">
              {t(
                '本地演示用浏览器随机种子出题；上链后会改用区块随机数，求值规则不变。',
                'The local demo draws inputs from a browser seed; on-chain it will use block randomness. The evaluation rules stay the same.',
              )}
            </Callout>
          </Sec>

          <Sec
            id="plaza"
            icon={Users}
            title={t('广场：拜访、鱼干、牵线', 'Plaza: visits, fish treats, linking up')}
            lead={t('社交玩法都绕着「邻居的芯喵」转，牵线后对战才能放合体技。', 'Social play orbits neighbors\' kitties; linking up unlocks the fusion move in battle.')}
            action={<Button size="sm" icon={Users} onClick={() => go('/plaza')}>{t('去广场', 'Open Plaza')}</Button>}
          >
            <ul className="space-y-2">
              <Bullet>
                <b className="font-semibold text-ink">{t('每日签到', 'Daily check-in')}</b>
                {' · '}
                {t('领小鱼干；连续签到会多给。鱼干可送给邻居的芯喵。', 'Claim fish treats; streaks pay more. Treats can be gifted to neighbors\' kitties.')}
              </Bullet>
              <Bullet>
                <b className="font-semibold text-ink">{t('拜访', 'Visit')}</b>
                {' · '}
                {t('摸头、说话、留言、送鱼干；今日任务也会统计拜访。', 'Pat, talk, leave a note, gift a treat; daily quests also track visits.')}
              </Bullet>
              <Bullet>
                <Fish className="mr-1 inline size-3.5 text-copper" />
                <b className="font-semibold text-ink">{t('牵线', 'Link up')}</b>
                {' · '}
                {t(`花 1 条鱼干和邻居牵线（基础 ${BOND_SLOTS_DEFAULT} 位免费，可用 BEM 扩到 ${BOND_SLOTS_MAX}）。两颗心脏互相引用，串成合体电路。`, `Spend 1 fish treat to link with a neighbor (base ${BOND_SLOTS_DEFAULT} slots free; BEM expands up to ${BOND_SLOTS_MAX}). The two hearts reference each other as one fusion circuit.`)}
              </Bullet>
              <Bullet>
                <Hand className="mr-1 inline size-3.5 text-si" />
                {t('广场还有动态流、热门芯喵和排行榜，方便找对手或线友。', 'The Plaza also has a feed, hot kitties and a leaderboard for finding sparring partners or wire pals.')}
              </Bullet>
            </ul>
            <Callout tone="gold">
              <span className="inline-flex items-center gap-1.5">
                <Cable className="size-3.5 text-gold-dim" />
                {t('线友名额有限，挑一只合得来的心脏再牵。', 'Wire-pal slots are limited—pick a heart that vibes with yours.')}
              </span>
            </Callout>
          </Sec>

          <Sec
            id="dex"
            icon={Cat}
            title={t('图鉴：物种与心脏', 'Dex: species and hearts')}
            lead={t('收集进度一眼看清：见过的物种亮起来，心脏电路标注是否已拥有。', 'Collection progress at a glance: seen species light up, and heart circuits show owned or not.')}
            action={<Button size="sm" variant="ghost" onClick={() => go('/dex')}>{t('打开图鉴', 'Open Dex')}</Button>}
          >
            <ul className="space-y-2">
              <Bullet>{t('共 8 个物种；未见过的显示剪影和性格提示。', 'There are 8 species; unseen ones show a silhouette and a personality hint.')}</Bullet>
              <Bullet>{t('心脏电路列表按稀有度与门数展示，方便对照养成目标。', 'Heart circuits are listed by rarity and gate count so you can aim your raising goals.')}</Bullet>
            </ul>
          </Sec>

          <Sec
            id="lab"
            icon={FlaskConical}
            title={t('实验室：设计与擂台', 'Lab: design and arena')}
            lead={t('黑客松主赛道：写电路、发悬赏、链上评测门数。', 'The hackathon track: write circuits, post bounties, judge gate count on-chain.')}
            action={<Button size="sm" variant="ghost" onClick={() => go('/lab')}>{t('进入实验室', 'Enter the Lab')}</Button>}
          >
            <ul className="space-y-2">
              <Bullet>
                <b className="font-semibold text-ink">{t('设计器', 'Studio')}</b>
                {' · '}
                {t('写 TapeHDL，浏览器里实时编译成 NAND 网表并仿真。', 'Write TapeHDL; the browser compiles it to a NAND netlist and simulates live.')}
              </Bullet>
              <Bullet>
                <b className="font-semibold text-ink">{t('擂台', 'Arena')}</b>
                {' · '}
                {t('发布者锁定奖金与测试向量；提交者把电路流片成 NFT；合约调用 TapeOut 处理器 eval，门数最少者拿走奖金。', 'Posters lock a prize and test vectors; submitters tape out circuits as NFTs; the contract calls the TapeOut processor\'s eval and the fewest gates wins.')}
              </Bullet>
              <Bullet>
                <b className="font-semibold text-ink">{t('组件库', 'Library')}</b>
                {' · '}
                {t('赢下的或登记的电路可被后续设计引用；被引用时原作者参与分成。', 'Won or registered circuits can be reused in later designs; originals share royalties when cited.')}
              </Bullet>
            </ul>
            <p className="text-mute">
              {t('芯喵养成不依赖合约也能玩；实验室功能在对应链部署 TapeArena 后完整可用。', 'Raising Chipets works without the contract; full Lab features need TapeArena deployed on the selected chain.')}
            </p>
          </Sec>

          <Sec
            id="shop"
            icon={Coins}
            title={t('免费与 BEM：上头后再氪', 'Free & BEM: pay only when hooked')}
            lead={t('核心闭环永远免费。BEM 只买更快、更稀有、多一个坑。', 'The core loop stays free forever. BEM only buys faster, rarer, or one more slot.')}
            action={<Button size="sm" icon={Coins} onClick={() => go('/shop')}>{t('打开 BEM 商店', 'Open BEM Shop')}</Button>}
          >
            <Callout>
              {t(
                '原则：先免费玩完整闭环（孵化、养成、对战、广场、图鉴、设计器）。玩上头了，再花 BEM 加速或冲稀有——不锁进度墙。',
                'Principle: finish the free loop first (hatch, raise, battle, Plaza, Dex, Studio). When you are hooked, spend BEM to go faster or rarer — never behind a progress wall.',
              )}
            </Callout>
            <div>
              <h4 className="font-display text-base font-bold text-ink">{t('永远免费', 'Always free')}</h4>
              <ul className="mt-2 space-y-2">
                <Bullet>{t('普通孵化、喂食（有冷却）、通电玩耍', 'Normal hatch, feed (with cooldown), Power Play')}</Bullet>
                <Bullet>{t('训练场常规对战（耗能量，不耗 BEM）', 'Regular Training battles (energy, not BEM)')}</Bullet>
                <Bullet>{t(`广场签到 / 拜访 / 牵线（基础 ${BOND_SLOTS_DEFAULT} 个线友位）`, `Plaza check-in / visits / linking (base ${BOND_SLOTS_DEFAULT} bond slots)`)}</Bullet>
                <Bullet>{t('图鉴收集、实验室设计器', 'Dex collecting and the Lab Studio')}</Bullet>
              </ul>
            </div>
            <div>
              <h4 className="font-display text-base font-bold text-ink">{t('四类氪金（价目与商店一致）', 'Four premium items (same prices as the Shop)')}</h4>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {BEM_SKU_LIST.map((sku) => (
                  <div key={sku.id} className="rounded-2xl bg-panel-2/70 px-3 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display font-bold text-ink">{txt(sku.title)}</span>
                      <Tag tone="copper">{sku.price} BEM</Tag>
                    </div>
                    <p className="mt-1 text-xs text-mute">{txt(sku.desc)}</p>
                  </div>
                ))}
              </div>
            </div>
            <ul className="space-y-2">
              <Bullet>
                {t(`演示余额：仅本地 fork 可每日领取 ${FAUCET_AMOUNT} 演示 BEM；主网连钱包后用链上余额。`, `Demo balance: claim ${FAUCET_AMOUNT} demo BEM once per day only on the local fork. On mainnet with a wallet, use on-chain BEM.`)}
              </Bullet>
              <Bullet>
                {t('切到 X Layer 并连上钱包后，商店会读该链真实 BEM 余额，购买优先走链上转账。', 'On X Layer with a wallet connected, the Shop reads that chain’s real BEM and prefers on-chain transfers.')}
              </Bullet>
              <Bullet>
                {t('不对战门票、不强制连钱包才能养成。', 'No battle tickets, and raising never requires a wallet.')}
              </Bullet>
            </ul>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" icon={Coins} onClick={() => go('/shop')}>{t('去商店', 'Go to Shop')}</Button>
              <Button size="sm" variant="ghost" onClick={() => go('/')}>{t('先免费敲蛋', 'Hatch for free first')}</Button>
            </div>
          </Sec>

          <Sec
            id="network"
            icon={Cpu}
            title={t('网络、语言与钱包', 'Network, language and wallet')}
            lead={t('右上角可切换 X Layer / 本地演示链，以及中英文。', 'Top-right switches X Layer / the local demo chain, plus Chinese and English.')}
          >
            <ul className="space-y-2">
              <Bullet>{t('本地 fork：不连钱包也能孵化、养成、对战、逛广场。', 'Local fork: hatch, raise, battle and roam the Plaza without a wallet.')}</Bullet>
              <Bullet>{t('主网（X Layer）：连接钱包后可参与实验室悬赏与链上流程。', 'Mainnet (X Layer): connect a wallet to join Lab bounties and on-chain flows.')}</Bullet>
              <Bullet>{t('语言切换立即生效；电路与对战结果不随语言改变。', 'Language switches instantly; circuits and battle outcomes do not change with language.')}</Bullet>
            </ul>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" icon={Sparkles} onClick={() => go('/')}>{t('从敲蛋开始', 'Start by cracking an egg')}</Button>
              <Button size="sm" variant="ghost" icon={ExternalLink} onClick={() => window.open(t('https://web3.okx.com/zh-hans/xlayer/build-x-series', 'https://web3.okx.com/xlayer/build-x-series'), '_blank', 'noreferrer')}>
                X Layer TapeOut
              </Button>
              <Link to="/lab/studio" className="inline-flex items-center gap-1.5 rounded-2xl px-3 py-2 text-sm text-mute no-underline ring-1 ring-line transition-colors hover:text-ink">
                {t('打开设计器', 'Open Studio')}
              </Link>
            </div>
          </Sec>
        </div>
      </div>
    </div>
  );
}
