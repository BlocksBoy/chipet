// 生成合约测试用的网表与测试向量（contracts/test/fixtures/circuits.json）。
// REF 目标地址先用占位符 0x1111…，测试里替换成本地部署出来的处理器地址。

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compile, resolveData, generateVectors, encodeVectors, toHex, Library, EXAMPLES, FULL_ADDER_NAND9,
} from '../src/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../../../contracts/test/fixtures/circuits.json');
const PLACEHOLDER = '0x' + '11'.repeat(20);

const faRef = compile(EXAMPLES.fullAdder.src);
const fa9 = compile(FULL_ADDER_NAND9);
const faCheat = compile(`circuit fa_cheat
in a, b, cin
out s, cout
s = a ^ b
cout = a & b
`);

const lib = new Library();
lib.set(PLACEHOLDER, 2n, fa9);
const add4Ref = compile(`circuit add4_fa
use FA = ${PLACEHOLDER}#2
in a[4], b[4], cin
out s[4], cout
wire c[5]
c[0] = cin
for i in 0..3 {
  (s[i], c[i+1]) = FA(a[i], b[i], c[i])
}
cout = c[4]
`, { components: { get: (c, i) => lib.get(c, i), gateCountOf: (c, i) => lib.resolve(c, i).gateCount } });

const refResolved = resolveData(faRef, null);
const allVectors = generateVectors(refResolved, null);
const cin0Vectors = allVectors.filter((v) => v.inputs[2] === 0);

const add4Resolved = resolveData(add4Ref, lib);
const add4Vectors = generateVectors(add4Resolved, lib, { count: 48, maxExhaustiveBits: 4 });

const pack = (r: { netlist: Uint8Array; nIn: number; nOut: number; gateCount: number; nNand: number; nLatch: number }) => ({
  netlist: toHex(r.netlist), nIn: r.nIn, nOut: r.nOut, gateCount: r.gateCount, nNand: r.nNand, nLatch: r.nLatch,
});

const data = {
  placeholder: PLACEHOLDER,
  faRef: pack(faRef),
  fa9: pack(fa9),
  faCheat: pack(faCheat),
  add4Ref: pack(add4Ref),
  faVectorsAll: toHex(encodeVectors(3, 2, allVectors)),
  faVectorsCin0: toHex(encodeVectors(3, 2, cin0Vectors)),
  add4Vectors: toHex(encodeVectors(9, 5, add4Vectors)),
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(data, null, 2));
console.log('wrote', out);
console.log({ faRef: faRef.gateCount, fa9: fa9.gateCount, faCheat: faCheat.gateCount, add4Ref: add4Ref.gateCount, add4Vectors: add4Vectors.length });
