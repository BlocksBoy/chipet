import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { closeAdminRedis } from '../src/adminAuth.ts';
import type { ChainCtx } from '../src/chain.ts';
import type { PublicClient } from 'viem';
import { ChainLibrary } from '@tapearena/chain';

const offline = new ChainLibrary({} as PublicClient);
const ctx = (): ChainCtx => ({ chainId: 31337, client: {} as PublicClient, lib: offline, deployment: undefined });

describe('admin auth', () => {
  const prevRedis = process.env.REDIS_URL;

  beforeEach(async () => {
    process.env.ADMIN_TOKEN = 'test-admin-token-32chars-xxxxxx';
    // 测试走内存会话，不依赖 Redis / SQLite
    delete process.env.REDIS_URL;
    await closeAdminRedis();
  });

  afterEach(async () => {
    await closeAdminRedis();
    if (prevRedis === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = prevRedis;
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
