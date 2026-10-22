/** Documentation-only fixtures. No model calls, mail delivery, or external accounts. */
import { createMock } from '../../apps/mock-api/src/index.ts';
import { parseScenario } from '../../apps/mock-api/src/scenario.ts';

const { app, scenarios } = createMock({
  experience: { seed: true },
  needsYou: 'none',
  reach: false,
  voice: false,
  featuresOff: ['phone', 'sms', 'companies'],
  speed: 1,
});

scenarios.unshift(
  parseScenario({
    id: 'docs-client-follow-up',
    title: 'Northstar proposal follow-up',
    summary: 'Scripted documentation walkthrough of reading a thread and reviewing a draft.',
    match: ['northstar'],
    steps: [
      {
        step: 'text',
        text: 'I’ll read the Northstar thread and prepare a short follow-up for your review.',
        delay_ms: 700,
      },
      {
        step: 'tool',
        name: 'email.search',
        arguments: { query: 'Northstar proposal' },
        result: { matches: 3, latest: '2026-10-20T09:00:00Z' },
        title: 'Read the proposal thread',
        delay_ms: 1100,
      },
      {
        step: 'text',
        text: '\n\nSam asked for the revised scope. The proposal was shared on Tuesday; there is no reply in this sample thread. I’ll ask whether the scope works and offer a short call.',
        delay_ms: 1100,
      },
      {
        step: 'propose',
        ref: 'followup',
        kind: 'email.send',
        connection: 'outbox',
        effect_class: 'write_external',
        delay_ms: 1100,
        payload: {
          to: ['sam@example.com'],
          subject: 'Northstar — next steps on the proposal',
          body: 'Hi Sam,\n\nFollowing up on the revised Northstar proposal I shared on Tuesday. Does the updated scope cover what your team needs?\n\nIf useful, I can walk through the open questions on a short call next week. Let me know what works for you.\n\nThanks,\nAvery',
        },
      },
      { step: 'complete', answer: 'Your draft is ready to review.' },
    ],
  }),
  parseScenario({
    id: 'docs-research-brief',
    title: 'Supplier research brief',
    summary: 'Scripted documentation example; the companies and findings are sample data.',
    match: ['supplier shortlist'],
    steps: [
      {
        step: 'text',
        text: 'I’ll compare the three suppliers and separate documented claims from questions to verify.',
        delay_ms: 600,
      },
      {
        step: 'tool',
        name: 'web.search',
        arguments: { query: 'sample supplier documentation' },
        result: { matches: 3 },
        title: 'Read supplier documentation',
        delay_ms: 900,
      },
      {
        step: 'complete',
        delay_ms: 900,
        answer:
          '## Supplier shortlist\n\nSample research brief for the walkthrough.\n\n| Supplier | Best fit | Question to verify |\n| --- | --- | --- |\n| Cedar Works | Small pilot orders | Confirm minimum order |\n| Field Supply | Repeat monthly orders | Request current lead times |\n| North Mill | Custom packaging | Ask for a proof sample |\n\n### Recommended next step\nRequest quotes with the same quantity, delivery date and packaging specification. Compare the landed cost before choosing.\n\n### What is still missing\nCurrent prices, references and delivery commitments. No supplier has been contacted.',
      },
    ],
  }),
);

async function request(method: string, path: string, body?: unknown) {
  const response = await app.request(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok)
    throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
  return response.json();
}

await request('PATCH', '/profile', {
  name: 'Avery Morgan',
  time_zone: 'Asia/Kolkata',
  day_hours: { start: '08:00', end: '18:00' },
  onboarded: true,
  time_zone_confirmed: true,
});
for (const [path, key] of [
  ['/tasks', 'tasks'],
  ['/plans', 'plans'],
  ['/automations', 'automations'],
  ['/conversations', 'conversations'],
]) {
  const data = await request('GET', path);
  for (const item of data[key] ?? []) await request('DELETE', `${path}/${item.id}`);
}
for (const title of [
  'Review the Northstar follow-up draft',
  'Compare supplier quotes for the pilot',
  'Send Friday’s client progress update',
]) {
  await request('POST', '/tasks', { title, due_at: null, done: false });
}
await request('POST', '/plans', {
  title: 'Launch the studio website',
  category: 'Work',
  milestones: [
    { title: 'Agree the page outline', assignee: { kind: 'person' } },
    { title: 'Review copy and screenshots', assignee: { kind: 'person' } },
    { title: 'Publish and share with clients', assignee: { kind: 'person' } },
  ],
});
const brief = await request('POST', '/automations/morning-brief', {
  at: '08:00',
  topics: ['Design tools', 'Small business'],
});
const research = await request('POST', '/automations', {
  title: 'Friday research brief',
  instruction:
    'Review the supplier shortlist. Summarise new information, link sources and list questions to verify. Do not contact suppliers.',
  weekdays: [5],
  at: '09:00',
});
const followup = await request('POST', '/conversations', { title: 'Northstar proposal follow-up' });
const comparison = await request('POST', '/conversations', { title: 'Supplier shortlist' });
const metadata = {
  scripted: true,
  followup: followup.conversation.id,
  comparison: comparison.conversation.id,
  brief: brief.automation.id,
  research: research.automation.id,
};

Bun.serve({
  hostname: '127.0.0.1',
  port: 3320,
  idleTimeout: 0,
  fetch(request) {
    if (new URL(request.url).pathname === '/docs-metadata') return Response.json(metadata);
    return app.fetch(request);
  },
});
process.stdout.write(
  'Documentation fixtures: http://127.0.0.1:3320 (scripted; no external actions)\n',
);
