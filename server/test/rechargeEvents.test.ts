import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PublicClient } from 'viem';
import { ChainLibrary } from '@tapearena/chain';
import { closeAdminDb, saveAdminScanCheckpoint } from '../src/adminDb.ts';
import { overlayRechargeStats, recordRecharge } from '../src/rechargeEvents.ts';
import { createApp } from '../src/app.ts';
import type { ChainCtx } from '../src/chain.ts';

const offline = new ChainLibrary({} as PublicClient);
const ctx = (): ChainCtx => ({ chainId: 31337, client: {} as PublicClient, lib: offline, deployment: undefined });

const ADDR = '0x1111111111111111111111111111111111111111';
const TX1 = `0x${'11'.repeat(32)}`;
const TX2 = `0x${'22'.repeat(32)}`;

describe('rechargeEvents', () => {
  let dir: string;
  const prev = process.env.ADMIN_DB_PATH;

  beforeEach(() => {
    closeAdminDb();
    dir = mkdtempSync(join(tmpdir(), 'chipet-recharge-'));
    process.env.ADMIN_DB_PATH = join(dir, 'admin.sqlite');
  });

  afterEach(() => {
    closeAdminDb();
    rmSync(dir, { recursive: true, force: true });
    if (prev === undefined) delete process.env.ADMIN_DB_PATH;
    else process.env.ADMIN_DB_PATH = prev;
  });

  it('txHash 去重；看板 = 扫链基线 + 上报', () => {
    saveAdminScanCheckpoint(196, {
      scannedTo: '100',
      rechargeTxs: 2,
      rechargeBemRaw: '100000000', // 1 BEM @ 8 decimals
      payers: ['0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
      hatchers: [],
      playedPets: [],
      players: [],
    });

    expect(recordRecharge({
      address: ADDR,
      chainId: 196,
      txHash: TX1,
      amountRaw: '200000000', // 2 BEM
      sku: 'energy',
    })).toEqual({ isNew: true, txs: 1 });

    expect(recordRecharge({
      address: ADDR,
      chainId: 196,
      txHash: TX1,
      amountRaw: '200000000',
    })).toEqual({ isNew: false, txs: 1 });

    expect(recordRecharge({
      address: '0x2222222222222222222222222222222222222222',
      chainId: 196,
      txHash: TX2,
      amountRaw: '300000000',
    }).isNew).toBe(true);

    const o = overlayRechargeStats(196);
    expect(o.rechargeTxs).toBe(4); // 2 frozen + 2 reported
    expect(o.rechargeUsers).toBe(3);
    expect(o.rechargeBem).toBe('6'); // 1+2+3
    expect(o.reportedTxs).toBe(2);
  });

  it('POST /api/recharges/report', async () => {
    const app = createApp({ ctx });
    const r = await app.request('/api/recharges/report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        address: ADDR,
        chainId: 196,
        txHash: TX1,
        amountRaw: '800000000',
        sku: 'egg_fancy',
      }),
    });
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j).toMatchObject({ ok: true, isNew: true, rechargeTxs: 1, reportedTxs: 1 });
  });
});
