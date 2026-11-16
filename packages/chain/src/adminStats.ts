/**
 * 运营后台链上指标：商店 BEM 进账、孵化注册、通电游玩、猫咪数量。
 * 公共 RPC 常限制日志区间，故按块分段拉取；支持基于 checkpoint 的增量扫描。
 */
import { formatUnits, parseAbiItem, type Address, type PublicClient } from 'viem';
import { chipetAbi, erc20Abi } from './abi.ts';
import {
  bemNetwork, BSC_TAPEOUT_FACTORY, XLAYER_TAPEOUT_FACTORY,
} from './networks.ts';

const TRANSFER = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
const HATCHED = parseAbiItem(
  'event Hatched(uint256 indexed petId, address indexed owner, address cpu, uint64 circuitId, uint8 rarity, string name)',
);
const PLAYED = parseAbiItem('event Played(uint256 indexed petId, uint16 mood, uint32 intimacy)');

type LogArgs = { from?: Address; to?: Address; value?: bigint; owner?: Address; petId?: bigint };

/** 各链 Chipet 大致部署起点（略早于正式上线，避免漏扫）。 */
export const SCAN_FROM: Record<number, bigint> = {
  196: 40_000_000n,
  56: 70_000_000n,
};

/** Alchemy 等付费节点可拉更大区间；公共节点保守一点。 */
function chunkFor(rpcHost?: string): bigint {
  return rpcHost?.includes('alchemy.com') ? 50_000n : 2_000n;
}

export interface AdminStats {
  chainId: number;
  cats: number;
  registered: number;
  players: number;
  rechargeUsers: number;
  rechargeTxs: number;
  rechargeBem: string;
  treasuryBal: string;
  scannedTo: string;
  /** 本次实际扫链起点（含）；noop 时与 scannedTo 相同 */
  scannedFrom: string;
  /** incremental=接上次游标；full=从部署起点；noop=头块未前进只刷新余额 */
  scanMode: 'incremental' | 'full' | 'noop';
  /** RPC 主机名（不含 key） */
  rpcHost: string;
  note: string;
}

/** 持久化游标 + 去重集合，供下次增量合并。 */
export interface AdminScanCheckpoint {
  scannedTo: string;
  rechargeTxs: number;
  /** BEM 累计量（最小单位，十进制字符串） */
  rechargeBemRaw: string;
  payers: string[];
  hatchers: string[];
  playedPets: string[];
  players: string[];
}

export interface LoadAdminStatsResult {
  stats: AdminStats;
  checkpoint: AdminScanCheckpoint;
}

function shopReceivers(chainId: number): Address[] {
  const bem = bemNetwork(chainId);
  if (!bem) return [];
  const legacy = chainId === 196 ? XLAYER_TAPEOUT_FACTORY : chainId === 56 ? BSC_TAPEOUT_FACTORY : undefined;
  return legacy && legacy.toLowerCase() !== bem.treasury.toLowerCase()
    ? [bem.treasury, legacy]
    : [bem.treasury];
}

async function forEachChunk(
  from: bigint,
  to: bigint,
  chunk: bigint,
  fn: (a: bigint, b: bigint) => Promise<void>,
) {
  for (let a = from; a <= to; a += chunk) {
    const b = a + chunk - 1n > to ? to : a + chunk - 1n;
    await fn(a, b);
  }
}

async function getLogsSafe(
  pub: PublicClient,
  params: {
    address: Address;
    event: typeof TRANSFER | typeof HATCHED | typeof PLAYED;
    args?: { to?: Address };
    fromBlock: bigint;
    toBlock: bigint;
  },
): Promise<{ args: LogArgs }[]> {
  try {
    return await pub.getLogs(params as never) as unknown as { args: LogArgs }[];
  } catch {
    const { fromBlock: from, toBlock: to } = params;
    if (to <= from) return [];
    const mid = from + (to - from) / 2n;
    const left = await getLogsSafe(pub, { ...params, fromBlock: from, toBlock: mid });
    const right = await getLogsSafe(pub, { ...params, fromBlock: mid + 1n, toBlock: to });
    return [...left, ...right];
  }
}

function emptyCheckpoint(): AdminScanCheckpoint {
  return {
    scannedTo: '0',
    rechargeTxs: 0,
    rechargeBemRaw: '0',
    payers: [],
    hatchers: [],
    playedPets: [],
    players: [],
  };
}

function genesisFrom(chainId: number, head: bigint): bigint {
  return SCAN_FROM[chainId] && SCAN_FROM[chainId]! < head
    ? SCAN_FROM[chainId]!
    : (head > 100_000n ? head - 100_000n : 0n);
}

async function resolveOwners(
  pub: PublicClient,
  chipet: Address,
  petIds: string[],
): Promise<Set<string>> {
  const players = new Set<string>();
  const ids = petIds.map((x) => BigInt(x));
  const batch = 20;
  for (let i = 0; i < ids.length; i += batch) {
    const slice = ids.slice(i, i + batch);
    const owners = await Promise.all(slice.map(async (id) => {
      try {
        return await pub.readContract({ address: chipet, abi: chipetAbi, functionName: 'ownerOf', args: [id] });
      } catch {
        return null;
      }
    }));
    for (const o of owners) if (o) players.add(o.toLowerCase());
  }
  return players;
}

