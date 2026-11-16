import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeAdminDb } from '../src/adminDb.ts';
import { countWalletUsers, registerWallet } from '../src/walletUsers.ts';
import { createApp } from '../src/app.ts';
import type { PublicClient } from 'viem';
import { ChainLibrary } from '@tapearena/chain';
import type { ChainCtx } from '../src/chain.ts';

const offline = new ChainLibrary({} as PublicClient);
const ctx = (): ChainCtx => ({ chainId: 31337, client: {} as PublicClient, lib: offline, deployment: undefined });

describe('walletUsers', () => {
  let dir: string;
  const prev = process.env.ADMIN_DB_PATH;

  beforeEach(() => {
    closeAdminDb();
    dir = mkdtempSync(join(tmpdir(), 'chipet-wallet-'));
    process.env.ADMIN_DB_PATH = join(dir, 'wallet.sqlite');
  });

  afterEach(() => {
    closeAdminDb();
    rmSync(dir, { recursive: true, force: true });
    if (prev === undefined) delete process.env.ADMIN_DB_PATH;
    else process.env.ADMIN_DB_PATH = prev;
  });

  it('新地址入库 +1，重复连接不重复计数', () => {
    const a = '0x1111111111111111111111111111111111111111';
    expect(registerWallet(a, 196)).toEqual({ isNew: true, total: 1 });
    expect(registerWallet(a, 56)).toEqual({ isNew: false, total: 1 });
    expect(registerWallet('0x2222222222222222222222222222222222222222', 56)).toEqual({ isNew: true, total: 2 });
    expect(countWalletUsers()).toBe(2);
  });

  it('POST /api/users/register 校验并登记', async () => {
    const app = createApp({ ctx });
    const bad = await app.request('/api/users/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address: 'not-an-addr' }),
    });
    expect(bad.status).toBe(400);

    const ok = await app.request('/api/users/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address: '0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa', chainId: 196 }),
    });
    expect(ok.status).toBe(200);
    const j = await ok.json();
    expect(j).toMatchObject({ ok: true, isNew: true, registered: 1 });
  });
});
