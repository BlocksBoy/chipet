import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeAdminDb } from '../src/adminDb.ts';
import {
  getWalletProfile, insertActivity, insertNote, listFeed, listNotes,
  putWalletProfile, toggleLike, bumpPetAgg,
} from '../src/chipetSocial.ts';
import { getWalletBem, putWalletBem } from '../src/chipetBem.ts';
import { getWalletPets, putWalletPets } from '../src/chipetWalletPets.ts';
import { createApp } from '../src/app.ts';
import type { PublicClient } from 'viem';
import { ChainLibrary } from '@tapearena/chain';
import type { ChainCtx } from '../src/chain.ts';

const offline = new ChainLibrary({} as PublicClient);
const ctx = (): ChainCtx => ({ chainId: 31337, client: {} as PublicClient, lib: offline, deployment: undefined });

const ADDR = '0x1111111111111111111111111111111111111111';
const ADDR2 = '0x2222222222222222222222222222222222222222';

describe('chipet social sync', () => {
  let dir: string;
  const prev = process.env.ADMIN_DB_PATH;

  beforeEach(() => {
    closeAdminDb();
    dir = mkdtempSync(join(tmpdir(), 'chipet-social-'));
    process.env.ADMIN_DB_PATH = join(dir, 'social.sqlite');
  });

  afterEach(() => {
    closeAdminDb();
    rmSync(dir, { recursive: true, force: true });
    if (prev === undefined) delete process.env.ADMIN_DB_PATH;
    else process.env.ADMIN_DB_PATH = prev;
  });

  it('空库种子动态可见', () => {
    const feed = listFeed({ limit: 10 });
    expect(feed.items.length).toBeGreaterThanOrEqual(5);
    expect(feed.items.some((a) => a.id === 'a0')).toBe(true);
    expect(feed.likes.a0).toBe(5);
    expect(listNotes('npc:-3').length).toBe(2);
  });

  it('写动态 / 留言 / 点赞 / pet-agg', () => {
    const act = insertActivity({
      kind: 'checkin',
      actor: 'Alice',
      text: { zh: '签到', en: 'checkin' },
      wallet: ADDR,
    });
    expect(act.id).toBeTruthy();
    const note = insertNote({
      petKey: 'npc:-1',
      from: 'Alice',
      text: 'hello',
      wallet: ADDR,
    });
    expect(note.petKey).toBe('npc:-1');
    const like = toggleLike(act.id, ADDR);
    expect(like.liked).toBe(true);
    expect(like.likes).toBe(1);
    expect(toggleLike(act.id, ADDR).liked).toBe(false);
    const agg = bumpPetAgg('npc:-1', 'pats', 1);
    expect(agg.pats).toBeGreaterThan(0);
  });

  it('profile / bem / local-pets 按钱包读写；空则 exists=false', () => {
    expect(getWalletProfile(ADDR).exists).toBe(false);
    const p = putWalletProfile({ address: ADDR, displayName: '小芯', fish: 9, checkinDay: '2026-04-01' });
    expect(p.exists).toBe(true);
    expect(getWalletProfile(ADDR).fish).toBe(9);

    expect(getWalletBem(ADDR).exists).toBe(false);
    putWalletBem({ address: ADDR, demoBal: 20, faucetDay: '2026-04-01' });
    expect(getWalletBem(ADDR).demoBal).toBe(20);

    expect(getWalletPets(ADDR).exists).toBe(false);
    putWalletPets(ADDR, [{
      id: 1, name: '青橘', cpu: '0x000000000000000000000000000000000000c111',
      circuitId: '1017', rarity: 0, energy: 80, mood: 70, intimacy: 0, level: 1,
      xp: 0, wins: 0, losses: 0, lastFeed: 0, lastPlay: 0, hatchedAt: Date.now(),
    }]);
    expect(getWalletPets(ADDR).pets).toHaveLength(1);
  });

  it('HTTP：feed 公开；profile 需 address；留言限流', async () => {
    const app = createApp({ ctx });
    const feed = await app.request('/api/chipet/feed');
    expect(feed.status).toBe(200);
    const fj = await feed.json() as { items: unknown[] };
    expect(fj.items.length).toBeGreaterThan(0);

    const noAddr = await app.request('/api/chipet/profile');
    expect(noAddr.status).toBe(400);

    const put = await app.request('/api/chipet/profile', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address: ADDR, displayName: 'Bob', fish: 3 }),
    });
    expect(put.status).toBe(200);

    const get = await app.request(`/api/chipet/profile?address=${ADDR}`);
    expect((await get.json() as { fish: number }).fish).toBe(3);

    // 留言：连续超限应 429
    for (let i = 0; i < 5; i++) {
      const r = await app.request('/api/chipet/notes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address: ADDR2, petKey: `npc:-${i + 1}`, from: 'x', text: `msg${i}-${Date.now()}` }),
      });
      expect(r.status).toBe(200);
    }
    const limited = await app.request('/api/chipet/notes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address: ADDR2, petKey: 'npc:-9', from: 'x', text: `extra-${Date.now()}` }),
    });
    expect(limited.status).toBe(429);
  });
});
