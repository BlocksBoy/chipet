import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { zeroAddress, type Address } from 'viem';
import { EXAMPLES, FULL_ADDER_NAND9, generateVectors, HdlError, toHex, type Library, type Resolved } from '@tapearena/netlist';
import { bountyPhase, type Bounty } from '@tapearena/chain';
import { bountiesOf, bountyOf, chainCtx, componentsOf, HttpError, type ChainCtx } from './chain.ts';
import { build, challengeHint, precheck, simulate, summary, vectorsFor } from '@tapearena/chain';
import { designLoop, openAIChat, type ChatFn, type DesignTarget } from './ai.ts';

export interface AppDeps {
  ctx?: (chainId?: number) => ChainCtx;
  chat?: ChatFn;
}

const json = (c: Context, data: unknown, status = 200) =>
  c.body(JSON.stringify(data, (_, v) => (typeof v === 'bigint' ? v.toString() : v)), status as 200, { 'content-type': 'application/json' });

function bountyView(b: Bounty) {
  return { ...b, phase: bountyPhase(b), vectorCount: b.vectors.length, vectors: undefined };
}

async function body<T>(c: Context): Promise<T> {
  try { return (await c.req.json()) as T; } catch { throw new HttpError(400, '请求体不是合法 JSON'); }
}

function need(v: unknown, what: string): asserts v {
  if (v === undefined || v === null || v === '') throw new HttpError(400, `缺少参数 ${what}`);
}

