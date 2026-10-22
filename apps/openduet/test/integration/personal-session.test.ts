import { afterAll, describe, expect, test } from 'bun:test';
import { personalSessionAcceptance } from '@openduet/contracts';
import { eq } from 'drizzle-orm';
import { owner, personalSession, principal, space } from '../../src/db/schema.ts';
import { PersonalSessionService } from '../../src/experience/personal-session.ts';
import { ExperienceService } from '../../src/experience/service.ts';
import { newId } from '../../src/ids.ts';
import { startQueue } from '../../src/jobs/queue.ts';
import { JobService } from '../../src/jobs/service.ts';
import { SubmissionService } from '../../src/jobs/submissions.ts';
import { principalContext } from '../../src/principals/authority.ts';
import { rejectionOf } from '../helpers/broker.ts';
import { testDatabase } from '../helpers/database.ts';

const handle = await testDatabase();
const queue = handle ? await startQueue(handle.url) : null;
const jobs = handle && queue ? new JobService(handle.db, queue.boss) : null;
const submissions = jobs ? new SubmissionService(jobs) : undefined;
const experience = handle ? new ExperienceService(handle.db, jobs ?? undefined, submissions) : null;
const personal = experience ? new PersonalSessionService(experience) : null;
const spaceId = newId('sp');
const personId = newId('own');
if (handle) {
  await handle.db.insert(owner).values({ id: personId, email: 'personal-session@example.test' });
  await handle.db
    .insert(principal)
    .values({ id: personId, email: 'personal-session@example.test' });
  await handle.db.insert(space).values({
    id: spaceId,
    name: 'Personal',
    gitPath: `/s/${spaceId}`,
    ownerPrincipalId: personId,
  });
}
const required = <T>(value: T | null | undefined): T => {
  if (!value) throw new Error('Expected fixture');
  return value;
};
const asPerson = <T>(body: () => Promise<T>) => principalContext.run(personId, body);
const withDb = handle ? describe : describe.skip;

