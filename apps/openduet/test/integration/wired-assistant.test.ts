import { afterAll, describe, expect, test } from 'bun:test';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { APPROVAL_OUTDATED_NOTE, type AttemptBundle } from '@openduet/contracts';
import { loadEnv } from '../../src/env.ts';
import { createScriptedProvider } from '../../src/gateway/fake.ts';
import { newId } from '../../src/ids.ts';
import { bootstrap } from '../../src/index.ts';
import { startQueue } from '../../src/jobs/queue.ts';
import { FileRestrictionJournal } from '../../src/memory/restore.ts';
import type { AttemptTiming } from '../../src/runtime/hermes.ts';
import { testDatabase } from '../helpers/database.ts';
import { createScope } from './postgres.ts';
import { head, record } from './properties-fixtures.ts';

const configured = loadEnv({});
const localEngine = existsSync(configured.OPENDUET_HERMES_PYTHON);
if (!localEngine)
  process.stdout.write(
    'wired assistant skipped: .hermes-venv is absent; install the pinned local Hermes first\n',
  );
const handle = localEngine ? await testDatabase() : null;
afterAll(async () => {
  await handle?.close();
}, 30_000);

(handle ? describe : describe.skip)('wired assistant through HTTP and pinned Hermes', () => {
  test('skills, handled recall, delta and correction repair reach the model from bootstrap', async () => {
    if (!handle) return;
    const root = await mkdtemp(join(tmpdir(), 'openduet-wired-assistant-'));
    const spaces = join(root, 'spaces');
    const seedQueue = await startQueue(handle.url);
    const db = { ...handle, boss: seedQueue.boss };
    const scope = await createScope(db);
    const skills = join(spaces, scope.spaceId, 'skills');
    await mkdir(skills, { recursive: true });
    await promisify(execFile)('git', ['-C', join(spaces, scope.spaceId), 'init', '--quiet'], {
      windowsHide: true,
    });
    await handle.sql`update space set git_path = ${join(spaces, scope.spaceId)} where id = ${scope.spaceId}`;
    for (const name of ['alpha', 'beta', 'gamma', 'zeta'])
      await writeFile(
        join(skills, `${name}.md`),
        `---\nname: ${name}\ndescription: Travel procedure\ntriggers: [travel]\ntools: []\n---\nUse the ${name} travel procedure.`,
      );
    const seeded = await record(
      db,
      scope,
      {
        identity: 'travel-preferences',
        text: 'travel seat aisle and travel meal vegan',
        eventAt: '2026-09-01T00:00:00Z',
      },
      [
        { key: 'pref.travel.seat', content: 'aisle', quote: 'aisle', kind: 'user_statement' },
        { key: 'pref.travel.meal', content: 'vegan', quote: 'vegan', kind: 'user_statement' },
      ],
    );
    expect(seeded.status).toBe('committed');
    const seat = await head(db, scope, 'pref.travel.seat');
    if (!seat) throw new Error('Missing seeded seat preference');
    const password = 'wired-local-proof-password';
    const passwordHash = await Bun.password.hash(password, { algorithm: 'argon2id' });
    await handle.sql`update owner set email = 'wired@example.test', password_hash = ${passwordHash}`;
    // Login reads the principal created by the fixture, not the singleton setup record.
    await handle.sql`update principal set email = 'wired@example.test', password_hash = ${passwordHash} where id = ${scope.ownerId}`;
    await handle.sql`insert into connection (id, space_id, provider, label, scopes, status)
      values (${newId('conn')}, ${scope.spaceId}, 'test', 'Scripted send', '["test.send"]'::jsonb, 'active')`;
    await new FileRestrictionJournal(join(spaces, '.memory', 'restrictions.jsonl')).initializeNew();
    await seedQueue.stop();

    const bundles: AttemptBundle[] = [];
    const timings: AttemptTiming[] = [];
    let reportBothTimings = () => {};
    const bothTimings = new Promise<void>((resolve) => {
      reportBothTimings = resolve;
    });
    const requests = new Map<string, string[]>();
    // Discovery is part of the real bootstrap path: this connector is indexed
    // before its schema is loaded into the running engine.
    const scripted = createScriptedProvider([
      { tool: { name: 'load_tool', arguments: { name: 'test.send' }, id: 'load_scripted_send' } },
      {
        tool: {
          name: 'test.send',
          arguments: { message: 'scripted hello' },
          id: 'call_scripted_send',
        },
      },
      { text: 'This is a walkthrough answer from the scripted model.' },
    ]);
    const service = await bootstrap({
      env: loadEnv({
        NODE_ENV: 'test',
        DATABASE_URL: handle.url,
        PORT: '3170',
        OPENDUET_RUNTIME_ADAPTER: 'hermes',
        OPENDUET_RUNTIME_SUPERVISOR: 'process',
        OPENDUET_CAPABILITY_KEY: 'wired-capability-key-32-characters-long',
        OPENDUET_APPROVAL_KEY: 'wired-approval-key-32-characters-long',
        OPENDUET_SPACES_DIR: spaces,
        OPENDUET_WORK_DIR: join(root, 'work'),
        OPENDUET_BROKER_BIND: '127.0.0.1:3172',
        OPENDUET_BROKER_URL: 'http://127.0.0.1:3172',
        OPENDUET_ENABLE_TEST_CONNECTOR: 'true',
        OPENDUET_ENABLE_FAKE_PROVIDER: 'true',
        OPENDUET_DEFAULT_PROVIDER: 'fake',
        OPENDUET_DEFAULT_MODEL: 'scripted',
      }),
      onBundle: (bundle) => bundles.push(bundle),
      onTiming: (timing) => {
        timings.push(timing);
        if (timings.length === 2) reportBothTimings();
      },
      fakeProvider: async (body, attemptId, protocol) => {
        requests.set(attemptId, [...(requests.get(attemptId) ?? []), JSON.stringify(body)]);
        return scripted(body, attemptId, protocol);
      },
    });
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 3170,
      fetch: service.app.fetch,
      idleTimeout: 0,
    });
    let cookie = '';
    const call = (path: string, body?: unknown, extra: Record<string, string> = {}) =>
      fetch(`http://127.0.0.1:3170${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'content-type': 'application/json',
          cookie,
          'x-openduet-space': scope.spaceId,
          ...extra,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    let jobId: string | undefined;
    try {
      expect(await (await call('/health')).json()).toMatchObject({
        runtime_adapter: 'hermes',
        database: 'ok',
      });
      // A supplied space header cannot authenticate a memory request.
      expect((await call('/memory/claims')).status).toBe(401);
      const login = await call('/login', { email: 'wired@example.test', password });
      expect(login.status).toBe(200);
      cookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';
      expect(cookie).toStartWith('openduet_session=');
      expect(
        (await call('/memory/claims', undefined, { cookie: `openduet_session=${'x'.repeat(43)}` }))
          .status,
      ).toBe(401);
      expect(
        (await call('/memory/claims', undefined, { 'x-openduet-space': newId('sp') })).status,
      ).toBe(403);
      const created = await call(
        '/jobs',
        {
          space_id: scope.spaceId,
          title: 'Travel plan',
          objective: 'travel',
        },
        { 'Idempotency-Key': 'wired-assistant-job' },
      );
      expect(created.status).toBe(201);
      const body = (await created.json()) as { job: { id: string } };
      jobId = body.job.id;
      const waitForAttempt = async (count: number) => {
        const deadline = Date.now() + 90_000;
        while (Date.now() < deadline) {
          const rows =
            await handle.sql`select id, outcome, outcome_detail from attempt where job_id = ${body.job.id} and ended_at is not null order by epoch`;
          if (rows.length >= count) {
            const current = rows[count - 1];
            if (current?.outcome !== 'waiting_for_approval') {
              const toolResults = (requests.get(String(current?.id)) ?? []).flatMap((request) => {
                const body = JSON.parse(request) as {
                  messages?: { role: string; content: unknown }[];
                };
                return body.messages?.filter((message) => message.role === 'tool') ?? [];
              });
              throw new Error(
                `Hermes attempt ended unexpectedly: ${JSON.stringify({ attempt: current, toolResults })}`,
              );
            }
            return;
          }
          await Bun.sleep(100);
        }
        throw new Error(`Hermes attempt ${count} did not finish within 90 seconds`);
      };
      await waitForAttempt(1);
      const first = bundles[0];
      if (!first) throw new Error('No first bundle');
      expect(first.budget.max_output_tokens).toBe(8000);
      // The window itself: each request sets aside only its own output from it.
      expect(first.budget.max_input_tokens).toBe(128000);
      expect(first.skills.map((skill) => skill.name)).toEqual(['alpha', 'beta', 'gamma']);
      expect(first.knowledge).toHaveLength(2);
      expect(first.knowledge.map((item) => item.handle)).toContain(`${seat.id}@1`);
      expect(first.tools.map((tool) => tool.name).sort()).toEqual([
        'ask_person',
        'files.delete',
        'files.list',
        'load_tool',
        'memory.search',
        'react',
        'search_tools',
        'skills.read',
        'web.fetch',
        'web.search',
      ]);
      expect(first.tools.map((tool) => tool.name)).not.toContain('test.send');
      expect(first.inputs.since_last).toBeUndefined();
      expect(first.since_last.attempt_id).toBeNull();
      expect(first.since_last.evidence.map((item) => item.handle)).toContain(
        `source:${seeded.sourceId}@1`,
      );
      // Automatic capture can add the request itself before recall. Every
      // delivered source still belongs to this person's own space.
      const sources = await handle.sql`select id, source_version from memory_sources
        where space_id = ${scope.spaceId} and owner_id = ${scope.ownerId} and state = 'active'`;
      const allowedSources = new Set(
        sources.map((source) => `source:${source.id}@${source.source_version}`),
      );
      for (const evidence of first.since_last.evidence) {
        expect(evidence.kind).toBe('source');
        expect(allowedSources.has(evidence.handle)).toBe(true);
      }
      const [priorApproval] = await handle.sql`select a.id as action_id, p.id as approval_id,
        a.status, p.decision from action a join approval p on p.action_id = a.id
        where a.attempt_id = ${first.attempt.id}`;
      if (!priorApproval) throw new Error('The first send did not request approval');
      expect(priorApproval).toMatchObject({ status: 'needs_approval', decision: null });
      expect(
        (
          await call('/memory/outputs', {
            job_id: jobId,
            attempt_id: first.attempt.id,
            kind: 'plan_step',
            output_id: 'travel-plan',
            output_version: '1',
            location: 'seat',
            uses: [`${seat.id}@1`],
          })
        ).status,
      ).toBe(201);
      const corrected = await call('/memory/corrections', {
        claim_id: seat.id,
        expected_revision: 1,
        text: 'travel seat window',
        content: 'window',
        valid_from: '2026-09-05T00:00:00Z',
        valid_until: null,
        idempotency_key: 'wired-assistant-window',
      });
      expect(corrected.status).toBe(200);
      await waitForAttempt(2);
      const second = bundles[1];
      if (!second) throw new Error('No replacement bundle');
      expect(second.attempt.token).not.toBe(first.attempt.token);
      expect(second.since_last.attempt_id).toBe(first.attempt.id);
      // Permission asked on the old facts cannot survive a correction. The
      // replacement must ask again before anything reaches the destination.
      const [withdrawn] = await handle.sql`select a.status, p.decision, p.decided_by
        from action a join approval p on p.action_id = a.id
        where p.id = ${priorApproval.approval_id}`;
      expect(withdrawn).toMatchObject({
        status: 'denied',
        decision: 'denied',
        decided_by: APPROVAL_OUTDATED_NOTE,
      });
      expect(second.since_last.pending_approvals).toHaveLength(0);
      expect(second.since_last.pending_approvals.map((item) => item.approval_id)).not.toContain(
        priorApproval.approval_id,
      );
      const [freshApproval] = await handle.sql`select a.id as action_id, p.id as approval_id,
        a.status, p.decision, p.job_revision from action a join approval p on p.action_id = a.id
        where a.attempt_id = ${second.attempt.id}`;
      expect(freshApproval).toMatchObject({
        status: 'needs_approval',
        decision: null,
        job_revision: second.attempt.revision,
      });
      expect(freshApproval?.action_id).not.toBe(priorApproval.action_id);
      expect(freshApproval?.approval_id).not.toBe(priorApproval.approval_id);
      const deliveries = await handle.sql`select d.action_id from test_destination_ledger d
        join action a on a.id = d.action_id where a.job_id = ${jobId}`;
      expect(deliveries).toHaveLength(0);
      expect(second.inputs.repair_briefs).toHaveLength(1);
      expect(second.inputs.repair_briefs[0]).toMatchObject({
        changed_handle: `${seat.id}@1`,
        replacement_handle: `${seat.id}@2`,
      });
      expect(second.knowledge.map((item) => item.handle)).toContain(`${seat.id}@2`);
      for (const bundle of [first, second]) {
        const schemas = (requests.get(bundle.attempt.id) ?? []).map((request) => {
          const body = JSON.parse(request) as {
            tools?: { name?: string; function?: { name?: string } }[];
          };
          return (body.tools ?? []).map((tool) => tool.function?.name ?? tool.name);
        });
        expect(schemas[0]).not.toContain('test.send');
        expect(schemas.slice(1).some((tools) => tools.includes('test.send'))).toBe(true);
        const delivered = requests.get(bundle.attempt.id)?.join('\n') ?? '';
        for (const skill of bundle.skills) expect(delivered).toContain(skill.body);
        for (const knowledge of bundle.knowledge) {
          expect(knowledge.handle).toBeDefined();
          expect(delivered).toContain(knowledge.handle ?? 'missing handle');
        }
        expect(delivered).toContain('Since the last attempt');
        for (const evidence of bundle.since_last.evidence)
          expect(delivered).toContain(evidence.handle);
        for (const approval of bundle.since_last.pending_approvals)
          expect(delivered).toContain(
            `approval ${approval.approval_id} is waiting on action ${approval.action_id}`,
          );
        const [context] =
          await handle.sql`select style_violations, items from memory_contexts where attempt_id = ${bundle.attempt.id}`;
        expect(context?.style_violations).toEqual([]);
        expect(
          ((context?.items ?? []) as { handle: string }[]).map((item) => item.handle),
        ).toContain(bundle.knowledge[0]?.handle ?? 'missing handle');
      }
      const replacementRequest = requests.get(second.attempt.id)?.join('\n') ?? '';
      expect(replacementRequest).toContain('Repair required');
      expect(replacementRequest).toContain(`${seat.id}@1`);
      expect(replacementRequest).toContain(`${seat.id}@2`);
      // Outcomes commit before engine cleanup finishes; the callback reports
      // the completed cleanup whose timing this assertion measures.
      await bothTimings;
      expect(timings).toHaveLength(2);
      for (const timing of timings) {
        expect(timing.coldStartMs).toBeGreaterThan(0);
        expect(timing.wallMs).toBeGreaterThanOrEqual(timing.coldStartMs);
        process.stdout.write(
          `wired Hermes ${timing.attemptId}: cold=${timing.coldStartMs}ms wall=${timing.wallMs}ms\n`,
        );
      }
    } finally {
      if (jobId) await call(`/jobs/${jobId}/cancel`, {}).catch(() => {});
      await server.stop(true);
      await service.close();
      if (
        resolve(root).startsWith(
          `${resolve(tmpdir())}${process.platform === 'win32' ? '\\' : '/'}openduet-wired-assistant-`,
        )
      )
        await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  }, 210_000);
});
