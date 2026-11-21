import { useEffect, useMemo, useRef, useState } from 'react';
import { formatEther, isAddress, type Address } from 'viem';
import {
  bitsToPins, depthOf, EXAMPLES, FULL_ADDER_NAND9, HdlError, packBits, pinsToBits, step, unpackBits,
} from '@tapearena/netlist';
import { build, fetchBounty, precheck, registerComponent, submit, tapeout, type Bounty, type Built, type Precheck } from '@tapearena/chain';
import {
  Activity, ArrowDownToLine, ArrowRight, BookmarkPlus, Bot, CircleCheck, CircleX, Clock, Cpu, Dices, Factory, FileCode2, Gauge, Layers,
  ListChecks, Microchip, Play, RotateCcw, ScanSearch, Send, Sparkles, Square, Table2, Target, Trophy, Wand2, Zap,
} from 'lucide-react';
import { Editor } from '../components/Editor.tsx';
import { Die } from '../components/Die.tsx';
import { PinRows } from '../components/Pins.tsx';
import { useApp } from '../state.tsx';
import { Link, useRoute } from '../router.tsx';
import { aiAvailable, aiDesign, type AiEvent } from '../api.ts';
import { short } from '../format.ts';
import { getLang, tr, useLang } from '../i18n.ts';
import { Button, cn, Empty, ErrBar, Input, KV, Panel, Select, Tag, Textarea } from '../components/ui.tsx';
import { social } from '../chipet/social.ts';

const TEMPLATES = { ...EXAMPLES, nand9: { get title() { return tr('9 门全加器（NAND 手写）', '9-gate full adder (hand-written NAND)'); }, src: FULL_ADDER_NAND9 } };
const DRAFT = 'tapearena.draft';

type Tab = 'sim' | 'test' | 'ai' | 'tape';

