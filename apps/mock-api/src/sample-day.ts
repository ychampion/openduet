/** An isolated, deterministic Sample day. This module has no production service or connector. */

import {
  type CustomerFollowupView,
  conversationResponse,
  customerFollowupCreate,
  memoryItemResponse,
} from '@openduet/contracts';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createMock } from './index.ts';
import { parseScenario } from './scenario.ts';

export const SAMPLE_PREFERENCE =
  'For client follow-ups, keep the message under 120 words and make one clear ask.';
export const SAMPLE_NOTES =
  'Customer call notes: Priya at Northstar is considering a pilot. She asked for the security review before choosing a date. We have not confirmed SSO support. Prepare a concise follow-up asking which security questions her team needs answered. Do not promise SSO or send anything.';

export async function createSampleDay() {
  const mock = createMock({
    experience: { seed: false },
    needsYou: 'none',
    computer: false,
    voice: false,
    reach: false,
    featuresOff: ['phone', 'sms', 'companies', 'browser', 'computer'],
    speed: 0,
  });
  const { experience, scenarios } = mock;
  const draftBody =
    'Hi Priya,\n\nThanks for walking me through the pilot. Before we agree a date, I’ll help get your team’s security questions answered. SSO support is still unconfirmed.\n\nWhich security questions should we prioritise for the review?\n\nThanks,\nAvery';
  scenarios.unshift(
    parseScenario({
      id: 'sample-customer-followup',
      title: 'Sample day · Northstar follow-up',
      summary: 'A scripted draft prepared from supplied notes, with no invented commitment.',
      match: ['customer call notes'],
      steps: [
        {
          step: 'text',
          text: 'The security review is still open. I’ve kept SSO unconfirmed and prepared one clear question for Priya.\n\nSource: your customer call notes. Sample day · scripted example; no real email is sent.',
        },
        {
          step: 'propose',
          ref: 'sample-followup',
          kind: 'email.send',
          connection: 'outbox',
          effect_class: 'write_external',
          payload: {
            to: ['priya@example.com'],
            subject: 'Northstar pilot — security review',
            body: draftBody,
          },
        },
        {
          step: 'complete',
          answer:
            '## Prepared follow-up\n\nThe draft asks Priya which security questions to prioritise. It does not promise SSO or a start date.\n\nSource: the customer call notes you supplied. Review the draft before sending.\n\nSample day · scripted result; no real email is sent.',
        },
      ],
    }),
  );
  scenarios.unshift(
    parseScenario({
      id: 'sample-later-task',
      title: 'Sample day · Your style in the next task',
      summary: 'A second deterministic example using the saved sample preference.',
      match: ['next relevant task'],
      steps: [
        {
          step: 'complete',
          answer:
            '## A later follow-up, in your saved style\n\nHi Priya,\n\nI’m checking in on the Northstar pilot’s security review. SSO support is still unconfirmed. Which security question would you like us to answer first?\n\nThanks,\nAvery\n\n---\nApplied saved preference: “For client follow-ups, keep the message under 120 words and make one clear ask.”\n\nSource: supplied Northstar call notes. This is a scripted Sample day example, not a live model evaluation.',
        },
      ],
    }),
  );
  async function call(path: string, method = 'GET', body?: unknown) {
    const response = await mock.app.request(path, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok)
      throw new Error(`Sample fixture ${method} ${path} failed (${response.status}).`);
    return response.json();
  }
  await call('/profile', 'PATCH', {
    name: 'Avery · Sample day',
    time_zone: 'Asia/Kolkata',
    day_hours: { start: '08:00', end: '18:00' },
    onboarded: true,
    time_zone_confirmed: true,
  });
  // Keep only this scenario's explicit preference; the ordinary mock's profile
  // examples must not leak into the sample assistant's context.
  experience.memories.clear();
  experience.answers.clear();
  const preference = memoryItemResponse.parse(
    await call('/memory/items', 'POST', {
      key: 'pref.client-followups.style',
      value: SAMPLE_PREFERENCE,
    }),
  );
  const followup = conversationResponse.parse(
    await call('/conversations', 'POST', { title: 'Sample day · Follow up with Priya' }),
  );
  await call(`/conversations/${followup.conversation.id}/messages`, 'POST', { text: SAMPLE_NOTES });
  const later = conversationResponse.parse(
    await call('/conversations', 'POST', { title: 'Sample day · Your style, next time' }),
  );
  await call(`/conversations/${later.conversation.id}/messages`, 'POST', {
    text: 'Next relevant task: prepare another short follow-up for Priya using my saved client follow-up preference.',
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (
      [followup.conversation.id, later.conversation.id].every((id) =>
        ['done', 'needs_you'].includes(experience.chats.get(id)?.view.status ?? ''),
      )
    )
      break;
    await Bun.sleep(5);
  }
  const metadata = {
    label: 'Sample day',
    scripted: true,
    real_effects: false,
    followup: followup.conversation.id,
    later: later.conversation.id,
    responsibility: 'sample-customer-watch',
    preference: preference.item.id,
  };
  const app = new Hono();
  app.use(
    '*',
    cors({
      origin: 'http://127.0.0.1:5321',
      allowHeaders: ['content-type', 'accept', 'idempotency-key', 'last-event-id'],
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    }),
  );
  app.get('/push/public-key', (c) => c.json({ public_key: null }));
  app.post('/push/subscriptions', (c) =>
    c.json(
      { error: { code: 'sample_only', message: 'Sample day does not subscribe real devices.' } },
      409,
    ),
  );
  app.get('/sample-day', (c) => c.json(metadata));
  const mailbox = [...mock.store.connections.values()].find((row) => row.label === 'inbox');
  if (!mailbox) throw new Error('Sample mailbox missing');
  const version = '1'.repeat(64);
  const watch: CustomerFollowupView = {
    id: metadata.responsibility,
    title: 'Sample day · Northstar pilot',
    connection_id: mailbox.id,
    connection_label: 'Sample mailbox',
    thread_key: 'sample-northstar',
    customer_email: 'priya@example.com',
    deadline_at: new Date(Date.now() + 86_400_000).toISOString(),
    time_zone: 'Asia/Kolkata',
    state: 'watching',
    next_check_at: new Date(Date.now() + 300_000).toISOString(),
    checked_at: new Date().toISOString(),
    failure: null,
    source_version: version,
    skill_refs: [],
    preference_refs: [preference.item.id],
    result: null,
  };
  const followups = new Map([[watch.id, watch]]);
  const thread = {
    version,
    subject: 'Northstar pilot — security review',
    latest_outgoing: 'sample-outgoing-1',
    replied: false,
    connection_label: 'Sample mailbox',
    messages: [
      {
        key: 'sample-outgoing-1',
        message_id: '<sample-outgoing@example.com>',
        from: 'avery@example.com',
        to: 'priya@example.com',
        subject: 'Northstar pilot — security review',
        text: draftBody,
        date: new Date().toISOString(),
        own: true,
      },
    ],
  };
  app.get('/customer-followups/sources', (c) =>
    c.json({ sources: [{ id: mailbox.id, label: 'Sample mailbox' }] }),
  );
  app.get('/customer-followups', (c) => c.json({ followups: [...followups.values()] }));
  app.post('/customer-followups/messages', (c) =>
    c.json({
      messages: [
        {
          key: 'sample-northstar',
          subject: thread.subject,
          from: 'avery@example.com',
          date: thread.messages[0]?.date,
          preview: 'Sample day · the latest outgoing message to Priya.',
        },
      ],
    }),
  );
  app.post('/customer-followups/preview', (c) => c.json({ thread }));
  app.post('/customer-followups', async (c) => {
    const parsed = customerFollowupCreate.safeParse(await c.req.json());
    if (
      !parsed.success ||
      parsed.data.connection_id !== mailbox.id ||
      parsed.data.source_version !== version
    )
      return c.json(
        {
          error: {
            code: 'sample_scope',
            message: 'Choose the sample mailbox and review its sample thread.',
          },
        },
        400,
      );
    const existing = [...followups.values()].find(
      (row) =>
        row.thread_key === parsed.data.thread_key && row.deadline_at === parsed.data.deadline_at,
    );
    const created: CustomerFollowupView = existing ?? {
      ...watch,
      ...parsed.data,
      id: `sample-watch-${followups.size + 1}`,
    };
    followups.set(created.id, created);
    return c.json({ followup: created }, 201);
  });
  for (const action of ['pause', 'resume', 'dismiss'] as const)
    app.post(`/customer-followups/:id/${action}`, (c) => {
      const row = followups.get(c.req.param('id'));
      if (!row)
        return c.json(
          { error: { code: 'not_found', message: 'This sample responsibility is not here.' } },
          404,
        );
      row.state = action === 'pause' ? 'paused' : action === 'resume' ? 'watching' : 'dismissed';
      row.next_check_at = action === 'resume' ? new Date().toISOString() : null;
      return c.json({ followup: row });
    });
  app.route('/', mock.app);
  return { ...mock, app, metadata, followups };
}

if (import.meta.main) {
  const sample = await createSampleDay();
  Bun.serve({ hostname: '127.0.0.1', port: 3321, idleTimeout: 0, fetch: sample.app.fetch });
  process.stdout.write('Sample day fixtures: http://127.0.0.1:3321 (scripted, no real actions)\n');
}
