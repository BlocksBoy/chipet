import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  closeAdminDb,
  getAdminScanCheckpoint,
  latestAdminStats,
  listAdminStatsHistory,
  saveAdminScanCheckpoint,
  saveAdminStats,
} from '../src/adminDb.ts';

const baseStats = {
  chainId: 196,
  cats: 3,
  registered: 2,
  players: 1,
  rechargeUsers: 1,
  rechargeTxs: 2,
  rechargeBem: '1.5',
  treasuryBal: '0.5',
  scannedTo: '123',
  scannedFrom: '100',
  scanMode: 'full' as const,
  complete: true,
  head: '123',
  rpcHost: 'xlayer-mainnet.g.alchemy.com',
  note: 'test',
};

describe('adminDb sqlite', () => {
  let dir: string;
  const prev = process.env.ADMIN_DB_PATH;

  beforeEach(() => {
    closeAdminDb();
    dir = mkdtempSync(join(tmpdir(), 'chipet-admin-'));
    process.env.ADMIN_DB_PATH = join(dir, 'admin.sqlite');
  });

  afterEach(() => {
    closeAdminDb();
    rmSync(dir, { recursive: true, force: true });
    if (prev === undefined) delete process.env.ADMIN_DB_PATH;
    else process.env.ADMIN_DB_PATH = prev;
  });

  it('写入并读出最新快照与历史', () => {
    const row = saveAdminStats(baseStats);
    expect(row.id).toBeGreaterThan(0);
    expect(row.source).toBe('live');
    expect(row.scanMode).toBe('full');

    const cached = latestAdminStats(196);
    expect(cached?.cats).toBe(3);
    expect(cached?.source).toBe('cache');
    expect(cached?.id).toBe(row.id);

    saveAdminStats({
      ...baseStats,
      cats: 4,
      scannedTo: '124',
      scannedFrom: '124',
      scanMode: 'incremental',
      complete: true,
      head: '124',
      note: 'test2',
    });
    expect(latestAdminStats(196)?.cats).toBe(4);
    expect(latestAdminStats(196)?.scanMode).toBe('incremental');
    expect(listAdminStatsHistory(196, 10)).toHaveLength(2);
    expect(latestAdminStats(56)).toBeNull();
  });

  it('持久化增量游标 checkpoint', () => {
    expect(getAdminScanCheckpoint(196)).toBeNull();
    saveAdminScanCheckpoint(196, {
      scannedTo: '500',
      rechargeTxs: 2,
      rechargeBemRaw: '1500000000000000000',
      payers: ['0xabc'],
      hatchers: ['0xdef'],
      playedPets: ['1', '2'],
      players: ['0xdef'],
    });
    const cp = getAdminScanCheckpoint(196);
    expect(cp?.scannedTo).toBe('500');
    expect(cp?.payers).toEqual(['0xabc']);
    expect(cp?.playedPets).toEqual(['1', '2']);

    saveAdminScanCheckpoint(196, {
      scannedTo: '600',
      rechargeTxs: 3,
      rechargeBemRaw: '2000000000000000000',
      payers: ['0xabc', '0x111'],
      hatchers: ['0xdef'],
      playedPets: ['1', '2', '3'],
      players: ['0xdef', '0x222'],
    });
    expect(getAdminScanCheckpoint(196)?.scannedTo).toBe('600');
    expect(getAdminScanCheckpoint(196)?.payers).toHaveLength(2);
  });
});
