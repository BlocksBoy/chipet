import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { zeroAddress, type Address } from 'viem';
import { EXAMPLES, FULL_ADDER_NAND9, generateVectors, HdlError, toHex, type Library, type Resolved } from '@tapearena/netlist';
import { bountyPhase, type Bounty } from '@tapearena/chain';
import { bountiesOf, bountyOf, chainCtx, componentsOf, HttpError, resetChainCtx, rpcHostLabel, type ChainCtx } from './chain.ts';
import { build, challengeHint, precheck, simulate, summary, vectorsFor } from '@tapearena/chain';
import { designLoop, openAIChat, petTalk, type ChatFn, type DesignTarget, type PetTalkInput } from './ai.ts';
import {
  ADMIN_SESSION_TTL_SEC, adminTokenConfigured, allowFailAttempt, clearAdminSessionCookie,
  clientIp, createSession, getAdminToken, readAdminSession, requireAdmin, revokeSession,
  sessionValid, setAdminSessionCookie, tokenMatches,
} from './adminAuth.ts';
import { listAdminStatsHistory } from './adminDb.ts';
import { adminStatsPayload, startAdminScanJob } from './adminScanWorker.ts';
import { countWalletUsers, overlayRegisteredStats, registerWallet } from './walletUsers.ts';
import { overlayRechargeStats, recordRecharge } from './rechargeEvents.ts';
import { countArchivedPets, listArchivedPets } from './petArchive.ts';
import { syncChipetPetsFully } from './petSync.ts';

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
  const corsOrigin = process.env.CORS_ORIGIN?.split(',').map((s) => s.trim()).filter(Boolean);
  app.use('*', cors({
    origin: corsOrigin?.length ? corsOrigin : (origin) => origin || '*',
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
  }));

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      const code = err.status === 401 ? 'unauthorized'
        : err.status === 429 ? 'rate_limited'
          : err.status === 503 ? 'admin_disabled'
            : undefined;
      return json(c, { error: err.message, ...(code ? { code } : {}) }, err.status);
    }
    if (err instanceof HdlError) return json(c, { error: err.message, line: err.line, col: err.col }, 422);
    return json(c, { error: err.message }, 500);
  });

  app.get('/api/health', (c) => {
    const x = pick(c);
    return json(c, {
      ok: true,
      chainId: x.chainId,
      deployment: x.deployment ?? null,
      ai: Boolean(process.env.AI_API_KEY) || Boolean(deps.chat),
      admin: adminTokenConfigured(),
    });
  });

  // ---------------------------------------------------------------- 运营后台（ADMIN_TOKEN → HttpOnly 会话）

  app.post('/api/admin/login', async (c) => {
    if (!adminTokenConfigured()) throw new HttpError(503, 'admin is not configured');
    const b = await body<{ token?: string }>(c);
    const token = (b.token ?? '').trim();
    if (!token) throw new HttpError(400, 'token required');
    if (!tokenMatches(getAdminToken(), token)) {
      if (!allowFailAttempt(clientIp(c))) {
        c.header('Retry-After', '900');
        throw new HttpError(429, 'too many failed attempts, try again later');
      }
      throw new HttpError(401, 'invalid admin token');
    }
    const id = createSession();
    setAdminSessionCookie(c, id);
    return json(c, { ok: true, expiresIn: ADMIN_SESSION_TTL_SEC });
  });

  app.post('/api/admin/logout', (c) => {
    revokeSession(readAdminSession(c));
    clearAdminSessionCookie(c);
    return json(c, { ok: true });
  });

  app.get('/api/admin/session', requireAdmin(), (c) =>
    json(c, { ok: true, expiresIn: ADMIN_SESSION_TTL_SEC, session: sessionValid(readAdminSession(c)) }));

  // ---------------------------------------------------------------- 钱包连接注册（公开；新地址计入注册人数）

  app.post('/api/users/register', async (c) => {
    const b = await body<{ address?: string; chainId?: number }>(c);
    need(b.address, 'address');
    const chainId = Number(b.chainId ?? 0);
    try {
      const r = registerWallet(String(b.address), Number.isFinite(chainId) ? chainId : 0);
      return json(c, { ok: true, isNew: r.isNew, registered: r.total });
    } catch (e) {
      throw new HttpError(400, e instanceof Error ? e.message : 'invalid address');
    }
  });

  app.get('/api/users/count', (c) => json(c, { registered: countWalletUsers() }));

  // ---------------------------------------------------------------- 商店充值上报（公开；txHash 去重）

  app.post('/api/recharges/report', async (c) => {
    const b = await body<{
      address?: string;
      chainId?: number;
      txHash?: string;
      amountRaw?: string;
      sku?: string;
    }>(c);
    need(b.address, 'address');
    need(b.txHash, 'txHash');
    need(b.amountRaw, 'amountRaw');
    need(b.chainId, 'chainId');
    try {
      const r = recordRecharge({
        address: String(b.address),
        chainId: Number(b.chainId),
        txHash: String(b.txHash),
        amountRaw: String(b.amountRaw),
        sku: b.sku ? String(b.sku) : undefined,
      });
      const overlay = overlayRechargeStats(Number(b.chainId));
      return json(c, { ok: true, isNew: r.isNew, ...overlay });
    } catch (e) {
      throw new HttpError(400, e instanceof Error ? e.message : 'invalid recharge');
    }
  });

  // 读库 + 任务状态（永不在请求里跑长扫链，避免 Cloudflare/Caddy 502）
  app.get('/api/admin/stats', requireAdmin(), (c) => {
    const chainId = Number(c.req.query('chainId') ?? process.env.CHAIN_ID ?? 196);
    if (chainId !== 196 && chainId !== 56) throw new HttpError(400, 'unsupported chainId');
    const { stats, job } = adminStatsPayload(chainId);
    const reg = overlayRegisteredStats(chainId);
    const recharge = overlayRechargeStats(chainId);
    if (!stats) {
      return json(c, {
        chainId,
        empty: true,
        job,
        // 扫链未完成时也能看注册 / 上报充值
        registered: reg.registered,
        registeredOnChain: reg.registeredOnChain,
        walletRegistered: reg.walletRegistered,
        rechargeUsers: recharge.rechargeUsers,
        rechargeTxs: recharge.rechargeTxs,
        rechargeBem: recharge.rechargeBem,
        reportedTxs: recharge.reportedTxs,
        note: '尚无快照。点「增量入库」启动后台扫链（首次会全量分片）。',
      });
    }
    return json(c, {
      ...stats,
      // 看板「注册人数」= 连钱包 ∪ 扫链孵化地址（去重）
      registered: reg.registered,
      registeredOnChain: reg.registeredOnChain,
      walletRegistered: reg.walletRegistered,
      // 充值 = 历史扫链冻结 + 商店成功上报
      rechargeUsers: recharge.rechargeUsers,
      rechargeTxs: recharge.rechargeTxs,
      rechargeBem: recharge.rechargeBem,
      reportedTxs: recharge.reportedTxs,
      job,
    });
  });

  // 启动后台扫链（立即返回；前端轮询 /api/admin/stats）
  app.post('/api/admin/stats/scan', requireAdmin(), (c) => {
    const chainId = Number(c.req.query('chainId') ?? process.env.CHAIN_ID ?? 196);
    if (chainId !== 196 && chainId !== 56) throw new HttpError(400, 'unsupported chainId');
    const full = c.req.query('full') === '1' || c.req.query('full') === 'true';
    resetChainCtx(chainId);
    const x = ctxOf(chainId);
    if (!x.deployment?.chipet) throw new HttpError(404, 'chipet not deployed on this chain');
    const job = startAdminScanJob({
      chainId,
      full,
      client: x.client,
      chipet: x.deployment.chipet,
      rpcHost: rpcHostLabel(chainId),
    });
    const { stats } = adminStatsPayload(chainId);
    return json(c, { ok: true, job, stats: stats ?? null });
  });

  app.get('/api/admin/stats/history', requireAdmin(), (c) => {
    const chainId = Number(c.req.query('chainId') ?? process.env.CHAIN_ID ?? 196);
    if (chainId !== 196 && chainId !== 56) throw new HttpError(400, 'unsupported chainId');
    const limit = Number(c.req.query('limit') ?? 20);
    return json(c, { chainId, items: listAdminStatsHistory(chainId, Number.isFinite(limit) ? limit : 20) });
  });

  // ---------------------------------------------------------------- 芯宠存档（全量属性落库 + 分页列表）

  app.get('/api/admin/cats', requireAdmin(), (c) => {
    const chainId = Number(c.req.query('chainId') ?? process.env.CHAIN_ID ?? 196);
    if (chainId !== 196 && chainId !== 56) throw new HttpError(400, 'unsupported chainId');
    const page = Number(c.req.query('page') ?? 1);
    const pageSize = Number(c.req.query('pageSize') ?? 20);
    const list = listArchivedPets(chainId, {
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 20,
    });
    return json(c, { chainId, archived: countArchivedPets(chainId), ...list });
  });

  app.post('/api/admin/cats/sync', requireAdmin(), async (c) => {
    const chainId = Number(c.req.query('chainId') ?? process.env.CHAIN_ID ?? 196);
    if (chainId !== 196 && chainId !== 56) throw new HttpError(400, 'unsupported chainId');
    resetChainCtx(chainId);
    const x = ctxOf(chainId);
    if (!x.deployment?.chipet) throw new HttpError(404, 'chipet not deployed on this chain');
    const result = await syncChipetPetsFully(x.client, chainId, x.deployment.chipet);
    return json(c, { ok: true, ...result });
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

  // ---------------------------------------------------------------- AI 芯宠说话

  app.post('/api/ai/pet-talk', async (c) => {
    if (!process.env.AI_API_KEY && !deps.chat) throw new HttpError(503, 'AI 未配置');
    const req = await body<PetTalkInput>(c);
    need(req.name, 'name');
    const line = await petTalk(
      {
        name: String(req.name).slice(0, 32),
        species: req.species ? String(req.species).slice(0, 24) : undefined,
        vibe: req.vibe ? String(req.vibe).slice(0, 24) : undefined,
        rarity: Number(req.rarity) || 0,
        mood: Number(req.mood),
        energy: Number(req.energy),
        intimacy: Number(req.intimacy),
        level: Number(req.level),
        wins: Number(req.wins),
        mine: Boolean(req.mine),
        owner: req.owner ? String(req.owner).slice(0, 32) : undefined,
      },
      deps.chat,
    );
    return json(c, { line });
  });

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
