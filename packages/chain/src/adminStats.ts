/**
 * 运营后台链上指标：商店 BEM 进账、孵化注册、通电游玩、猫咪数量。
 * 公共 RPC 常限制日志区间，故按块分段拉取。
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
const SCAN_FROM: Record<number, bigint> = {
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
  /** RPC 主机名（不含 key） */
  rpcHost: string;
  note: string;
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

export async function loadAdminStats(
  pub: PublicClient,
  chainId: number,
  chipet: Address | undefined,
  opts?: { rpcHost?: string },
): Promise<AdminStats> {
  const bem = bemNetwork(chainId);
  const rpcHost = opts?.rpcHost ?? 'default';
  const chunk = chunkFor(rpcHost);
  const head = await pub.getBlockNumber();
  const from = SCAN_FROM[chainId] && SCAN_FROM[chainId]! < head
    ? SCAN_FROM[chainId]!
    : (head > 100_000n ? head - 100_000n : 0n);

  let cats = 0;
  if (chipet) {
    try {
      const next = await pub.readContract({ address: chipet, abi: chipetAbi, functionName: 'nextId' });
      cats = Number(next > 0n ? next - 1n : 0n);
    } catch {
      cats = 0;
    }
  }

  const payers = new Set<string>();
  let rechargeTxs = 0;
  let rechargeRaw = 0n;
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

  const hatchers = new Set<string>();
  const playedPets = new Set<string>();
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
        if (l.args.petId != null) playedPets.add(l.args.petId.toString());
      }
    });
  }

  const players = new Set<string>();
  if (chipet && playedPets.size) {
    const ids = [...playedPets].map((x) => BigInt(x));
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

  return {
    chainId,
    cats,
    registered: hatchers.size,
    players: players.size,
    rechargeUsers: payers.size,
    rechargeTxs,
    rechargeBem: bem ? formatUnits(rechargeRaw, bem.decimals) : '0',
    treasuryBal,
    scannedTo: head.toString(),
    rpcHost,
    note: '注册=链上孵化过的钱包；游玩=通电过的芯喵主人；充值含现收款地址与旧工厂地址入账。仅本地演示、未上链行为不计入。',
  };
}
