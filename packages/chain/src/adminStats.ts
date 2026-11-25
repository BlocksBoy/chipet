/**
 * 运营后台链上指标：商店 BEM 进账、孵化注册、通电游玩、猫咪数量。
 * 按块分段拉取；支持 checkpoint 增量；可用 budgetMs 限时分片，避免网关 502。
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

/**
 * getLogs 块窗口。dRPC 对 eth_getLogs 按扫描块数计 CU，窗口过大一旦失败再二分，
 * 会把一次请求打成十几二十次；付费节点也压到 8k，宁可多几轮顺序请求。
 */
function chunkFor(rpcHost?: string): bigint {
  const h = (rpcHost ?? '').toLowerCase();
  if (h.includes('alchemy.com') || h.includes('drpc.live') || h.includes('drpc.org')) return 8_000n;
  return 2_000n;
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
  /** 本轮是否已扫到链头；false 表示分片未完成，应继续 */
  complete: boolean;
  /** 目标链头（分片进度分母） */
  head: string;
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

const GET_LOGS_MAX_DEPTH = 6;

async function getLogsSafe(
  pub: PublicClient,
  params: {
    address: Address;
    event: typeof TRANSFER | typeof HATCHED | typeof PLAYED;
    args?: { to?: Address };
    fromBlock: bigint;
    toBlock: bigint;
  },
  depth = 0,
): Promise<{ args: LogArgs }[]> {
  try {
    return await pub.getLogs(params as never) as unknown as { args: LogArgs }[];
  } catch (e) {
    const { fromBlock: from, toBlock: to } = params;
    if (to <= from || depth >= GET_LOGS_MAX_DEPTH) {
      console.warn('[adminStats] getLogs give up', {
        from: from.toString(), to: to.toString(), depth,
        err: e instanceof Error ? e.message : String(e),
      });
      return [];
    }
    const mid = from + (to - from) / 2n;
    const left = await getLogsSafe(pub, { ...params, fromBlock: from, toBlock: mid }, depth + 1);
    const right = await getLogsSafe(pub, { ...params, fromBlock: mid + 1n, toBlock: to }, depth + 1);
    return [...left, ...right];
  }
}

export function emptyAdminCheckpoint(): AdminScanCheckpoint {
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

export async function readLiveBalances(
  pub: PublicClient,
  chainId: number,
  chipet: Address | undefined,
): Promise<{ cats: number; treasuryBal: string }> {
  const bem = bemNetwork(chainId);
  let cats = 0;
  if (chipet) {
    try {
      const next = await pub.readContract({ address: chipet, abi: chipetAbi, functionName: 'nextId' });
      cats = Number(next > 0n ? next - 1n : 0n);
    } catch {
      cats = 0;
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
  return { cats, treasuryBal };
}

/**
 * 扫一段链上日志并合并 checkpoint。
 * 外层按块推进：每个 chunk 内拉完 Transfer/Hatched/Played 再前进游标，便于限时分片落库。
 */
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
    /** 单次调用最长耗时（毫秒）；超时则带着未完成 checkpoint 返回 */
    budgetMs?: number;
    /**
     * 跳过 BEM Transfer 扫日志（商店充值由前端成功后主动入库）。
     * 仍扫 Hatched/Played；checkpoint 里充值字段保持上次冻结值。
     */
    skipTransfers?: boolean;
    /** 跳过 Played 日志（通电事件多，自动巡检可不扫，省 eth_getLogs CU） */
    skipPlayed?: boolean;
    /** 全量重扫时用于保留历史充值基线（通常传旧 checkpoint） */
    rechargeSeed?: AdminScanCheckpoint | null;
  },
): Promise<LoadAdminStatsResult> {
  const bem = bemNetwork(chainId);
  const rpcHost = opts?.rpcHost ?? 'default';
  const chunk = chunkFor(rpcHost);
  const head = await pub.getBlockNumber();
  const budgetMs = opts?.budgetMs;
  const deadline = budgetMs && budgetMs > 0 ? Date.now() + budgetMs : Number.POSITIVE_INFINITY;
  const skipTransfers = !!opts?.skipTransfers;
  const skipPlayed = !!opts?.skipPlayed;

  const base = opts?.full || !opts?.checkpoint ? emptyAdminCheckpoint() : opts.checkpoint;
  const full = !!opts?.full || !opts?.checkpoint;
  // 跳过 Transfer 时：全量也不清掉历史充值/孵化/游玩集合（RPC 空结果或分片中途不能把看板打成 0）
  const seed = skipTransfers ? (opts.rechargeSeed ?? opts.checkpoint ?? null) : null;
  const prev: AdminScanCheckpoint = seed
    ? {
      ...base,
      rechargeTxs: seed.rechargeTxs,
      rechargeBemRaw: seed.rechargeBemRaw,
      payers: [...new Set([...(base.payers ?? []), ...(seed.payers ?? [])])],
      hatchers: [...new Set([...(base.hatchers ?? []), ...(seed.hatchers ?? [])])],
      playedPets: [...new Set([...(base.playedPets ?? []), ...(seed.playedPets ?? [])])],
      players: [...new Set([...(base.players ?? []), ...(seed.players ?? [])])],
    }
    : base;

  let from: bigint;
  let scanMode: AdminStats['scanMode'];
  if (full) {
    from = genesisFrom(chainId, head);
    scanMode = 'full';
  } else {
    const last = BigInt(prev.scannedTo || '0');
    if (last >= head) {
      scanMode = 'noop';
      from = head + 1n;
    } else {
      from = last + 1n;
      scanMode = 'incremental';
    }
  }

  const scannedFrom = scanMode === 'noop' ? head.toString() : from.toString();
  const { cats, treasuryBal } = await readLiveBalances(pub, chainId, chipet);

  const payers = new Set(prev.payers);
  const hatchers = new Set(prev.hatchers);
  const playedPets = new Set(prev.playedPets);
  const players = new Set(prev.players);
  let rechargeTxs = prev.rechargeTxs;
  let rechargeRaw = BigInt(prev.rechargeBemRaw || '0');
  let cursor = scanMode === 'noop' ? head : BigInt(prev.scannedTo || '0');
  if (full) cursor = from - 1n;
  let complete = scanMode === 'noop' || from > head;
  let timedOut = false;

  const receivers = shopReceivers(chainId);

  if (!complete) {
    for (let a = from; a <= head; a += chunk) {
      if (Date.now() >= deadline) {
        timedOut = true;
        break;
      }
      const b = a + chunk - 1n > head ? head : a + chunk - 1n;
      const newPlayed: string[] = [];

      if (!skipTransfers && bem && receivers.length) {
        for (const to of receivers) {
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
        }
      }

      if (chipet) {
        const hatched = await getLogsSafe(pub, {
          address: chipet,
          event: HATCHED,
          fromBlock: a,
          toBlock: b,
        });
        for (const l of hatched) {
          if (l.args.owner) hatchers.add(l.args.owner.toLowerCase());
        }

        if (!skipPlayed) {
          const played = await getLogsSafe(pub, {
            address: chipet,
            event: PLAYED,
            fromBlock: a,
            toBlock: b,
          });
          for (const l of played) {
            if (l.args.petId == null) continue;
            const id = l.args.petId.toString();
            if (!playedPets.has(id)) {
              playedPets.add(id);
              newPlayed.push(id);
            }
          }

          if (newPlayed.length) {
            const added = await resolveOwners(pub, chipet, newPlayed);
            for (const p of added) players.add(p);
          }
        }
      }

      cursor = b;
    }
    complete = !timedOut && cursor >= head;
  }

  const checkpoint: AdminScanCheckpoint = {
    scannedTo: cursor.toString(),
    rechargeTxs,
    rechargeBemRaw: rechargeRaw.toString(),
    payers: [...payers],
    hatchers: [...hatchers],
    playedPets: [...playedPets],
    players: [...players],
  };

  const transferNote = skipTransfers ? '（充值 Transfer 已跳过，由商店上报入库）' : '';
  const playedNote = skipPlayed ? '（Played 已跳过）' : '';
  const note = !complete
    ? `分片扫链进行中：已至 #${checkpoint.scannedTo} / 链头 #${head}。后台会继续，页面可轮询。${transferNote}${playedNote}`
    : scanMode === 'incremental'
      ? `增量扫链完成：接上次游标合并去重集合。${transferNote}${playedNote}`
      : scanMode === 'noop'
        ? '链头未前进：未拉日志，仅刷新猫咪数与收款余额。'
        : `全量扫链完成：从部署起点重建。${transferNote}${playedNote}`;

  const stats: AdminStats = {
    chainId,
    cats,
    registered: hatchers.size,
    players: players.size,
    rechargeUsers: payers.size,
    rechargeTxs,
    rechargeBem: bem ? formatUnits(rechargeRaw, bem.decimals) : '0',
    treasuryBal,
    scannedTo: checkpoint.scannedTo,
    scannedFrom,
    scanMode,
    complete,
    head: head.toString(),
    rpcHost,
    note,
  };

  return { stats, checkpoint };
}
