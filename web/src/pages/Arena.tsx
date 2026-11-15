import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { compile, EXAMPLES, packBits, resolveData, step } from '@tapearena/netlist';
import { bountyPhase, listBounties, type Bounty } from '@tapearena/chain';
import {
  ArrowRight, Blocks, CircuitBoard, Clock, Coins, FileCode2, Gavel, Inbox, Plus, Send, ShieldCheck, Sparkles, Trophy, Users, Zap,
} from 'lucide-react';
import { Die } from '../components/Die.tsx';
import { Link } from '../router.tsx';
import { useApp, useAsync } from '../state.tsx';
import { amount, left, unit } from '../format.ts';
import { both, getLang, tr, txt } from '../i18n.ts';
import { btn, Empty, Loading, PhaseTag } from '../components/ui.tsx';

function HeroDie() {
  const c = useMemo(() => {
    const r = compile(EXAMPLES.add4.src);
    return resolveData({ netlist: r.netlist, nIn: r.nIn, nOut: r.nOut }, null);
  }, []);
  const [signals, setSignals] = useState<Uint8Array>();
  useEffect(() => {
    const tick = () => {
      const bits = Array.from({ length: c.nIn }, () => (Math.random() < 0.5 ? 1 : 0));
      setSignals(step(c, new Uint8Array(0), packBits(bits), null).signals);
    };
    tick();
    const t = setInterval(tick, 1800);
    return () => clearInterval(t);
  }, [c]);
  return <Die elements={c.elements} nIn={c.nIn} signals={signals} height={360} label={tr('ADD4 · 实时仿真', 'ADD4 · live simulation')} />;
}

function Meta({ icon: I, children }: { icon: typeof Clock; children: ReactNode }) {
  return <span className="flex items-center gap-1.5"><I className="size-3.5 text-faint" />{children}</span>;
}

export function BountyCard({ b, i }: { b: Bounty; i: number }) {
  const { chain } = useApp();
  const phase = bountyPhase(b);
  const best = b.best >= 0 ? b.submissions[b.best] : null;
  return (
    <Link to={`/lab/bounty/${b.id}`} style={{ animationDelay: `${i * 60}ms` }}
      className="group relative flex animate-rise flex-col overflow-hidden rounded-3xl border border-line/80 bg-panel shadow-sm shadow-si/5 p-5 text-inherit no-underline transition duration-150 hover:-translate-y-0.5 hover:border-copper-dim hover:shadow-md hover:shadow-copper/10">
      <CircuitBoard className="absolute -top-4 -right-4 size-28 text-line/70 transition-colors group-hover:text-copper-dim/40" strokeWidth={1} />
      <div className="relative flex items-center gap-2">
        <PhaseTag phase={phase} />
        <span className="font-mono text-xs text-faint">#{b.id}</span>
        {b.royaltyBps > 0 && <span className="ml-auto flex items-center gap-1 font-mono text-[11px] text-gold"><Blocks className="size-3" />{tr('分润', 'royalty')} {b.royaltyBps / 100}%</span>}
      </div>
      <h3 className="relative mt-3 line-clamp-1 text-[19px] text-ink">{b.meta.title}</h3>
      {b.meta.description && <p className="relative mt-1 line-clamp-2 text-[13px] text-pretty text-mute">{b.meta.description}</p>}
      <div className="relative mt-4 flex items-end justify-between">
        <div className="flex items-baseline gap-1.5 font-display text-[32px] leading-none font-extrabold text-copper-hi tabular-nums">
          <Coins className="size-5 self-center text-copper" />{amount(b.reward)}<small className="text-[13px] font-medium text-mute">{unit(b.token, chain.nativeCurrency.symbol)}</small>
        </div>
        <div className="text-right">
          <div className="font-mono text-[11px] text-faint">{tr('最优', 'Best')}</div>
          <div className="flex items-center gap-1 font-display text-xl font-extrabold tabular-nums">
            {best ? <><Trophy className="size-4 text-gold" />{best.gateCount}<span className="text-xs font-normal text-mute">{tr('门', 'gates')}</span></> : <span className="text-faint">—</span>}
          </div>
        </div>
      </div>
      <div className="relative mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 font-mono text-xs text-mute tabular-nums">
        <Meta icon={Zap}>{b.nIn}→{b.nOut} {tr('引脚', 'pins')}</Meta>
        <Meta icon={Users}>{b.submissions.length} {tr('提交', 'submitted')}</Meta>
        {(phase === 'open' || phase === 'challenge') && (
          <Meta icon={Clock}>
            {phase === 'open' ? tr(`剩 ${left(b.deadline)}`, `${left(b.deadline)} left`) : tr(`挑战剩 ${left(b.challengeEnd)}`, `challenge: ${left(b.challengeEnd)} left`)}
          </Meta>
        )}
        <ArrowRight className="ml-auto size-4 text-faint transition group-hover:translate-x-0.5 group-hover:text-copper" />
      </div>
    </Link>
  );
}

