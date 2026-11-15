// TapeHDL：一门很小的硬件描述语言，编译成 TapeOut 网表（只用 NAND / LATCH / REF）。
//
//   circuit add4
//   in a[4], b[4], cin
//   out s[4], cout
//   wire c[5]
//   c[0] = cin
//   for i in 0..3 {
//     s[i] = a[i] ^ b[i] ^ c[i]
//     c[i+1] = (a[i] & b[i]) | (c[i] & (a[i] ^ b[i]))
//   }
//   cout = c[4]
//
// 运算：~ ! & | ^  三元 s ? x : y  内建 nand() nor() xnor() mux()  切片 a[0..3]  字面量 0 1 0b1010
// 时序：reg q[4] 声明寄存器（LATCH），q <= expr 指定下一周期的值。
// 组件：use FA = 0xCPU地址#电路号，之后 FA(x, y, z) 返回其输出向量，(s, co) = FA(...) 解构赋值。
// 向量运算逐位进行，宽度 1 的操作数自动广播。引脚顺序 = 声明顺序，向量低位在前。

import { encode, type Element } from './format.ts';
import type { RefSource } from './vm.ts';
import { L } from './locale.ts';

// ------------------------------------------------------------------ 词法

type TokKind = 'id' | 'num' | 'addr' | 'op' | 'nl' | 'eof';
interface Tok { kind: TokKind; text: string; line: number; col: number }

export class HdlError extends Error {
  constructor(msg: string, public line: number, public col: number) {
    super(L(`第 ${line} 行第 ${col} 列：${msg}`, `Line ${line}, col ${col}: ${msg}`));
  }
}

/** 报错里展示的记号文本：文件结尾与换行没有可见字符。 */
const shown = (t: Tok) => (t.kind === 'eof' ? L('文件结尾', 'end of file') : t.text === '\n' ? L('换行', 'end of line') : t.text);

const OPS = ['<=', '..', '(', ')', '[', ']', '{', '}', ',', '=', '~', '!', '&', '|', '^', '?', ':', '+', '-', '*', '/', '%', '#'];

