/**
 * 后台分片扫链：HTTP 只启动/查询任务，避免 Cloudflare ~100s 超时导致 502。
 * 另：进程内每小时自动增量同步两条主网。
 */
import type { Address, PublicClient } from 'viem';
import { loadAdminStats, MAINNET_IDS, readLiveBalances, type AdminStats } from '@tapearena/chain';
import {
  getAdminScanCheckpoint,
  latestAdminStats,
  saveAdminScanCheckpoint,
  saveAdminStats,
  type AdminStatsRow,
} from './adminDb.ts';
import { chainCtx, resetChainCtx, rpcHostLabel } from './chain.ts';
import { syncChipetPetsFully, syncChipetPetsIncremental } from './petSync.ts';
import { overlayRechargeStats } from './rechargeEvents.ts';
import { overlayRegisteredStats } from './walletUsers.ts';

export type AdminScanJobStatus = 'idle' | 'running' | 'done' | 'error';

export type AdminScanJob = {
  chainId: number;
  status: AdminScanJobStatus;
  full: boolean;
  startedAt: number;
  updatedAt: number;
  error?: string;
  stats?: AdminStatsRow | AdminStats;
};

type Runner = {
  job: AdminScanJob;
  promise?: Promise<void>;
};

const runners = new Map<number, Runner>();

const SLICE_MS = 20_000;

export function getAdminScanJob(chainId: number): AdminScanJob {
  const r = runners.get(chainId);
  if (r) return { ...r.job };
  return {
    chainId,
    status: 'idle',
    full: false,
    startedAt: 0,
    updatedAt: 0,
  };
}

export function startAdminScanJob(opts: {
  chainId: number;
  full?: boolean;
  client: PublicClient;
  chipet: Address;
  rpcHost: string;
}): AdminScanJob {
  const { chainId, full = false, client, chipet, rpcHost } = opts;
  const existing = runners.get(chainId);
  if (existing?.job.status === 'running') return { ...existing.job };

  const job: AdminScanJob = {
    chainId,
    status: 'running',
    full,
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };
  const runner: Runner = { job };
  runners.set(chainId, runner);

  runner.promise = (async () => {
    try {
      const existingCp = getAdminScanCheckpoint(chainId);
      let checkpoint = full ? null : existingCp;
      let first = true;
      for (;;) {
        const { stats, checkpoint: next } = await loadAdminStats(client, chainId, chipet, {
          rpcHost,
          checkpoint,
          full: first && full,
          budgetMs: SLICE_MS,
          // 商店充值由前端成功后上报，不再扫 BEM Transfer，减轻 RPC 压力
          skipTransfers: true,
          // Played 日志量大且可用；增量/自动巡检跳过，全量重扫仍拉
          skipPlayed: !(first && full),
          rechargeSeed: existingCp,
        });
        first = false;
        saveAdminScanCheckpoint(chainId, next);
        const row = saveAdminStats(stats);
        job.stats = row;
        job.updatedAt = Date.now();
        checkpoint = next;
        if (stats.complete) {
          // 只增量同步新宠，避免每次从 #1 全量 eth_call（dRPC CU 大头之一）
          try {
            const petSync = full
              ? await syncChipetPetsFully(client, chainId, chipet)
              : await syncChipetPetsIncremental(client, chainId, chipet);
            console.log(
              `[admin] pet archive chain=${chainId} synced=${petSync.synced} cursor=${petSync.cursor}/${petSync.totalOnChain}`,
            );
          } catch (e) {
            console.warn('[admin] pet archive sync failed', chainId, e);
          }
          job.status = 'done';
          job.updatedAt = Date.now();
          return;
        }
      }
    } catch (e) {
      job.status = 'error';
      job.error = e instanceof Error ? e.message : String(e);
      job.updatedAt = Date.now();
    }
  })();

  return { ...job };
}

/** 给快照叠注册/充值看板字段，避免扫链原始 hatchers/payers 把前端盖成残缺数据。 */
export function decorateAdminStats(
  stats: AdminStatsRow | AdminStats | null | undefined,
  chainId: number,
): (AdminStatsRow | AdminStats) & {
  registeredOnChain: number;
  walletRegistered: number;
  reportedTxs: number;
} | null {
  const reg = overlayRegisteredStats(chainId);
  const recharge = overlayRechargeStats(chainId);
  if (!stats) return null;
  return {
    ...stats,
    registered: reg.registered,
    registeredOnChain: reg.registeredOnChain,
    walletRegistered: reg.walletRegistered,
    rechargeUsers: recharge.rechargeUsers,
    rechargeTxs: recharge.rechargeTxs,
    rechargeBem: recharge.rechargeBem,
    reportedTxs: recharge.reportedTxs,
  };
}

export function adminStatsPayload(chainId: number) {
  const cached = latestAdminStats(chainId);
  const job = getAdminScanJob(chainId);
  return {
    stats: decorateAdminStats(cached, chainId),
    job: {
      chainId: job.chainId,
      status: job.status,
      full: job.full,
      startedAt: job.startedAt,
      updatedAt: job.updatedAt,
      error: job.error,
      scannedTo: (job.stats as AdminStats | undefined)?.scannedTo ?? cached?.scannedTo,
      head: (job.stats as AdminStats | undefined)?.head ?? cached?.head,
      complete: (job.stats as AdminStats | undefined)?.complete ?? (job.status === 'done' ? true : undefined),
    },
  };
}

