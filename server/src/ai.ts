// AI 电路设计助手：大模型写 TapeHDL → 本地编译 → 跑测试向量 / 找反例 → 把错误喂回去重写；
// 正确之后继续逼它减少门数，始终保留最优正确解。任何 OpenAI 兼容接口都可以接。

import { evaluate, findCounterexample, HdlError, packBits, unpackBits, type Library, type Resolved, type Vector } from '@tapearena/netlist';
import { build, describe, precheck, summary, type Built } from '@tapearena/chain';

export const HDL_GUIDE = `TapeHDL 语法（编译成纯 NAND 网表，门数 = NAND + LATCH 数量，REF 组件按其递归门数计）
circuit 名字                     # 第一行
in a[4], b[4], cin               # 输入，按声明顺序排成引脚，向量低位在前
out s[4], cout                   # 输出
wire t, c[5]                     # 中间信号（每位只能赋值一次）
reg q[4]                         # 寄存器（LATCH），q <= expr 指定下一拍的值；擂台只接受纯组合逻辑，不要用 reg
use FA = 0x<40位十六进制地址>#7   # 引用已流片电路作为黑盒组件，FA(x, y, z) 返回其输出位向量
(s[0], c[1]) = FA(a[0], b[0], c[0])  # 解构赋值
for i in 0..3 { ... }            # 闭区间循环，下标可写 i+1、i*2 等
运算：~x !x 取反；& | ^；三元 c ? x : y（c 必须 1 位）；内建 nand(a,b) nor xnor and or xor not mux(s,x,y)=s?x:y
切片 a[0..3]，字面量 0 1 0b1010；向量运算逐位进行，宽度 1 的操作数自动广播；注释用 //
代价参考：nand 1 门，not 1 门，and 2 门，or 3 门，xor 4 门，mux 4 门（编译器会做常量折叠、公共子表达式合并、双重取反消除）。
想省门就直接用 nand() 手写并复用中间信号，例如 9 个 NAND 的全加器：
  t1 = nand(a, b)  t2 = nand(a, t1)  t3 = nand(b, t1)  p = nand(t2, t3)
  t4 = nand(p, cin)  t5 = nand(p, t4)  t6 = nand(cin, t4)  s = nand(t5, t6)  cout = nand(t4, t1)`;

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }
export type ChatFn = (messages: ChatMessage[]) => Promise<string>;