const STEPS = [
  {
    icon: FileCode2, n: '01', t: both('出题', 'Post'), b: both('锁奖金 + 测试向量', 'Lock a prize + test vectors'),
    p: both('参考电路先在链上跑一遍所有向量，题目本身也是可验证的。', 'The reference circuit runs every vector on-chain first, so the bounty itself is verifiable.'),
  },
  {
    icon: Sparkles, n: '02', t: both('设计', 'Design'), b: both('写 HDL 或问 AI', 'Write HDL or ask AI'),
    p: both('浏览器里编译成 NAND 网表，实时仿真、预检、估算排名。', 'Compile to a NAND netlist in the browser, with live simulation, pre-check and a rank estimate.'),
  },
  {
    icon: Gavel, n: '03', t: both('判题', 'Judge'), b: both('链上 eval 打分', 'Scored by on-chain eval'),
    p: both('提交即判：向量全过才入榜，门数少者领先，同门数先到先得。', 'Judged on submit: only circuits that pass every vector are ranked. Fewest gates leads; ties go to the earliest.'),
  },
  {
    icon: ShieldCheck, n: '04', t: both('挑战与分润', 'Challenge & royalties'), b: both('反例取消资格', 'Counterexamples disqualify'),
    p: both('向量外的错误也能被反例挑战；冠军引用的组件自动分到版税。', 'Bugs outside the vectors can still be challenged with a counterexample; components used by the winner earn royalties automatically.'),
  },
];