export function createApp(deps: AppDeps = {}) {
  const ctxOf = deps.ctx ?? chainCtx;
  const chat = deps.chat ?? openAIChat();
  const pick = (c: Context, b?: { chainId?: number }) => ctxOf(Number(b?.chainId ?? c.req.query('chainId') ?? process.env.CHAIN_ID ?? 196));

  async function loadCircuit(x: ChainCtx, cpu: string, id: bigint | number | string): Promise<Resolved> {
    return x.lib.resolved(cpu as Address, BigInt(id));
  }

  async function candidateOf(x: ChainCtx, b: { src?: string; cpu?: string; circuitId?: string | number }) {
    if (b.src) return (await build(b.src, x.lib)).circuit;
    need(b.cpu, 'src 或 cpu+circuitId');
    need(b.circuitId, 'circuitId');
    return loadCircuit(x, b.cpu, b.circuitId);
  }

  const app = new Hono();
  app.use('*', cors());

  app.onError((err, c) => {
    if (err instanceof HttpError) return json(c, { error: err.message }, err.status);
    if (err instanceof HdlError) return json(c, { error: err.message, line: err.line, col: err.col }, 422);
    return json(c, { error: err.message }, 500);
  });

  app.get('/api/health', (c) => {
    const x = pick(c);
    return json(c, { ok: true, chainId: x.chainId, deployment: x.deployment ?? null, ai: Boolean(process.env.AI_API_KEY) || Boolean(deps.chat) });
  });

  app.get('/api/examples', (c) => json(c, { ...EXAMPLES, fullAdderNand9: { title: '9 门全加器（NAND 手写）', src: FULL_ADDER_NAND9 } }));

  // ---------------------------------------------------------------- 设计器

  app.post('/api/compile', async (c) => {
    const b = await body<{ src: string; chainId?: number }>(c);
    need(b.src, 'src');
    const x = pick(c, b);
    const built = await build(b.src, x.lib);
    return json(c, { ...summary(built.compiled), nState: built.circuit.nState });
  });

  app.post('/api/simulate', async (c) => {
    const b = await body<{ src: string; inputs?: Record<string, unknown> | Record<string, unknown>[]; cycles?: number; state?: string; chainId?: number }>(c);
    need(b.src, 'src');
    const x = pick(c, b);
    const built = await build(b.src, x.lib);
    return json(c, simulate(built, x.lib, b.inputs ?? {}, b.cycles ?? 1, b.state));
  });

  app.post('/api/vectors', async (c) => {
    const b = await body<{ src: string; count?: number; seed?: number; chainId?: number }>(c);
    need(b.src, 'src');
    const x = pick(c, b);
    const built = await build(b.src, x.lib);
    const count = Math.min(Math.max(1, b.count ?? 64), 512);
    return json(c, { ...vectorsFor(built, x.lib, count, b.seed ?? 1), nIn: built.circuit.nIn, nOut: built.circuit.nOut, inputs: built.compiled.inputs, outputs: built.compiled.outputs });
  });

  app.get('/api/circuits/:cpu/:id', async (c) => {
    const x = pick(c);
    const r = await loadCircuit(x, c.req.param('cpu'), c.req.param('id'));
    return json(c, { nIn: r.nIn, nOut: r.nOut, nState: r.nState, gateCount: r.gateCount, netlist: toHex(r.netlist), elements: r.elements.length });
  });

  // ---------------------------------------------------------------- 擂台

  app.get('/api/bounties', async (c) => json(c, (await bountiesOf(pick(c))).map(bountyView)));

  app.get('/api/bounties/:id', async (c) => {
    const b = await bountyOf(pick(c), Number(c.req.param('id')));
    return json(c, { ...b, phase: bountyPhase(b) });
  });

  app.post('/api/bounties/:id/precheck', async (c) => {
    const req = await body<{ src?: string; cpu?: string; circuitId?: string; chainId?: number }>(c);
    const x = pick(c, req);
    const b = await bountyOf(x, Number(c.req.param('id')));
    const cand = await candidateOf(x, req);
    return json(c, { phase: bountyPhase(b), ...precheck(cand, x.lib, b) });
  });

  app.get('/api/bounties/:id/submissions/:index/challenge', async (c) => {
    const x = pick(c);
    const b = await bountyOf(x, Number(c.req.param('id')));
    const s = b.submissions[Number(c.req.param('index'))];
    if (!s) throw new HttpError(404, '没有这条提交');
    if (s.disqualified) return json(c, { hint: null, reason: '已被取消资格' });
    const cand = await loadCircuit(x, s.cpu, s.circuitId);
    const ref = b.refCpu !== zeroAddress ? await loadCircuit(x, b.refCpu, b.refId) : null;
    const hint = challengeHint(cand, ref, x.lib, b.vectors);
    return json(c, { hint, reason: hint ? undefined : '没有找到反例：这条提交在已知范围内与参考一致' });
  });

  // ---------------------------------------------------------------- 组件库

  app.get('/api/components', async (c) => json(c, await componentsOf(pick(c))));

  // ---------------------------------------------------------------- AI 设计

  app.post('/api/ai/design', async (c) => {
    const req = await body<{
      spec: string; inputs?: DesignTarget['inputs']; outputs?: DesignTarget['outputs']; maxGates?: number;
      referenceSrc?: string; bountyId?: number; seed?: string; maxRounds?: number; chainId?: number; stream?: boolean;
    }>(c);
    need(req.spec, 'spec');
    const x = pick(c, req);
    const lib: Library = x.lib;
    const t: DesignTarget = { spec: req.spec, inputs: req.inputs, outputs: req.outputs, maxGates: req.maxGates, seed: req.seed };

    if (req.bountyId !== undefined) {
      const b = await bountyOf(x, req.bountyId);
      Object.assign(t, {
        nIn: b.nIn, nOut: b.nOut, vectors: b.vectors, maxGates: b.maxGates || t.maxGates,
        inputs: t.inputs ?? b.meta.inputs, outputs: t.outputs ?? b.meta.outputs,
        reference: b.refCpu !== zeroAddress ? await loadCircuit(x, b.refCpu, b.refId) : null,
      });
      if (!t.spec.includes(b.meta.title)) t.spec = `${b.meta.title}：${b.meta.description ?? ''}\n${t.spec}`;
    } else if (req.referenceSrc) {
      const ref = await build(req.referenceSrc, lib);
      Object.assign(t, {
        nIn: ref.circuit.nIn, nOut: ref.circuit.nOut, inputs: t.inputs ?? ref.compiled.inputs, outputs: t.outputs ?? ref.compiled.outputs,
        reference: ref.circuit.nState ? null : ref.circuit,
        vectors: ref.circuit.nState ? undefined : generateVectors(ref.circuit, lib, { count: 64 }),
      });
    }

    const rounds = Math.min(Math.max(1, req.maxRounds ?? 6), 12);
    if (req.stream === false) {
      const events = [];
      for await (const e of designLoop(t, lib, chat, rounds)) events.push(e);
      return json(c, { events, best: (events.at(-1) as { best?: unknown })?.best ?? null });
    }
    return streamSSE(c, async (s) => {
      for await (const e of designLoop(t, lib, chat, rounds)) await s.writeSSE({ event: e.type, data: JSON.stringify(e) });
    });
  });

  return app;
}