export function openAIChat(opts = {
  baseUrl: process.env.AI_BASE_URL ?? 'https://api.openai.com/v1',
  apiKey: process.env.AI_API_KEY ?? '',
  model: process.env.AI_MODEL ?? 'gpt-4o-mini',
}): ChatFn {
  return async (messages) => {
    if (!opts.apiKey) throw new Error('未配置 AI_API_KEY');
    const res = await fetch(`${opts.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${opts.apiKey}` },
      body: JSON.stringify({ model: opts.model, messages, temperature: 0.2 }),
    });
    if (!res.ok) throw new Error(`AI 接口返回 ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return j.choices?.[0]?.message?.content ?? '';
  };
}

/** 取回复里最后一个代码块；没有代码块时把以 circuit 开头的部分当源码。 */
export function extractCode(reply: string): string | null {
  const blocks = [...reply.matchAll(/```[a-zA-Z]*\n([\s\S]*?)```/g)].map((m) => m[1]);
  const pick = blocks.reverse().find((b) => /^\s*circuit\s+\w+/m.test(b)) ?? blocks[0];
  if (pick) return pick.trim() + '\n';
  const i = reply.search(/^circuit\s+\w+/m);
  return i >= 0 ? reply.slice(i).trim() + '\n' : null;
}

export interface DesignTarget {
  /** 自然语言需求 */
  spec: string;
  /** 期望的引脚（来自擂台元数据），可选 */
  inputs?: { name: string; width: number }[];
  outputs?: { name: string; width: number }[];
  nIn?: number;
  nOut?: number;
  /** 判定标准：测试向量（必须全过）与可选参考电路（用来找向量外的反例） */
  vectors?: Vector[];
  reference?: Resolved | null;
  maxGates?: number;
  /** 起点代码（比如用户当前编辑器里的版本） */
  seed?: string;
}

export type DesignEvent =
  | { type: 'attempt'; round: number; phase: 'correct' | 'optimize'; code: string | null; ok: boolean; gateCount?: number; feedback: string }
  | { type: 'best'; round: number; code: string; gateCount: number; result: ReturnType<typeof summary> }
  | { type: 'done'; best: { code: string; gateCount: number; result: ReturnType<typeof summary> } | null; rounds: number }
  | { type: 'error'; message: string };

function pinsText(t: DesignTarget): string {
  const f = (ps?: { name: string; width: number }[]) => ps?.map((p) => (p.width > 1 ? `${p.name}[${p.width}]` : p.name)).join(', ');
  const parts: string[] = [];
  if (t.inputs?.length) parts.push(`输入引脚（顺序固定）：${f(t.inputs)}`);
  else if (t.nIn) parts.push(`输入共 ${t.nIn} 位`);
  if (t.outputs?.length) parts.push(`输出引脚（顺序固定）：${f(t.outputs)}`);
  else if (t.nOut) parts.push(`输出共 ${t.nOut} 位`);
  return parts.join('\n');
}

function vectorSample(t: DesignTarget, built?: Built): string {
  if (!t.vectors?.length) return '';
  const pins = built?.compiled ?? (t.inputs && t.outputs ? { inputs: t.inputs, outputs: t.outputs } : null);
  const rows = t.vectors.slice(0, 12).map((v) =>
    pins ? JSON.stringify(describe(pins, v)) : `${v.inputs.join('')} -> ${v.outputs.join('')}`);
  return `\n部分测试向量（共 ${t.vectors.length} 条，全部通过才算正确）：\n${rows.join('\n')}`;
}

/** 编译并判定一份代码，返回给模型看的反馈。 */
export async function judge(code: string, t: DesignTarget, lib: Library) {
  let built: Built;
  try {
    built = await build(code, lib);
  } catch (e) {
    const msg = e instanceof HdlError ? `编译错误（第 ${e.line} 行第 ${e.col} 列）：${e.message}` : `编译错误：${(e as Error).message}`;
    return { ok: false as const, feedback: msg };
  }
  const c = built.circuit;
  const nIn = t.nIn ?? t.inputs?.reduce((s, p) => s + p.width, 0);
  const nOut = t.nOut ?? t.outputs?.reduce((s, p) => s + p.width, 0);
  if (t.vectors?.length && nIn !== undefined && nOut !== undefined) {
    const pc = precheck(c, lib, { nIn, nOut, maxGates: t.maxGates ?? 0, vectors: t.vectors });
    if (!pc.ok) {
      const fails = pc.report.failures.slice(0, 4).map((f) => {
        const d = describe(built.compiled, { inputs: f.inputs, outputs: f.expected });
        const a = describe(built.compiled, { inputs: f.inputs, outputs: f.actual });
        return `输入 ${JSON.stringify(d.inputs)} 期望 ${JSON.stringify(d.outputs)} 实际 ${JSON.stringify(a.outputs)}`;
      });
      return { ok: false as const, built, feedback: [...pc.reasons, ...fails].join('\n') };
    }
  } else if (nIn !== undefined && nOut !== undefined && (c.nIn !== nIn || c.nOut !== nOut)) {
    return { ok: false as const, built, feedback: `引脚不符：需要 ${nIn} 入 ${nOut} 出，实际 ${c.nIn} 入 ${c.nOut} 出` };
  }
  if (t.reference) {
    if (c.nState) return { ok: false as const, built, feedback: '电路含寄存器，擂台只接受组合逻辑' };
    if (c.nIn !== t.reference.nIn || c.nOut !== t.reference.nOut) {
      return { ok: false as const, built, feedback: `引脚不符：需要 ${t.reference.nIn} 入 ${t.reference.nOut} 出，实际 ${c.nIn} 入 ${c.nOut} 出` };
    }
    const bits = findCounterexample(c, t.reference, lib, { tries: 4000 });
    if (bits) {
      const exp = unpackBits(evaluate(t.reference, packBits(bits), lib), c.nOut);
      const act = unpackBits(evaluate(c, packBits(bits), lib), c.nOut);
      const d = describe(built.compiled, { inputs: bits, outputs: exp });
      const a = describe(built.compiled, { inputs: bits, outputs: act });
      return { ok: false as const, built, feedback: `与参考电路不一致：输入 ${JSON.stringify(d.inputs)} 期望 ${JSON.stringify(d.outputs)} 实际 ${JSON.stringify(a.outputs)}` };
    }
  }
  return { ok: true as const, built, feedback: `正确，门数 ${c.gateCount}` };
}

export async function* designLoop(t: DesignTarget, lib: Library, chat: ChatFn, maxRounds = 6): AsyncGenerator<DesignEvent> {
  const sys: ChatMessage = {
    role: 'system',
    content: `你是数字电路设计专家，用 TapeHDL 设计电路，目标是功能正确且 NAND 门数尽量少。\n${HDL_GUIDE}\n每次只输出一个 \`\`\`tapehdl 代码块，代码块外最多两句说明。`,
  };
  const task = [`需求：${t.spec}`, pinsText(t), t.maxGates ? `门数上限 ${t.maxGates}` : '', vectorSample(t)].filter(Boolean).join('\n');
  const msgs: ChatMessage[] = [sys, { role: 'user', content: t.seed ? `${task}\n\n从这份代码出发：\n\`\`\`tapehdl\n${t.seed}\`\`\`` : task }];

  let best: { code: string; gateCount: number; result: ReturnType<typeof summary> } | null = null;
  let stale = 0;
  let round = 0;
  for (round = 1; round <= maxRounds; round++) {
    const phase = best ? 'optimize' : 'correct';
    let reply: string;
    try {
      reply = await chat(msgs);
    } catch (e) {
      yield { type: 'error', message: (e as Error).message };
      break;
    }
    msgs.push({ role: 'assistant', content: reply });
    const code = extractCode(reply);
    if (!code) {
      const feedback = '没有找到代码块，请输出完整的 ```tapehdl 代码块';
      yield { type: 'attempt', round, phase, code: null, ok: false, feedback };
      msgs.push({ role: 'user', content: feedback });
      continue;
    }
    const j = await judge(code, t, lib);
    const gateCount = j.built?.circuit.gateCount;
    yield { type: 'attempt', round, phase, code, ok: j.ok, gateCount, feedback: j.feedback };

    if (j.ok && j.built && (!best || j.built.circuit.gateCount < best.gateCount)) {
      best = { code, gateCount: j.built.circuit.gateCount, result: summary(j.built.compiled) };
      stale = 0;
      yield { type: 'best', round, ...best };
    } else if (best) {
      stale++;
    }
    if (best && stale >= 2) break;

    const next = !j.ok
      ? `${j.feedback}\n请修正后输出完整代码。${best ? `（当前最优正确解 ${best.gateCount} 门，修不好可以换思路）` : ''}`
      : best && j.built && j.built.circuit.gateCount > best.gateCount
        ? `正确但 ${j.built.circuit.gateCount} 门，不如之前的 ${best.gateCount} 门。在 ${best.gateCount} 门的版本基础上继续减少门数。`
        : `正确，${best!.gateCount} 门。请在保持功能不变的前提下进一步减少门数（复用中间信号、直接用 nand 手写、消去冗余取反）。`;
    msgs.push({ role: 'user', content: next });
  }
  yield { type: 'done', best, rounds: Math.min(round, maxRounds) };
}
