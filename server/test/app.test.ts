import { describe, expect, it } from 'vitest';
import type { PublicClient } from 'viem';
import { EXAMPLES, FULL_ADDER_NAND9, generateVectors } from '@tapearena/netlist';
import { ChainLibrary } from '@tapearena/chain';
import { createApp } from '../src/app.ts';
import { extractCode, type ChatFn } from '../src/ai.ts';
import { build, challengeHint, precheck } from '@tapearena/chain';
import type { ChainCtx } from '../src/chain.ts';

const offline = new ChainLibrary({} as PublicClient);
const ctx = (): ChainCtx => ({ chainId: 31337, client: {} as PublicClient, lib: offline, deployment: undefined });

function scripted(replies: string[]): ChatFn & { calls: number } {
  const f = Object.assign(async () => replies[Math.min(f.calls++, replies.length - 1)], { calls: 0 });
  return f;
}

const post = (app: ReturnType<typeof createApp>, path: string, data: unknown) =>
  app.request(path, { method: 'POST', body: JSON.stringify(data), headers: { 'content-type': 'application/json' } });

describe('设计器 API', () => {
  const app = createApp({ ctx, chat: scripted(['']) });

  it('编译返回网表与门数', async () => {
    const r = await post(app, '/api/compile', { src: FULL_ADDER_NAND9 });
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.gateCount).toBe(9);
    expect(j.netlist).toMatch(/^0x/);
    expect(j.inputs.map((p: { name: string }) => p.name)).toEqual(['a', 'b', 'cin']);
  });

  it('编译错误带行列号', async () => {
    const r = await post(app, '/api/compile', { src: 'circuit x\nin a\nout y\ny = a & q\n' });
    expect(r.status).toBe(422);
    const j = await r.json();
    expect(j.line).toBe(4);
  });

  it('逐拍仿真计数器', async () => {
    const r = await post(app, '/api/simulate', { src: EXAMPLES.counter4.src, inputs: { en: 1 }, cycles: 5 });
    const j = await r.json();
    expect(j.trace.map((t: { outputs: { q: string } }) => t.outputs.q)).toEqual(['0', '1', '2', '3', '4']);
  });

  it('组合电路仿真：4 位加法器', async () => {
    const r = await post(app, '/api/simulate', { src: EXAMPLES.add4.src, inputs: { a: 9, b: '0x7', cin: 1 } });
    const j = await r.json();
    expect(j.trace[0].outputs).toEqual({ s: '1', cout: '1' });
  });

  it('生成擂台向量：小输入穷举', async () => {
    const j = await (await post(app, '/api/vectors', { src: EXAMPLES.fullAdder.src })).json();
    expect(j.count).toBe(8);
    expect(j.hex.length).toBe(2 + 8 * 2 * 2);
  });

  it('寄存器电路不能当参考', async () => {
    const r = await post(app, '/api/vectors', { src: EXAMPLES.counter4.src });
    expect(r.status).toBe(500);
  });

  it('未部署时擂台接口返回 503', async () => {
    const r = await app.request('/api/bounties');
    expect(r.status).toBe(503);
  });
});

describe('预检与挑战', () => {
  it('作弊电路被向量或参考电路抓出来', async () => {
    const ref = await build(EXAMPLES.fullAdder.src, offline);
    const vectors = generateVectors(ref.circuit, offline).filter((v) => v.inputs[2] === 0); // 只含 cin=0
    const cheat = await build('circuit cheat\nin a, b, cin\nout s, cout\ns = a ^ b\ncout = a & b\n', offline);

    const pc = precheck(cheat.circuit, offline, { nIn: 3, nOut: 2, maxGates: 0, vectors, submissions: [{ gateCount: 9, disqualified: false }] });
    expect(pc.ok).toBe(true); // 向量覆盖不足时能混过 submit
    expect(pc.rankIfSubmitted).toBe(1);

    const hint = challengeHint(cheat.circuit, ref.circuit, offline, vectors);
    expect(hint?.kind).toBe('input');
    expect(hint?.bits?.[2]).toBe(1);
  });

  it('引脚与门数上限', async () => {
    const fa = await build(FULL_ADDER_NAND9, offline);
    const pc = precheck(fa.circuit, offline, { nIn: 3, nOut: 2, maxGates: 8, vectors: [] });
    expect(pc.ok).toBe(false);
    expect(pc.reasons[0]).toContain('上限');
  });
});

describe('AI 设计循环', () => {
  it('提取代码块', () => {
    expect(extractCode('看这里\n```tapehdl\ncircuit a\nin x\nout y\ny = ~x\n```')).toContain('circuit a');
    expect(extractCode('circuit b\nin x\nout y\ny = x\n')).toContain('circuit b');
    expect(extractCode('没有代码')).toBeNull();
  });

  it('编译错误 → 修正 → 优化，保留最优解', async () => {
    const broken = '```tapehdl\ncircuit fa\nin a, b, cin\nout s, cout\ns = a ^ b ^ cin\ncout = oops\n```';
    const wrong = '```tapehdl\ncircuit fa\nin a, b, cin\nout s, cout\ns = a ^ b\ncout = a & b\n```';
    const plain = '```tapehdl\ncircuit fa\nin a, b, cin\nout s, cout\ns = a ^ b ^ cin\ncout = (a & b) | (a & cin) | (b & cin)\n```';
    const nand9 = '```tapehdl\n' + FULL_ADDER_NAND9 + '```';
    const chat = scripted([broken, wrong, plain, nand9, nand9, nand9]);
    const app = createApp({ ctx, chat });

    const r = await post(app, '/api/ai/design', { spec: '一位全加器', referenceSrc: EXAMPLES.fullAdder.src, stream: false, maxRounds: 8 });
    const j = await r.json();
    const attempts = j.events.filter((e: { type: string }) => e.type === 'attempt');
    expect(attempts[0].feedback).toContain('编译错误');
    expect(attempts[1].ok).toBe(false);
    expect(attempts[2].ok).toBe(true);
    expect(attempts[2].gateCount).toBeGreaterThan(9);
    expect(j.best.gateCount).toBe(9);
    expect(chat.calls).toBe(6); // 9 门之后连续两次没进步就停
  });

  it('SSE 流式输出', async () => {
    const app = createApp({ ctx, chat: scripted(['```\n' + FULL_ADDER_NAND9 + '```']) });
    const r = await post(app, '/api/ai/design', { spec: '全加器', referenceSrc: EXAMPLES.fullAdder.src, maxRounds: 2 });
    const text = await r.text();
    expect(text).toContain('event: best');
    expect(text).toContain('event: done');
  });
});