export function Studio() {
  const app = useApp();
  const lang = useLang();
  const route = useRoute();
  const bountyId = route.query.get('bounty');
  const [src, setSrc] = useState(() => localStorage.getItem(DRAFT) ?? EXAMPLES.add4.src);
  const [picked, setPicked] = useState('');
  const [built, setBuilt] = useState<Built | null>(null);
  const [err, setErr] = useState<{ msg: string; line?: number } | null>(null);
  const [tab, setTab] = useState<Tab>(bountyId ? 'test' : 'sim');
  const [bounty, setBounty] = useState<Bounty | null>(null);

  useEffect(() => { localStorage.setItem(DRAFT, src); }, [src]);

  const loadTemplate = (key: string) => {
    const t = TEMPLATES[key as keyof typeof TEMPLATES];
    if (!t) return;
    setPicked(key);
    setSrc(t.src);
  };

  // 输入改动后 250ms 重新编译（use 组件会按需读链）
  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      try {
        const b = await build(src, app.lib);
        if (!live) return;
        setBuilt(b);
        setErr(null);
      } catch (e) {
        if (!live) return;
        setErr(e instanceof HdlError ? { msg: e.message, line: e.line } : { msg: (e as Error).message });
      }
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [src, app.lib, lang]);

  useEffect(() => {
    if (!bountyId || !app.deployment?.arena) { setBounty(null); return; }
    fetchBounty(app.pub, app.deployment.arena, Number(bountyId)).then(setBounty).catch(() => setBounty(null));
  }, [bountyId, app.pub, app.deployment, app.refreshKey]);

  const depth = useMemo(() => (built ? depthOf(built.circuit, app.lib) : 0), [built, app.lib]);
  const check = useMemo<Precheck | null>(() => {
    if (!built || !bounty) return null;
    try { return precheck(built.circuit, app.lib, bounty); } catch { return null; }
  }, [built, bounty, app.lib, lang]);

  const TABS: { id: Tab; label: string; icon: typeof Play }[] = [
    { id: 'sim', label: tr('仿真', 'Simulate'), icon: Activity },
    { id: 'test', label: bounty ? tr('擂台预检', 'Bounty pre-check') : tr('真值表', 'Truth table'), icon: bounty ? Target : Table2 },
    { id: 'ai', label: tr('AI 助手', 'AI assistant'), icon: Bot },
    { id: 'tape', label: tr('流片 / 提交', 'Tape out / Submit'), icon: Factory },
  ];

  return (
    <div className="min-w-0 w-full overflow-x-clip pb-16">
      <div className="flex min-w-0 flex-wrap items-center gap-3 pt-6">
        <h2 className="flex min-w-0 items-center gap-2.5 text-[22px] sm:text-[26px]"><Microchip className="size-6 shrink-0 text-copper" />{tr('设计器', 'Studio')}</h2>
        {bounty
          ? <Link to={`/lab/bounty/${bounty.id}`} className="min-w-0 no-underline"><Tag tone="si" icon={Target}>{tr(`正在为擂台 #${bounty.id}「${bounty.meta.title}」设计`, `Designing for bounty #${bounty.id} "${bounty.meta.title}"`)}</Tag></Link>
          : <span className="min-w-0 text-[13px] text-pretty text-mute">{tr('写 TapeHDL，实时编译成 NAND 网表；所有计算都在你的浏览器里完成。', 'Write TapeHDL and it compiles to a NAND netlist as you type. Everything runs in your browser.')}</span>}
        <div className="hidden flex-1 sm:block" />
        <Select
          aria-label={tr('载入示例', 'Load an example')}
          icon={FileCode2}
          className="w-full max-w-full sm:w-64"
          value={picked}
          onChange={(e) => { if (e.target.value) loadTemplate(e.target.value); }}
        >
          <option value="">{tr('载入示例…', 'Load an example…')}</option>
          {Object.entries(TEMPLATES).map(([k, v]) => <option key={k} value={k}>{v.title}</option>)}
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-5 pt-5 pb-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="flex flex-col gap-5">
          <Panel title={<span className="font-mono">{built?.compiled.name ?? 'circuit'}<span className="text-faint">.thdl</span></span>} icon={FileCode2}
            right={err ? <Tag tone="danger" icon={CircleX}>{tr('编译失败', 'Compile failed')}</Tag> : built && <Tag tone="si" icon={CircleCheck}>{tr('已编译', 'Compiled')}</Tag>}>
            <Editor
              value={src}
              onChange={(v) => {
                setSrc(v);
                if (picked) setPicked('');
              }}
              errLine={err?.line}
            />
            {err
              ? <ErrBar>{err.msg}</ErrBar>
              : built && (
                <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-si/20 bg-si/[0.05] px-3.5 py-2.5 font-mono text-[12.5px] text-si">
                  <span className="flex items-center gap-1.5"><Zap className="size-3.5" />{built.compiled.inputs.map((p) => `${p.name}${p.width > 1 ? `[${p.width}]` : ''}`).join(', ')} → {built.compiled.outputs.map((p) => `${p.name}${p.width > 1 ? `[${p.width}]` : ''}`).join(', ')}</span>
                  <span className="flex items-center gap-1.5"><ArrowDownToLine className="size-3.5" />{tr(`${built.compiled.netlist.length} 字节网表`, `${built.compiled.netlist.length}-byte netlist`)}</span>
                  {built.compiled.components.length > 0 && <span className="flex items-center gap-1.5"><Layers className="size-3.5" />{tr('引用', 'Uses')} {built.compiled.components.map((c) => c.name).join(', ')}</span>}
                </div>
              )}
          </Panel>
          {built && (
            <dl className="flex flex-nowrap items-stretch divide-x divide-line/80 overflow-x-auto overflow-y-hidden">
              {([
                { icon: Cpu, label: tr('总门数', 'Total gates'), value: built.circuit.gateCount, tone: 'text-copper' },
                { icon: Square, label: tr('本层 NAND', 'NAND (this level)'), value: built.compiled.nNand, tone: 'text-ink' },
                { icon: Clock, label: tr('寄存器', 'Registers'), value: built.circuit.nState, tone: 'text-si' },
                { icon: Gauge, label: tr('关键路径', 'Critical path'), value: depth, tone: 'text-ink' },
              ] as const).map(({ icon: I, label, value, tone }) => (
                <div key={label} className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1 sm:gap-3 sm:px-5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-panel-2 text-mute sm:size-9"><I className="size-3.5 sm:size-4" /></span>
                  <div className="min-w-0">
                    <dd className={cn('m-0 font-display text-xl leading-none font-bold tabular-nums sm:text-2xl', tone)}>{value}</dd>
                    <dt className="mt-1 text-[10px] whitespace-nowrap text-mute sm:text-[11px]">{label}</dt>
                  </div>
                </div>
              ))}
            </dl>
          )}
        </div>

        <div className="flex flex-col gap-5">
          {built && <SimDie built={built} />}
          <Panel>
            <div role="tablist" className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line px-2">
              {TABS.map(({ id, label, icon: I }) => (
                <button key={id} role="tab" aria-selected={tab === id} type="button" onClick={() => setTab(id)}
                  className={cn('flex shrink-0 items-center gap-1.5 border-b-2 px-3 pt-3 pb-2.5 text-[13px] leading-none whitespace-nowrap transition-colors',
                    tab === id ? 'border-copper text-ink' : 'border-transparent text-mute hover:text-ink')}>
                  <I className={cn('size-4 shrink-0', tab === id && 'text-copper')} />{label}
                </button>
              ))}
            </div>
            <div className="p-4">
              {tab === 'sim' && (built ? <SimPanel built={built} /> : <FixFirst />)}
              {tab === 'test' && (bounty ? <BountyCheck bounty={bounty} check={check} /> : built ? <TruthTable built={built} /> : <FixFirst />)}
              {tab === 'ai' && <AiPanel src={src} bounty={bounty} onUse={setSrc} />}
              {tab === 'tape' && <TapePanel built={built} bounty={bounty} check={check} />}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

const FixFirst = () => <p className="m-0 flex items-center gap-1.5 text-mute"><CircleX className="size-4 text-danger" />{tr('先修好编译错误。', 'Fix the compile error first.')}</p>;

// ---------------------------------------------------------------- 仿真

const simBus = { listeners: new Set<(s: Uint8Array) => void>(), emit(s: Uint8Array) { this.listeners.forEach((f) => f(s)); } };

function SimDie({ built }: { built: Built }) {
  const [signals, setSignals] = useState<Uint8Array>();
  useEffect(() => {
    const f = (s: Uint8Array) => setSignals(s);
    simBus.listeners.add(f);
    return () => { simBus.listeners.delete(f); };
  }, []);
  useEffect(() => setSignals(undefined), [built]);
  return <Die elements={built.circuit.elements} nIn={built.circuit.nIn} signals={signals} height={250} label={built.compiled.name.toUpperCase()} />;
}

function SimPanel({ built }: { built: Built }) {
  const { lib } = useApp();
  const { compiled, circuit } = built;
  const [vals, setVals] = useState<Record<string, bigint>>({});
  const [state, setState] = useState<Uint8Array>(() => new Uint8Array(Math.ceil(circuit.nState / 8)));
  const [cycle, setCycle] = useState(0);
  const sig = useRef('');

  useEffect(() => {
    const k = `${compiled.inputs.map((p) => p.name + p.width).join()}|${circuit.nState}`;
    if (k !== sig.current) { sig.current = k; setVals({}); setState(new Uint8Array(Math.ceil(circuit.nState / 8))); setCycle(0); }
  }, [compiled, circuit]);

  const r = useMemo(() => {
    try {
      const inBits = pinsToBits(compiled.inputs, vals);
      return step(circuit, state, packBits(inBits), lib);
    } catch { return null; }
  }, [compiled, circuit, vals, state, lib]);

  useEffect(() => { if (r) simBus.emit(r.signals); }, [r]);
  useEffect(() => {
    // 今日任务：设计器成功跑通一次仿真
    if (r) social.completeQuest('lab_peek');
  }, [r]);

  const outs = r ? bitsToPins(compiled.outputs, unpackBits(r.outputs, circuit.nOut)) : {};
  const randomize = () => {
    const v: Record<string, bigint> = {};
    for (const p of compiled.inputs) v[p.name] = BigInt(Math.floor(Math.random() * 2 ** Math.min(p.width, 30)));
    setVals(v);
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="mb-2.5 flex items-center">
          <span className="flex items-center gap-1.5 font-mono text-xs text-mute"><ArrowRight className="size-3.5 text-copper" />{tr('输入（点击切换位，左高右低）', 'Inputs (click to toggle bits, high bit on the left)')}</span>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" icon={Dices} onClick={randomize}>{tr('随机', 'Random')}</Button>
        </div>
        <PinRows pins={compiled.inputs} values={vals} onChange={(n, v) => setVals((o) => ({ ...o, [n]: v }))} />
      </div>
      <div>
        <span className="mb-2.5 flex items-center gap-1.5 font-mono text-xs text-mute"><ArrowRight className="size-3.5 text-si" />{tr('输出', 'Outputs')}</span>
        <PinRows pins={compiled.outputs} values={outs} out />
      </div>
      {circuit.nState > 0 && (
        <div className="flex items-center gap-2.5">
          <Button variant="si" size="sm" icon={Play} onClick={() => { if (r) { setState(r.state); setCycle((c) => c + 1); } }}>{tr('时钟 +1', 'Clock +1')}</Button>
          <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => { setState(new Uint8Array(Math.ceil(circuit.nState / 8))); setCycle(0); }}>{tr('复位', 'Reset')}</Button>
          <span className="font-mono text-xs text-mute tabular-nums">{tr(`第 ${cycle} 拍 · ${circuit.nState} 位状态`, `Cycle ${cycle} · ${circuit.nState} state bits`)}</span>
        </div>
      )}
    </div>
  );
}

