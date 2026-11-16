import { describe, expect, it } from 'vitest';
import {
  compile, decode, encode, evaluate, step, resolveData, validate, Library, packBits, unpackBits,
  intToBits, bitsToInt, pinsToBits, generateVectors, checkVectors, encodeVectors, decodeVectors,
  findCounterexample, EXAMPLES, FULL_ADDER_NAND9, HdlError,
} from '../src/index.ts';

const run = (src: string, lib: Library | null = null) => {
  const r = compile(src, lib ? { components: { get: (c, i) => lib.get(c, i), gateCountOf: (c, i) => lib.resolve(c, i).gateCount } } : {});
  expect(validate(r.netlist, r.nIn, r.nOut)).toBeNull();
  return { r, c: resolveData(r, lib) };
};

describe('format', () => {
  it('encode/decode 往返一致', () => {
    const els = [
      { op: 'nand' as const, a: 2, b: 3 },
      { op: 'latch' as const, d: 4 },
      { op: 'ref' as const, cpu: '0x' + 'ab'.repeat(20), cid: 77n, rIn: 2, rOut: 1, inputs: [2, 3] },
    ];
    expect(decode(encode(els))).toEqual(els);
  });
  it('拒绝引用未来信号', () => {
    expect(validate(encode([{ op: 'nand', a: 2, b: 5 }]), 2, 1)).toMatch(/future/);
  });
});

describe('HDL 编译与仿真', () => {
  it('全加器真值表正确', () => {
    const { c } = run(EXAMPLES.fullAdder.src);
    for (let x = 0; x < 8; x++) {
      const [a, b, cin] = intToBits(x, 3);
      const [s, cout] = unpackBits(evaluate(c, packBits([a, b, cin]), null), 2);
      expect(s + 2 * cout).toBe(a + b + cin);
    }
  });

  it('手写 NAND 全加器正好 9 门，HDL 版不超过 12 门', () => {
    const hand = run(FULL_ADDER_NAND9);
    expect(hand.r.gateCount).toBe(9);
    const hdl = run(EXAMPLES.fullAdder.src);
    expect(hdl.r.gateCount).toBeLessThanOrEqual(12);
  });

  it('4 位加法器穷举 512 种输入', () => {
    const { r, c } = run(EXAMPLES.add4.src);
    expect(r.nIn).toBe(9);
    expect(r.nOut).toBe(5);
    for (let a = 0; a < 16; a++) for (let b = 0; b < 16; b++) for (let cin = 0; cin < 2; cin++) {
      const out = unpackBits(evaluate(c, packBits(pinsToBits(r.inputs, { a, b, cin })), null), 5);
      expect(Number(bitsToInt(out))).toBe(a + b + cin);
    }
  });

  it('比较器与多路选择器', () => {
    const gt = run(EXAMPLES.cmp4.src);
    for (let a = 0; a < 16; a++) for (let b = 0; b < 16; b++) {
      expect(unpackBits(evaluate(gt.c, packBits(pinsToBits(gt.r.inputs, { a, b })), null), 1)[0]).toBe(a > b ? 1 : 0);
    }
    const mx = run(EXAMPLES.mux4.src);
    for (let d = 0; d < 16; d++) for (let s = 0; s < 4; s++) {
      expect(unpackBits(evaluate(mx.c, packBits(pinsToBits(mx.r.inputs, { d, s })), null), 1)[0]).toBe((d >> s) & 1);
    }
  });

  it('寄存器计数器逐拍累加', () => {
    const { r, c } = run(EXAMPLES.counter4.src);
    expect(r.nLatch).toBe(4);
    expect(() => evaluate(c, packBits([1]), null)).toThrow(/latch/);
    let state = new Uint8Array(1);
    for (let t = 1; t <= 20; t++) {
      const res = step(c, state, packBits([1]), null);
      state = res.state;
      // 输出是本拍之前的寄存器值
      expect(Number(bitsToInt(unpackBits(res.outputs, 4)))).toBe((t - 1) % 16);
    }
  });

  it('输出直接连输入或常量时插入缓冲门', () => {
    const { r, c } = run(`in a, b\nout x, y, one, zero\nx = b\ny = a\none = 1\nzero = 0`);
    expect(r.gateCount).toBe(2 + 2 + 1 + 1);
    for (let v = 0; v < 4; v++) {
      const [a, b] = intToBits(v, 2);
      expect(unpackBits(evaluate(c, packBits([a, b]), null), 4)).toEqual([b, a, 1, 0]);
    }
  });

  it('REF 组件：用已流片的全加器拼 4 位加法器', () => {
    const lib = new Library();
    const cpu = '0x' + '11'.repeat(20);
    const fa = compile(FULL_ADDER_NAND9);
    lib.set(cpu, 5n, fa);
    const src = `circuit add4_ref
use FA = ${cpu}#5
in a[4], b[4], cin
out s[4], cout
wire c[5]
c[0] = cin
for i in 0..3 {
  (s[i], c[i+1]) = FA(a[i], b[i], c[i])
}
cout = c[4]
`;
    const { r, c } = run(src, lib);
    expect(r.components).toHaveLength(1);
    // 4 个 FA + s[0..2] 各 2 门缓冲；最后一个 FA 的 (s[3], cout) 恰好是网表末尾两个信号，免缓冲
    expect(r.gateCount).toBe(4 * 9 + 6);
    for (let a = 0; a < 16; a++) for (let b = 0; b < 16; b++) {
      const out = unpackBits(evaluate(c, packBits(pinsToBits(r.inputs, { a, b, cin: 0 })), lib), 5);
      expect(Number(bitsToInt(out))).toBe(a + b);
    }
  });

  it('编译错误带行列号', () => {
    expect(() => compile('in a\nout y\ny = a & q')).toThrow(HdlError);
    try { compile('in a\nout y\ny = a & q'); } catch (e) { expect((e as HdlError).line).toBe(3); }
  });

  it('全部内置示例可编译', () => {
    for (const [k, ex] of Object.entries(EXAMPLES)) {
      expect(() => compile(ex.src), k).not.toThrow();
    }
  });
});

describe('测试向量', () => {
  it('参考电路生成向量，优化解通过，错误解被抓到', () => {
    const ref = run(EXAMPLES.fullAdder.src).c;
    const vs = generateVectors(ref, null);
    expect(vs).toHaveLength(8);
    const blob = encodeVectors(3, 2, vs);
    expect(decodeVectors(3, 2, blob)).toEqual(vs);
    const good = run(FULL_ADDER_NAND9).c;
    expect(checkVectors(good, null, vs).passed).toBe(8);
    const bad = run('in a, b, cin\nout s, cout\ns = a ^ b ^ cin\ncout = a & b').c;
    expect(checkVectors(bad, null, vs).passed).toBeLessThan(8);
    expect(findCounterexample(bad, ref, null)).not.toBeNull();
    expect(findCounterexample(good, ref, null)).toBeNull();
  });
});