function lex(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0, line = 1, col = 1;
  const push = (kind: TokKind, text: string, l: number, c: number) => toks.push({ kind, text, line: l, col: c });
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\n') { push('nl', '\n', line, col); i++; line++; col = 1; continue; }
    if (ch === ' ' || ch === '\t' || ch === '\r') { i++; col++; continue; }
    if (ch === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (ch === ';') { push('nl', ';', line, col); i++; col++; continue; }
    const l = line, c = col;
    if (/[0-9]/.test(ch)) {
      let j = i;
      if (src.startsWith('0x', i) && /[0-9a-fA-F]{40}/.test(src.slice(i + 2, i + 42))) {
        j = i + 42;
        push('addr', src.slice(i, j), l, c);
      } else if (src.startsWith('0b', i)) {
        j = i + 2;
        while (j < src.length && /[01_]/.test(src[j])) j++;
        push('num', src.slice(i, j), l, c);
      } else {
        while (j < src.length && /[0-9]/.test(src[j])) j++;
        push('num', src.slice(i, j), l, c);
      }
      col += j - i; i = j; continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      push('id', src.slice(i, j), l, c);
      col += j - i; i = j; continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new HdlError(L(`无法识别的字符 '${ch}'`, `Unrecognized character '${ch}'`), l, c);
    push('op', op, l, c);
    i += op.length; col += op.length;
  }
  push('eof', '', line, col);
  return toks;
}

// ------------------------------------------------------------------ 语法树

type IExpr =
  | { k: 'int'; v: number }
  | { k: 'var'; name: string; t: Tok }
  | { k: 'bin'; op: string; a: IExpr; b: IExpr };

type Index = { lo: IExpr; hi?: IExpr };

type Expr =
  | { k: 'lit'; bits: number[]; t: Tok }
  | { k: 'ref'; name: string; index?: Index; t: Tok }
  | { k: 'not'; a: Expr }
  | { k: 'bin'; op: '&' | '|' | '^'; a: Expr; b: Expr }
  | { k: 'mux'; s: Expr; a: Expr; b: Expr }
  | { k: 'call'; name: string; args: Expr[]; index?: Index; t: Tok };

interface Decl { name: string; width?: IExpr; t: Tok }
interface LVal { name: string; index?: Index; t: Tok }

type Stmt =
  | { k: 'decl'; kind: 'in' | 'out' | 'wire' | 'reg'; decls: Decl[] }
  | { k: 'use'; name: string; cpu: string; cid: bigint; t: Tok }
  | { k: 'for'; v: string; from: IExpr; to: IExpr; body: Stmt[]; t: Tok }
  | { k: 'assign'; lhs: LVal[]; rhs: Expr; latch: boolean; t: Tok };

class Parser {
  p = 0;
  constructor(private toks: Tok[]) {}
  peek(o = 0) { return this.toks[this.p + o]; }
  next() { return this.toks[this.p++]; }
  is(text: string) { const t = this.peek(); return (t.kind === 'op' || t.kind === 'id') && t.text === text; }
  eat(text: string) {
    const t = this.next();
    if (t.text !== text) throw new HdlError(L(`应为 '${text}'，实际是 '${shown(t)}'`, `Expected '${text}', got '${shown(t)}'`), t.line, t.col);
    return t;
  }
  id() {
    const t = this.next();
    if (t.kind !== 'id') throw new HdlError(L(`应为名字，实际是 '${shown(t)}'`, `Expected a name, got '${shown(t)}'`), t.line, t.col);
    return t;
  }
  skipNl() { while (this.peek().kind === 'nl') this.p++; }
  endStmt() {
    const t = this.peek();
    if (t.kind === 'nl') { this.skipNl(); return; }
    if (t.kind === 'eof' || t.text === '}') return;
    throw new HdlError(L(`语句后多余的 '${t.text}'`, `Unexpected '${t.text}' after the statement`), t.line, t.col);
  }

  program(): { name: string; body: Stmt[] } {
    this.skipNl();
    let name = 'circuit';
    if (this.is('circuit')) { this.next(); name = this.id().text; this.endStmt(); }
    const body = this.stmts(false);
    return { name, body };
  }

  stmts(inBlock: boolean): Stmt[] {
    const out: Stmt[] = [];
    this.skipNl();
    while (this.peek().kind !== 'eof' && !(inBlock && this.is('}'))) {
      out.push(this.stmt());
      this.skipNl();
    }
    return out;
  }

  stmt(): Stmt {
    const t = this.peek();
    if (t.kind === 'id' && ['in', 'out', 'wire', 'reg'].includes(t.text)) {
      this.next();
      const decls: Decl[] = [];
      do {
        const n = this.id();
        let width: IExpr | undefined;
        if (this.is('[')) { this.next(); width = this.iexpr(); this.eat(']'); }
        decls.push({ name: n.text, width, t: n });
      } while (this.is(',') && this.next());
      this.endStmt();
      return { k: 'decl', kind: t.text as 'in', decls };
    }
    if (t.kind === 'id' && t.text === 'use') {
      this.next();
      const n = this.id();
      this.eat('=');
      const a = this.next();
      if (a.kind !== 'addr') throw new HdlError(L('use 需要 0x 开头的 40 位处理器地址', 'use needs a processor address: 0x followed by 40 hex digits'), a.line, a.col);
      this.eat('#');
      const c = this.next();
      if (c.kind !== 'num') throw new HdlError(L('use 需要 #电路号', 'use needs a #circuit-id'), c.line, c.col);
      this.endStmt();
      return { k: 'use', name: n.text, cpu: a.text, cid: BigInt(c.text), t: n };
    }
    if (t.kind === 'id' && t.text === 'for') {
      this.next();
      const v = this.id().text;
      this.eat('in');
      const from = this.iexpr();
      this.eat('..');
      const to = this.iexpr();
      this.skipNl();
      this.eat('{');
      const body = this.stmts(true);
      this.eat('}');
      this.endStmt();
      return { k: 'for', v, from, to, body, t };
    }
    let lhs: LVal[];
    if (this.is('(')) {
      this.next();
      lhs = [this.lval()];
      while (this.is(',')) { this.next(); lhs.push(this.lval()); }
      this.eat(')');
    } else {
      lhs = [this.lval()];
    }
    const op = this.next();
    if (op.text !== '=' && op.text !== '<=') throw new HdlError(L(`应为 '=' 或 '<='，实际是 '${shown(op)}'`, `Expected '=' or '<=', got '${shown(op)}'`), op.line, op.col);
    const rhs = this.expr();
    this.endStmt();
    return { k: 'assign', lhs, rhs, latch: op.text === '<=', t: op };
  }

  lval(): LVal {
    const n = this.id();
    return { name: n.text, index: this.index(), t: n };
  }

  index(): Index | undefined {
    if (!this.is('[')) return undefined;
    this.next();
    const lo = this.iexpr();
    let hi: IExpr | undefined;
    if (this.is('..')) { this.next(); hi = this.iexpr(); }
    this.eat(']');
    return { lo, hi };
  }

  iexpr(): IExpr {
    let a = this.iterm();
    while (this.is('+') || this.is('-')) { const op = this.next().text; a = { k: 'bin', op, a, b: this.iterm() }; }
    return a;
  }
  iterm(): IExpr {
    let a = this.iatom();
    while (this.is('*') || this.is('/') || this.is('%')) { const op = this.next().text; a = { k: 'bin', op, a, b: this.iatom() }; }
    return a;
  }
  iatom(): IExpr {
    const t = this.next();
    if (t.kind === 'num' && !t.text.startsWith('0b')) return { k: 'int', v: Number(t.text) };
    if (t.kind === 'id') return { k: 'var', name: t.text, t };
    if (t.text === '(') { const e = this.iexpr(); this.eat(')'); return e; }
    throw new HdlError(L(`下标里应为整数表达式，实际是 '${shown(t)}'`, `Expected an integer expression in the index, got '${shown(t)}'`), t.line, t.col);
  }

  expr(): Expr {
    const s = this.or();
    if (this.is('?')) {
      this.next();
      const a = this.expr();
      this.eat(':');
      const b = this.expr();
      return { k: 'mux', s, a, b };
    }
    return s;
  }
  or(): Expr { let a = this.xor(); while (this.is('|')) { this.next(); a = { k: 'bin', op: '|', a, b: this.xor() }; } return a; }
  xor(): Expr { let a = this.and(); while (this.is('^')) { this.next(); a = { k: 'bin', op: '^', a, b: this.and() }; } return a; }
  and(): Expr { let a = this.unary(); while (this.is('&')) { this.next(); a = { k: 'bin', op: '&', a, b: this.unary() }; } return a; }
  unary(): Expr {
    if (this.is('~') || this.is('!')) { this.next(); return { k: 'not', a: this.unary() }; }
    return this.primary();
  }
  primary(): Expr {
    const t = this.next();
    if (t.text === '(') { const e = this.expr(); this.eat(')'); return e; }
    if (t.kind === 'num') {
      if (t.text.startsWith('0b')) {
        const digits = t.text.slice(2).replace(/_/g, '');
        if (!digits) throw new HdlError(L('空的二进制字面量', 'Empty binary literal'), t.line, t.col);
        return { k: 'lit', bits: [...digits].reverse().map(Number), t };
      }
      if (t.text !== '0' && t.text !== '1') throw new HdlError(L('信号字面量只能是 0、1 或 0b…', 'A signal literal must be 0, 1 or 0b…'), t.line, t.col);
      return { k: 'lit', bits: [Number(t.text)], t };
    }
    if (t.kind === 'id') {
      if (this.is('(')) {
        this.next();
        const args: Expr[] = [];
        if (!this.is(')')) {
          args.push(this.expr());
          while (this.is(',')) { this.next(); args.push(this.expr()); }
        }
        this.eat(')');
        return { k: 'call', name: t.text, args, index: this.index(), t };
      }
      return { k: 'ref', name: t.text, index: this.index(), t };
    }
    throw new HdlError(L(`意外的 '${shown(t)}'`, `Unexpected '${shown(t)}'`), t.line, t.col);
  }
}

// ------------------------------------------------------------------ 门级图

// 节点号：0 = 常量 0，1 = 常量 1，2.. = 输入引脚与元件（由 Graph 分配）
type Node =
  | { t: 'const' }
  | { t: 'in'; pin: number }
  | { t: 'nand'; a: number; b: number }
  | { t: 'latch'; d: number }
  | { t: 'ref'; comp: number; inputs: number[] }
  | { t: 'refout'; ref: number; k: number };

interface Component { name: string; cpu: string; cid: bigint; nIn: number; nOut: number; gateCount: number }

class Graph {
  nodes: Node[] = [{ t: 'const' }, { t: 'const' }];
  private hash = new Map<string, number>();

  input(pin: number): number { this.nodes.push({ t: 'in', pin }); return this.nodes.length - 1; }

  nand(a: number, b: number): number {
    if (a === 0 || b === 0) return 1;
    if (a === 1) return this.not(b);
    if (b === 1) return this.not(a);
    const x = Math.min(a, b), y = Math.max(a, b);
    // NAND(x, NOT x) = 1
    const na = this.nodes[x], nb = this.nodes[y];
    if ((na.t === 'nand' && na.a === na.b && na.a === y) || (nb.t === 'nand' && nb.a === nb.b && nb.a === x)) return 1;
    const key = `${x},${y}`;
    const hit = this.hash.get(key);
    if (hit !== undefined) return hit;
    this.nodes.push({ t: 'nand', a: x, b: y });
    const id = this.nodes.length - 1;
    this.hash.set(key, id);
    return id;
  }

  not(a: number): number {
    if (a === 0) return 1;
    if (a === 1) return 0;
    const n = this.nodes[a];
    if (n.t === 'nand' && n.a === n.b) return n.a; // NOT(NOT x) = x
    return this.nand(a, a);
  }
  and(a: number, b: number) { return this.not(this.nand(a, b)); }
  or(a: number, b: number) { return this.nand(this.not(a), this.not(b)); }
  xor(a: number, b: number) {
    if (a === 0) return b;
    if (b === 0) return a;
    if (a === 1) return this.not(b);
    if (b === 1) return this.not(a);
    if (a === b) return 0;
    const t = this.nand(a, b);
    return this.nand(this.nand(a, t), this.nand(b, t));
  }
  mux(s: number, x: number, y: number) {
    if (s === 1) return x;
    if (s === 0) return y;
    if (x === y) return x;
    return this.nand(this.nand(s, x), this.nand(this.not(s), y));
  }
  latch(): number { this.nodes.push({ t: 'latch', d: -1 }); return this.nodes.length - 1; }
  ref(comp: number, inputs: number[], nOut: number): number[] {
    this.nodes.push({ t: 'ref', comp, inputs });
    const r = this.nodes.length - 1;
    const outs: number[] = [];
    for (let k = 0; k < nOut; k++) { this.nodes.push({ t: 'refout', ref: r, k }); outs.push(this.nodes.length - 1); }
    return outs;
  }
  /** 不经结构哈希的原始 NAND，用于输出缓冲。 */
  rawNand(a: number, b: number): number { this.nodes.push({ t: 'nand', a, b }); return this.nodes.length - 1; }
}

// ------------------------------------------------------------------ 编译

export interface Pin { name: string; width: number }

export interface CompileResult {
  name: string;
  netlist: Uint8Array;
  nIn: number;
  nOut: number;
  inputs: Pin[];
  outputs: Pin[];
  /** 本层晶体管（流片时实际烧掉的量） */
  nNand: number;
  nLatch: number;
  /** 递归总门数（= 链上 circuitInfo.gateCount） */
  gateCount: number;
  components: { name: string; cpu: string; cid: string; gateCount: number }[];
  elements: Element[];
}

type Sym =
  | { kind: 'in' | 'out' | 'wire' | 'reg'; width: number; bits: (number | undefined)[]; t: Tok }
  | { kind: 'comp'; comp: number };

export interface CompileOptions {
  /** 解析 use 声明的组件（需提供 nIn/nOut 与 gateCount），通常是预取过的链上电路。 */
  components?: RefSource & { gateCountOf?(cpu: string, cid: bigint): number | undefined };
}

export function compile(src: string, opts: CompileOptions = {}): CompileResult {
  const prog = new Parser(lex(src)).program();
  const g = new Graph();
  const syms = new Map<string, Sym>();
  const comps: Component[] = [];
  const inputs: Pin[] = [];
  const outputs: Pin[] = [];
  const outSyms: string[] = [];
  const regs: { name: string; bits: number[]; d: (number | undefined)[]; t: Tok }[] = [];
  let pin = 0;

  const ival = (e: IExpr, env: Map<string, number>): number => {
    if (e.k === 'int') return e.v;
    if (e.k === 'var') {
      const v = env.get(e.name);
      if (v === undefined) throw new HdlError(L(`下标里的 '${e.name}' 不是循环变量`, `'${e.name}' in the index is not a loop variable`), e.t.line, e.t.col);
      return v;
    }
    const a = ival(e.a, env), b = ival(e.b, env);
    switch (e.op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/': return Math.trunc(a / b);
      default: return a % b;
    }
  };

  const range = (sym: { width: number }, idx: Index | undefined, env: Map<string, number>, t: Tok): number[] => {
    if (!idx) return [...Array(sym.width).keys()];
    const lo = ival(idx.lo, env);
    const hi = idx.hi ? ival(idx.hi, env) : lo;
    const out: number[] = [];
    const step = hi >= lo ? 1 : -1;
    for (let i = lo; step > 0 ? i <= hi : i >= hi; i += step) {
      if (i < 0 || i >= sym.width) throw new HdlError(L(`下标 ${i} 越界（宽度 ${sym.width}）`, `Index ${i} is out of range (width ${sym.width})`), t.line, t.col);
      out.push(i);
    }
    return out;
  };

  const broadcast = (a: number[], b: number[], t: Tok | undefined): [number[], number[]] => {
    if (a.length === b.length) return [a, b];
    if (a.length === 1) return [Array(b.length).fill(a[0]), b];
    if (b.length === 1) return [a, Array(a.length).fill(b[0])];
    throw new HdlError(L(`宽度不一致：${a.length} 与 ${b.length}`, `Width mismatch: ${a.length} vs ${b.length}`), t?.line ?? 0, t?.col ?? 0);
  };

  const firstTok = (e: Expr): Tok | undefined => {
    if (e.k === 'lit' || e.k === 'ref' || e.k === 'call') return e.t;
    if (e.k === 'not') return firstTok(e.a);
    if (e.k === 'mux') return firstTok(e.s);
    return firstTok(e.a);
  };

  const callComp = (ci: number, argBits: number[], t: Tok): number[] => {
    const c = comps[ci];
    if (argBits.length !== c.nIn) throw new HdlError(L(`组件 ${c.name} 需要 ${c.nIn} 个输入位，实际给了 ${argBits.length}`, `Component ${c.name} takes ${c.nIn} input bits, got ${argBits.length}`), t.line, t.col);
    return g.ref(ci, argBits, c.nOut);
  };

  const ev = (e: Expr, env: Map<string, number>): number[] => {
    switch (e.k) {
      case 'lit': return e.bits.map((b) => (b ? 1 : 0));
      case 'ref': {
        const s = syms.get(e.name);
        if (!s) throw new HdlError(L(`未声明的信号 '${e.name}'`, `Undeclared signal '${e.name}'`), e.t.line, e.t.col);
        if (s.kind === 'comp') throw new HdlError(L(`'${e.name}' 是组件，需要用 ${e.name}(…) 调用`, `'${e.name}' is a component: call it as ${e.name}(…)`), e.t.line, e.t.col);
        if (s.kind === 'out') throw new HdlError(L(`输出 '${e.name}' 不能被读取，请先赋给 wire`, `Output '${e.name}' can't be read: assign it to a wire first`), e.t.line, e.t.col);
        return range(s, e.index, env, e.t).map((i) => {
          const b = s.bits[i];
          if (b === undefined) throw new HdlError(L(`'${e.name}[${i}]' 在使用前还没有赋值`, `'${e.name}[${i}]' is used before it is assigned`), e.t.line, e.t.col);
          return b;
        });
      }
      case 'not': return ev(e.a, env).map((x) => g.not(x));
      case 'bin': {
        const [a, b] = broadcast(ev(e.a, env), ev(e.b, env), firstTok(e));
        const f = e.op === '&' ? g.and.bind(g) : e.op === '|' ? g.or.bind(g) : g.xor.bind(g);
        return a.map((x, i) => f(x, b[i]));
      }
      case 'mux': {
        const s = ev(e.s, env);
        if (s.length !== 1) throw new HdlError(L('三元运算的条件必须是 1 位', 'The condition of ?: must be 1 bit wide'), firstTok(e.s)?.line ?? 0, firstTok(e.s)?.col ?? 0);
        const [a, b] = broadcast(ev(e.a, env), ev(e.b, env), firstTok(e));
        return a.map((x, i) => g.mux(s[0], x, b[i]));
      }
      case 'call': {
        const args = e.args.map((a) => ev(a, env));
        let out: number[];
        const sym = syms.get(e.name);
        if (sym && sym.kind === 'comp') {
          out = callComp(sym.comp, args.flat(), e.t);
        } else {
          const need = (n: number) => {
            if (args.length !== n) throw new HdlError(L(`${e.name}() 需要 ${n} 个参数`, `${e.name}() takes ${n} argument${n === 1 ? '' : 's'}`), e.t.line, e.t.col);
          };
          switch (e.name) {
            case 'not': need(1); out = args[0].map((x) => g.not(x)); break;
            case 'nand': case 'and': case 'or': case 'xor': case 'nor': case 'xnor': {
              need(2);
              const [a, b] = broadcast(args[0], args[1], e.t);
              out = a.map((x, i) => {
                const y = b[i];
                switch (e.name) {
                  case 'nand': return g.nand(x, y);
                  case 'and': return g.and(x, y);
                  case 'or': return g.or(x, y);
                  case 'xor': return g.xor(x, y);
                  case 'nor': return g.not(g.or(x, y));
                  default: return g.not(g.xor(x, y));
                }
              });
              break;
            }
            case 'mux': {
              need(3);
              if (args[0].length !== 1) throw new HdlError(L('mux 的选择信号必须是 1 位', 'The select signal of mux must be 1 bit wide'), e.t.line, e.t.col);
              const [a, b] = broadcast(args[1], args[2], e.t);
              out = a.map((x, i) => g.mux(args[0][0], x, b[i]));
              break;
            }
            default: throw new HdlError(L(`未知的函数或组件 '${e.name}'`, `Unknown function or component '${e.name}'`), e.t.line, e.t.col);
          }
        }
        if (e.index) out = range({ width: out.length }, e.index, env, e.t).map((i) => out[i]);
        return out;
      }
    }
  };

  const exec = (stmts: Stmt[], env: Map<string, number>) => {
    for (const s of stmts) {
      if (s.k === 'decl') {
        for (const d of s.decls) {
          if (syms.has(d.name)) throw new HdlError(L(`重复声明 '${d.name}'`, `'${d.name}' is already declared`), d.t.line, d.t.col);
          const width = d.width ? ival(d.width, env) : 1;
          if (!(width >= 1 && width <= 4096)) throw new HdlError(L(`宽度 ${width} 不合法`, `Invalid width ${width}`), d.t.line, d.t.col);
          const bits: (number | undefined)[] = Array(width).fill(undefined);
          if (s.kind === 'in') {
            if (pin + width > 65536) throw new HdlError(L('输入引脚过多', 'Too many input pins'), d.t.line, d.t.col);
            for (let i = 0; i < width; i++) bits[i] = g.input(pin++);
            inputs.push({ name: d.name, width });
          } else if (s.kind === 'out') {
            outputs.push({ name: d.name, width });
            outSyms.push(d.name);
          } else if (s.kind === 'reg') {
            const lb: number[] = [];
            for (let i = 0; i < width; i++) { const l = g.latch(); bits[i] = l; lb.push(l); }
            regs.push({ name: d.name, bits: lb, d: Array(width).fill(undefined), t: d.t });
          }
          syms.set(d.name, { kind: s.kind, width, bits, t: d.t });
        }
      } else if (s.k === 'use') {
        if (syms.has(s.name)) throw new HdlError(L(`重复声明 '${s.name}'`, `'${s.name}' is already declared`), s.t.line, s.t.col);
        const src = opts.components?.get(s.cpu, s.cid);
        if (!src) throw new HdlError(L(`组件 ${s.cpu}#${s.cid} 未加载（需要先从链上读取）`, `Component ${s.cpu}#${s.cid} isn't loaded (it has to be read from chain first)`), s.t.line, s.t.col);
        const gc = opts.components?.gateCountOf?.(s.cpu, s.cid) ?? 0;
        comps.push({ name: s.name, cpu: s.cpu, cid: s.cid, nIn: src.nIn, nOut: src.nOut, gateCount: gc });
        syms.set(s.name, { kind: 'comp', comp: comps.length - 1 });
      } else if (s.k === 'for') {
        const from = ival(s.from, env), to = ival(s.to, env);
        if (Math.abs(to - from) > 100000) throw new HdlError(L('循环次数过多', 'Too many loop iterations'), s.t.line, s.t.col);
        const step = to >= from ? 1 : -1;
        for (let i = from; step > 0 ? i <= to : i >= to; i += step) {
          const inner = new Map(env);
          inner.set(s.v, i);
          exec(s.body, inner);
        }
      } else {
        const rhs = ev(s.rhs, env);
        const targets: { sym: Extract<Sym, { bits: unknown }>; i: number; name: string; t: Tok }[] = [];
        for (const lv of s.lhs) {
          const sym = syms.get(lv.name);
          if (!sym) throw new HdlError(L(`未声明的信号 '${lv.name}'`, `Undeclared signal '${lv.name}'`), lv.t.line, lv.t.col);
          if (sym.kind === 'comp' || sym.kind === 'in') throw new HdlError(L(`不能给 '${lv.name}' 赋值`, `'${lv.name}' can't be assigned to`), lv.t.line, lv.t.col);
          for (const i of range(sym, lv.index, env, lv.t)) targets.push({ sym, i, name: lv.name, t: lv.t });
        }
        let vals = rhs;
        if (rhs.length === 1 && targets.length > 1) vals = Array(targets.length).fill(rhs[0]);
        if (vals.length !== targets.length) throw new HdlError(L(`赋值宽度不一致：左边 ${targets.length} 位，右边 ${rhs.length} 位`, `Assignment width mismatch: ${targets.length} bits on the left, ${rhs.length} on the right`), s.t.line, s.t.col);
        targets.forEach((tg, j) => {
          if (s.latch) {
            if (tg.sym.kind !== 'reg') throw new HdlError(L(`'<=' 只能用于 reg，'${tg.name}' 不是寄存器`, `'<=' only works on a reg, and '${tg.name}' isn't one`), tg.t.line, tg.t.col);
            const r = regs.find((x) => x.name === tg.name)!;
            if (r.d[tg.i] !== undefined) throw new HdlError(L(`寄存器 '${tg.name}[${tg.i}]' 重复赋值`, `Register '${tg.name}[${tg.i}]' is assigned more than once`), tg.t.line, tg.t.col);
            r.d[tg.i] = vals[j];
          } else {
            if (tg.sym.kind === 'reg') throw new HdlError(L(`寄存器 '${tg.name}' 要用 '<=' 赋下一周期的值`, `Register '${tg.name}' takes its next-cycle value with '<='`), tg.t.line, tg.t.col);
            if (tg.sym.bits[tg.i] !== undefined) throw new HdlError(L(`'${tg.name}[${tg.i}]' 重复赋值`, `'${tg.name}[${tg.i}]' is assigned more than once`), tg.t.line, tg.t.col);
            tg.sym.bits[tg.i] = vals[j];
          }
        });
      }
    }
  };

  exec(prog.body, new Map());

  if (outputs.length === 0) throw new HdlError(L('至少需要一个 out 输出', 'At least one out is required'), 1, 1);
  const outBits: number[] = [];
  for (const name of outSyms) {
    const s = syms.get(name) as Extract<Sym, { bits: unknown }>;
    s.bits.forEach((b, i) => {
      if (b === undefined) throw new HdlError(L(`输出 '${name}[${i}]' 没有赋值`, `Output '${name}[${i}]' is never assigned`), s.t.line, s.t.col);
      outBits.push(b);
    });
  }
  for (const r of regs) {
    r.d.forEach((d, i) => {
      if (d === undefined) throw new HdlError(L(`寄存器 '${r.name}[${i}]' 没有用 '<=' 指定下一周期的值`, `Register '${r.name}[${i}]' has no next-cycle value (assign it with '<=')`), r.t.line, r.t.col);
      (g.nodes[r.bits[i]] as { t: 'latch'; d: number }).d = d;
    });
  }

  return emit(g, prog.name, outBits, comps, inputs, outputs, pin);
}

// ------------------------------------------------------------------ 排布与编码

function emit(g: Graph, name: string, outBits: number[], comps: Component[], inputs: Pin[], outputs: Pin[], nIn: number): CompileResult {
  const deps = (id: number): number[] => {
    const n = g.nodes[id];
    if (n.t === 'nand') return [n.a, n.b];
    if (n.t === 'ref') return n.inputs;
    if (n.t === 'refout') return [n.ref];
    return [];
  };
  // 输出需要放在信号空间末尾：能直接把产生它的元件放到末尾就放，否则插缓冲门。
  // 「元件」= nand / latch / ref（refout 只是 ref 的第 k 个输出）。
  const elemOf = (id: number) => (g.nodes[id].t === 'refout' ? (g.nodes[id] as { ref: number }).ref : id);

  // 1) 活跃元件：从输出与被用到的寄存器 d 反向可达
  const live = new Set<number>();
  const stack = [...outBits];
  while (stack.length) {
    const x = stack.pop()!;
    const e = elemOf(x);
    if (live.has(e)) continue;
    const n = g.nodes[e];
    if (n.t === 'const' || n.t === 'in') continue;
    live.add(e);
    if (n.t === 'latch') stack.push(n.d);
    else stack.push(...deps(e));
  }

  // 2) 决定末尾元件序列
  type Tail = { elem: number; bits: number };
  const tail: Tail[] = [];
  const buffered = new Set<number>(); // 需要缓冲的输出位下标
  const consumers = new Map<number, Set<number>>(); // 元件 → 用到它的元件（组合依赖；latch.d 是时序引用，不受顺序约束）
  for (const e of live) {
    const n = g.nodes[e];
    if (n.t === 'nand' || n.t === 'ref') {
      for (const d of deps(e)) {
        const de = elemOf(d);
        if (!live.has(de)) continue;
        if (!consumers.has(de)) consumers.set(de, new Set());
        consumers.get(de)!.add(e);
      }
    }
  }
  const useCount = new Map<number, number>();
  for (const b of outBits) useCount.set(elemOf(b), (useCount.get(elemOf(b)) ?? 0) + 1);

  // 初步：每个输出位尝试把它的元件放末尾
  let i = 0;
  const tailOfElem = new Map<number, number>(); // elem → tail 序号
  while (i < outBits.length) {
    const b = outBits[i];
    const n = g.nodes[b];
    const e = elemOf(b);
    if ((n.t === 'nand' || n.t === 'latch') && useCount.get(e) === 1) {
      tailOfElem.set(e, tail.length);
      tail.push({ elem: e, bits: 1 });
      i += 1;
      continue;
    }
    if (n.t === 'refout' && n.k === 0) {
      const ref = g.nodes[e] as { t: 'ref'; comp: number };
      const k = comps[ref.comp].nOut;
      let ok = i + k <= outBits.length && useCount.get(e) === k;
      for (let j = 0; ok && j < k; j++) {
        const nj = g.nodes[outBits[i + j]];
        ok = nj.t === 'refout' && nj.ref === e && nj.k === j;
      }
      if (ok) {
        tailOfElem.set(e, tail.length);
        tail.push({ elem: e, bits: k });
        i += k;
        continue;
      }
    }
    tail.push({ elem: -1, bits: 1 });
    buffered.add(i);
    i += 1;
  }
  // 迭代降级：末尾元件只能被「更靠后的末尾元件」组合使用
  for (let changed = true; changed;) {
    changed = false;
    for (const [e, ti] of tailOfElem) {
      for (const c of consumers.get(e) ?? []) {
        const ct = tailOfElem.get(c);
        if (ct === undefined || ct <= ti) {
          tailOfElem.delete(e);
          tail[ti] = { elem: -1, bits: tail[ti].bits };
          changed = true;
          break;
        }
      }
    }
  }

  // 3) 主体：非末尾活跃元件的拓扑序（寄存器没有组合前驱，最先放）
  const body: number[] = [];
  const placed = new Set<number>();
  const latches = [...live].filter((e) => g.nodes[e].t === 'latch' && !tailOfElem.has(e)).sort((a, b) => a - b);
  for (const l of latches) { body.push(l); placed.add(l); }
  const visit = (root: number) => {
    const st: [number, boolean][] = [[root, false]];
    while (st.length) {
      const [x, done] = st.pop()!;
      if (placed.has(x) || tailOfElem.has(x) || !live.has(x)) continue;
      if (done) { placed.add(x); body.push(x); continue; }
      st.push([x, true]);
      for (const d of deps(x)) {
        const de = elemOf(d);
        if (!placed.has(de) && live.has(de) && !tailOfElem.has(de)) st.push([de, false]);
      }
    }
  };
  for (const e of [...live].sort((a, b) => a - b)) visit(e);
  // 末尾元件的组合前驱也必须在主体里（上面已覆盖全部活跃非末尾元件）

  // 4) 展开缓冲：被降级或无法直接放置的输出位用 NAND 缓冲
  //    常量 1 = NAND(0,0)，常量 0 = NAND(1,1)；其余 = NOT(NOT x)（NOT x 进主体）
  const finalTail: ({ kind: 'elem'; elem: number } | { kind: 'buf'; a: number; b: number })[] = [];
  let bit = 0;
  for (const tEntry of tail) {
    if (tEntry.elem >= 0) {
      finalTail.push({ kind: 'elem', elem: tEntry.elem });
      bit += tEntry.bits;
      continue;
    }
    for (let j = 0; j < tEntry.bits; j++, bit++) {
      const src = outBits[bit];
      if (src === 1) finalTail.push({ kind: 'buf', a: 0, b: 0 });
      else if (src === 0) finalTail.push({ kind: 'buf', a: 1, b: 1 });
      else {
        const inv = g.rawNand(src, src);
        body.push(inv);
        finalTail.push({ kind: 'buf', a: inv, b: inv });
      }
    }
  }

  // 5) 分配信号号并编码
  const sigOf = new Map<number, number>();
  sigOf.set(0, 0);
  sigOf.set(1, 1);
  g.nodes.forEach((n, id) => { if (n.t === 'in') sigOf.set(id, 2 + n.pin); });
  let next = 2 + nIn;
  const order: ({ kind: 'elem'; elem: number } | { kind: 'buf'; a: number; b: number })[] = [
    ...body.map((elem) => ({ kind: 'elem' as const, elem })),
    ...finalTail,
  ];
  for (const o of order) {
    if (o.kind === 'buf') { next += 1; continue; }
    const n = g.nodes[o.elem];
    if (n.t === 'ref') {
      const k = comps[n.comp].nOut;
      sigOf.set(o.elem, next);
      for (let j = 0; j < k; j++) {
        const outNode = o.elem + 1 + j; // refout 节点紧跟在 ref 后创建
        sigOf.set(outNode, next + j);
      }
      next += k;
    } else {
      sigOf.set(o.elem, next++);
    }
  }
  const S = (id: number) => {
    const s = sigOf.get(id);
    if (s === undefined) throw new Error(`internal: unplaced node ${id}`);
    return s;
  };
  const elements: Element[] = [];
  let nNand = 0, nLatch = 0, refGates = 0;
  for (const o of order) {
    if (o.kind === 'buf') {
      elements.push({ op: 'nand', a: o.a <= 1 ? o.a : S(o.a), b: o.b <= 1 ? o.b : S(o.b) });
      nNand++;
      continue;
    }
    const n = g.nodes[o.elem];
    if (n.t === 'nand') { elements.push({ op: 'nand', a: S(n.a), b: S(n.b) }); nNand++; }
    else if (n.t === 'latch') { elements.push({ op: 'latch', d: S(n.d) }); nLatch++; }
    else if (n.t === 'ref') {
      const c = comps[n.comp];
      elements.push({ op: 'ref', cpu: c.cpu, cid: c.cid, rIn: c.nIn, rOut: c.nOut, inputs: n.inputs.map(S) });
      refGates += c.gateCount;
    }
  }
  const nOut = outBits.length;
  const usedComps = new Map<string, Component>();
  for (const e of elements) if (e.op === 'ref') {
    const c = comps.find((x) => x.cpu === e.cpu && x.cid === e.cid)!;
    usedComps.set(`${c.cpu}#${c.cid}`, c);
  }
  return {
    name,
    netlist: encode(elements),
    nIn,
    nOut,
    inputs,
    outputs,
    nNand,
    nLatch,
    gateCount: nNand + nLatch + refGates,
    components: [...usedComps.values()].map((c) => ({ name: c.name, cpu: c.cpu, cid: c.cid.toString(), gateCount: c.gateCount })),
    elements,
  };
}