function TruthTable({ built }: { built: Built }) {
  const { lib } = useApp();
  const { compiled, circuit } = built;
  if (circuit.nState) return <p className="m-0 text-mute">{tr('时序电路请在「仿真」里逐拍运行。', 'For sequential circuits, step through cycles in "Simulate".')}</p>;
  const exhaustive = circuit.nIn <= 6;
  const rows = Array.from({ length: exhaustive ? 1 << circuit.nIn : 16 }, (_, x) => {
    const bits = exhaustive ? Array.from({ length: circuit.nIn }, (_, i) => (x >> i) & 1) : Array.from({ length: circuit.nIn }, () => (Math.random() < 0.5 ? 1 : 0));
    const out = unpackBits(step(circuit, new Uint8Array(0), packBits(bits), lib).outputs, circuit.nOut);
    return { i: bitsToPins(compiled.inputs, bits), o: bitsToPins(compiled.outputs, out) };
  });
  const cols = [...compiled.inputs.map((p) => p.name), ...compiled.outputs.map((p) => p.name)];
  const colW = `${100 / Math.max(cols.length, 1)}%`;
  return (
    <div className="flex max-h-[340px] flex-col">
      <p className="mt-0 mb-2 flex shrink-0 items-center gap-1.5 text-[13px] text-mute">
        <Table2 className="size-4" />
        {exhaustive ? tr(`全部 ${rows.length} 种输入`, `All ${rows.length} input combinations`) : tr('输入太宽，随机抽 16 组', 'Inputs are too wide, so here are 16 random samples')}
      </p>
      <table className="table-t shrink-0 table-fixed font-mono tabular-nums">
        <colgroup>{cols.map((n) => <col key={n} style={{ width: colW }} />)}</colgroup>
        <thead>
          <tr>
            {compiled.inputs.map((p) => <th key={p.name}>{p.name}</th>)}
            {compiled.outputs.map((p) => <th key={p.name} className="!text-si">{p.name}</th>)}
          </tr>
        </thead>
      </table>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <table className="table-t table-fixed font-mono tabular-nums">
          <colgroup>{cols.map((n) => <col key={n} style={{ width: colW }} />)}</colgroup>
          <tbody>
            {rows.map((r, k) => (
              <tr key={k}>
                {compiled.inputs.map((p) => <td key={p.name}>{r.i[p.name].toString()}</td>)}
                {compiled.outputs.map((p) => <td key={p.name} className="text-si">{r.o[p.name].toString()}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 擂台预检

function BountyCheck({ bounty, check }: { bounty: Bounty; check: Precheck | null }) {
  const best = bounty.best >= 0 ? bounty.submissions[bounty.best] : null;
  return (
    <div className="flex flex-col gap-4">
      {bounty.meta.description && <div className="text-[13px] text-pretty text-mute">{bounty.meta.description}</div>}
      <KV rows={[
        [Zap, tr('引脚', 'Pins'), `${tr(`${bounty.nIn} 入 / ${bounty.nOut} 出`, `${bounty.nIn} in / ${bounty.nOut} out`)}${bounty.meta.inputs ? ` (${bounty.meta.inputs.map((p) => p.name + (p.width > 1 ? `[${p.width}]` : '')).join(', ')} → ${bounty.meta.outputs?.map((p) => p.name + (p.width > 1 ? `[${p.width}]` : '')).join(', ')})` : ''}`],
        [ListChecks, tr('测试向量', 'Test vectors'), bounty.sampleSize
          ? tr(`${bounty.vectors.length} 条，提交时随机抽 ${bounty.sampleSize} 条`, `${bounty.vectors.length}, with ${bounty.sampleSize} sampled at random on submit`)
          : tr(`${bounty.vectors.length} 条，提交时全部链上跑`, `${bounty.vectors.length}, all run on-chain on submit`)],
        [Trophy, tr('当前最优', 'Current best'), best ? tr(`${best.gateCount} 门（${short(best.solver)}）`, `${best.gateCount} gates (${short(best.solver)})`) : tr('暂无提交', 'No submissions yet')],
        ...(bounty.maxGates > 0 ? [[Gauge, tr('门数上限', 'Gate limit'), bounty.maxGates] as [typeof Zap, string, number]] : []),
      ]} />
      {check && (
        <div className={cn('rounded-2xl p-4 ring-1', check.ok ? 'bg-si/[0.06] ring-si-dim' : 'bg-danger/[0.06] ring-danger-dim')}>
          {check.ok
            ? <div className="flex items-center gap-3">
                <CircleCheck className="size-8 shrink-0 text-si" />
                <div>
                  <b className="text-si">{tr(`通过全部 ${check.report.total} 条向量`, `Passes all ${check.report.total} vectors`)}</b>
                  <div className="text-sm text-mute">{tr(`${check.gateCount} 门 · 提交后预计排名`, `${check.gateCount} gates · estimated rank if submitted`)} <b className="font-display text-lg text-copper-hi">#{check.rankIfSubmitted}</b></div>
                </div>
              </div>
            : <div className="flex flex-col gap-1.5">
                {check.reasons.map((r) => <div key={r} className="flex items-center gap-1.5 text-danger"><CircleX className="size-4" />{r}</div>)}
                {check.report.failures.slice(0, 3).map((f) => <div key={f.index} className="font-mono text-xs text-faint">{tr(
                  `向量 #${f.index}：输入 ${f.inputs.join('')} 期望 ${f.expected.join('')} 实际 ${f.actual.join('')}`,
                  `Vector #${f.index}: input ${f.inputs.join('')}, expected ${f.expected.join('')}, got ${f.actual.join('')}`,
                )}</div>)}
              </div>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- AI

function AiPanel({ src, bounty, onUse }: { src: string; bounty: Bounty | null; onUse: (s: string) => void }) {
  const { chainId } = useApp();
  const [ok, setOk] = useState<boolean | null>(null);
  const [spec, setSpec] = useState('');
  const [events, setEvents] = useState<AiEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const abort = useRef<AbortController>();

  useEffect(() => { aiAvailable().then(setOk); }, []);

  const start = async (fromCurrent: boolean) => {
    setEvents([]); setError(''); setBusy(true);
    abort.current = new AbortController();
    try {
      await aiDesign({
        spec: spec || (bounty
          ? tr('按擂台要求设计，门数越少越好', 'Design to the bounty spec with as few gates as possible')
          : tr('优化这份电路，保持功能不变，减少门数', 'Optimize this circuit: keep the behavior, reduce the gate count')),
        bountyId: bounty?.id, chainId,
        referenceSrc: !bounty && fromCurrent ? src : undefined,
        seed: fromCurrent ? src : undefined,
        maxRounds: 8,
      }, (e) => setEvents((x) => [...x, e]), abort.current.signal);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    } finally { setBusy(false); }
  };

  const best = [...events].reverse().find((e) => e.type === 'best');
  if (ok === false) {
    return (
      <Empty icon={Bot} title={tr('AI 助手未启用', 'AI assistant is off')}>
        {getLang() === 'zh'
          ? <>需要启动后端并配置 <code>AI_API_KEY</code>（任何 OpenAI 兼容接口）。设计器其余功能不受影响。</>
          : <>It needs the backend running with <code>AI_API_KEY</code> set (any OpenAI-compatible API). The rest of the Studio works without it.</>}
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Textarea rows={3} placeholder={bounty
        ? tr('补充思路（可选），AI 会对照擂台测试向量与参考电路反复修正', 'Add hints (optional). The AI iterates against the bounty\'s test vectors and reference circuit')
        : tr('描述你要的电路，例如：8 位奇偶校验，输入 x[8]，输出 p', 'Describe the circuit you want, e.g. 8-bit parity, input x[8], output p')} value={spec} onChange={(e) => setSpec(e.target.value)} />
      <div className="flex flex-wrap items-center gap-2">
        <Button icon={Sparkles} busy={busy} disabled={busy} onClick={() => start(false)}>{busy ? tr('设计中', 'Designing') : tr('让 AI 设计', 'Design with AI')}</Button>
        <Button variant="ghost" icon={Wand2} disabled={busy} onClick={() => start(true)}>{tr('从当前代码优化', 'Optimize current code')}</Button>
        {busy && <Button variant="ghost" size="sm" icon={Square} onClick={() => abort.current?.abort()}>{tr('停止', 'Stop')}</Button>}
        <div className="flex-1" />
        {best?.code && <Button variant="si" size="sm" icon={CircleCheck} onClick={() => onUse(best.code!)}>{tr(`采用最优解（${best.gateCount} 门）`, `Use the best (${best.gateCount} gates)`)}</Button>}
      </div>
      {error && <div className="flex items-center gap-1.5 text-[13px] text-danger"><CircleX className="size-4" />{error}</div>}
      <div className="flex max-h-[360px] flex-col gap-2 overflow-auto">
        {events.filter((e) => e.type === 'attempt' || e.type === 'error').map((e, i) => (
          <div key={i} className="animate-rise rounded-xl bg-substrate/60 px-3 py-2 text-[13px] ring-1 ring-line">
            <div className="flex items-center gap-2 font-mono text-xs">
              {e.ok ? <CircleCheck className="size-4 text-si" /> : <CircleX className="size-4 text-danger" />}
              <span>{e.phase === 'optimize'
                ? tr(`第 ${e.round} 轮 · 压缩门数`, `Round ${e.round} · cutting gates`)
                : tr(`第 ${e.round} 轮 · 求正确`, `Round ${e.round} · getting it right`)}</span>
              {e.gateCount !== undefined && <span className="text-copper-hi tabular-nums">{e.gateCount} {tr('门', 'gates')}</span>}
              <div className="flex-1" />
              {e.code && <Button variant="ghost" size="sm" icon={ArrowDownToLine} onClick={() => onUse(e.code!)}>{tr('载入', 'Load')}</Button>}
            </div>
            <pre className="mt-1.5 mb-0 max-h-[90px] overflow-auto font-mono text-xs whitespace-pre-wrap text-mute">{e.message ?? e.feedback}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 流片与提交

function TapePanel({ built, bounty, check }: { built: Built | null; bounty: Bounty | null; check: Precheck | null }) {
  const app = useApp();
  const [cpu, setCpu] = useState<string>(app.deployment?.cpu ?? '');
  const [done, setDone] = useState<{ cpu: Address; id: bigint; gates: number } | null>(null);
  const [name, setName] = useState('');
  const [fee, setFee] = useState<bigint | null>(null);
  const sym = app.chain.nativeCurrency.symbol;

  useEffect(() => { setCpu(app.deployment?.cpu ?? ''); }, [app.deployment]);
  useEffect(() => { setDone(null); }, [built]);
  useEffect(() => {
    if (!isAddress(cpu)) { setFee(null); return; }
    app.pub.readContract({ address: cpu, abi: [{ type: 'function', name: 'TAPEOUT_FEE', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }], functionName: 'TAPEOUT_FEE' })
      .then(setFee).catch(() => setFee(null));
  }, [cpu, app.pub]);

  if (!built) return <FixFirst />;
  const { compiled, circuit } = built;

  const doTapeout = () => app.run(tr('流片', 'Tape out'), async (stepFn) => {
    const s = await app.signer();
    const r = await tapeout(s, cpu as Address, compiled.netlist, compiled.nIn, compiled.nOut, stepFn);
    setDone({ cpu: cpu as Address, id: r.circuitId, gates: r.gateCount });
    return r;
  });

  const doSubmit = () => app.run(tr('提交到擂台', 'Submit to bounty'), async (stepFn) => {
    const s = await app.signer();
    return submit(s, app.deployment!.arena!, bounty!.id, done!.cpu, done!.id, bounty!.bond, stepFn);
  });

  const doRegister = () => app.run(tr('登记组件', 'Register component'), async (stepFn) => {
    const s = await app.signer();
    const meta = JSON.stringify({ inputs: compiled.inputs, outputs: compiled.outputs, src: built.compiled.name });
    return registerComponent(s, app.deployment!.library!, done!.cpu, done!.id, name || compiled.name, meta, stepFn);
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          [Square, 'NAND', compiled.nNand, 'text-copper-hi'],
          [Clock, 'LATCH', compiled.nLatch, 'text-si'],
          [Layers, tr('REF（免烧）', 'REF (no burn)'), compiled.components.length, 'text-gold'],
        ].map(([I, k, v, tone]) => {
          const Icon = I as typeof Square;
          return (
            <div key={k as string} className="rounded-xl bg-substrate/60 py-2.5 ring-1 ring-line">
              <Icon className={cn('mx-auto size-4', tone as string)} />
              <div className={cn('mt-1 font-display text-xl font-extrabold tabular-nums', tone as string)}>{v as number}</div>
              <div className="font-mono text-[11px] text-faint">{k as string}</div>
            </div>
          );
        })}
      </div>
      <p className="m-0 text-[13px] text-pretty text-mute">
        {getLang() === 'zh'
          ? <>流片会烧掉上面的晶体管（REF 引用的组件不用再烧），得到一枚 ERC-721 电路，链上任何合约都能调用它的 <code>eval</code>。</>
          : <>Taping out burns the transistors above (components pulled in by REF aren't burned again) and gives you an ERC-721 circuit whose <code>eval</code> any contract on-chain can call.</>}
      </p>
      <label className="block">
        <span className="mb-1.5 flex items-center gap-1.5 font-mono text-xs text-mute"><Cpu className="size-3.5 text-faint" />{tr('处理器（CPU）地址', 'Processor (CPU) address')}</span>
        <Input mono value={cpu} onChange={(e) => setCpu(e.target.value.trim())} placeholder={tr('0x…（TapeOut 官方工厂创建的处理器）', '0x… (a processor created by the official TapeOut factory)')} />
        <span className="mt-1.5 block font-mono text-xs text-faint">
          {tr('流片费', 'Tape-out fee')} {fee !== null ? `${formatEther(fee)} ${sym}` : '—'} · {tr('晶体管按该 CPU 的价格铸造（X Layer 主网用 BEM 支付）', 'transistors are minted at this CPU\'s price (paid in BEM on X Layer mainnet)')}
        </span>
      </label>
      {!done
        ? <Button size="lg" icon={Factory} disabled={!isAddress(cpu) || circuit.gateCount === 0} onClick={doTapeout}>{tr('铸晶体管并流片', 'Mint transistors and tape out')}</Button>
        : <div className="rounded-2xl bg-si/[0.06] p-4 ring-1 ring-si-dim">
            <div className="flex items-center gap-2">
              <CircleCheck className="size-5 text-si" /><b className="text-si">{tr('已流片', 'Taped out')}</b>
              <span className="font-mono text-sm">{tr(`电路 #${done.id.toString()} · ${done.gates} 门`, `Circuit #${done.id.toString()} · ${done.gates} gates`)}</span>
              <span className="ml-auto font-mono text-xs text-faint">{short(done.cpu)}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {bounty && app.deployment?.arena && (
                <Button icon={Send} disabled={check?.ok === false} onClick={doSubmit}>
                  {tr(`提交到擂台 #${bounty.id}`, `Submit to bounty #${bounty.id}`)}{bounty.bond > 0n ? tr(`（保证金 ${formatEther(bounty.bond)} ${sym}）`, ` (bond ${formatEther(bounty.bond)} ${sym})`) : ''}
                </Button>
              )}
              {app.deployment?.library && <>
                <Input className="w-40" placeholder={tr('组件名', 'Component name')} value={name} onChange={(e) => setName(e.target.value)} />
                <Button variant="ghost" icon={BookmarkPlus} onClick={doRegister}>{tr('登记为组件', 'Register as component')}</Button>
              </>}
            </div>
          </div>}
      {bounty && check && !check.ok && <div className="flex items-center gap-1.5 text-[13px] text-danger"><ScanSearch className="size-4" />{tr('预检没通过，提交会被合约拒绝：', 'Pre-check failed, so the contract would reject this submission: ')}{check.reasons[0]}</div>}
      {!bounty && (
        <div className="flex items-center gap-1.5 text-[13px] text-faint">
          <Trophy className="size-4" />
          {getLang() === 'zh'
            ? <span>想参赛？去 <Link to="/lab">擂台</Link> 选一场，点「去设计」会把目标带过来。</span>
            : <span>Want to compete? Pick a bounty in the <Link to="/lab">Arena</Link> and hit "Design" to bring its target here.</span>}
        </div>
      )}
    </div>
  );
}
