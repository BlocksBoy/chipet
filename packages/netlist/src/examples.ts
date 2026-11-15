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
