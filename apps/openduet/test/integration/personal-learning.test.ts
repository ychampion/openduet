/** Explicit preferences use the same durable recall that a subsequent task gets. */
import { afterAll, describe, expect, test } from 'bun:test';
import { memoryItemResponse } from '@openduet/contracts';
import { ExperienceMemory } from '../../src/experience/memory.ts';
import { recall } from '../../src/memory/recall.ts';
import { createJournal } from './lifecycle-fixtures.ts';
import { createScope, createTestDatabase } from './postgres.ts';

const db = await createTestDatabase();
const journal = await createJournal();
afterAll(async () => {
  await journal.close();
  await db?.close();
});

(db ? describe : describe.skip)('explicit learning on subsequent work', () => {
  test('save, correct and forget change current task recall without creating recurring work', async () => {
    if (!db) return;
    const scope = await createScope(db);
    const memory = new ExperienceMemory(db.sql, journal.journal);
    const before = await db.sql`select count(*)::int as n from job`;
    const original =
      'For client follow-ups, keep the message under 120 words and make one clear ask.';
    const saved = memoryItemResponse.parse(
      await memory.create(scope.spaceId, scope.ownerId, {
        key: 'pref.client-followups.style',
        value: original,
        statement: original,
      }),
    ).item;
    const nextTask = () =>
      recall(
        db.sql,
        scope,
        { query: 'Draft the next client follow-up for Priya.', max_tokens: 2000 },
        { includeProfile: true },
      );
    expect((await nextTask()).items.map((item) => item.content)).toContain(original);

    const revised =
      'For client follow-ups, keep the message under 80 words and make one clear ask.';
    await memory.edit(scope.spaceId, scope.ownerId, saved.id, {
      value: revised,
      version: saved.version,
    });
    const afterEdit = (await nextTask()).items.map((item) => item.content);
    expect(afterEdit).toContain(revised);
    expect(afterEdit).not.toContain(original);

    expect(await memory.forget(scope.spaceId, scope.ownerId, saved.id)).toEqual({ status: 'ok' });
    expect((await nextTask()).items.map((item) => item.content)).not.toContain(revised);
    expect((await db.sql`select count(*)::int as n from job`)[0]?.n).toBe(before[0]?.n);
    expect((await db.sql`select count(*)::int as n from trigger`)[0]?.n).toBe(0);
  }, 30000);
});