/** 默认 6 小时；可用 ADMIN_AUTO_SYNC_MS 覆盖。旧默认 1h 双链 getLogs 把 dRPC CU 打爆。 */
export const ADMIN_AUTO_SYNC_MS = 6 * 60 * 60 * 1000;

function autoSyncIntervalMs(): number {
  const raw = Number(process.env.ADMIN_AUTO_SYNC_MS);
  if (Number.isFinite(raw) && raw >= 60_000) return Math.trunc(raw);
  return ADMIN_AUTO_SYNC_MS;
}

/** 自动巡检链列表；默认只扫 X Layer。BSC 无猫时仍每小时 getLogs 纯浪费 CU。 */
function autoSyncChainIds(): number[] {
  const raw = (process.env.ADMIN_AUTO_SYNC_CHAINS ?? '196').trim();
  if (!raw || raw === 'all') return [...MAINNET_IDS];
  const ids = raw.split(/[,\s]+/).map((s) => Number(s)).filter((n) => MAINNET_IDS.includes(n as 56 | 196));
  return ids.length ? ids : [196];
}

/**
 * light（默认）：只 eth_call 刷新猫咪数 + 国库余额，不拉 eth_getLogs。
 * logs：旧行为，增量 getLogs（可用 ADMIN_AUTO_SYNC_MODE=logs 打开）。
 */
function autoSyncMode(): 'light' | 'logs' {
  const m = (process.env.ADMIN_AUTO_SYNC_MODE ?? 'light').trim().toLowerCase();
  return m === 'logs' ? 'logs' : 'light';
}

/** 轻量刷新：2～3 次 eth_call，写入 noop 快照；游标不变。 */
async function runAdminLightRefresh(chainId: number, reason: string) {
  resetChainCtx(chainId);
  const x = chainCtx(chainId);
  const chipet = x.deployment?.chipet;
  const rpcHost = rpcHostLabel(chainId);
  const head = await x.client.getBlockNumber();
  const { cats, treasuryBal } = await readLiveBalances(x.client, chainId, chipet);
  const prev = latestAdminStats(chainId);
  const cp = getAdminScanCheckpoint(chainId);
  const scannedTo = cp?.scannedTo ?? prev?.scannedTo ?? head.toString();
  const stats: AdminStats = {
    chainId,
    cats,
    registered: prev?.registered ?? 0,
    players: prev?.players ?? 0,
    rechargeUsers: prev?.rechargeUsers ?? 0,
    rechargeTxs: prev?.rechargeTxs ?? cp?.rechargeTxs ?? 0,
    rechargeBem: prev?.rechargeBem ?? '0',
    treasuryBal,
    scannedTo,
    scannedFrom: scannedTo,
    scanMode: 'noop',
    complete: true,
    head: head.toString(),
    rpcHost,
    note: `自动轻量刷新（${reason}）：未拉日志，仅更新猫咪数与收款余额。`,
  };
  saveAdminStats(stats);
  // 只补新宠，不重扫旧宠
  if (chipet) {
    try {
      const petSync = await syncChipetPetsIncremental(x.client, chainId, chipet);
      if (petSync.synced > 0) {
        console.log(`[admin-auto-sync] ${reason} chain=${chainId} newPets=${petSync.synced}`);
      }
    } catch (e) {
      console.warn(`[admin-auto-sync] ${reason} pet sync failed`, chainId, e);
    }
  }
  console.log(`[admin-auto-sync] ${reason} chain=${chainId} mode=light cats=${cats} head=#${head}`);
}

/** 对配置链各启一次自动同步（已在跑则跳过）。 */
export function kickAdminIncrementalSync(reason = 'manual') {
  const mode = autoSyncMode();
  const chains = autoSyncChainIds();
  for (const chainId of chains) {
    void (async () => {
      try {
        if (mode === 'light') {
          await runAdminLightRefresh(chainId, reason);
          return;
        }
        resetChainCtx(chainId);
        const x = chainCtx(chainId);
        if (!x.deployment?.chipet) {
          console.warn(`[admin-auto-sync] skip chain ${chainId}: chipet not deployed`);
          return;
        }
        const job = startAdminScanJob({
          chainId,
          full: false,
          client: x.client,
          chipet: x.deployment.chipet,
          rpcHost: rpcHostLabel(chainId),
        });
        console.log(`[admin-auto-sync] ${reason} chain=${chainId} mode=logs status=${job.status}`);
      } catch (e) {
        console.error(`[admin-auto-sync] ${reason} chain=${chainId} failed`, e);
      }
    })();
  }
}

/**
 * 启动后短暂延迟跑一次，之后按 interval 自动巡检。
 * 默认 light + 仅 196 + 6h，避免 dRPC eth_getLogs CU 暴涨。
 */
export function startAdminAutoSync(opts?: { intervalMs?: number; initialDelayMs?: number }) {
  const intervalMs = opts?.intervalMs ?? autoSyncIntervalMs();
  const initialDelayMs = opts?.initialDelayMs ?? 15_000;
  const tick = () => kickAdminIncrementalSync('scheduled');
  const initial = setTimeout(() => {
    kickAdminIncrementalSync('boot');
  }, initialDelayMs);
  const timer = setInterval(tick, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  if (typeof initial.unref === 'function') initial.unref();
  console.log(
    `[admin-auto-sync] mode=${autoSyncMode()} chains=${autoSyncChainIds().join(',')} `
    + `every ${Math.round(intervalMs / 60000)}m (first in ${Math.round(initialDelayMs / 1000)}s)`,
  );
  return () => {
    clearTimeout(initial);
    clearInterval(timer);
  };
}