export async function loadAdminStats(
  pub: PublicClient,
  chainId: number,
  chipet: Address | undefined,
  opts?: {
    rpcHost?: string;
    /** 上次扫到的游标与去重集合；有则默认增量 */
    checkpoint?: AdminScanCheckpoint | null;
    /** 强制从部署起点全量重扫 */
    full?: boolean;
  },
): Promise<LoadAdminStatsResult> {
  const bem = bemNetwork(chainId);
  const rpcHost = opts?.rpcHost ?? 'default';
  const chunk = chunkFor(rpcHost);
  const head = await pub.getBlockNumber();

  const prev = opts?.full || !opts?.checkpoint ? emptyCheckpoint() : opts.checkpoint;
  const full = !!opts?.full || !opts?.checkpoint;

  let from: bigint;
  let scanMode: AdminStats['scanMode'];
  if (full) {
    from = genesisFrom(chainId, head);
    scanMode = 'full';
  } else {
    const last = BigInt(prev.scannedTo || '0');
    if (last >= head) {
      scanMode = 'noop';
      from = head + 1n; // 跳过日志区间
    } else {
      from = last + 1n;
      scanMode = 'incremental';
    }
  }

  let cats = 0;
  if (chipet) {
    try {
      const next = await pub.readContract({ address: chipet, abi: chipetAbi, functionName: 'nextId' });
      cats = Number(next > 0n ? next - 1n : 0n);
    } catch {
      cats = 0;
    }
  }

  const payers = new Set(prev.payers);
  const hatchers = new Set(prev.hatchers);
  const playedPets = new Set(prev.playedPets);
  const players = new Set(prev.players);
  let rechargeTxs = prev.rechargeTxs;
  let rechargeRaw = BigInt(prev.rechargeBemRaw || '0');
  const newPlayed: string[] = [];

  if (scanMode !== 'noop' && from <= head) {
    const receivers = shopReceivers(chainId);
    if (bem && receivers.length) {
      for (const to of receivers) {
        await forEachChunk(from, head, chunk, async (a, b) => {
          const logs = await getLogsSafe(pub, {
            address: bem.token,
            event: TRANSFER,
            args: { to },
            fromBlock: a,
            toBlock: b,
          });
          for (const l of logs) {
            if (l.args.from) payers.add(l.args.from.toLowerCase());
            if (l.args.value != null) rechargeRaw += l.args.value;
            rechargeTxs += 1;
          }
        });
      }
    }

    if (chipet) {
      await forEachChunk(from, head, chunk, async (a, b) => {
        const logs = await getLogsSafe(pub, {
          address: chipet,
          event: HATCHED,
          fromBlock: a,
          toBlock: b,
        });
        for (const l of logs) {
          if (l.args.owner) hatchers.add(l.args.owner.toLowerCase());
        }
      });

      await forEachChunk(from, head, chunk, async (a, b) => {
        const logs = await getLogsSafe(pub, {
          address: chipet,
          event: PLAYED,
          fromBlock: a,
          toBlock: b,
        });
        for (const l of logs) {
          if (l.args.petId == null) continue;
          const id = l.args.petId.toString();
          if (!playedPets.has(id)) {
            playedPets.add(id);
            newPlayed.push(id);
          }
        }
      });
    }
  }

  // 全量：对全部 playedPets 解析主人；增量：只解析新出现的 petId
  if (chipet) {
    if (full) {
      const all = await resolveOwners(pub, chipet, [...playedPets]);
      players.clear();
      for (const p of all) players.add(p);
    } else if (newPlayed.length) {
      const added = await resolveOwners(pub, chipet, newPlayed);
      for (const p of added) players.add(p);
    }
  }

  let treasuryBal = '0';
  if (bem) {
    try {
      const bal = await pub.readContract({
        address: bem.token,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [bem.treasury],
      });
      treasuryBal = formatUnits(bal, bem.decimals);
    } catch {
      treasuryBal = '—';
    }
  }

  const checkpoint: AdminScanCheckpoint = {
    scannedTo: head.toString(),
    rechargeTxs,
    rechargeBemRaw: rechargeRaw.toString(),
    payers: [...payers],
    hatchers: [...hatchers],
    playedPets: [...playedPets],
    players: [...players],
  };

  const scannedFrom = scanMode === 'noop' ? head.toString() : from.toString();
  const stats: AdminStats = {
    chainId,
    cats,
    registered: hatchers.size,
    players: players.size,
    rechargeUsers: payers.size,
    rechargeTxs,
    rechargeBem: bem ? formatUnits(rechargeRaw, bem.decimals) : '0',
    treasuryBal,
    scannedTo: head.toString(),
    scannedFrom,
    scanMode,
    rpcHost,
    note: scanMode === 'incremental'
      ? '增量扫链：接上次区块游标合并去重集合。注册=孵化钱包；游玩=通电过的芯喵主人；充值含现收款与旧工厂。'
      : scanMode === 'noop'
        ? '链头未前进：未拉日志，仅刷新猫咪数与收款余额。'
        : '全量扫链：从部署起点重建。注册=孵化钱包；游玩=通电过的芯喵主人；充值含现收款与旧工厂。',
  };

  return { stats, checkpoint };
}
