// 内置示例：设计器模板、演示擂台的参考实现与对应的「优化解」。

import { L } from './locale.ts';

export const EXAMPLES: Record<string, { readonly title: string; src: string }> = {
  fullAdder: {
    get title() { return L('一位全加器', 'One-bit full adder'); },
    src: `circuit full_adder
in a, b, cin
out s, cout
wire p
p = a ^ b
s = p ^ cin
cout = (a & b) | (p & cin)
`,
  },
  add4: {
    get title() { return L('4 位行波进位加法器', '4-bit ripple-carry adder'); },
    src: `circuit add4
in a[4], b[4], cin
out s[4], cout
wire c[5]
c[0] = cin
for i in 0..3 {
  s[i] = a[i] ^ b[i] ^ c[i]
  c[i+1] = (a[i] & b[i]) | (c[i] & (a[i] ^ b[i]))
}
cout = c[4]
`,
  },
  cmp4: {
    get title() { return L('4 位无符号比较器（a > b）', '4-bit unsigned comparator (a > b)'); },
    src: `circuit gt4
in a[4], b[4]
out gt
wire g[5]
g[0] = 0
for i in 0..3 {
  // 从低位往高位：本位 a>b 则为真；本位相等则沿用低位结果
  g[i+1] = (a[i] & ~b[i]) | (~(a[i] ^ b[i]) & g[i])
}
gt = g[4]
`,
  },
  counter4: {
    get title() { return L('4 位计数器（寄存器示例）', '4-bit counter (register example)'); },
    src: `circuit counter4
in en
out q[4]
reg r[4]
wire c[5]
c[0] = en
for i in 0..3 {
  r[i] <= r[i] ^ c[i]
  c[i+1] = r[i] & c[i]
}
q = r
`,
  },
  mux4: {
    get title() { return L('4 选 1 多路选择器', '4-to-1 multiplexer'); },
    src: `circuit mux4
in d[4], s[2]
out y
y = s[1] ? (s[0] ? d[3] : d[2]) : (s[0] ? d[1] : d[0])
`,
  },
  popcount3: {
    get title() { return L('3 位人口计数（数 1 的个数）', '3-bit popcount (number of 1s)'); },
    src: `circuit popcount3
in x[3]
out n[2]
wire p
p = x[0] ^ x[1]
n[0] = p ^ x[2]
n[1] = (x[0] & x[1]) | (p & x[2])
`,
  },
  halfAdder: {
    get title() { return L('半加器', 'Half adder'); },
    src: `circuit half_adder
in a, b
out s, c
s = a ^ b
c = a & b
`,
  },
  xorNand: {
    get title() { return L('用 NAND 拼 XOR', 'XOR from NANDs'); },
    src: `circuit xor_nand
in a, b
out y
wire t, u, v
t = nand(a, b)
u = nand(a, t)
v = nand(b, t)
y = nand(u, v)
`,
  },
  majority3: {
    get title() { return L('3 输入多数表决', '3-input majority'); },
    src: `circuit majority3
in a, b, c
out y
y = (a & b) | (b & c) | (a & c)
`,
  },
  parity4: {
    get title() { return L('4 位偶校验', '4-bit even parity'); },
    src: `circuit parity4
in x[4]
out p
p = x[0] ^ x[1] ^ x[2] ^ x[3]
`,
  },
  decoder2: {
    get title() { return L('2–4 译码器', '2-to-4 decoder'); },
    src: `circuit decoder2
in s[2]
out y[4]
y[0] = ~s[1] & ~s[0]
y[1] = ~s[1] &  s[0]
y[2] =  s[1] & ~s[0]
y[3] =  s[1] &  s[0]
`,
  },
  eq4: {
    get title() { return L('4 位相等比较器', '4-bit equality comparator'); },
    src: `circuit eq4
in a[4], b[4]
out eq
wire d[4]
for i in 0..3 {
  d[i] = ~(a[i] ^ b[i])
}
eq = d[0] & d[1] & d[2] & d[3]
`,
  },
  priority4: {
    get title() { return L('4 位优先编码器', '4-bit priority encoder'); },
    src: `circuit priority4
in x[4]
out y[2], valid
// 高位优先：x[3] > x[2] > x[1] > x[0]
valid = x[0] | x[1] | x[2] | x[3]
y[1] = x[3] | x[2]
y[0] = x[3] | (~x[2] & x[1])
`,
  },
  toggle: {
    get title() { return L('T 触发器（寄存器）', 'T flip-flop (register)'); },
    src: `circuit toggle
in t
out q
reg r
r <= t ? ~r : r
q = r
`,
  },
};

/** 直接用 NAND 手写的全加器（9 门，经典最优），用来演示「同样功能、门数更少」。 */
export const FULL_ADDER_NAND9 = `circuit full_adder_nand9
in a, b, cin
out s, cout
wire t1, t2, t3, p, t4, t5, t6
t1 = nand(a, b)
t2 = nand(a, t1)
t3 = nand(b, t1)
p  = nand(t2, t3)
t4 = nand(p, cin)
t5 = nand(p, t4)
t6 = nand(cin, t4)
s  = nand(t5, t6)
cout = nand(t4, t1)
`;
