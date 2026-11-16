import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.ts';
import { closeAdminDb } from '../src/adminDb.ts';
import type { ChainCtx } from '../src/chain.ts';
import type { PublicClient } from 'viem';
import { ChainLibrary } from '@tapearena/chain';

const offline = new ChainLibrary({} as PublicClient);
const ctx = (): ChainCtx => ({ chainId: 31337, client: {} as PublicClient, lib: offline, deployment: undefined });

describe('admin auth', () => {
  let dir: string;
  const prevDb = process.env.ADMIN_DB_PATH;

  beforeEach(() => {
    process.env.ADMIN_TOKEN = 'test-admin-token-32chars-xxxxxx';
    closeAdminDb();
    dir = mkdtempSync(join(tmpdir(), 'chipet-admin-auth-'));
    process.env.ADMIN_DB_PATH = join(dir, 'admin.sqlite');
  });

  afterEach(() => {
    closeAdminDb();
    rmSync(dir, { recursive: true, force: true });
    if (prevDb === undefined) delete process.env.ADMIN_DB_PATH;
    else process.env.ADMIN_DB_PATH = prevDb;
  });

  it('拒绝未配置口令的登录', async () => {
    delete process.env.ADMIN_TOKEN;
    const app = createApp({ ctx, chat: async () => '' });
    const r = await app.request('/api/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'x' }),
    });
    expect(r.status).toBe(503);
  });

  it('错误口令返回 401', async () => {
    const app = createApp({ ctx, chat: async () => '' });
    const r = await app.request('/api/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'wrong-token-wrong-token' }),
    });
    expect(r.status).toBe(401);
    expect((await r.json()).code).toBe('unauthorized');
  });

  it('正确口令设置会话 Cookie，并可访问 session', async () => {
    const app = createApp({ ctx, chat: async () => '' });
    const login = await app.request('/api/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: process.env.ADMIN_TOKEN }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/chipet_admin=/);
    expect(cookie.toLowerCase()).toMatch(/httponly/);

    const session = await app.request('/api/admin/session', {
      headers: { cookie: cookie.split(';')[0]! },
    });
    expect(session.status).toBe(200);
  });

  it('无会话访问 stats 返回 401', async () => {
    const app = createApp({ ctx, chat: async () => '' });
    const r = await app.request('/api/admin/stats?chainId=196');
    expect(r.status).toBe(401);
  });
});
