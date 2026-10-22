import { afterAll, describe, expect, test } from 'bun:test';
import type { CapabilityClaims } from '@openduet/contracts';
import { loadAction } from '../../src/broker/records.ts';
import { BrokerService } from '../../src/broker/service.ts';
import { createTableTrustResolver } from '../../src/broker/trust.ts';
import { EmailConnector } from '../../src/connectors/email.ts';
import type { MailMessage, MailTransport } from '../../src/connectors/mail-transport.ts';
import { ConnectorRegistry } from '../../src/connectors/registry.ts';
import { openDatabase } from '../../src/db/client.ts';
import { agentAccess, agentAccessIn } from '../../src/experience/access.ts';
import { ExperienceEffects } from '../../src/experience/effects.ts';
import { ExperiencePermissions } from '../../src/experience/permissions.ts';
import { PersonalSessionService } from '../../src/experience/personal-session.ts';
import { removeJobs } from '../../src/experience/removal.ts';
import { resolveExperienceGrant } from '../../src/experience/rules.ts';
import { ExperienceService } from '../../src/experience/service.ts';
import { newId } from '../../src/ids.ts';
import { QUEUES } from '../../src/jobs/queue.ts';
import { JobService } from '../../src/jobs/service.ts';
import { SubmissionService } from '../../src/jobs/submissions.ts';
import { principalContext } from '../../src/principals/authority.ts';
import { PushService } from '../../src/push/service.ts';
import { CustomerFollowupService } from '../../src/responsibilities/customer-followups.ts';
import { rejectionOf } from '../helpers/broker.ts';
import { createScope, createTestDatabase } from './postgres.ts';

const database = await createTestDatabase();
const handle = database ? openDatabase(database.url, 3) : null;
if (database) for (const queue of Object.values(QUEUES)) await database.boss.createQueue(queue);
afterAll(async () => {
  await handle?.close();
  await database?.close();
}, 30_000);
const withDb = database && handle ? describe : describe.skip;
const outgoing = (): MailMessage => ({
  id: 'outgoing',
  message_id: '<outgoing@example.test>',
  from: 'Avery <avery@example.test>',
  from_addresses: ['avery@example.test'],
  to: 'Priya <priya@example.test>',
  to_addresses: ['priya@example.test'],
  subject: 'Pilot',
  text: 'Can you confirm the pilot date? The retention requirement is still unresolved.',
  html: '',
  date: '2026-10-23T08:00:00Z',
});

