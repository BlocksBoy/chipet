/**
 * 后台分片扫链：HTTP 只启动/查询任务，避免 Cloudflare ~100s 超时导致 502。
 * 另：进程内每小时自动增量同步两条主网。
 */
import type { Address, PublicClient } from 'viem';
import { chipetAddresses, loadAdminStats, MAINNET_IDS, type AdminStats } from '@tapearena/chain';
import {
  getAdminScanCheckpoint,
  latestAdminStats,
  saveAdminScanCheckpoint,
  saveAdminStats,
  type AdminStatsRow,
} from './adminDb.ts';
import { chainCtx, resetChainCtx, rpcHostLabel } from './chain.ts';
import { syncAllChipetPetsFully } from './petSync.ts';
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
      const dep = chainCtx(chainId).deployment;
      const addrs = chipetAddresses(dep);
      const scanAddrs = addrs.length ? addrs : [chipet];
      for (;;) {
        const { stats, checkpoint: next } = await loadAdminStats(client, chainId, scanAddrs, {
          rpcHost,
          checkpoint,
          full: first && full,
          budgetMs: SLICE_MS,
          // 商店充值由前端成功后上报，不再扫 BEM Transfer，减轻 RPC 压力
          skipTransfers: true,
          rechargeSeed: existingCp,
        });
        first = false;
        saveAdminScanCheckpoint(chainId, next);
        const row = saveAdminStats(stats);
        job.stats = row;
        job.updatedAt = Date.now();
        checkpoint = next;
        if (stats.complete) {
          // 扫链完成后把全量宠物属性落库（当前 + 历史 Chipet）
          try {
            const primary = dep?.chipet ?? chipet;
            await syncAllChipetPetsFully(client, chainId, primary, dep?.chipetLegacy ?? []);
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
export function decorateAdminStats<T extends object>(
  stats: T | null | undefined,
  chainId: number,
): (T & {
  registered: number;
  registeredOnChain: number;
  walletRegistered: number;
  rechargeUsers: number;
  rechargeTxs: number;
  rechargeBem: string;
  reportedTxs: number;
}) | null {
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

export const ADMIN_AUTO_SYNC_MS = 60 * 60 * 1000;

/** 对 MAINNET_IDS 各启一次增量扫（已在跑则跳过）。 */
export function kickAdminIncrementalSync(reason = 'manual') {
  for (const chainId of MAINNET_IDS) {
    try {
      resetChainCtx(chainId);
      const x = chainCtx(chainId);
      if (!x.deployment?.chipet) {
        console.warn(`[admin-auto-sync] skip chain ${chainId}: chipet not deployed`);
        continue;
      }
      const job = startAdminScanJob({
        chainId,
        full: false,
        client: x.client,
        chipet: x.deployment.chipet,
        rpcHost: rpcHostLabel(chainId),
      });
      console.log(`[admin-auto-sync] ${reason} chain=${chainId} status=${job.status}`);
    } catch (e) {
      console.error(`[admin-auto-sync] ${reason} chain=${chainId} failed`, e);
    }
  }
}

/**
 * 启动后短暂延迟跑一次，之后每 hourMs 自动增量入库。
 * 返回 stop()，供测试或热重载清理。
 */
export function startAdminAutoSync(opts?: { intervalMs?: number; initialDelayMs?: number }) {
  const intervalMs = opts?.intervalMs ?? ADMIN_AUTO_SYNC_MS;
  const initialDelayMs = opts?.initialDelayMs ?? 15_000;
  const tick = () => kickAdminIncrementalSync('hourly');
  const initial = setTimeout(() => {
    kickAdminIncrementalSync('boot');
  }, initialDelayMs);
  const timer = setInterval(tick, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  if (typeof initial.unref === 'function') initial.unref();
  console.log(`[admin-auto-sync] scheduled every ${Math.round(intervalMs / 60000)}m (first in ${Math.round(initialDelayMs / 1000)}s)`);
  return () => {
    clearTimeout(initial);
    clearInterval(timer);
  };
}
