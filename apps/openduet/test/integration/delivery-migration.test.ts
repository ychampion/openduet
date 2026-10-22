import { afterAll, expect, test } from 'bun:test';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrateDatabase } from '../../src/db/migrate.ts';
import { acquireTestServer } from '../helpers/database.ts';
import { createPostgresFixture } from '../helpers/postgres.ts';

const current = fileURLToPath(new URL('../../drizzle', import.meta.url));
const server = await acquireTestServer();
let folder: string | undefined;
afterAll(async () => {
  await server?.release();
  if (
    folder &&
    dirname(resolve(folder)) === resolve(tmpdir()) &&
    resolve(folder).includes('openduet-delivery-upgrade-')
  )
    await rm(folder, { recursive: true, force: true });
});

(server ? test : test.skip)(
  'delivery upgrade preserves opt-outs, adopts one paused brief, and retains duplicate result threads',
  async () => {
    const journal = JSON.parse(await readFile(join(current, 'meta/_journal.json'), 'utf8')) as {
      version: string;
      dialect: string;
      entries: Array<{ tag: string }>;
    };
    folder = await mkdtemp(join(tmpdir(), 'openduet-delivery-upgrade-'));
    await mkdir(join(folder, 'meta'));
    const entries = journal.entries.filter((entry) => Number(entry.tag.slice(0, 4)) < 137);
    for (const entry of entries)
      await copyFile(join(current, `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`));
    await writeFile(join(folder, 'meta/_journal.json'), JSON.stringify({ ...journal, entries }));
    const fixture = await createPostgresFixture({ migrationsFolder: folder });
    if (!fixture) throw new Error('Postgres fixture unavailable');
    try {
      const { sql } = fixture;
      await sql`insert into principal(id, email) values ('own_delivery_upgrade', 'delivery-upgrade@example.test')`;
      await sql`insert into space(id, name, kind, git_path, owner_principal_id) values ('sp_delivery_upgrade', 'Personal', 'personal', '/fixtures/delivery-upgrade', 'own_delivery_upgrade')`;
      await sql`insert into push_setting(principal_id, decisions, settled, weekly_summary) values ('own_delivery_upgrade', false, false, false)`;
      for (const [id, enabled] of [
        ['first', true],
        ['paused', false],
      ] as const) {
        await sql`insert into job(id, space_id, principal_id, kind, title, objective, state) values (${`job_delivery_${id}`}, 'sp_delivery_upgrade', 'own_delivery_upgrade', 'routine', 'Your morning brief', 'Keep this original request and result history.', 'waiting_for_event_or_time')`;
        await sql`insert into trigger(id, job_id, kind, spec, enabled) values (${`trg_delivery_${id}`}, ${`job_delivery_${id}`}, 'schedule', '{"kind":"schedule","cron":"30 8 * * *","timezone":"Asia/Kolkata"}'::jsonb, ${enabled})`;
      }
      await migrateDatabase(fixture);
      const [settings] =
        await sql`select * from push_setting where principal_id = 'own_delivery_upgrade'`;
      expect(settings).toMatchObject({
        decisions: false,
        settled: false,
        weekly_summary: false,
        task_results: false,
        requested_reminders: false,
        daily_brief: false,
        proactive_suggestions: false,
      });
      const [canonical] =
        await sql`select * from personal_daily_brief where space_id = 'sp_delivery_upgrade'`;
      expect(canonical).toMatchObject({
        principal_id: 'own_delivery_upgrade',
        purpose: 'personal.daily_brief',
        trigger_id: 'trg_delivery_paused',
      });
      const registrations =
        await sql`select id, enabled, spec from trigger where id like 'trg_delivery_%' order by id`;
      expect(registrations).toHaveLength(2);
      expect(
        registrations.every((row) => row.enabled === false && row.spec.cron === '30 8 * * *'),
      ).toBe(true);
      expect(await sql`select id from job where id like 'job_delivery_%'`).toHaveLength(2);
      await migrateDatabase(fixture);
      expect(
        await sql`select * from personal_daily_brief where space_id = 'sp_delivery_upgrade'`,
      ).toHaveLength(1);
      expect(
        (await sql`select enabled from trigger where id = 'trg_delivery_paused'`)[0]?.enabled,
      ).toBe(false);
    } finally {
      await fixture.close();
    }
  },
  60_000,
);
