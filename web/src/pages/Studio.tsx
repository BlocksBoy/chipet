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
import { Button, cn, Empty, ErrBar, Input, KV, Panel, Select, Stat, Tag, Textarea } from '../components/ui.tsx';

const TEMPLATES = { ...EXAMPLES, nand9: { title: '9 门全加器（NAND 手写）', src: FULL_ADDER_NAND9 } };
const DRAFT = 'tapearena.draft';

type Tab = 'sim' | 'test' | 'ai' | 'tape';

export function Studio() {
  const app = useApp();
  const route = useRoute();
  const bountyId = route.query.get('bounty');
  const [src, setSrc] = useState(() => localStorage.getItem(DRAFT) ?? EXAMPLES.add4.src);
  const [built, setBuilt] = useState<Built | null>(null);
  const [err, setErr] = useState<{ msg: string; line?: number } | null>(null);
  const [tab, setTab] = useState<Tab>(bountyId ? 'test' : 'sim');
  const [bounty, setBounty] = useState<Bounty | null>(null);

  useEffect(() => { localStorage.setItem(DRAFT, src); }, [src]);

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
  }, [src, app.lib]);

  useEffect(() => {
    if (!bountyId || !app.deployment?.arena) { setBounty(null); return; }
    fetchBounty(app.pub, app.deployment.arena, Number(bountyId)).then(setBounty).catch(() => setBounty(null));
  }, [bountyId, app.pub, app.deployment, app.refreshKey]);

  const depth = useMemo(() => (built ? depthOf(built.circuit, app.lib) : 0), [built, app.lib]);
  const check = useMemo<Precheck | null>(() => {
    if (!built || !bounty) return null;
    try { return precheck(built.circuit, app.lib, bounty); } catch { return null; }
  }, [built, bounty, app.lib]);

  const TABS: { id: Tab; label: string; icon: typeof Play }[] = [
    { id: 'sim', label: '仿真', icon: Activity },
    { id: 'test', label: bounty ? '擂台预检' : '真值表', icon: bounty ? Target : Table2 },
    { id: 'ai', label: 'AI 助手', icon: Bot },
    { id: 'tape', label: '流片 / 提交', icon: Factory },
  ];

  return (
    <div className="mx-auto max-w-[1240px] px-4 sm:px-7">
      <div className="flex flex-wrap items-center gap-3.5 pt-6">
        <h2 className="flex items-center gap-2.5 text-[26px]"><Microchip className="size-6 text-copper" />设计器</h2>
        {bounty
          ? <Link to={`/bounty/${bounty.id}`} className="no-underline"><Tag tone="si" icon={Target}>正在为擂台 #{bounty.id}「{bounty.meta.title}」设计</Tag></Link>
          : <span className="text-[13px] text-mute">写 TapeHDL，实时编译成 NAND 网表；所有计算都在你的浏览器里完成。</span>}
        <div className="flex-1" />
        <Select aria-label="载入示例" icon={FileCode2} className="w-64" value="" onChange={(e) => e.target.value && setSrc(TEMPLATES[e.target.value as keyof typeof TEMPLATES].src)}>
          <option value="">载入示例…</option>
          {Object.entries(TEMPLATES).map(([k, v]) => <option key={k} value={k}>{v.title}</option>)}
        </Select>
      </div>

      <div className="grid gap-5 pt-5 pb-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="flex flex-col gap-5">
          <Panel title={<span className="font-mono">{built?.compiled.name ?? 'circuit'}<span className="text-faint">.thdl</span></span>} icon={FileCode2}
            right={err ? <Tag tone="danger" icon={CircleX}>编译失败</Tag> : built && <Tag tone="si" icon={CircleCheck}>已编译</Tag>}>
            <Editor value={src} onChange={setSrc} errLine={err?.line} />
            {err
              ? <ErrBar>{err.line ? `第 ${err.line} 行：` : ''}{err.msg}</ErrBar>
              : built && (
                <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-si/20 bg-si/[0.05] px-3.5 py-2.5 font-mono text-[12.5px] text-si">
                  <span className="flex items-center gap-1.5"><Zap className="size-3.5" />{built.compiled.inputs.map((p) => `${p.name}${p.width > 1 ? `[${p.width}]` : ''}`).join(', ')} → {built.compiled.outputs.map((p) => `${p.name}${p.width > 1 ? `[${p.width}]` : ''}`).join(', ')}</span>
                  <span className="flex items-center gap-1.5"><ArrowDownToLine className="size-3.5" />{built.compiled.netlist.length} 字节网表</span>
                  {built.compiled.components.length > 0 && <span className="flex items-center gap-1.5"><Layers className="size-3.5" />引用 {built.compiled.components.map((c) => c.name).join(', ')}</span>}
                </div>
              )}
          </Panel>
          {built && (
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
              <Stat label="总门数" icon={Cpu} value={built.circuit.gateCount} tone="copper" />
              <Stat label="本层 NAND" icon={Square} value={built.compiled.nNand} />
              <Stat label="寄存器" icon={Clock} value={built.circuit.nState} tone="si" />
              <Stat label="关键路径" icon={Gauge} value={depth} />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-5">
          {built && <SimDie built={built} />}
          <Panel>
            <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line px-2">
              {TABS.map(({ id, label, icon: I }) => (
                <button key={id} role="tab" aria-selected={tab === id} type="button" onClick={() => setTab(id)}
                  className={cn('-mb-px flex items-center gap-1.5 border-b-2 px-3 pt-3 pb-2.5 text-[13px] whitespace-nowrap transition-colors',
                    tab === id ? 'border-copper text-ink' : 'border-transparent text-mute hover:text-ink')}>
                  <I className={cn('size-4', tab === id && 'text-copper')} />{label}
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

const FixFirst = () => <p className="m-0 flex items-center gap-1.5 text-mute"><CircleX className="size-4 text-danger" />先修好编译错误。</p>;

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
          <span className="flex items-center gap-1.5 font-mono text-xs text-mute"><ArrowRight className="size-3.5 text-copper" />输入（点击切换位，左高右低）</span>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" icon={Dices} onClick={randomize}>随机</Button>
        </div>
        <PinRows pins={compiled.inputs} values={vals} onChange={(n, v) => setVals((o) => ({ ...o, [n]: v }))} />
      </div>
      <div>
        <span className="mb-2.5 flex items-center gap-1.5 font-mono text-xs text-mute"><ArrowRight className="size-3.5 text-si" />输出</span>
        <PinRows pins={compiled.outputs} values={outs} out />
      </div>
      {circuit.nState > 0 && (
        <div className="flex items-center gap-2.5">
          <Button variant="si" size="sm" icon={Play} onClick={() => { if (r) { setState(r.state); setCycle((c) => c + 1); } }}>时钟 +1</Button>
          <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => { setState(new Uint8Array(Math.ceil(circuit.nState / 8))); setCycle(0); }}>复位</Button>
          <span className="font-mono text-xs text-mute tabular-nums">第 {cycle} 拍 · {circuit.nState} 位状态</span>
        </div>
      )}
    </div>
  );
}

function TruthTable({ built }: { built: Built }) {
  const { lib } = useApp();
  const { compiled, circuit } = built;
  if (circuit.nState) return <p className="m-0 text-mute">时序电路请在「仿真」里逐拍运行。</p>;
  const exhaustive = circuit.nIn <= 6;
  const rows = Array.from({ length: exhaustive ? 1 << circuit.nIn : 16 }, (_, x) => {
    const bits = exhaustive ? Array.from({ length: circuit.nIn }, (_, i) => (x >> i) & 1) : Array.from({ length: circuit.nIn }, () => (Math.random() < 0.5 ? 1 : 0));
    const out = unpackBits(step(circuit, new Uint8Array(0), packBits(bits), lib).outputs, circuit.nOut);
    return { i: bitsToPins(compiled.inputs, bits), o: bitsToPins(compiled.outputs, out) };
  });
  return (
    <div className="max-h-[340px] overflow-auto">
      <p className="mt-0 flex items-center gap-1.5 text-[13px] text-mute"><Table2 className="size-4" />{exhaustive ? `全部 ${rows.length} 种输入` : '输入太宽，随机抽 16 组'}</p>
      <table className="table-t font-mono tabular-nums">
        <thead><tr>{compiled.inputs.map((p) => <th key={p.name}>{p.name}</th>)}{compiled.outputs.map((p) => <th key={p.name} className="!text-si">{p.name}</th>)}</tr></thead>
        <tbody>{rows.map((r, k) => <tr key={k}>{compiled.inputs.map((p) => <td key={p.name}>{r.i[p.name].toString()}</td>)}{compiled.outputs.map((p) => <td key={p.name} className="text-si">{r.o[p.name].toString()}</td>)}</tr>)}</tbody>
      </table>
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
        [Zap, '引脚', `${bounty.nIn} 入 / ${bounty.nOut} 出${bounty.meta.inputs ? `（${bounty.meta.inputs.map((p) => p.name + (p.width > 1 ? `[${p.width}]` : '')).join(', ')} → ${bounty.meta.outputs?.map((p) => p.name + (p.width > 1 ? `[${p.width}]` : '')).join(', ')}）` : ''}`],
        [ListChecks, '测试向量', `${bounty.vectors.length} 条${bounty.sampleSize ? `，提交时随机抽 ${bounty.sampleSize} 条` : '，提交时全部链上跑'}`],
        [Trophy, '当前最优', best ? `${best.gateCount} 门（${short(best.solver)}）` : '暂无提交'],
        ...(bounty.maxGates > 0 ? [[Gauge, '门数上限', bounty.maxGates] as [typeof Zap, string, number]] : []),
      ]} />
      {check && (
        <div className={cn('rounded-xl p-4 ring-1', check.ok ? 'bg-si/[0.06] ring-si-dim' : 'bg-danger/[0.06] ring-danger-dim')}>
          {check.ok
            ? <div className="flex items-center gap-3">
                <CircleCheck className="size-8 shrink-0 text-si" />
                <div>
                  <b className="text-si">通过全部 {check.report.total} 条向量</b>
                  <div className="text-sm text-mute">{check.gateCount} 门 · 提交后预计排名 <b className="font-display text-lg text-copper-hi">#{check.rankIfSubmitted}</b></div>
                </div>
              </div>
            : <div className="flex flex-col gap-1.5">
                {check.reasons.map((r) => <div key={r} className="flex items-center gap-1.5 text-danger"><CircleX className="size-4" />{r}</div>)}
                {check.report.failures.slice(0, 3).map((f) => <div key={f.index} className="font-mono text-xs text-faint">向量 #{f.index}：输入 {f.inputs.join('')} 期望 {f.expected.join('')} 实际 {f.actual.join('')}</div>)}
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
        spec: spec || (bounty ? '按擂台要求设计，门数越少越好' : '优化这份电路，保持功能不变，减少门数'),
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
  if (ok === false) return <Empty icon={Bot} title="AI 助手未启用">需要启动后端并配置 <code>AI_API_KEY</code>（任何 OpenAI 兼容接口）。设计器其余功能不受影响。</Empty>;

  return (
    <div className="flex flex-col gap-3">
      <Textarea rows={3} placeholder={bounty ? '补充思路（可选），AI 会对照擂台测试向量与参考电路反复修正' : '描述你要的电路，例如：8 位奇偶校验，输入 x[8]，输出 p'} value={spec} onChange={(e) => setSpec(e.target.value)} />
      <div className="flex flex-wrap items-center gap-2">
        <Button icon={Sparkles} busy={busy} disabled={busy} onClick={() => start(false)}>{busy ? '设计中' : '让 AI 设计'}</Button>
        <Button variant="ghost" icon={Wand2} disabled={busy} onClick={() => start(true)}>从当前代码优化</Button>
        {busy && <Button variant="ghost" size="sm" icon={Square} onClick={() => abort.current?.abort()}>停止</Button>}
        <div className="flex-1" />
        {best?.code && <Button variant="si" size="sm" icon={CircleCheck} onClick={() => onUse(best.code!)}>采用最优解（{best.gateCount} 门）</Button>}
      </div>
      {error && <div className="flex items-center gap-1.5 text-[13px] text-danger"><CircleX className="size-4" />{error}</div>}
      <div className="flex max-h-[360px] flex-col gap-2 overflow-auto">
        {events.filter((e) => e.type === 'attempt' || e.type === 'error').map((e, i) => (
          <div key={i} className="animate-rise rounded-lg bg-substrate/60 px-3 py-2 text-[13px] ring-1 ring-line">
            <div className="flex items-center gap-2 font-mono text-xs">
              {e.ok ? <CircleCheck className="size-4 text-si" /> : <CircleX className="size-4 text-danger" />}
              <span>第 {e.round} 轮 · {e.phase === 'optimize' ? '压缩门数' : '求正确'}</span>
              {e.gateCount !== undefined && <span className="text-copper-hi tabular-nums">{e.gateCount} 门</span>}
              <div className="flex-1" />
              {e.code && <Button variant="ghost" size="sm" icon={ArrowDownToLine} onClick={() => onUse(e.code!)}>载入</Button>}
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

  useEffect(() => { setCpu(app.deployment?.cpu ?? ''); }, [app.deployment]);
  useEffect(() => { setDone(null); }, [built]);
  useEffect(() => {
    if (!isAddress(cpu)) { setFee(null); return; }
    app.pub.readContract({ address: cpu, abi: [{ type: 'function', name: 'TAPEOUT_FEE', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }], functionName: 'TAPEOUT_FEE' })
      .then(setFee).catch(() => setFee(null));
  }, [cpu, app.pub]);

  if (!built) return <FixFirst />;
  const { compiled, circuit } = built;

  const doTapeout = () => app.run('流片', async (stepFn) => {
    const s = await app.signer();
    const r = await tapeout(s, cpu as Address, compiled.netlist, compiled.nIn, compiled.nOut, stepFn);
    setDone({ cpu: cpu as Address, id: r.circuitId, gates: r.gateCount });
    return r;
  });

  const doSubmit = () => app.run('提交到擂台', async (stepFn) => {
    const s = await app.signer();
    return submit(s, app.deployment!.arena!, bounty!.id, done!.cpu, done!.id, bounty!.bond, stepFn);
  });

  const doRegister = () => app.run('登记组件', async (stepFn) => {
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
          [Layers, 'REF（免烧）', compiled.components.length, 'text-gold'],
        ].map(([I, k, v, tone]) => {
          const Icon = I as typeof Square;
          return (
            <div key={k as string} className="rounded-lg bg-substrate/60 py-2.5 ring-1 ring-line">
              <Icon className={cn('mx-auto size-4', tone as string)} />
              <div className={cn('mt-1 font-display text-xl font-extrabold tabular-nums', tone as string)}>{v as number}</div>
              <div className="font-mono text-[11px] text-faint">{k as string}</div>
            </div>
          );
        })}
      </div>
      <p className="m-0 text-[13px] text-pretty text-mute">
        流片会烧掉上面的晶体管（REF 引用的组件不用再烧），得到一枚 ERC-721 电路，链上任何合约都能调用它的 <code>eval</code>。
      </p>
      <label className="block">
        <span className="mb-1.5 flex items-center gap-1.5 font-mono text-xs text-mute"><Cpu className="size-3.5 text-faint" />处理器（CPU）地址</span>
        <Input mono value={cpu} onChange={(e) => setCpu(e.target.value.trim())} placeholder="0x…（TapeOut 官方工厂创建的处理器）" />
        <span className="mt-1.5 block font-mono text-xs text-faint">流片费 {fee !== null ? `${formatEther(fee)} OKB` : '—'} · 晶体管按该 CPU 的价格铸造（X Layer 主网用 BEM 支付）</span>
      </label>
      {!done
        ? <Button size="lg" icon={Factory} disabled={!isAddress(cpu) || circuit.gateCount === 0} onClick={doTapeout}>铸晶体管并流片</Button>
        : <div className="rounded-xl bg-si/[0.06] p-4 ring-1 ring-si-dim">
            <div className="flex items-center gap-2">
              <CircleCheck className="size-5 text-si" /><b className="text-si">已流片</b>
              <span className="font-mono text-sm">电路 #{done.id.toString()} · {done.gates} 门</span>
              <span className="ml-auto font-mono text-xs text-faint">{short(done.cpu)}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {bounty && app.deployment?.arena && (
                <Button icon={Send} disabled={check?.ok === false} onClick={doSubmit}>
                  提交到擂台 #{bounty.id}{bounty.bond > 0n ? `（保证金 ${formatEther(bounty.bond)} OKB）` : ''}
                </Button>
              )}
              {app.deployment?.library && <>
                <Input className="w-40" placeholder="组件名" value={name} onChange={(e) => setName(e.target.value)} />
                <Button variant="ghost" icon={BookmarkPlus} onClick={doRegister}>登记为组件</Button>
              </>}
            </div>
          </div>}
      {bounty && check && !check.ok && <div className="flex items-center gap-1.5 text-[13px] text-danger"><ScanSearch className="size-4" />预检没通过，提交会被合约拒绝：{check.reasons[0]}</div>}
      {!bounty && <div className="flex items-center gap-1.5 text-[13px] text-faint"><Trophy className="size-4" />想参赛？去 <Link to="/">擂台</Link> 选一场，点「去设计」会把目标带过来。</div>}
    </div>
  );
}