withDb('personal continuity preserves task execution boundaries', () => {
  afterAll(async () => {
    await queue?.stop();
    await handle?.close();
  }, 30000);

  test('two tabs resolve one server-owned personal session and existing chats stay intact', async () =>
    asPerson(async () => {
      const [first, second] = await Promise.all([
        required(personal).get(spaceId),
        required(personal).get(spaceId),
      ]);
      expect(first.session.id).toBe(second.session.id);
      expect(
        await required(handle).sql`select indexname from pg_indexes
        where schemaname = 'public' and tablename = 'session_reference'
          and indexname = 'session_reference_discussion_idx'`,
      ).toHaveLength(1);
      expect(
        await required(handle)
          .db.select()
          .from(personalSession)
          .where(eq(personalSession.spaceId, spaceId)),
      ).toHaveLength(1);
      const legacy = await required(experience).createConversation(spaceId, {
        title: 'Existing meeting preparation',
      });
      if ('status' in legacy) throw new Error('Conversations missing');
      const feed = await required(personal).get(spaceId);
      expect(
        feed.session.references.some((ref) => ref.conversation_id === legacy.conversation.id),
      ).toBe(true);
      expect((await required(jobs).get(legacy.conversation.id)).experienceParentId).toBeNull();
    }));

  test('a first request and its job commit once across retries, tabs and changed-input conflicts', async () =>
    asPerson(async () => {
      const body = { target: { kind: 'new_task' }, text: 'Research the pilot requirements.' };
      const [first, retry] = await Promise.all([
        required(personal).message(spaceId, body, 'saved-first-request'),
        required(personal).message(spaceId, body, 'saved-first-request'),
      ]);
      expect(retry).toEqual(first);
      const turns = await required(experience).messages(spaceId, first.conversation_id);
      expect(turns.turns).toHaveLength(1);
      expect(turns.turns[0]?.text).toBe(body.text);
      const conflict = await rejectionOf(
        required(personal).message(
          spaceId,
          { ...body, text: 'Different words' },
          'saved-first-request',
        ),
      );
      expect((conflict as { code: string }).code).toBe('submission_conflict');
      expect(
        (await required(experience).messages(spaceId, first.conversation_id)).turns,
      ).toHaveLength(1);
    }));

  test('an unrelated task does not steer the first task or withdraw its email approval', async () =>
    asPerson(async () => {
      const first = await required(personal).message(
        spaceId,
        { target: { kind: 'new_task' }, text: 'Draft an email about the pilot.' },
        'parallel-a',
      );
      const db = required(handle);
      const attemptId = newId('att');
      const connectionId = newId('conn');
      const actionId = newId('act');
      const approvalId = newId('apr');
      await db.sql`insert into connection (id, space_id, provider, label, scopes) values (${connectionId}, ${spaceId}, 'test', 'Disposable mail', '[]')`;
      await db.sql`insert into attempt (id, job_id, epoch, runtime_version, provider, model, ended_at) values (${attemptId}, ${first.conversation_id}, 1, 'fixture', 'fixture', 'scripted', now())`;
      await db.sql`insert into action (id, job_id, attempt_id, connection_id, kind, effect_class, canonical_payload, payload_hash, idempotency_key, status)
      values (${actionId}, ${first.conversation_id}, ${attemptId}, ${connectionId}, 'email.send', 'send', '{"body":"Old draft"}', 'fixture-hash', ${actionId}, 'needs_approval')`;
      await db.sql`insert into approval (id, action_id, job_revision, payload_hash) values (${approvalId}, ${actionId}, 0, 'fixture-hash')`;
      await db.sql`update job set state = 'running' where id = ${first.conversation_id}`;
      const before = await required(jobs).get(first.conversation_id);
      const second = await required(personal).message(
        spaceId,
        { target: { kind: 'new_task' }, text: 'What is a pilot study?' },
        'parallel-b',
      );
      expect(second.conversation_id).not.toBe(first.conversation_id);
      const after = await required(jobs).get(first.conversation_id);
      expect(after.state).toBe(before.state);
      expect(after.stateVersion).toBe(before.stateVersion);
      expect(
        (await db.sql`select decision from approval where id = ${approvalId}`)[0]?.decision,
      ).toBeNull();
      expect(
        (
          await db.sql`select count(*)::int as count from event where job_id = ${first.conversation_id} and payload->>'kind' = 'steer'`
        )[0]?.count,
      ).toBe(0);
      // When the explicitly selected email is corrected, its old exact-action approval is withdrawn.
      await db.sql`update job set state = 'waiting_for_input' where id = ${first.conversation_id}`;
      await db.sql`update experience_turn set answer = 'Old draft: Please confirm the pilot.', status = 'done', finished_at = now() where id = ${first.turn_id}`;
      const corrected = await required(personal).message(
        spaceId,
        {
          target: {
            kind: 'reply_result',
            conversation_id: first.conversation_id,
            turn_id: first.turn_id,
          },
          text: 'Make the email shorter.',
        },
        'parallel-correction',
      );
      expect(corrected.conversation_id).toBe(first.conversation_id);
      expect(
        (await db.sql`select decision from approval where id = ${approvalId}`)[0]?.decision,
      ).toBe('denied');
      await required(jobs).cancel(second.conversation_id);
      expect((await required(jobs).get(first.conversation_id)).state).toBe('queued');
    }));

  test('an ambiguous message is refused with one focused target question', async () =>
    asPerson(async () => {
      const error = await rejectionOf(
        required(personal).message(spaceId, { text: 'Make it shorter.' }, 'ambiguous'),
      );
      expect((error as { code: string }).code).toBe('message_target_required');
    }));

  test('Continue reaches only the explicitly selected active task', async () =>
    asPerson(async () => {
      const first = await required(personal).message(
        spaceId,
        { target: { kind: 'new_task' }, text: 'Research the decision.' },
        'continue-research',
      );
      const second = await required(personal).message(
        spaceId,
        { target: { kind: 'new_task' }, text: 'Prepare the meeting.' },
        'continue-meeting',
      );
      const accepted = await required(personal).message(
        spaceId,
        {
          target: { kind: 'continue_task', conversation_id: first.conversation_id },
          text: 'Include implementation cost.',
        },
        'continue-selected',
      );
      expect(accepted.conversation_id).toBe(first.conversation_id);
      expect(personalSessionAcceptance.parse(accepted).steer?.state).toBe('queued');
      expect(
        (await required(experience).messages(spaceId, second.conversation_id)).turns,
      ).toHaveLength(1);
    }));

  test('an invalid attachment rolls the first handoff back without an empty task', async () =>
    asPerson(async () => {
      const title = 'Attachment handoff must be atomic';
      const error = await rejectionOf(
        required(personal).message(
          spaceId,
          {
            target: { kind: 'new_task' },
            text: title,
            attachments: ['file_missing'],
          },
          'invalid-attachment',
        ),
      );
      expect((error as { code: string }).code).toStartWith('attachment');
      const [counts] = await required(handle)
        .sql`select count(*)::int as count from job where title = ${title}`;
      expect(counts?.count).toBe(0);
    }));

  test('a different principal cannot use another person personal session or its targets', async () => {
    const other = newId('own');
    await required(handle)
      .db.insert(principal)
      .values({ id: other, email: 'other-continuity@example.test' });
    const error = await principalContext.run(other, () =>
      rejectionOf(required(personal).get(spaceId)),
    );
    expect((error as { code: string }).code).toBe('scope_denied');
  });

  test('replying to yesterday result stays bound to its turn and leaves tomorrow schedule active', async () =>
    asPerson(async () => {
      const agent = await required(experience).defaultAgent(spaceId);
      const routine = await required(jobs).transaction((tx) =>
        required(jobs).createInTransaction(
          tx,
          {
            space_id: spaceId,
            title: 'Morning pilot brief',
            objective: 'Prepare my requested brief.',
          },
          { kind: 'routine', agentId: agent.id, dormant: true },
          'owner_request',
        ),
      );
      const yesterday = newId('turn');
      const today = newId('turn');
      const triggerId = newId('trg');
      const db = required(handle);
      await db.sql`insert into experience_turn (id, job_id, agent_id, submission_id, text, answer, status, created_at, finished_at)
      values (${yesterday}, ${routine.id}, ${agent.id}, ${newId('op')}, '', 'Yesterday: Priya asked about the pilot retention requirement.', 'done', now() - interval '1 day', now() - interval '1 day'),
      (${today}, ${routine.id}, ${agent.id}, ${newId('op')}, '', 'Today: An unrelated supplier update.', 'done', now(), now())`;
      await db.sql`insert into trigger (id, job_id, kind, spec, enabled) values (${triggerId}, ${routine.id}, 'schedule', '{"kind":"schedule","cron":"0 8 * * *","time_zone":"UTC"}', true)`;
      const connectionId = newId('conn');
      await db.sql`insert into connection (id, space_id, provider, label, scopes) values (${connectionId}, ${spaceId}, 'test', 'Routine fixture mail', '[]')`;
      const pending = async (turnId: string, epoch: number) => {
        const attemptId = newId('att');
        const actionId = newId('act');
        const approvalId = newId('apr');
        await db.sql`insert into attempt (id, job_id, epoch, turn_id, runtime_version, provider, model, ended_at)
          values (${attemptId}, ${routine.id}, ${epoch}, ${turnId}, 'fixture', 'fixture', 'scripted', now())`;
        await db.sql`insert into action (id, job_id, attempt_id, connection_id, kind, effect_class, canonical_payload, payload_hash, idempotency_key, status)
          values (${actionId}, ${routine.id}, ${attemptId}, ${connectionId}, 'email.send', 'send', '{"body":"Draft"}', 'fixture-hash', ${actionId}, 'needs_approval')`;
        await db.sql`insert into approval (id, action_id, job_revision, payload_hash) values (${approvalId}, ${actionId}, 0, 'fixture-hash')`;
        return approvalId;
      };
      const oldApproval = await pending(yesterday, 1);
      const newApproval = await pending(today, 2);
      const feed = await required(personal).get(spaceId);
      expect(
        feed.session.references.filter(
          (ref) => ref.conversation_id === routine.id && ref.kind === 'result',
        ),
      ).toHaveLength(2);
      const body = {
        target: { kind: 'reply_result', conversation_id: routine.id, turn_id: yesterday },
        text: 'Make its second paragraph shorter.',
      };
      const first = await required(personal).message(spaceId, body, 'yesterday-result');
      const retry = await required(personal).message(spaceId, body, 'yesterday-result');
      expect(retry).toEqual(first);
      expect(first.conversation_id).not.toBe(routine.id);
      const discussion = await required(jobs).get(first.conversation_id);
      expect(discussion.objective).toContain(yesterday);
      expect(discussion.objective).toContain('Yesterday: Priya');
      expect(discussion.objective).not.toContain('Today: An unrelated');
      expect(discussion.objectiveOrigin).toBe('derived');
      expect(discussion.experienceParentId).toBeNull();
      expect((await db.sql`select enabled from trigger where id = ${triggerId}`)[0]?.enabled).toBe(
        true,
      );
      expect((await required(jobs).get(routine.id)).state).toBe(routine.state);
      expect(
        (await db.sql`select decision from approval where id = ${oldApproval}`)[0]?.decision,
      ).toBe('denied');
      expect(
        (await db.sql`select decision from approval where id = ${newApproval}`)[0]?.decision,
      ).toBeNull();
      const reference = (await required(personal).get(spaceId)).session.references.find(
        (ref) => ref.turn_id === yesterday,
      );
      expect(reference?.discussion_id).toBe(first.conversation_id);
      const read = await required(personal).read(spaceId, { reference_id: first.reference_id });
      expect(read.session.read_reference_id).toBe(first.reference_id);
    }));
});
