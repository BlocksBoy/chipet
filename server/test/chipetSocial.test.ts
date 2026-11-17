import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeAdminDb } from '../src/adminDb.ts';
import {
  bootstrapPublic, getWalletProfile, insertActivity, insertNote, listFeed, listLeaderboard, listNotes,
  putWalletProfile, toggleLike, bumpPetAgg, upsertPetStats, recomputeAndStoreLeaderboards, scorePet,
} from '../src/chipetSocial.ts';
import { getAdminDb } from '../src/adminDb.ts';
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

  it('bootstrap 把本地动态/留言/摸访灌进库，重复 id 不重复插', () => {
    const r1 = bootstrapPublic({
      activities: [{
        id: 'boot-a1', at: Date.now(), kind: 'pat', actor: 'Alice',
        petKey: 'npc:-1', petName: '青橘', text: '摸了摸',
      }],
      notes: [{
        id: 'boot-n1', petKey: 'npc:-1', from: 'Alice', text: '你好', at: Date.now(),
      }],
      petAggs: [{ petKey: 'npc:-1', pats: 99, visits: 50 }],
    });
    expect(r1.activities).toBe(1);
    expect(r1.notes).toBe(1);
    expect(listFeed({ limit: 20 }).items.some((a) => a.id === 'boot-a1')).toBe(true);
    expect(listNotes('npc:-1').some((n) => n.id === 'boot-n1')).toBe(true);

    const r2 = bootstrapPublic({
      activities: [{
        id: 'boot-a1', at: Date.now(), kind: 'pat', actor: 'Alice',
        petKey: 'npc:-1', petName: '青橘', text: '摸了摸',
      }],
      petAggs: [{ petKey: 'npc:-1', pats: 10, visits: 80 }],
    });
    expect(r2.activities).toBe(0);
    // pats 取 max(99,10)=99；visits 取 max(50,80)=80
    const heat = listLeaderboard('pats', 10);
    const row = heat.find((p) => p.petKey === 'npc:-1');
    expect(row?.pats).toBe(99);
  });

  it('排行榜：现算落库再读；heat 公式正确', () => {
    bumpPetAgg('npc:-3', 'pats', 10);
    upsertPetStats({ petKey: 'mine:1', name: '测试猫', wins: 3, level: 2, intimacy: 9, rarity: 1, circuitId: '99', routeId: 1 });
    const n = recomputeAndStoreLeaderboards();
    expect(n).toBeGreaterThan(0);
    const stored = getAdminDb().prepare(`SELECT COUNT(*) AS n FROM chipet_leaderboard WHERE kind = 'heat'`).get() as { n: number };
    expect(Number(stored.n)).toBeGreaterThan(0);

    const heat = listLeaderboard('heat', 10);
    expect(heat.length).toBeGreaterThan(0);
    expect(heat[0]!.score).toBeGreaterThan(0);
    // 校验 top 分数符合公式（用返回行自身字段）
    const top = heat[0]!;
    expect(top.score).toBe(scorePet('heat', top, top.recent));

    const pats = listLeaderboard('pats', 3);
    expect(pats.some((p) => p.petKey === 'npc:-3')).toBe(true);
    const wins = listLeaderboard('wins', 10);
    expect(wins.some((p) => p.petKey === 'mine:1' && p.wins === 3)).toBe(true);
  });

  it('排行榜：不把 mine:id 占位当成展示名；无名鬼宠不入榜', () => {
    bumpPetAgg('mine:42', 'pats', 5);
    bumpPetAgg('mine:99', 'pats', 8);
    getAdminDb().prepare(`
      INSERT INTO chipet_activities (id, at, kind, actor_json, pet_key, pet_name, text_json, wallet)
      VALUES ('act-name-1', ?, 'pat', '"A"', 'mine:42', '豆花', '"摸了摸"', '')
    `).run(Date.now());
    recomputeAndStoreLeaderboards();
    const row = listLeaderboard('pats', 20).find((p) => p.petKey === 'mine:42');
    expect(row?.name).toBe('豆花');
    expect(row?.name).not.toMatch(/^mine:/);
    expect(listLeaderboard('pats', 50).some((p) => p.petKey === 'mine:99')).toBe(false);
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
