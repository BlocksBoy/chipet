/**
 * 后台分片扫链：HTTP 只启动/查询任务，避免 Cloudflare ~100s 超时导致 502。
 */
import type { Address, PublicClient } from 'viem';
import { loadAdminStats, type AdminStats } from '@tapearena/chain';
import {
  getAdminScanCheckpoint,
  latestAdminStats,
  saveAdminScanCheckpoint,
  saveAdminStats,
  type AdminStatsRow,
} from './adminDb.ts';

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
      let checkpoint = full ? null : getAdminScanCheckpoint(chainId);
      let first = true;
      for (;;) {
        const { stats, checkpoint: next } = await loadAdminStats(client, chainId, chipet, {
          rpcHost,
          checkpoint,
          full: first && full,
          budgetMs: SLICE_MS,
        });
        first = false;
        saveAdminScanCheckpoint(chainId, next);
        const row = saveAdminStats(stats);
        job.stats = row;
        job.updatedAt = Date.now();
        checkpoint = next;
        if (stats.complete) {
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

export function adminStatsPayload(chainId: number) {
  const cached = latestAdminStats(chainId);
  const job = getAdminScanJob(chainId);
  return {
    stats: cached,
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
