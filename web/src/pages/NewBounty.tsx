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
import { Button, ErrBar, Field, Input, Panel, Textarea } from '../components/ui.tsx';

export function NewBounty() {
  const app = useApp();
  const [src, setSrc] = useState(EXAMPLES.cmp4.src);
  const [built, setBuilt] = useState<Built | null>(null);
  const [err, setErr] = useState<{ msg: string; line?: number } | null>(null);
  const [f, setF] = useState({
    title: '4 位比较器 a > b', description: '输入两个 4 位无符号数，输出 a 是否大于 b。门数越少越好。',
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
  }, [src, app.lib]);

  const vec = useMemo(() => {
    if (!built || built.circuit.nState) return null;
    try { return vectorsFor(built, app.lib, Math.min(512, Math.max(1, Number(f.count) || 64)), Number(f.seed) || 1); } catch { return null; }
  }, [built, app.lib, f.count, f.seed]);

  const ready = Boolean(built && vec && app.deployment?.arena && (!f.useRef || isAddress(f.cpu)) && Number(f.reward) > 0);

  const publish = () => app.run('发布悬赏', async (st) => {
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
    go(`/bounty/${id}`);
    return id;
  });

  return (
    <div className="mx-auto max-w-[1240px] px-4 pt-8 pb-16 sm:px-7">
      <h2 className="flex items-center gap-2.5 text-[28px]"><Rocket className="size-6 text-copper" />发布悬赏</h2>
      <p className="mt-2 max-w-[760px] text-pretty text-mute">
        写一份参考实现（正确就行，不用省门），系统用它生成测试向量。发布时参考电路会先流片，合约在链上跑一遍全部向量确认题目自洽，然后锁定奖金。
      </p>
      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="flex flex-col gap-5">
          <Panel title="参考实现" icon={FileCode2}
            right={built && !err && <span className="flex items-center gap-1 font-mono text-xs text-si"><CircleCheck className="size-3.5" />{built.circuit.gateCount} 门 · {built.circuit.nIn}→{built.circuit.nOut}</span>}>
            <Editor value={src} onChange={setSrc} errLine={err?.line} />
            {err && <ErrBar>{err.line ? `第 ${err.line} 行：` : ''}{err.msg}</ErrBar>}
            {built?.circuit.nState ? <ErrBar>参考实现不能含寄存器：擂台只比组合逻辑</ErrBar> : null}
          </Panel>
          {built && <Die elements={built.circuit.elements} nIn={built.circuit.nIn} height={200} label="参考电路" />}
        </div>

        <Panel title="擂台参数" icon={ScrollText} bodyClass="flex flex-col gap-4 p-5">
          <Field label="标题" icon={Heading}><Input value={f.title} onChange={set('title')} /></Field>
          <Field label="说明" icon={ScrollText}><Textarea rows={3} value={f.description} onChange={set('description')} /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="奖金 OKB" icon={Coins}><Input mono value={f.reward} onChange={set('reward')} /></Field>
            <Field label="保证金 OKB" icon={Lock}><Input mono value={f.bond} onChange={set('bond')} /></Field>
            <Field label="上游分润 %" icon={Blocks}><Input mono value={f.royalty} onChange={set('royalty')} /></Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="提交期（天）" icon={CalendarClock}><Input mono value={f.days} onChange={set('days')} /></Field>
            <Field label="挑战期（天）" icon={Swords}><Input mono value={f.challengeDays} onChange={set('challengeDays')} /></Field>
            <Field label="门数上限" icon={Gauge} hint="0 = 不限"><Input mono value={f.maxGates} onChange={set('maxGates')} /></Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="向量条数" icon={ListChecks}><Input mono value={f.count} onChange={set('count')} /></Field>
            <Field label="随机种子" icon={Dice5}><Input mono value={f.seed} onChange={set('seed')} /></Field>
            <Field label="抽检条数" icon={Shuffle} hint="0 = 全量"><Input mono value={f.sample} onChange={set('sample')} /></Field>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-xs text-faint">
            <ListChecks className="size-3.5" />{vec ? `已生成 ${vec.count} 条向量（输入 ≤ 8 位时穷举）` : '—'}
          </div>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg bg-substrate/60 p-3 text-sm ring-1 ring-line">
            <input type="checkbox" className="mt-1 accent-copper" checked={f.useRef} onChange={(e) => setF((o) => ({ ...o, useRef: e.target.checked }))} />
            <span className="text-pretty">把参考实现流片上链<span className="block text-xs text-faint">推荐：挑战者可以用任意输入对照它找反例</span></span>
          </label>
          {f.useRef && <Field label="流片用的处理器地址" icon={Cpu}><Input mono value={f.cpu} onChange={set('cpu')} placeholder="0x…" /></Field>}
          <Button size="lg" icon={Rocket} disabled={!ready} onClick={publish}>锁定 {f.reward} OKB 并发布</Button>
          {!app.deployment?.arena && <div className="flex items-center gap-1.5 text-[13px] text-danger"><CircleAlert className="size-4" />当前链未部署 TapeArena。</div>}
        </Panel>
      </div>
    </div>
  );
}