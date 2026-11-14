// 位打包与链上 NetlistVM 一致：字节内小端位序（第 i 位 = byte[i>>3] 的第 (i&7) 位）。

export function packBits(bits: ArrayLike<number | boolean>): Uint8Array {
  const out = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i++) if (bits[i]) out[i >> 3] |= 1 << (i & 7);
  return out;
}

export function unpackBits(bytes: Uint8Array, n: number): number[] {
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const b = i >> 3;
    out[i] = b < bytes.length ? (bytes[b] >> (i & 7)) & 1 : 0;
  }
  return out;
}

export function getBit(bytes: Uint8Array, i: number): number {
  const b = i >> 3;
  return b < bytes.length ? (bytes[b] >> (i & 7)) & 1 : 0;
}

/** 无符号整数 → n 位（低位在前），用于把「a=5」这类测试用例转成引脚。 */
export function intToBits(value: bigint | number, n: number): number[] {
  let v = BigInt(value);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(Number(v & 1n));
    v >>= 1n;
  }
  return out;
}

export function bitsToInt(bits: ArrayLike<number>): bigint {
  let v = 0n;
  for (let i = bits.length - 1; i >= 0; i--) v = (v << 1n) | BigInt(bits[i] ? 1 : 0);
  return v;
}

export function toHex(bytes: Uint8Array): `0x${string}` {
  let s = '0x';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s as `0x${string}`;
}

export function fromHex(hex: string): Uint8Array {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (h.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(h)) throw new Error('bad hex');
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}

export function concatBytes(parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
