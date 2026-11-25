/**
 * 从链上拉取芯宠全量属性写入 chipet_pets 存档。
 * 按 petId 分段，支持 budgetMs 分片，避免一次扫光 RPC。
 */
import type { Address, PublicClient } from 'viem';
import { chipetAbi } from '@tapearena/chain';
import { countArchivedPets, maxArchivedPetId, upsertArchivedPet } from './petArchive.ts';

export type PetSyncResult = {
  chainId: number;
  nextId: number;
  totalOnChain: number;
  synced: number;
  cursor: number;
  complete: boolean;
  archived: number;
};

type PetTuple = {
  cpu: Address;
  circuitId: bigint;
  rarity: number;
  energy: number;
  mood: number;
  intimacy: number;
  level: number;
  lastFeed: bigint;
  lastPlay: bigint;
  name: string;
};

async function readOne(
  client: PublicClient,
  chipet: Address,
  petId: number,
): Promise<{
  owner: string;
  pet: PetTuple;
  gene?: { gates: number; nIn: number; nOut: number };
} | null> {
  try {
    const [owner, pet] = await Promise.all([
      client.readContract({ address: chipet, abi: chipetAbi, functionName: 'ownerOf', args: [BigInt(petId)] }),
      client.readContract({ address: chipet, abi: chipetAbi, functionName: 'petOf', args: [BigInt(petId)] }),
    ]);
    let gene: { gates: number; nIn: number; nOut: number } | undefined;
    try {
      const g = await client.readContract({
        address: chipet,
        abi: chipetAbi,
        functionName: 'geneHint',
        args: [BigInt(petId)],
      });
      gene = { gates: Number(g[3]), nIn: Number(g[4]), nOut: Number(g[5]) };
    } catch {
      /* geneHint 可选 */
    }
    return { owner: owner as string, pet: pet as PetTuple, gene };
  } catch {
    return null;
  }
}

/**
 * 从 fromId（含）同步到 nextId-1；budgetMs 到点则带着 cursor 返回。
 * 默认从 1 起；传入 cursor+1 可续跑。
 */
export async function syncChipetPets(
  client: PublicClient,
  chainId: number,
  chipet: Address,
  opts?: { fromId?: number; budgetMs?: number; batchSize?: number },
): Promise<PetSyncResult> {
  const next = await client.readContract({ address: chipet, abi: chipetAbi, functionName: 'nextId' });
  const nextId = Number(next);
  const totalOnChain = Math.max(0, nextId - 1);
  const fromId = Math.max(1, Number(opts?.fromId ?? 1) || 1);
  const batchSize = Math.min(40, Math.max(5, Number(opts?.batchSize ?? 20) || 20));
  const deadline = opts?.budgetMs && opts.budgetMs > 0 ? Date.now() + opts.budgetMs : Number.POSITIVE_INFINITY;

  let synced = 0;
  let cursor = fromId - 1;
  let timedOut = false;

  for (let start = fromId; start < nextId; start += batchSize) {
    if (Date.now() >= deadline) {
      timedOut = true;
      break;
    }
    const end = Math.min(start + batchSize - 1, nextId - 1);
    const ids: number[] = [];
    for (let id = start; id <= end; id++) ids.push(id);
    const rows = await Promise.all(ids.map((id) => readOne(client, chipet, id)));
    for (let i = 0; i < ids.length; i++) {
      const row = rows[i];
      const petId = ids[i]!;
      cursor = petId;
      if (!row) continue;
      upsertArchivedPet({
        chainId,
        petId,
        owner: row.owner,
        name: row.pet.name,
        cpu: row.pet.cpu,
        circuitId: row.pet.circuitId,
        rarity: Number(row.pet.rarity),
        energy: Number(row.pet.energy),
        mood: Number(row.pet.mood),
        intimacy: Number(row.pet.intimacy),
        level: Number(row.pet.level),
        lastFeed: Number(row.pet.lastFeed),
        lastPlay: Number(row.pet.lastPlay),
        gates: row.gene?.gates ?? null,
        nIn: row.gene?.nIn ?? null,
        nOut: row.gene?.nOut ?? null,
      });
      synced += 1;
    }
  }

  const complete = !timedOut && cursor >= totalOnChain;
  return {
    chainId,
    nextId,
    totalOnChain,
    synced,
    cursor,
    complete,
    archived: countArchivedPets(chainId),
  };
}

/** 分片跑到 complete；供扫链结束 / 手动同步调用。 */
export async function syncChipetPetsFully(
  client: PublicClient,
  chainId: number,
  chipet: Address,
  opts?: { sliceMs?: number; fromId?: number },
): Promise<PetSyncResult> {
  const sliceMs = opts?.sliceMs ?? 15_000;
  let fromId = Math.max(1, Number(opts?.fromId ?? 1) || 1);
  let last: PetSyncResult | null = null;
  for (;;) {
    last = await syncChipetPets(client, chainId, chipet, { fromId, budgetMs: sliceMs });
    if (last.complete) return last;
    fromId = last.cursor + 1;
  }
}

/**
 * 只同步「比存档更大的新宠」；已有档案不重拉（省 eth_call）。
 * 自动扫链完成后应走这条，而不是每次从 #1 全量。
 */
export async function syncChipetPetsIncremental(
  client: PublicClient,
  chainId: number,
  chipet: Address,
  opts?: { sliceMs?: number },
): Promise<PetSyncResult> {
  const fromId = maxArchivedPetId(chainId) + 1;
  return syncChipetPetsFully(client, chainId, chipet, { ...opts, fromId });
}