async function fixture() {
  if (!database || !handle) throw new Error('Database unavailable');
  const db = database;
  const scope = await createScope(db);
  const connectionId = newId('conn');
  const scopes = ['email.search', 'email.read', 'email.draft', 'email.discard', 'email.send'];
  await db.sql`insert into connection (id, space_id, provider, label, scopes) values
    (${connectionId}, ${scope.spaceId}, 'imap', 'Work mail', ${JSON.stringify(scopes)}::jsonb)`;
  const messages = [outgoing()];
  let reads = 0;
  let sends = 0;
  let broken = false;
  let nextRead: (() => Promise<void>) | undefined;
  const transport: MailTransport = {
    async thread() {
      reads++;
      const wait = nextRead;
      nextRead = undefined;
      await wait?.();
      if (broken) throw new Error('Mailbox offline');
      return structuredClone(messages);
    },
    async search() {
      return structuredClone(messages);
    },
    async read() {
      return structuredClone(messages[0] ?? null);
    },
    async send() {
      sends++;
      return { messageId: '<receipt@example.test>', sentCopy: true };
    },
    async findSent() {
      return true;
    },
    async health() {},
  };
  const connector = new EmailConnector({
    kind: 'api',
    id: connectionId,
    spaceId: scope.spaceId,
    from: 'avery@example.test',
    session: async (work) => work(transport),
  });
  const registry = new ConnectorRegistry().register(connectionId, connector);
  const jobs = new JobService(handle.db, db.boss);
  const submissions = new SubmissionService(jobs);
  const experience = new ExperienceService(handle.db, jobs, submissions);
  const broker = new BrokerService({
    sql: db.sql,
    connectors: registry,
    resolveStandingGrant: resolveExperienceGrant,
    resolveTrust: createTableTrustResolver({
      'priya@example.test': { origin_trust: 'verified_connector', handle: 'thread:pilot' },
    }),
  });
  const effects = new ExperienceEffects(db.sql, broker, registry);
  const permissions = new ExperiencePermissions(db.sql, broker, effects);
  let now = new Date('2026-10-23T08:30:00Z');
  const errors: unknown[] = [];
  const deps = {
    sql: db.sql,
    db: handle.db,
    registry,
    jobs,
    submissions,
    experience,
    effects,
    now: () => now,
    onError: (error: unknown) => errors.push(error),
  };
  let service = new CustomerFollowupService(deps);
  const identity = {
    connection_id: connectionId,
    thread_key: 'outgoing',
    customer_email: 'priya@example.test',
  };
  const actor = <T>(work: () => Promise<T>) => principalContext.run(scope.ownerId, work);
  const create = async (deadline = '2026-10-23T09:00:00Z') => {
    const preview = await service.preview(scope.ownerId, scope.spaceId, identity);
    return service.create(scope.ownerId, scope.spaceId, {
      ...identity,
      source_version: preview.version,
      deadline_at: deadline,
      time_zone: 'Europe/London',
      title: 'the pilot',
      skill_refs: ['client-follow-up'],
      preference_refs: ['claim:short-client-messages'],
    });
  };
  const startAttempt = async (chatId: string) => {
    const [job] = await db.sql`select * from job where id = ${chatId}`;
    const attemptId = newId('att');
    await db.sql`update job set state = 'running', lease_epoch = 1 where id = ${chatId}`;
    await db.sql`insert into attempt (id, job_id, turn_id, epoch, runtime_version, provider, model)
      values (${attemptId}, ${chatId}, ${job?.current_turn_id}, 1, 'scripted-v1', 'fixture', 'scripted')`;
    const claims: CapabilityClaims = {
      job_id: chatId,
      attempt_id: attemptId,
      space_id: scope.spaceId,
      principal_id: scope.ownerId,
      membership_generation: 0,
      epoch: 1,
      revision: Number(job?.revision),
      scopes,
      budget: job?.budget,
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    return claims;
  };
  const prepare = async (id: string, to = 'priya@example.test') => {
    const row = await service.get(scope.ownerId, scope.spaceId, id);
    const chatId = row.result?.conversation_id;
    if (!chatId) throw new Error(`No admitted preparation: ${JSON.stringify(errors)}`);
    const claims = await startAttempt(chatId);
    const draft = await actor(() =>
      broker.propose(claims, {
        connection_id: connectionId,
        kind: 'email.draft',
        payload: {
          to,
          subject: 'Re: Pilot',
          body: 'Hi Priya, could you confirm the pilot date? The retention requirement is still open. Thanks, Avery',
        },
        client_ref: 'customer-draft',
      }),
    );
    return { claims, draft, chatId };
  };
  return {
    db,
    scope,
    connectionId,
    jobs,
    submissions,
    experience,
    broker,
    permissions,
    actor,
    identity,
    create,
    prepare,
    startAttempt,
    gateNextRead: (gate: () => Promise<void>) => {
      nextRead = gate;
    },
    errors,
    get service() {
      return service;
    },
    now: (value: string) => {
      now = new Date(value);
    },
    restart: () => {
      service = new CustomerFollowupService(deps);
    },
    reply: () => {
      messages.push({
        ...outgoing(),
        id: 'reply',
        message_id: '<reply@example.test>',
        from: 'Priya <priya@example.test>',
        from_addresses: ['priya@example.test'],
        to: 'avery@example.test',
        to_addresses: ['avery@example.test'],
        text: 'Yes, Tuesday works.',
        date: '2026-10-23T10:00:00Z',
        in_reply_to: outgoing().message_id,
      });
    },
    breakSource: () => {
      broken = true;
    },
    reads: () => reads,
    sends: () => sends,
  };
}

withDb('scoped customer responsibility with durable admission and scripted mailbox', () => {
  test('ten unchanged checks admit one preparation, recover one draft and one notification after restart', async () => {
    const f = await fixture();
    const watch = await f.create();
    await f.service.check(watch.id);
    expect((await f.service.get(f.scope.ownerId, f.scope.spaceId, watch.id)).result).toBeNull();
    f.now('2026-10-23T09:01:00Z');
    for (let check = 0; check < 10; check++) await f.service.check(watch.id);
    expect(f.errors).toHaveLength(0);
    const admitted = await f.db
      .sql`select * from customer_followup_preparation where followup_id = ${watch.id}`;
    expect(admitted).toHaveLength(1);
    const [turn] = await f.db
      .sql`select text from experience_turn where job_id = ${admitted[0]?.conversation_id}`;
    expect(turn?.text).toContain('claim:short-client-messages');
    expect(turn?.text).toContain('client-follow-up');
    const prepared = await f.prepare(watch.id);
    expect(await loadAction(f.db.sql, prepared.draft.action_id)).toMatchObject({
      status: 'succeeded',
    });
    await f.service.check(watch.id);
    const result = await f.service.get(f.scope.ownerId, f.scope.spaceId, watch.id);
    expect(result).toMatchObject({
      state: 'prepared',
      result: { draft_action_id: prepared.draft.action_id, recipient: 'priya@example.test' },
    });
    expect(f.sends()).toBe(0);
    await f.db
      .sql`update experience_turn set status = 'done', answer = 'Your draft is ready.', finished_at = now() where job_id = ${prepared.chatId}`;
    if (!handle) throw new Error('Database unavailable');
    const push = new PushService(handle.db, { keys: null, subject: null, extraOrigins: [] });
    await push.collectStatus(f.scope.ownerId, new Date(Date.now() - 3600_000), new Date());
    const conversationPushes = await f.db
      .sql`select id from push_intent where url = ${`/#/chat/${prepared.chatId}`}`;
    expect(conversationPushes).toHaveLength(1);
    f.restart();
    for (let check = 0; check < 10; check++) await f.service.check(watch.id);
    const [counts] = await f.db
      .sql`select (select count(*)::int from customer_followup_preparation where followup_id = ${watch.id}) as preparations,
      (select count(*)::int from push_intent where dedup_key = ${`customer-followup:${admitted[0]?.id}`}) as notifications`;
    expect(counts).toMatchObject({ preparations: 1, notifications: 1 });
    expect(await agentAccess(f.db.sql, prepared.chatId)).toMatchObject({
      followupConnection: f.connectionId,
    });
    expect(
      await rejectionOf(
        f.actor(() =>
          f.broker.propose(prepared.claims, {
            connection_id: f.connectionId,
            kind: 'email.search',
            payload: { query: 'unrelated' },
          }),
        ),
      ),
    ).toMatchObject({ code: 'scope_denied' });
  }, 30_000);

  test('reply received during downtime prevents obsolete preparation; repeated failures are explicit', async () => {
    const f = await fixture();
    const watch = await f.create();
    f.reply();
    f.now('2026-10-25T09:01:00Z');
    f.restart();
    await f.service.tick();
    expect(await f.service.get(f.scope.ownerId, f.scope.spaceId, watch.id)).toMatchObject({
      state: 'replied',
      result: null,
      next_check_at: null,
    });
    expect(
      await f.db.sql`select id from customer_followup_preparation where followup_id = ${watch.id}`,
    ).toHaveLength(0);
    const failed = await fixture();
    const other = await failed.create();
    failed.breakSource();
    failed.now('2026-10-23T09:01:00Z');
    await failed.service.check(other.id);
    expect(
      await failed.service.get(failed.scope.ownerId, failed.scope.spaceId, other.id),
    ).toMatchObject({ state: 'failed', result: null });
  }, 30_000);

  test('pause or disconnect stops source reads and preparation', async () => {
    const f = await fixture();
    const watch = await f.create();
    await f.service.setPaused(f.scope.ownerId, f.scope.spaceId, watch.id, true);
    const reads = f.reads();
    f.now('2026-10-23T09:01:00Z');
    await f.service.check(watch.id);
    await f.service.tick();
    expect(f.reads()).toBe(reads);
    await f.db
      .sql`update connection set status = 'revoked', generation = generation + 1 where id = ${f.connectionId}`;
    await f.db.sql`update customer_followup set paused = false where id = ${watch.id}`;
    await f.service.check(watch.id);
    expect(f.reads()).toBe(reads);
    expect(await f.service.get(f.scope.ownerId, f.scope.spaceId, watch.id)).toMatchObject({
      state: 'failed',
      result: null,
    });
  }, 30_000);

  test('owner boundaries and revoked read access prevent disclosure or send; pausing withdraws pending approval', async () => {
    const f = await fixture();
    const watch = await f.create();
    const other = await createScope(f.db);
    const otherOwner = newId('own');
    await f.db
      .sql`insert into principal (id, email) values (${otherOwner}, ${`${otherOwner}@example.test`})`;
    await f.db.sql`update space set owner_principal_id = ${otherOwner} where id = ${other.spaceId}`;
    const before = f.reads();
    expect(await rejectionOf(f.service.get(otherOwner, f.scope.spaceId, watch.id))).toMatchObject({
      code: 'scope_denied',
    });
    expect(
      await rejectionOf(f.service.preview(otherOwner, other.spaceId, f.identity)),
    ).toMatchObject({ code: 'source_unavailable' });
    expect(f.reads()).toBe(before);
    f.now('2026-10-23T09:01:00Z');
    await f.service.check(watch.id);
    const prepared = await f.prepare(watch.id);
    await f.service.check(watch.id);
    const requested = await f.actor(() =>
      f.permissions.send(f.scope.spaceId, prepared.draft.action_id),
    );
    if ('reason' in requested || !requested.permission) throw new Error('Expected permission');
    await f.service.setPaused(f.scope.ownerId, f.scope.spaceId, watch.id, true);
    const [approval] = await f.db
      .sql`select decision from approval where id = ${requested.permission.id}`;
    expect(approval?.decision).toBe('denied');
    expect(
      await rejectionOf(
        f.actor(() =>
          f.permissions.decide(f.scope.spaceId, requested.permission?.id as string, {
            option: 'allow_once',
            version: requested.permission?.version,
          }),
        ),
      ),
    ).toMatchObject({ code: 'permission_replaced' });
    expect(f.sends()).toBe(0);
    const revoked = await fixture();
    const revokedWatch = await revoked.create();
    revoked.now('2026-10-23T09:01:00Z');
    await revoked.service.check(revokedWatch.id);
    const currentDraft = await revoked.prepare(revokedWatch.id);
    const pending = await revoked.actor(() =>
      revoked.permissions.send(revoked.scope.spaceId, currentDraft.draft.action_id),
    );
    if ('reason' in pending || !pending.permission) throw new Error('Expected permission');
    await revoked.db
      .sql`update connection set scopes = '["email.draft", "email.send"]'::jsonb where id = ${revoked.connectionId}`;
    const reads = revoked.reads();
    expect(
      await rejectionOf(
        revoked.actor(() =>
          revoked.permissions.decide(revoked.scope.spaceId, pending.permission?.id as string, {
            option: 'allow_once',
            version: pending.permission?.version,
          }),
        ),
      ),
    ).toBeDefined();
    expect(revoked.reads()).toBe(reads);
    expect(revoked.sends()).toBe(0);
  }, 30_000);

  test('scope prevents another recipient and a reply invalidates exact-action send approval', async () => {
    const f = await fixture();
    const watch = await f.create();
    f.now('2026-10-23T09:01:00Z');
    await f.service.check(watch.id);
    const prepared = await f.prepare(watch.id);
    await f.service.check(watch.id);
    const prohibited = await rejectionOf(
      f.actor(() =>
        f.broker.propose(prepared.claims, {
          connection_id: f.connectionId,
          kind: 'email.draft',
          payload: {
            to: 'someone-else@example.test',
            subject: 'Unrelated',
            body: 'Different destination',
          },
          client_ref: 'outside-scope',
        }),
      ),
    );
    expect(prohibited).toMatchObject({ code: 'scope_denied' });
    const requested = await f.actor(() =>
      f.permissions.send(f.scope.spaceId, prepared.draft.action_id),
    );
    if ('reason' in requested || !requested.permission)
      throw new Error('Expected exact-action approval');
    expect(f.sends()).toBe(0);
    f.reply();
    const decided = await rejectionOf(
      f.actor(() =>
        f.permissions.decide(f.scope.spaceId, requested.permission?.id as string, {
          option: 'allow_once',
          version: requested.permission?.version,
        }),
      ),
    );
    expect(decided).toBeDefined();
    expect(f.sends()).toBe(0);
    await f.service.check(watch.id);
    expect(await f.service.get(f.scope.ownerId, f.scope.spaceId, watch.id)).toMatchObject({
      state: 'replied',
      result: { state: 'obsolete' },
    });
  }, 30_000);

  test('a current exact approval sends once and exposes its real receipt', async () => {
    const f = await fixture();
    const watch = await f.create();
    f.now('2026-10-23T09:01:00Z');
    await f.service.check(watch.id);
    const prepared = await f.prepare(watch.id);
    await f.service.check(watch.id);
    const requested = await f.actor(() =>
      f.permissions.send(f.scope.spaceId, prepared.draft.action_id),
    );
    if ('reason' in requested || !requested.permission) throw new Error('Expected permission');
    await f.actor(() =>
      f.permissions.decide(f.scope.spaceId, requested.permission?.id as string, {
        option: 'allow_once',
        version: requested.permission?.version,
      }),
    );
    expect(f.sends()).toBe(1);
    await f.actor(() => f.permissions.send(f.scope.spaceId, prepared.draft.action_id));
    expect(f.sends()).toBe(1);
    const sent = await f.service.get(f.scope.ownerId, f.scope.spaceId, watch.id);
    expect(sent).toMatchObject({ result: { state: 'sent' } });
    expect((sent.result?.receipt as { external_ref?: string })?.external_ref).toContain(
      '@openduet.local>',
    );
    const reads = f.reads();
    f.restart();
    await f.service.check(watch.id);
    f.now('2026-10-25T09:01:00Z');
    await f.service.tick();
    expect(f.reads()).toBe(reads);
    expect(await f.service.get(f.scope.ownerId, f.scope.spaceId, watch.id)).toMatchObject({
      state: 'completed',
      next_check_at: null,
    });
    expect(
      await f.db.sql`select id from customer_followup_preparation where followup_id = ${watch.id}`,
    ).toHaveLength(1);
  }, 30_000);

  test('postponing a confirmed deadline while a source read is in flight does not admit the old deadline', async () => {
    const f = await fixture();
    const watch = await f.create();
    f.now('2026-10-23T09:01:00Z');
    let release!: () => void;
    let started!: () => void;
    const reading = new Promise<void>((resolve) => {
      started = resolve;
    });
    const resume = new Promise<void>((resolve) => {
      release = resolve;
    });
    f.gateNextRead(async () => {
      started();
      await resume;
    });
    const checking = f.service.check(watch.id);
    await reading;
    expect((await f.create('2026-10-23T12:00:00Z')).id).toBe(watch.id);
    release();
    await checking;
    expect(f.errors).toHaveLength(0);
    expect(await f.service.get(f.scope.ownerId, f.scope.spaceId, watch.id)).toMatchObject({
      deadline_at: '2026-10-23T12:00:00.000Z',
      result: null,
    });
    f.now('2026-10-23T12:01:00Z');
    await f.service.check(watch.id);
    const [turn] = await f.db
      .sql`select t.text from customer_followup_preparation p join experience_turn t on t.id = p.turn_id where p.followup_id = ${watch.id}`;
    expect(turn?.text).toContain('2026-10-23T12:00:00.000Z');
  }, 30_000);

  test('nested historical corrections and their pending sends retain scope after deleting source chats or the watch', async () => {
    const f = await fixture();
    const watch = await f.create();
    f.now('2026-10-23T09:01:00Z');
    await f.service.check(watch.id);
    const prepared = await f.prepare(watch.id);
    await f.service.check(watch.id);
    const personal = new PersonalSessionService(f.experience);
    const historicalReply = async (sourceId: string, key: string) => {
      const [source] = await f.db
        .sql`select current_turn_id, agent_id from job where id = ${sourceId}`;
      const original = String(source?.current_turn_id);
      const newer = newId('turn');
      await f.db
        .sql`update experience_turn set status = 'done', answer = 'The requested draft is ready.', finished_at = now() where id = ${original}`;
      await f.db.sql`insert into experience_turn (id, job_id, agent_id, submission_id, text, status)
        values (${newer}, ${sourceId}, ${source?.agent_id}, ${newId('op')}, 'A newer unrelated question', 'done')`;
      await f.db.sql`update job set current_turn_id = ${newer} where id = ${sourceId}`;
      const accepted = await f.actor(() =>
        personal.message(
          f.scope.spaceId,
          {
            target: { kind: 'reply_result', conversation_id: sourceId, turn_id: original },
            text: 'Make the follow-up shorter.',
          },
          key,
        ),
      );
      expect(accepted.conversation_id).not.toBe(sourceId);
      return accepted.conversation_id;
    };
    const discussion = await historicalReply(prepared.chatId, 'historical-watch');
    const nested = await historicalReply(discussion, 'historical-watch-nested');
    const access = await f.jobs.transaction((tx) => agentAccessIn(tx, nested));
    expect(access).toMatchObject({ followupConnection: f.connectionId });
    const claims = await f.startAttempt(nested);
    const propose = (connectionId: string, to: string, ref: string) =>
      f.actor(() =>
        f.broker.propose(claims, {
          connection_id: connectionId,
          kind: 'email.draft',
          payload: { to, subject: 'Re: Pilot', body: `Could you confirm the pilot date? ${ref}` },
          client_ref: ref,
        }),
      );
    const otherConnection = newId('conn');
    await f.db
      .sql`insert into connection (id, space_id, provider, label, scopes) values (${otherConnection}, ${f.scope.spaceId}, 'imap', 'Other mailbox', '["email.draft"]')`;
    expect(
      await rejectionOf(propose(otherConnection, 'priya@example.test', 'other-mailbox')),
    ).toMatchObject({ code: 'scope_denied' });
    expect(
      await rejectionOf(propose(f.connectionId, 'other@example.test', 'other-person')),
    ).toMatchObject({ code: 'scope_denied' });
    const corrected = await propose(f.connectionId, 'priya@example.test', 'valid-correction');
    expect((await loadAction(f.db.sql, corrected.action_id)).status).toBe('succeeded');
    const pending = await f.actor(() => f.permissions.send(f.scope.spaceId, corrected.action_id));
    if ('reason' in pending || !pending.permission) throw new Error('Expected exact approval');
    await f.actor(() => removeJobs({ jobs: f.jobs, sql: f.db.sql }, [prepared.chatId]));
    await f.actor(() => removeJobs({ jobs: f.jobs, sql: f.db.sql }, [discussion]));
    expect(
      await f.db.sql`select id from job where id in (${prepared.chatId}, ${discussion})`,
    ).toHaveLength(0);
    expect(
      await f.db
        .sql`select id from session_reference where discussion_id = ${nested} and job_id <> ${nested}`,
    ).toHaveLength(0);
    expect(
      (
        await f.db
          .sql`select conversation_id from customer_followup_preparation where followup_id = ${watch.id}`
      )[0]?.conversation_id,
    ).toBeNull();
    expect(await agentAccess(f.db.sql, nested)).toMatchObject({
      followupConnection: f.connectionId,
    });
    expect(await f.jobs.transaction((tx) => agentAccessIn(tx, nested))).toMatchObject({
      followupConnection: f.connectionId,
    });
    expect(
      await rejectionOf(
        propose(otherConnection, 'priya@example.test', 'other-mailbox-after-deletion'),
      ),
    ).toMatchObject({ code: 'scope_denied' });
    expect(
      await rejectionOf(
        propose(f.connectionId, 'other@example.test', 'other-person-after-deletion'),
      ),
    ).toMatchObject({ code: 'scope_denied' });
    const currentAfterDeletion = await propose(
      f.connectionId,
      'priya@example.test',
      'fresh-correction-after-deletion',
    );
    expect((await loadAction(f.db.sql, currentAfterDeletion.action_id)).status).toBe('succeeded');
    await f.service.setPaused(f.scope.ownerId, f.scope.spaceId, watch.id, true);
    expect(
      (await f.db.sql`select decision from approval where id = ${pending.permission.id}`)[0]
        ?.decision,
    ).toBe('denied');
    expect(
      await rejectionOf(
        f.actor(() =>
          f.permissions.decide(f.scope.spaceId, pending.permission?.id as string, {
            option: 'allow_once',
            version: pending.permission?.version,
          }),
        ),
      ),
    ).toMatchObject({ code: 'permission_replaced' });
    await f.service.setPaused(f.scope.ownerId, f.scope.spaceId, watch.id, false);
    const currentPending = await f.actor(() =>
      f.permissions.send(f.scope.spaceId, currentAfterDeletion.action_id),
    );
    if ('reason' in currentPending || !currentPending.permission)
      throw new Error('Expected current exact approval');
    f.reply();
    expect(
      await rejectionOf(
        f.actor(() =>
          f.permissions.decide(f.scope.spaceId, currentPending.permission?.id as string, {
            option: 'allow_once',
            version: currentPending.permission?.version,
          }),
        ),
      ),
    ).toBeDefined();
    expect(
      await rejectionOf(propose(f.connectionId, 'priya@example.test', 'stale-correction')),
    ).toMatchObject({ code: 'payload_invalid' });
    expect(f.sends()).toBe(0);
    await f.db.sql`delete from customer_followup where id = ${watch.id}`;
    expect(
      (
        await f.db
          .sql`select preparation_id, connection_id from customer_followup_binding where job_id = ${nested}`
      )[0],
    ).toMatchObject({ preparation_id: null, connection_id: f.connectionId });
    expect(await agentAccess(f.db.sql, nested)).toMatchObject({
      followupConnection: f.connectionId,
    });
    const reads = f.reads();
    expect(
      await rejectionOf(propose(f.connectionId, 'priya@example.test', 'missing-preparation')),
    ).toMatchObject({ code: 'payload_invalid' });
    expect(f.reads()).toBe(reads);
    const orphanDiscussion = await historicalReply(nested, 'historical-after-watch-deletion');
    expect(await agentAccess(f.db.sql, orphanDiscussion)).toMatchObject({
      followupConnection: f.connectionId,
    });
  }, 30_000);
});
