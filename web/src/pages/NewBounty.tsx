import { useEffect, useMemo, useState } from 'react';
import { isAddress, parseEther, zeroAddress, type Address } from 'viem';
import { EXAMPLES, HdlError } from '@tapearena/netlist';
import { build, createBounty, tapeout, vectorsFor, type Built } from '@tapearena/chain';
import {
  Blocks, CalendarClock, CircleAlert, CircleCheck, Coins, Cpu, Dice5, FileCode2, Gauge, Heading, ListChecks, Lock, Rocket, ScrollText, Shuffle, Swords,
} from 'lucide-react';
import { Editor } from '../components/Editor.tsx';
import { Die } from '../components/Die.tsx';
import { useApp } from '../state.tsx';
import { go } from '../router.tsx';
import { tr, useLang } from '../i18n.ts';
import { Button, ErrBar, Field, Input, PageHeader, Panel, Textarea } from '../components/ui.tsx';

export function NewBounty() {
  const app = useApp();
  const sym = app.chain.nativeCurrency.symbol;
  const lang = useLang();
  const [src, setSrc] = useState(EXAMPLES.cmp4.src);
  const [built, setBuilt] = useState<Built | null>(null);
  const [err, setErr] = useState<{ msg: string; line?: number } | null>(null);
  const [f, setF] = useState({
    title: tr('4 位比较器 a > b', '4-bit comparator a > b'),
    description: tr('输入两个 4 位无符号数，输出 a 是否大于 b。门数越少越好。', 'Takes two 4-bit unsigned numbers and outputs whether a is greater than b. Fewer gates is better.'),
    reward: '0.05', bond: '0.001', days: '3', challengeDays: '1', royalty: '10', count: '64', seed: '1', sample: '0', maxGates: '0',
    cpu: app.deployment?.cpu ?? '', useRef: true,
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((o) => ({ ...o, [k]: e.target.value }));

  useEffect(() => { setF((o) => ({ ...o, cpu: o.cpu || app.deployment?.cpu || '' })); }, [app.deployment]);
  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      try { const b = await build(src, app.lib); if (live) { setBuilt(b); setErr(null); } }
      catch (e) { if (live) setErr(e instanceof HdlError ? { msg: e.message, line: e.line } : { msg: (e as Error).message }); }
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [src, app.lib, lang]);

  const vec = useMemo(() => {
    if (!built || built.circuit.nState) return null;
    try { return vectorsFor(built, app.lib, Math.min(512, Math.max(1, Number(f.count) || 64)), Number(f.seed) || 1); } catch { return null; }
  }, [built, app.lib, f.count, f.seed]);

  const ready = Boolean(built && vec && app.deployment?.arena && (!f.useRef || isAddress(f.cpu)) && Number(f.reward) > 0);

  const publish = () => app.run(tr('发布悬赏', 'Post bounty'), async (st) => {
    const s = await app.signer();
    const b = built!;
    let refCpu: Address = zeroAddress;
    let refId = 0n;
    if (f.useRef) {
      const r = await tapeout(s, f.cpu as Address, b.compiled.netlist, b.compiled.nIn, b.compiled.nOut, st);
      refCpu = f.cpu as Address; refId = r.circuitId;
    }
    const now = BigInt(Math.floor(Date.now() / 1000));
    const meta = JSON.stringify({ title: f.title, description: f.description, inputs: b.compiled.inputs, outputs: b.compiled.outputs, tags: [] });
    const id = await createBounty(s, app.deployment!.arena!, {
      token: zeroAddress, reward: parseEther(f.reward), bond: parseEther(f.bond || '0'),
      refCpu, refId, nIn: b.compiled.nIn, nOut: b.compiled.nOut, maxGates: Number(f.maxGates) || 0,
      royaltyBps: Math.round(Number(f.royalty) * 100), sampleSize: Number(f.sample) || 0,
      deadline: now + BigInt(Math.round(Number(f.days) * 86400)), challengeWindow: BigInt(Math.round(Number(f.challengeDays) * 86400)),
      vectors: vec!.hex, meta,
    }, st);
    go(`/lab/bounty/${id}`);
    return id;
  });

  return (
    <div className="w-full pt-2 pb-16">
      <PageHeader
        eyebrow={tr('实验室 · Lab', 'Lab')} icon={Rocket}
        title={tr('发布悬赏', 'Post a bounty')}
        desc={tr(
          '写一份参考实现（正确就行，不用省门），系统用它生成测试向量。发布时参考电路会先流片，合约在链上跑一遍全部向量确认题目自洽，然后锁定奖金。',
          'Write a reference implementation (it only has to be correct, not small) and the test vectors are generated from it. On publish the reference is taped out first, the contract runs every vector on-chain to make sure the bounty is self-consistent, and then the prize is locked.',
        )}
      />
      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="flex flex-col gap-5">
          <Panel title={tr('参考实现', 'Reference implementation')} icon={FileCode2}
            right={built && !err && <span className="flex items-center gap-1 font-mono text-xs text-si"><CircleCheck className="size-3.5" />{built.circuit.gateCount} {tr('门', 'gates')} · {built.circuit.nIn}→{built.circuit.nOut}</span>}>
            <Editor value={src} onChange={setSrc} errLine={err?.line} />
            {err && <ErrBar>{err.msg}</ErrBar>}
            {built?.circuit.nState ? <ErrBar>{tr('参考实现不能含寄存器：擂台只比组合逻辑', 'The reference can\'t contain registers: bounties compare combinational logic only')}</ErrBar> : null}
          </Panel>
          {built && <Die elements={built.circuit.elements} nIn={built.circuit.nIn} height={200} label={tr('参考电路', 'Reference circuit')} />}
        </div>

        <Panel title={tr('擂台参数', 'Bounty settings')} icon={ScrollText} bodyClass="flex flex-col gap-4 p-5">
          <Field label={tr('标题', 'Title')} icon={Heading}><Input value={f.title} onChange={set('title')} /></Field>
          <Field label={tr('说明', 'Description')} icon={ScrollText}><Textarea rows={3} value={f.description} onChange={set('description')} /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label={tr(`奖金 ${sym}`, `Prize (${sym})`)} icon={Coins}><Input mono value={f.reward} onChange={set('reward')} /></Field>
            <Field label={tr(`保证金 ${sym}`, `Bond (${sym})`)} icon={Lock}><Input mono value={f.bond} onChange={set('bond')} /></Field>
            <Field label={tr('上游分润 %', 'Royalty %')} icon={Blocks}><Input mono value={f.royalty} onChange={set('royalty')} /></Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label={tr('提交期（天）', 'Submit (days)')} icon={CalendarClock}><Input mono value={f.days} onChange={set('days')} /></Field>
            <Field label={tr('挑战期（天）', 'Challenge (days)')} icon={Swords}><Input mono value={f.challengeDays} onChange={set('challengeDays')} /></Field>
            <Field label={tr('门数上限', 'Gate limit')} icon={Gauge} hint={tr('0 = 不限', '0 = no limit')}><Input mono value={f.maxGates} onChange={set('maxGates')} /></Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label={tr('向量条数', 'Vectors')} icon={ListChecks}><Input mono value={f.count} onChange={set('count')} /></Field>
            <Field label={tr('随机种子', 'Random seed')} icon={Dice5}><Input mono value={f.seed} onChange={set('seed')} /></Field>
            <Field label={tr('抽检条数', 'Sample size')} icon={Shuffle} hint={tr('0 = 全量', '0 = all')}><Input mono value={f.sample} onChange={set('sample')} /></Field>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-xs text-faint">
            <ListChecks className="size-3.5" />{vec ? tr(`已生成 ${vec.count} 条向量（输入 ≤ 8 位时穷举）`, `${vec.count} vectors generated (exhaustive when inputs ≤ 8 bits)`) : '—'}
          </div>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-substrate/60 p-3 text-sm ring-1 ring-line">
            <input type="checkbox" className="mt-1 accent-copper" checked={f.useRef} onChange={(e) => setF((o) => ({ ...o, useRef: e.target.checked }))} />
            <span className="text-pretty">{tr('把参考实现流片上链', 'Tape out the reference on-chain')}<span className="block text-xs text-faint">{tr('推荐：挑战者可以用任意输入对照它找反例', 'Recommended: challengers can test any input against it to find counterexamples')}</span></span>
          </label>
          {f.useRef && <Field label={tr('流片用的处理器地址', 'Processor address for the tape-out')} icon={Cpu}><Input mono value={f.cpu} onChange={set('cpu')} placeholder="0x…" /></Field>}
          <Button size="lg" icon={Rocket} disabled={!ready} onClick={publish}>{tr(`锁定 ${f.reward} ${sym} 并发布`, `Lock ${f.reward} ${sym} and publish`)}</Button>
          {!app.deployment?.arena && <div className="flex items-center gap-1.5 text-[13px] text-danger"><CircleAlert className="size-4" />{tr('当前链未部署 TapeArena。', 'TapeArena isn\'t deployed on this chain.')}</div>}
        </Panel>
      </div>
    </div>
  );
}