import type { Address, PublicClient } from 'viem';
import { decodeVectors, fromHex, Library, loadRefTree, resolveData, type CircuitData, type Pin, type Resolved, type Vector } from '@tapearena/netlist';
import { arenaAbi, cpuAbi, libraryAbi } from './abi.ts';

export interface ChainCircuit extends CircuitData {
  cpu: Address;
  circuitId: bigint;
  nState: number;
  gateCount: number;
  owner?: Address;
}

export async function fetchCircuit(client: PublicClient, cpu: Address, circuitId: bigint, withOwner = false): Promise<ChainCircuit> {
  const [info, nl, owner] = await Promise.all([
    client.readContract({ address: cpu, abi: cpuAbi, functionName: 'circuitInfo', args: [circuitId] }),
    client.readContract({ address: cpu, abi: cpuAbi, functionName: 'netlist', args: [circuitId] }),
    withOwner ? client.readContract({ address: cpu, abi: cpuAbi, functionName: 'ownerOf', args: [circuitId] }) : Promise.resolve(undefined),
  ]);
  const [nIn, nOut, nState, gateCount] = info;
  return { cpu, circuitId, netlist: fromHex(nl), nIn, nOut, nState, gateCount, owner };
}

/** 带缓存的链上电路库：编译 use 组件、仿真 REF 时按需读链。已流片电路不可变，可以永久缓存。 */
export class ChainLibrary extends Library {
  private gates = new Map<string, number>();
  constructor(private client: PublicClient) { super(); }

  async load(cpu: Address, circuitId: bigint): Promise<ChainCircuit> {
    const c = await fetchCircuit(this.client, cpu, circuitId);
    this.set(cpu, circuitId, c);
    this.gates.set(`${cpu.toLowerCase()}#${circuitId}`, c.gateCount);
    await loadRefTree(c, this, async (a, id) => {
      const sub = await fetchCircuit(this.client, a as Address, id);
      this.gates.set(`${a.toLowerCase()}#${id}`, sub.gateCount);
      return sub;
    });
    return c;
  }

  gateCountOf(cpu: string, cid: bigint): number | undefined {
    return this.gates.get(`${cpu.toLowerCase()}#${cid}`) ?? (this.has(cpu, cid) ? this.resolve(cpu, cid).gateCount : undefined);
  }

  async resolved(cpu: Address, circuitId: bigint): Promise<Resolved> {
    if (!this.has(cpu, circuitId)) await this.load(cpu, circuitId);
    return this.resolve(cpu, circuitId);
  }

  /** 找出 HDL 源码里 use 声明的组件并预取。 */
  async preloadUses(src: string): Promise<void> {
    const re = /use\s+\w+\s*=\s*(0x[0-9a-fA-F]{40})\s*#\s*(\d+)/g;
    const jobs: Promise<unknown>[] = [];
    for (const m of src.matchAll(re)) {
      if (!this.has(m[1], BigInt(m[2]))) jobs.push(this.load(m[1] as Address, BigInt(m[2])));
    }
    await Promise.all(jobs);
  }
}

export function resolveLocal(c: CircuitData, lib: Library): Resolved {
  return resolveData(c, lib);
}

// ------------------------------------------------------------------ 擂台

export interface BountyMeta {
  title: string;
  description?: string;
  inputs?: Pin[];
  outputs?: Pin[];
  referenceHdl?: string;
  tags?: string[];
}

export interface Submission {
  index: number;
  solver: Address;
  cpu: Address;
  circuitId: bigint;
  gateCount: number;
  submittedAt: number;
  disqualified: boolean;
  bondClaimed: boolean;
}

export interface Bounty {
  id: number;
  poster: Address;
  token: Address;
  reward: bigint;
  bond: bigint;
  refCpu: Address;
  refId: bigint;
  nIn: number;
  nOut: number;
  maxGates: number;
  royaltyBps: number;
  feeBps: number;
  sampleSize: number;
  deadline: number;
  challengeEnd: number;
  finalized: boolean;
  best: number; // 最优提交下标，-1 = 暂无
  meta: BountyMeta;
  rawMeta: string;
  vectors: Vector[];
  submissions: Submission[];
}

