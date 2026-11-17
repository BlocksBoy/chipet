import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeAdminDb } from '../src/adminDb.ts';
import { listFeed, resetChipetSocialSchemaCacheForTests } from '../src/chipetSocial.ts';
import {
  enqueueActivity, enqueueLikeToggle, enqueuePetAggBump, flushWriteQueue,
  listFeedWithPending, resetWriteQueueForTests, writeQueueDepth,
} from '../src/chipetWriteQueue.ts';

const ADDR = '0x1111111111111111111111111111111111111111';

describe('chipetWriteQueue', () => {
  let dir: string;
  const prevDb = process.env.ADMIN_DB_PATH;
  const prevRedis = process.env.REDIS_URL;

  beforeEach(() => {
    closeAdminDb();
    resetChipetSocialSchemaCacheForTests();
    resetWriteQueueForTests();
    dir = mkdtempSync(join(tmpdir(), 'chipet-wq-'));
    process.env.ADMIN_DB_PATH = join(dir, 'wq.sqlite');
    delete process.env.REDIS_URL; // 测内存回落
  });

  afterEach(async () => {
    await flushWriteQueue();
    resetWriteQueueForTests();
    closeAdminDb();
    resetChipetSocialSchemaCacheForTests();
    rmSync(dir, { recursive: true, force: true });
    if (prevDb === undefined) delete process.env.ADMIN_DB_PATH;
    else process.env.ADMIN_DB_PATH = prevDb;
    if (prevRedis === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = prevRedis;
  });

  it('动态入队后立即可读，flush 后落库', async () => {
    const item = await enqueueActivity({
      id: 'wq-a1',
      kind: 'pat',
      actor: 'Alice',
      petKey: 'npc:-1',
      petName: '青橘',
      text: '摸了摸',
    });
    expect(item.id).toBe('wq-a1');
    expect(listFeedWithPending({ limit: 10 }).items.some((a) => a.id === 'wq-a1')).toBe(true);
    // 尚未 flush：SQLite 直读可能还没有（种子除外）
    expect(await writeQueueDepth()).toBeGreaterThanOrEqual(1);

    const n = await flushWriteQueue();
    expect(n).toBeGreaterThanOrEqual(1);
    expect(listFeed({ limit: 20 }).items.some((a) => a.id === 'wq-a1')).toBe(true);
    expect(await writeQueueDepth()).toBe(0);
  });

  it('点赞 / 摸访 pending 合并，flush 后一致', async () => {
    await enqueueActivity({
      id: 'wq-a2', kind: 'note', actor: 'Bob', petKey: 'npc:-2', petName: '比特', text: 'hi',
    });
    const like = await enqueueLikeToggle('wq-a2', ADDR);
    expect(like.liked).toBe(true);
    expect(like.likes).toBe(1);

    const agg = await enqueuePetAggBump('npc:-2', 'pats', 3);
    expect(agg.pats).toBeGreaterThanOrEqual(3);

    await flushWriteQueue();
    const like2 = await enqueueLikeToggle('wq-a2', ADDR);
    expect(like2.liked).toBe(false);
    await flushWriteQueue();
  });
});
