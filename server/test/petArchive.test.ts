import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeAdminDb } from '../src/adminDb.ts';
import { countArchivedPets, listArchivedPets, upsertArchivedPet } from '../src/petArchive.ts';

describe('petArchive', () => {
  let dir: string;
  const prev = process.env.ADMIN_DB_PATH;

  beforeEach(() => {
    closeAdminDb();
    dir = mkdtempSync(join(tmpdir(), 'chipet-pets-'));
    process.env.ADMIN_DB_PATH = join(dir, 'admin.sqlite');
  });

  afterEach(() => {
    closeAdminDb();
    rmSync(dir, { recursive: true, force: true });
    if (prev === undefined) delete process.env.ADMIN_DB_PATH;
    else process.env.ADMIN_DB_PATH = prev;
  });

  it('upsert 属性并分页（每页 20）', () => {
    for (let i = 1; i <= 25; i++) {
      upsertArchivedPet({
        chainId: 196,
        petId: i,
        owner: `0x${i.toString(16).padStart(40, '0')}`,
        name: `Cat${i}`,
        cpu: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        circuitId: i,
        rarity: i % 3,
        energy: 50 + (i % 40),
        mood: 60,
        intimacy: i,
        level: 1 + (i % 5),
        lastFeed: 1000 + i,
        lastPlay: 2000 + i,
        gates: 9,
        nIn: 3,
        nOut: 2,
      });
    }
    expect(countArchivedPets(196)).toBe(25);

    const p1 = listArchivedPets({ chainId: 196, page: 1, pageSize: 20 });
    expect(p1.total).toBe(25);
    expect(p1.pages).toBe(2);
    expect(p1.items).toHaveLength(20);
    expect(p1.items[0]?.petId).toBe(25); // DESC

    const p2 = listArchivedPets({ chainId: 196, page: 2, pageSize: 20 });
    expect(p2.items).toHaveLength(5);
    expect(p2.items[0]?.petId).toBe(5);

    upsertArchivedPet({
      chainId: 196,
      petId: 25,
      owner: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      name: 'Renamed',
      cpu: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      circuitId: 25,
      rarity: 2,
      energy: 100,
      mood: 100,
      intimacy: 99,
      level: 9,
      lastFeed: 9999,
      lastPlay: 9999,
      gates: 12,
      nIn: 4,
      nOut: 3,
    });
    upsertArchivedPet({
      chainId: 56,
      petId: 1,
      owner: '0xcccccccccccccccccccccccccccccccccccccccc',
      name: 'BscCat',
      cpu: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      circuitId: 1,
      rarity: 0,
      energy: 10,
      mood: 10,
      intimacy: 1,
      level: 1,
      lastFeed: 1,
      lastPlay: 1,
    });
    const again = listArchivedPets({ chainId: 196, page: 1, pageSize: 1 });
    expect(again.items[0]).toMatchObject({ petId: 25, name: 'Renamed', energy: 100, gates: 12 });
    expect(countArchivedPets(196)).toBe(25);
    expect(countArchivedPets(null)).toBe(26);
    const all = listArchivedPets({ page: 1, pageSize: 30 });
    expect(all.total).toBe(26);
    expect(all.items.some((x) => x.chainId === 56 && x.petId === 1)).toBe(true);
  });
});