export function parseMeta(raw: string): BountyMeta {
  try {
    const m = JSON.parse(raw);
    if (m && typeof m === 'object' && typeof m.title === 'string') return m as BountyMeta;
  } catch { /* 非 JSON 时把原文当标题 */ }
  return { title: raw.slice(0, 80) || 'Untitled' };
}

export async function fetchBounty(client: PublicClient, arena: Address, id: number): Promise<Bounty> {
  const [b, vec, subs] = await Promise.all([
    client.readContract({ address: arena, abi: arenaAbi, functionName: 'getBounty', args: [BigInt(id)] }),
    client.readContract({ address: arena, abi: arenaAbi, functionName: 'vectorsOf', args: [BigInt(id)] }),
    client.readContract({ address: arena, abi: arenaAbi, functionName: 'getSubmissions', args: [BigInt(id)] }),
  ]);
  return {
    id,
    poster: b.poster,
    token: b.token,
    reward: b.reward,
    bond: b.bond,
    refCpu: b.refCpu,
    refId: b.refId,
    nIn: b.nIn,
    nOut: b.nOut,
    maxGates: b.maxGates,
    royaltyBps: b.royaltyBps,
    feeBps: b.feeBps,
    sampleSize: b.sampleSize,
    deadline: Number(b.deadline),
    challengeEnd: Number(b.challengeEnd),
    finalized: b.finalized,
    best: b.best - 1,
    meta: parseMeta(b.meta),
    rawMeta: b.meta,
    vectors: decodeVectors(b.nIn, b.nOut, fromHex(vec)),
    submissions: subs.map((s, index) => ({
      index,
      solver: s.solver,
      cpu: s.cpu,
      circuitId: s.circuitId,
      gateCount: s.gateCount,
      submittedAt: Number(s.submittedAt),
      disqualified: s.disqualified,
      bondClaimed: s.bondClaimed,
    })),
  };
}

export async function listBounties(client: PublicClient, arena: Address): Promise<Bounty[]> {
  const n = Number(await client.readContract({ address: arena, abi: arenaAbi, functionName: 'bountyCount' }));
  const ids = [...Array(n).keys()].reverse();
  return Promise.all(ids.map((id) => fetchBounty(client, arena, id)));
}

export type BountyPhase = 'open' | 'challenge' | 'settle' | 'finalized';

export function bountyPhase(b: Pick<Bounty, 'deadline' | 'challengeEnd' | 'finalized'>, now = Date.now() / 1000): BountyPhase {
  if (b.finalized) return 'finalized';
  if (now < b.deadline) return 'open';
  if (now < b.challengeEnd) return 'challenge';
  return 'settle';
}

// ------------------------------------------------------------------ 组件库

export interface ComponentInfo {
  key: `0x${string}`;
  cpu: Address;
  circuitId: bigint;
  registeredAt: number;
  registrant: Address;
  nIn: number;
  nOut: number;
  gateCount: number;
  uses: number;
  verifiedBounty: number; // -1 = 未认证
  name: string;
  meta: Record<string, unknown>;
}

export async function listComponents(client: PublicClient, library: Address): Promise<ComponentInfo[]> {
  const n = await client.readContract({ address: library, abi: libraryAbi, functionName: 'count' });
  const out: ComponentInfo[] = [];
  for (let off = 0n; off < n; off += 100n) {
    const page = await client.readContract({ address: library, abi: libraryAbi, functionName: 'list', args: [off, 100n] });
    for (const c of page) {
      const key = await client.readContract({ address: library, abi: libraryAbi, functionName: 'keyOf', args: [c.cpu, c.circuitId] });
      let meta: Record<string, unknown> = {};
      try { meta = JSON.parse(c.meta); } catch { meta = c.meta ? { description: c.meta } : {}; }
      out.push({
        key,
        cpu: c.cpu,
        circuitId: c.circuitId,
        registeredAt: Number(c.registeredAt),
        registrant: c.registrant,
        nIn: c.nIn,
        nOut: c.nOut,
        gateCount: c.gateCount,
        uses: c.uses,
        verifiedBounty: c.verifiedBounty - 1,
        name: c.name,
        meta,
      });
    }
  }
  return out;
}