export function Arena() {
  const { pub, deployment, chain } = useApp();
  const bounties = useAsync(() => (deployment?.arena ? listBounties(pub, deployment.arena) : Promise.resolve(null)), [pub, deployment]);
  const list = bounties.data ?? [];
  const order = { open: 0, challenge: 1, settle: 2, finalized: 3 };
  const sorted = [...list].sort((a, b) => order[bountyPhase(a)] - order[bountyPhase(b)] || Number(b.reward - a.reward));
  const pool = list.filter((b) => !b.finalized).reduce((s, b) => s + b.reward, 0n);
  const subs = list.reduce((s, b) => s + b.submissions.length, 0);

  return (
    <div className="w-full pb-16">
      <section className="grid grid-cols-1 items-center gap-10 pt-10 pb-10 sm:pt-14 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-si/5 px-3 py-1 font-mono text-xs text-si ring-1 ring-si-dim">
            <CircuitBoard className="size-3.5" />{tr('电路悬赏 · 链上评测', 'Circuit bounties · judged on-chain')}
          </div>
          {getLang() === 'zh'
            ? <h1 className="text-[clamp(38px,5vw,64px)] leading-[1.04]">门数最少的人<br />拿走<span className="text-copper">奖金</span>。</h1>
            : <h1 className="text-[clamp(38px,5vw,64px)] leading-[1.04]">Fewest gates<br />takes the <span className="text-copper">prize</span>.</h1>}
          <p className="mt-5 mb-7 max-w-[560px] text-[17px] text-pretty text-mute">
            {getLang() === 'zh' ? (
              <>
                出题人锁定奖金和测试向量；设计者把电路流片成 NFT 提交。合约直接调用 TapeOut 处理器的 <code>eval</code> 判题，
                不需要裁判、不需要预言机。冠军自动进入组件库，以后别人用它赢了擂台，奖金按比例分给它的持有人。
              </>
            ) : (
              <>
                Posters lock a prize and test vectors; designers tape their circuit out as an NFT and submit it. The contract judges by calling <code>eval</code> on
                the TapeOut processor directly: no referee, no oracle. Winners enter the component library automatically, and when someone later wins a bounty with
                one, a share of the prize goes to its holder.
              </>
            )}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/lab/studio" className={btn('primary', 'lg')}><Sparkles />{tr('打开设计器', 'Open Studio')}</Link>
            <Link to="/lab/new" className={btn('ghost', 'lg')}><Plus />{tr('发布悬赏', 'Post a bounty')}</Link>
          </div>
          {list.length > 0 && (
            <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3 font-mono text-xs text-mute">
              <span className="flex items-center gap-2"><Coins className="size-4 text-copper" /><b className="font-display text-xl text-ink tabular-nums">{amount(pool)}</b> {tr(`${chain.nativeCurrency.symbol} 奖池`, `${chain.nativeCurrency.symbol} in prizes`)}</span>
              <span className="flex items-center gap-2"><Trophy className="size-4 text-gold" /><b className="font-display text-xl text-ink tabular-nums">{list.length}</b> {tr('场擂台', 'bounties')}</span>
              <span className="flex items-center gap-2"><Send className="size-4 text-si" /><b className="font-display text-xl text-ink tabular-nums">{subs}</b> {tr('份提交', 'submissions')}</span>
            </div>
          )}
        </div>
        <HeroDie />
      </section>

      <div className="mb-12 grid grid-cols-1 overflow-hidden rounded-3xl border border-line/80 shadow-sm shadow-si/5 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map(({ icon: I, n, t, b, p }) => (
          <div key={n} className="border-line bg-panel/70 p-5 not-last:border-b sm:not-last:border-r lg:not-last:border-b-0">
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-xl bg-copper/10 text-copper ring-1 ring-copper-dim"><I className="size-[18px]" /></span>
              <span className="font-mono text-[11px] text-copper">{n} / {txt(t)}</span>
            </div>
            <b className="mt-3 block font-display text-[17px]">{txt(b)}</b>
            <p className="mt-1 text-[13px] text-pretty text-mute">{txt(p)}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 flex items-end justify-between">
        <h2 className="flex items-center gap-2.5 text-[28px]"><Trophy className="size-6 text-gold" />{tr('擂台', 'Arena')}</h2>
        <span className="font-mono text-xs text-mute">{chain.name}{deployment?.arena ? '' : tr(' · 尚未部署', ' · not deployed')}</span>
      </div>

      <div className="pb-16">
        {!deployment?.arena
          ? <div className="rounded-3xl border border-line/80 bg-panel shadow-sm shadow-si/5"><Empty icon={CircuitBoard} title={tr('这条链上还没有部署 TapeArena', 'TapeArena isn\'t deployed on this chain yet')} action={<Link to="/lab/studio" className={btn()}><Sparkles />{tr('打开设计器', 'Open Studio')}</Link>}>{tr('切换到本地演示链，或者先去设计器玩：编译、仿真、AI 设计都不依赖合约。', 'Switch to the local demo chain, or play in the Studio first: compiling, simulation and AI design don\'t need the contract.')}</Empty></div>
          : bounties.loading && !bounties.data
            ? <Loading>{tr('读取链上擂台…', 'Loading bounties from chain…')}</Loading>
            : bounties.error
              ? <div className="rounded-3xl border border-line/80 bg-panel shadow-sm shadow-si/5"><Empty icon={Inbox} title={tr('读取失败', 'Failed to load')} action={<Link to="/lab/studio" className={btn('ghost')}><Sparkles />{tr('先去设计器', 'Open Studio meanwhile')}</Link>}>{tr(`擂台列表暂时读不出来，多半是 ${chain.name} 的节点连不上。可以在右上角切换网络后再试。`, `The bounty list can't be loaded right now, most likely because the ${chain.name} node is unreachable. Try switching networks in the top-right corner.`)}<span className="mt-2 block font-mono text-xs text-danger">{bounties.error.message.split('\n')[0]}</span></Empty></div>
              : sorted.length === 0
                ? <div className="rounded-3xl border border-line/80 bg-panel shadow-sm shadow-si/5"><Empty icon={Inbox} title={tr('还没有擂台', 'No bounties yet')} action={<Link to="/lab/new" className={btn()}><Plus />{tr('发布悬赏', 'Post a bounty')}</Link>}>{tr('第一场由你来出？', 'Want to post the first one?')}</Empty></div>
                : <div className="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(340px,1fr))]">{sorted.map((b, i) => <BountyCard key={b.id} b={b} i={i} />)}</div>}
      </div>
    </div>
  );
}
