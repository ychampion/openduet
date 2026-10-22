import { afterAll, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import {
  experienceProfile,
  experienceTurn,
  job,
  personalDailyBrief,
  principal,
  pushIntent,
  pushSubscription,
  space,
  trigger,
} from '../../src/db/schema.ts';
import { ExperiencePlanning } from '../../src/experience/planning.ts';
import { ExperienceService } from '../../src/experience/service.ts';
import { newId } from '../../src/ids.ts';
import { startQueue } from '../../src/jobs/queue.ts';
import { AttemptRunner } from '../../src/jobs/runner.ts';
import { JobService } from '../../src/jobs/service.ts';
import { TriggerService } from '../../src/jobs/triggers.ts';
import { principalContext } from '../../src/principals/authority.ts';
import { PushService } from '../../src/push/service.ts';
import { generateVapidKeys, toBase64Url } from '../../src/push/webpush.ts';
import { StubRuntimeAdapter } from '../../src/runtime/stub.ts';
import { situation } from '../../src/situations/schema.ts';
import { testDatabase } from '../helpers/database.ts';

const fixture = await testDatabase();
const queue = fixture ? await startQueue(fixture.url) : null;
const jobs = fixture && queue ? new JobService(fixture.db, queue.boss) : null;
const runner = jobs
  ? new AttemptRunner(jobs, new StubRuntimeAdapter(), {
      key: 'delivery-policy-fixture-key-32-bytes',
    })
  : null;
const triggers = jobs && runner ? new TriggerService(jobs, runner) : null;
afterAll(async () => {
  await triggers?.stop();
  await runner?.stop();
  await queue?.stop();
  await fixture?.close();
}, 60_000);

(fixture && jobs && triggers ? describe : describe.skip)('personal delivery policy', () => {
  if (!fixture || !jobs || !triggers) return;
  const db = fixture.db;
  const service = new ExperienceService(db, jobs);
  const planning = new ExperiencePlanning(service, triggers);
  const push = new PushService(db, { keys: null, subject: null, extraOrigins: [] });
  const person = async () => {
    const principalId = newId('own');
    const spaceId = newId('sp');
    await db.insert(principal).values({ id: principalId, email: `${principalId}@example.test` });
    await db.insert(space).values({
      id: spaceId,
      name: 'Personal',
      kind: 'personal',
      ownerPrincipalId: principalId,
      gitPath: `/fixtures/${spaceId}`,
    });
    await db.insert(experienceProfile).values({ spaceId, timeZone: 'Asia/Kolkata' });
    return { principalId, spaceId };
  };
  const daily = (who: Awaited<ReturnType<typeof person>>, at: string, topics?: string[]) =>
    principalContext.run(who.principalId, () =>
      planning.createMorningBrief(who.spaceId, { at, ...(topics ? { topics } : {}) }),
    );

  test('two tabs and repeated setup resolve one stable daily brief and edit its actual trigger', async () => {
    const who = await person();
    const [a, b] = await Promise.all([
      daily(who, '08:00', ['Science']),
      daily(who, '08:00', ['Science']),
    ]);
    if (!('automation' in a) || !('automation' in b)) throw new Error('Brief unavailable');
    expect(a.automation.id).toBe(b.automation.id);
    expect(a.automation.purpose).toBe('personal.daily_brief');
    const changed = await daily(who, '08:30');
    if (!('automation' in changed)) throw new Error('Brief unavailable');
    expect(changed.automation).toMatchObject({
      id: a.automation.id,
      at: '08:30',
      time_zone: 'Asia/Kolkata',
    });
    const [registration] = await db.select().from(trigger).where(eq(trigger.id, a.automation.id));
    expect(registration?.spec).toEqual({
      kind: 'schedule',
      cron: '30 8 * * *',
      timezone: 'Asia/Kolkata',
    });
    const [thread] = await db.select().from(job).where(eq(job.id, a.automation.conversation_id));
    expect(thread?.objective).toContain('news on Science');
    expect(
      await db.select().from(personalDailyBrief).where(eq(personalDailyBrief.spaceId, who.spaceId)),
    ).toHaveLength(1);
    const restarted = new ExperiencePlanning(new ExperienceService(db, jobs), triggers);
    const again = await principalContext.run(who.principalId, () =>
      restarted.createMorningBrief(who.spaceId, { at: '08:30' }),
    );
    if (!('automation' in again)) throw new Error('Brief unavailable');
    expect(again.automation.id).toBe(a.automation.id);
    if (!queue) throw new Error('Queue unavailable');
    const schedules = await queue.boss.getSchedules();
    expect(
      schedules.some(
        (schedule) =>
          JSON.stringify(schedule).includes(a.automation.id) &&
          JSON.stringify(schedule).includes('30 8 * * *'),
      ),
    ).toBe(true);
  });

  test('paused daily brief stays paused through setup and delivery changes do not stop it', async () => {
    const who = await person();
    const made = await daily(who, '08:00');
    if (!('automation' in made)) throw new Error('Brief unavailable');
    await principalContext.run(who.principalId, () =>
      planning.setAutomationEnabled(who.spaceId, made.automation.id, false),
    );
    const repeated = await daily(who, '08:30');
    if (!('automation' in repeated)) throw new Error('Brief unavailable');
    expect(repeated.automation.enabled).toBe(false);
    expect(
      (await db.select().from(trigger).where(eq(trigger.id, made.automation.id)))[0]?.enabled,
    ).toBe(false);
    await principalContext.run(who.principalId, () =>
      planning.setAutomationEnabled(who.spaceId, made.automation.id, true),
    );
    await push.updateSettings(who.principalId, { daily_brief: false });
    expect(
      (await db.select().from(trigger).where(eq(trigger.id, made.automation.id)))[0]?.enabled,
    ).toBe(true);
    expect((await push.settings(who.principalId)).daily_brief).toBe(false);
  });

  test('suggestions off leaves requested reminders enabled and drops only unsolicited pending delivery', async () => {
    const who = await person();
    const before = new Date();
    for (const kind of ['situation', 'reminder', 'done', 'daily_brief'])
      await db.insert(pushIntent).values({
        id: newId('pint'),
        principalId: who.principalId,
        kind,
        title: kind,
        body: 'A real category fixture',
        because: 'Because this is a category fixture.',
        url: '/#/work',
        dedupKey: `${who.principalId}:${kind}`,
      });
    const saved = await push.updateSettings(who.principalId, { proactive_suggestions: false });
    expect(saved).toMatchObject({
      proactive_suggestions: false,
      requested_reminders: true,
      task_results: true,
      daily_brief: true,
    });
    const intents = await db
      .select()
      .from(pushIntent)
      .where(eq(pushIntent.principalId, who.principalId));
    expect(
      intents.find((row) => row.kind === 'situation')?.droppedAt?.getTime(),
    ).toBeGreaterThanOrEqual(before.getTime());
    expect(
      intents.filter((row) => row.kind !== 'situation').every((row) => row.droppedAt === null),
    ).toBe(true);
    await push.updateSettings(who.principalId, { task_results: false, settled: false });
    expect(await push.settings(who.principalId)).toMatchObject({
      requested_reminders: true,
      task_results: false,
      daily_brief: true,
    });
  });

  test('simultaneous category edits merge and never undo another device’s opt-out', async () => {
    const who = await person();
    await Promise.all([
      push.updateSettings(who.principalId, { task_results: false }),
      push.updateSettings(who.principalId, { requested_reminders: false }),
      push.updateSettings(who.principalId, { decisions: false }),
    ]);
    expect(await push.settings(who.principalId)).toMatchObject({
      task_results: false,
      requested_reminders: false,
      decisions: false,
      proactive_suggestions: false,
      daily_brief: true,
    });
  });

  test('event categories distinguish a daily brief, a requested reminder and completed work', async () => {
    const who = await person();
    const made = await daily(who, '08:30');
    if (!('automation' in made)) throw new Error('Brief unavailable');
    const chosen = await service.defaultAgent(who.spaceId);
    const completed = async (kind: string, timed: boolean, existingId?: string) => {
      const id = existingId ?? newId('job');
      if (!existingId)
        await db.insert(job).values({
          id,
          spaceId: who.spaceId,
          principalId: who.principalId,
          agentId: chosen.id,
          kind,
          title: 'Requested work',
          objective: 'Requested work',
          state: 'waiting_for_event_or_time',
        });
      const turnId = newId('turn');
      await db.insert(experienceTurn).values({
        id: turnId,
        jobId: id,
        agentId: chosen.id,
        submissionId: `${timed ? (kind === 'routine' ? 'routine' : 'wake') : 'user'}:${turnId}`,
        text: 'My request',
        answer: 'Here is the requested output.',
        status: 'done',
        finishedAt: new Date(),
      });
    };
    await completed('routine', true, made.automation.conversation_id);
    await completed('chat', true);
    await completed('chat', false);
    await push.collectStatus(who.principalId, new Date(Date.now() - 60_000), new Date());
    expect(
      (await db.select().from(pushIntent).where(eq(pushIntent.principalId, who.principalId)))
        .map((row) => row.kind)
        .sort(),
    ).toEqual(['daily_brief', 'done', 'reminder']);
    // Configuration survives a fresh dispatcher and never substitutes a single global opt-out.
    await push.updateSettings(who.principalId, {
      proactive_suggestions: false,
      requested_reminders: true,
    });
    const fresh = new PushService(db, {
      keys: await generateVapidKeys(),
      subject: null,
      extraOrigins: [],
    });
    expect(await fresh.settings(who.principalId)).toMatchObject({
      proactive_suggestions: false,
      requested_reminders: true,
    });
  });

  test('dispatch suppresses unsolicited situations while delivering requested reminders and accepted deadlines', async () => {
    const who = await person();
    const device = await generateVapidKeys();
    await db.insert(pushSubscription).values({
      id: newId('psub'),
      principalId: who.principalId,
      endpoint: `https://fcm.googleapis.com/${who.principalId}`,
      p256dh: device.publicKey,
      auth: toBase64Url(crypto.getRandomValues(new Uint8Array(16))),
    });
    let deliveries = 0;
    const dispatch = new PushService(db, {
      keys: await generateVapidKeys(),
      subject: 'mailto:fixture@example.test',
      extraOrigins: [],
      fetcher: Object.assign(
        async () => {
          deliveries++;
          return new Response(null, { status: 201 });
        },
        { preconnect: () => {} },
      ),
    });
    for (const personSet of [false, true]) {
      const situationId = newId('sit');
      await db.insert(situation).values({
        id: situationId,
        spaceId: who.spaceId,
        principalId: who.principalId,
        kind: 'deadline.at_risk',
        subjectKey: `fixture:${personSet}`,
        key: `${who.principalId}:${personSet}`,
        personSet,
        title: 'A deadline',
        reason: 'A fixture deadline is due.',
        because: ['fixture'],
        origin: 'service',
      });
      await db.insert(pushIntent).values({
        id: newId('pint'),
        principalId: who.principalId,
        kind: 'situation',
        personSet,
        urgency: personSet ? 'urgent' : 'soon',
        situationId,
        title: 'A deadline',
        body: 'A deadline is due.',
        because: 'Because of this deadline.',
        url: '/#/work',
        dedupKey: `${who.principalId}:${personSet}`,
      });
    }
    await db.insert(pushIntent).values({
      id: newId('pint'),
      principalId: who.principalId,
      kind: 'reminder',
      title: 'Your reminder',
      body: 'You asked for this.',
      because: 'Because you asked at this time.',
      url: '/#/work',
      dedupKey: `${who.principalId}:reminder`,
    });
    expect(await dispatch.dispatch(who.principalId, new Date())).toBe('sent');
    expect(await dispatch.dispatch(who.principalId, new Date())).toBe('sent');
    expect(deliveries).toBe(2);
    const intents = await db
      .select()
      .from(pushIntent)
      .where(eq(pushIntent.principalId, who.principalId));
    expect(
      intents
        .filter((row) => row.sentAt)
        .map((row) => row.kind)
        .sort(),
    ).toEqual(['reminder', 'situation']);
    const unsolicited = intents.find((row) => row.kind === 'situation' && !row.personSet);
    expect(unsolicited?.sentAt).toBeNull();
    expect(unsolicited?.droppedAt).not.toBeNull();
  });
});
