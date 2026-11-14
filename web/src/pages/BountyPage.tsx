import { Fragment, useState } from 'react';
import { formatEther, isAddress, zeroAddress, type Address, type Hex } from 'viem';
import {
  arenaAbi, libraryAbi, bountyPhase, challenge, challengeHint, challengeVector, claimBond, fetchBounty, finalize, precheck, submit, withdraw,
  type Bounty, type Submission,
} from '@tapearena/chain';
import {
  ArrowLeft, Banknote, Blocks, ChevronRight, CircleCheck, CircuitBoard, Coins, Crosshair, Crown, FlaskConical, Gauge, Hash, Landmark,
  ListChecks, Lock, PenTool, Percent, ScanSearch, Send, ShieldAlert, Swords, Trophy, User, Wallet, Zap,
} from 'lucide-react';
import { useApp, useAsync } from '../state.tsx';
import { Link } from '../router.tsx';
import { Die } from '../components/Die.tsx';
import { amount, left, PHASE_TEXT, short, unit } from '../format.ts';
import { btn, Button, cn, Empty, Input, KV, Loading, Panel, PhaseTag, Tag } from '../components/ui.tsx';

export function BountyPage({ id }: { id: number }) {
  const app = useApp();
  const arena = app.deployment?.arena;
  const q = useAsync(() => (arena ? fetchBounty(app.pub, arena, id) : Promise.reject(new Error('未部署'))), [arena, id, app.pub]);
  const credit = useAsync(async () => {
    if (!arena || !app.account || !q.data) return 0n;
    return app.pub.readContract({ address: arena, abi: arenaAbi, functionName: 'credit', args: [q.data.token, app.account] });
  }, [arena, app.account, q.data]);
  const ref = useAsync(async () => {
    const b = q.data;
    if (!b || b.refCpu === zeroAddress) return null;
    return app.lib.resolved(b.refCpu, b.refId);
  }, [q.data]);
  const payout = useAsync(async () => {
    const b = q.data;
    const library = app.deployment?.library;
    if (!b?.finalized || b.best < 0 || !library) return null;
    const w = b.submissions[b.best];
    const [comps, owners] = await app.pub.readContract({ address: library, abi: libraryAbi, functionName: 'registeredRefs', args: [w.cpu, BigInt(w.circuitId)] });
    const fee = (b.reward * BigInt(b.feeBps)) / 10_000n;
    const each = owners.length ? (b.reward * BigInt(b.royaltyBps)) / 10_000n / BigInt(owners.length) : 0n;
    return { winner: w.solver, fee, each, owners, comps, prize: b.reward - fee - each * BigInt(owners.length) };
  }, [q.data, app.deployment?.library]);

  if (q.loading && !q.data) return <Loading>读取擂台…</Loading>;
  if (!q.data) return <div className="mx-auto max-w-[1240px] px-7"><Empty icon={ShieldAlert} title={`找不到擂台 #${id}`} action={<Link to="/" className={btn('ghost')}><ArrowLeft />回到擂台</Link>}><span className="text-danger">{q.error?.message}</span></Empty></div>;
  const b = q.data;
  const phase = bountyPhase(b);
  const ranked = b.submissions.map((s, i) => ({ s, i })).sort((x, y) =>
    Number(x.s.disqualified) - Number(y.s.disqualified) || x.s.gateCount - y.s.gateCount || x.s.submittedAt - y.s.submittedAt);
  const stages = ['open', 'challenge', 'settle', 'finalized'] as const;
  const at = stages.indexOf(phase);
  const STAGE_ICON = { open: Send, challenge: Swords, settle: Gauge, finalized: CircleCheck };
  const pinText = b.meta.inputs && `${b.meta.inputs.map((p) => p.name + (p.width > 1 ? `[${p.width}]` : '')).join(', ')} → ${b.meta.outputs?.map((p) => p.name + (p.width > 1 ? `[${p.width}]` : '')).join(', ')}`;

  return (
    <div className="mx-auto max-w-[1240px] px-4 sm:px-7">
      <div className="grid gap-5 pt-6 pb-16 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-5">
          <div>
            <div className="flex items-center gap-2.5">
              <Link to="/" className="flex items-center gap-1 font-mono text-xs text-mute no-underline hover:text-ink"><ArrowLeft className="size-3.5" />擂台</Link>
              <ChevronRight className="size-3.5 text-faint" />
              <PhaseTag phase={phase} />
              <span className="font-mono text-xs text-faint">#{b.id}</span>
            </div>
            <h1 className="mt-3 mb-1.5 text-[40px] leading-tight">{b.meta.title}</h1>
            {b.meta.description && <p className="m-0 max-w-[720px] text-pretty text-mute">{b.meta.description}</p>}
            <ol className="mt-5 grid grid-cols-4 gap-2">
              {stages.map((st, k) => {
                const I = STAGE_ICON[st];
                return (
                  <li key={st} className={cn('border-t-2 pt-2 font-mono text-[11px]', k === at ? 'border-copper text-ink' : k < at ? 'border-copper-dim text-mute' : 'border-line-2 text-faint')}>
                    <span className="flex items-center gap-1.5"><I className={cn('size-3.5', k === at && 'text-copper')} />{PHASE_TEXT[st]}</span>
                    {st === 'open' && <span className="mt-0.5 block text-faint">{left(b.deadline)}</span>}
                    {st === 'challenge' && <span className="mt-0.5 block text-faint">{left(b.challengeEnd)}</span>}
                  </li>
                );
              })}
            </ol>
          </div>

          <Panel title="排行榜" icon={Trophy}
            right={<><span className="hidden font-mono text-xs text-faint sm:inline">门数少者胜 · 同门数先到先得</span>{phase === 'open' && <Link to={`/studio?bounty=${b.id}`} className={btn('primary', 'sm')}><PenTool />去设计</Link>}</>}>
            {ranked.length === 0
              ? <Empty icon={Send} title="还没有人提交" action={phase === 'open' && <Link to={`/studio?bounty=${b.id}`} className={btn()}><PenTool />去设计</Link>}>第一个提交的人直接领先。</Empty>
              : <div className="overflow-x-auto"><table className="table-t">
                  <thead><tr><th>#</th><th>设计者</th><th>电路</th><th>门数</th><th>状态</th><th /></tr></thead>
                  <tbody>{ranked.map(({ s, i }, k) => (
                    <SubmissionRow key={i} b={b} s={s} rank={s.disqualified ? null : k + 1} win={b.best === i} refCircuit={ref.data ?? null} />
                  ))}</tbody>
                </table></div>}
          </Panel>

          {ref.data && <Die elements={ref.data.elements} nIn={ref.data.nIn} height={220} label="参考电路" />}
        </div>

        <div className="flex flex-col gap-5">
          <Panel bodyClass="p-5">
            <div className="flex items-center gap-1.5 font-mono text-xs text-mute"><Coins className="size-3.5 text-copper" />奖金</div>
            <div className="mt-1 font-display text-[44px] leading-tight font-extrabold text-copper-hi tabular-nums">{amount(b.reward)} <span className="text-base font-medium text-mute">{unit(b.token)}</span></div>
            <div className="mt-4 border-t border-line pt-4">
              <KV rows={[
                [Zap, '引脚', `${b.nIn} 入 → ${b.nOut} 出`],
                ...(pinText ? [[CircuitBoard, '接口', pinText] as [typeof Zap, string, string]] : []),
                [ListChecks, '测试向量', `${b.vectors.length} 条${b.sampleSize ? `（抽检 ${b.sampleSize}）` : '（全量）'}`],
                [Gauge, '门数上限', b.maxGates || '无'],
                [Lock, '保证金', `${formatEther(b.bond)} OKB`],
                [Blocks, '上游分润', `${b.royaltyBps / 100}%`],
                [Percent, '平台费', `${b.feeBps / 100}%`],
                [FlaskConical, '参考电路', b.refCpu === zeroAddress ? '无（只用向量判）' : `${short(b.refCpu)} #${b.refId}`],
                [User, '出题人', short(b.poster)],
              ]} />
            </div>
          </Panel>

          {payout.data && (
            <Panel title="结算分账" icon={Banknote} bodyClass="flex flex-col gap-2 p-4">
              <Payee icon={Crown} tone="text-gold" label="冠军" who={payout.data.winner} v={`${amount(payout.data.prize)} ${unit(b.token)}`} />
              {payout.data.owners.map((o, k) => (
                <Fragment key={k}><Payee icon={Blocks} tone="text-si" label={`上游组件 ${payout.data!.comps[k].slice(0, 8)}`} who={o} v={`${amount(payout.data!.each)} ${unit(b.token)}`} /></Fragment>
              ))}
              <Payee icon={Landmark} tone="text-mute" label="平台费" v={`${amount(payout.data.fee)} ${unit(b.token)}`} />
            </Panel>
          )}

          {phase === 'open' && <SubmitExisting b={b} />}

          {phase === 'settle' && (
            <Button size="lg" icon={Gauge} onClick={() => app.run('结算', async (st) => finalize(await app.signer(), arena!, b.id, st))}>结算并发奖</Button>
          )}
          {credit.data !== undefined && credit.data > 0n && (
            <Panel bodyClass="p-5">
              <div className="flex items-center gap-1.5 text-[13px] text-mute"><Wallet className="size-4 text-copper" />你在合约里的可提余额</div>
              <div className="mt-1 font-display text-2xl font-extrabold text-copper-hi tabular-nums">{amount(credit.data)} {unit(b.token)}</div>
              <Button variant="si" className="mt-3 w-full" icon={Banknote} onClick={() => app.run('提取', async (st) => withdraw(await app.signer(), arena!, b.token, st))}>提取</Button>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function Payee({ icon: I, tone, label, who, v }: { icon: typeof Crown; tone: string; label: string; who?: string; v: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-substrate/60 px-3 py-2.5 ring-1 ring-line">
      <I className={cn('size-4 shrink-0', tone)} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-[11px] text-faint">{label}</div>
        {who && <div className="font-mono text-xs">{short(who)}</div>}
      </div>
      <div className="font-mono text-sm text-ink tabular-nums">{v}</div>
    </div>
  );
}

function SubmissionRow({ b, s, rank, win, refCircuit }: { b: Bounty; s: Submission; rank: number | null; win: boolean; refCircuit: Awaited<ReturnType<ReturnType<typeof useApp>['lib']['resolved']>> | null }) {
  const app = useApp();
  const arena = app.deployment!.arena!;
  const phase = bountyPhase(b);
  const [hint, setHint] = useState<string | null>(null);
  const canChallenge = !s.disqualified && phase !== 'finalized' && phase !== 'settle';
  const mine = app.account && s.solver.toLowerCase() === app.account.toLowerCase();

  const hunt = () => app.run('发起挑战', async (st) => {
    st('在浏览器里对比参考电路');
    const cand = await app.lib.resolved(s.cpu, s.circuitId);
    const h = challengeHint(cand, refCircuit, app.lib, b.vectors);
    if (!h) { setHint('没找到反例，这个电路是对的'); return; }
    setHint(h.kind === 'vector' ? `找到反例：向量 #${h.vectorIndex} 不通过` : `找到反例：输入 ${h.input} 与参考电路输出不同`);
    const signer = await app.signer();
    if (h.kind === 'vector') return challengeVector(signer, arena, b.id, s.index, h.vectorIndex, st);
    return challenge(signer, arena, b.id, s.index, h.input as Hex, st);
  });

  return (
    <tr className={cn(win && 'bg-gold/[0.06]', s.disqualified && 'opacity-50')}>
      <td className="font-mono tabular-nums">
        {win ? <Crown className="size-4 text-gold" aria-label="领先" /> : rank ?? '—'}
      </td>
      <td className="font-mono"><span className="flex items-center gap-1.5">{short(s.solver)}{mine && <Tag tone="copper">我</Tag>}</span></td>
      <td className="font-mono text-faint"><span className="flex items-center gap-1"><Hash className="size-3" />{short(s.cpu)} #{s.circuitId.toString()}</span></td>
      <td><b className={cn('font-display text-lg tabular-nums', win && 'text-gold', s.disqualified && 'line-through decoration-danger/60')}>{s.gateCount}</b></td>
      <td>{s.disqualified ? <Tag tone="danger" icon={ShieldAlert}>被挑战出局</Tag> : win ? <Tag tone="gold" icon={Trophy}>领先</Tag> : <Tag icon={CircleCheck}>有效</Tag>}</td>
      <td className="text-right">
        {canChallenge && !mine && <Button variant="ghost" size="sm" icon={Crosshair} onClick={hunt} title="自动找反例并发起挑战，成功可拿走对方保证金">挑战</Button>}
        {phase === 'finalized' && mine && !s.disqualified && !s.bondClaimed && b.bond > 0n && (
          <Button variant="ghost" size="sm" icon={Banknote} onClick={() => app.run('取回保证金', async (st) => claimBond(await app.signer(), arena, b.id, s.index, st))}>取回保证金</Button>
        )}
        {hint && <div className={cn('mt-1 flex items-center justify-end gap-1 text-xs', hint.startsWith('找到') ? 'text-danger' : 'text-faint')}><ScanSearch className="size-3" />{hint}</div>}
      </td>
    </tr>
  );
}

function SubmitExisting({ b }: { b: Bounty }) {
  const app = useApp();
  const [cpu, setCpu] = useState(app.deployment?.cpu ?? '');
  const [cid, setCid] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const check = async () => {
    try {
      const c = await app.lib.resolved(cpu as Address, BigInt(cid));
      const r = precheck(c, app.lib, b);
      setMsg(r.ok ? { ok: true, text: `通过全部向量，${r.gateCount} 门，预计排名 #${r.rankIfSubmitted}` } : { ok: false, text: r.reasons.join('；') });
      return r.ok;
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); return false; }
  };
  const valid = isAddress(cpu) && Boolean(cid);

  return (
    <Panel title="提交已流片的电路" icon={Send} bodyClass="flex flex-col gap-2.5 p-4">
      <Input mono placeholder="处理器地址 0x…" value={cpu} onChange={(e) => setCpu(e.target.value.trim())} />
      <Input mono placeholder="电路号" value={cid} onChange={(e) => setCid(e.target.value.trim())} />
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" icon={ScanSearch} disabled={!valid} onClick={check}>预检</Button>
        <Button size="sm" icon={Send} className="flex-1" disabled={!valid} onClick={async () => {
          if (!(await check())) return;
          await app.run('提交', async (st) => submit(await app.signer(), app.deployment!.arena!, b.id, cpu as Address, BigInt(cid), b.bond, st));
        }}>提交{b.bond > 0n ? `（押 ${formatEther(b.bond)} OKB）` : ''}</Button>
      </div>
      {msg && <div className={cn('flex items-start gap-1.5 text-[13px]', msg.ok ? 'text-si' : 'text-danger')}>{msg.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0" /> : <ShieldAlert className="mt-0.5 size-4 shrink-0" />}{msg.text}</div>}
    </Panel>
  );
}
