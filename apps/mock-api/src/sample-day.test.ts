import { expect, test } from 'bun:test';
import {
  assistantCollaboration,
  assistantSnapshot,
  experienceDraft,
  experienceReceipt,
  permissionCard,
} from '@openduet/contracts';
import { z } from 'zod';
import { isolatedSampleFetch, sampleRequestAllowed } from '../../web/src/sample/transport.ts';
import { createSampleDay, SAMPLE_PREFERENCE } from './sample-day.ts';

test('collaborative suggestions have actual sample context, remain unsent, and pause or dismissal stays isolated', async () => {
  const first = await createSampleDay(),
    second = await createSampleDay();
  const read = async (sample: typeof first) =>
    assistantSnapshot.parse(await (await sample.app.request('/assistant')).json());
  const card = (await read(first)).suggestions[0];
  if (!card) throw new Error('Missing suggestion');
  const before = first.experience.chats.size;
  const context = assistantCollaboration.parse(
    await (
      await first.app.request(`/assistant/suggestions/${card.id}/context`, { method: 'POST' })
    ).json(),
  );
  expect(context.attachment.name).toBe('sample-collaboration-context.txt');
  expect(context.prompt).toContain('Do not send');
  expect(first.experience.chats.size).toBe(before);
  const post = (path: string, body: unknown, method = 'POST') =>
    first.app.request(path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  await post('/assistant', { enabled: false }, 'PATCH');
  expect((await read(first)).status).toBe('paused');
  expect(
    (await first.app.request(`/assistant/suggestions/${card.id}/context`, { method: 'POST' }))
      .status,
  ).toBe(404);
  await post('/assistant', { enabled: true }, 'PATCH');
  await post(`/assistant/suggestions/${card.id}`, { action: 'tomorrow' });
  expect((await read(first)).suggestions).toHaveLength(0);
  expect(
    (await first.app.request(`/assistant/suggestions/${card.id}/context`, { method: 'POST' }))
      .status,
  ).toBe(404);
  await post(`/assistant/suggestions/${card.id}`, { action: 'dismiss' });
  expect((await read(first)).suggestions).toHaveLength(0);
  expect((await read(second)).suggestions).toHaveLength(1);
});

test('Sample day never configures browser push or accepts device subscriptions', async () => {
  const sample = await createSampleDay();
  const key = await sample.app.request('/push/public-key', {
    headers: { origin: 'http://127.0.0.1:5321' },
  });
  expect(key.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:5321');
  expect(await key.json()).toEqual({ public_key: null });
  const attempt = await sample.app.request('/push/subscriptions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      endpoint: 'https://push.example/device',
      keys: { auth: 'x', p256dh: 'y' },
    }),
  });
  expect(attempt.status).toBe(409);
  const devices = await sample.app.request('/push/subscriptions');
  expect(await devices.json()).toEqual({ subscriptions: [] });
});

test('Sample day is isolated per instance and its reviewed send creates only a mock receipt', async () => {
  const first = await createSampleDay();
  const second = await createSampleDay();
  expect(first.metadata.followup).not.toBe(second.metadata.followup);
  const chat = first.experience.chats.get(first.metadata.followup);
  expect(chat?.drafts).toHaveLength(1);
  expect(chat?.turns[0]?.answer).toContain('Sample day');
  const draft = chat?.drafts[0];
  if (!draft) throw new Error('Missing sample draft');
  expect(draft.body).toContain('SSO support is still unconfirmed');
  const review = await first.app.request(`/drafts/${draft.id}/send`, { method: 'POST' });
  const body = z
    .object({
      draft: experienceDraft,
      permission: permissionCard.nullable(),
      receipt: experienceReceipt.nullable(),
    })
    .parse(await review.json());
  expect(body.permission).not.toBeNull();
  if (!body.permission) throw new Error('Missing sample approval');
  const result = await first.app.request(`/permissions/${body.permission.id}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ option: 'allow_once', version: body.permission.version }),
  });
  expect(result.ok).toBe(true);
  expect(chat?.receipts).toHaveLength(1);
  expect(second.experience.chats.get(second.metadata.followup)?.receipts).toHaveLength(0);
  expect(first.experience.memories.get(first.metadata.preference)?.value).toBe(SAMPLE_PREFERENCE);
  expect(first.experience.chats.get(first.metadata.later)?.turns[0]?.answer).toContain(
    'Applied saved preference',
  );
});

test('sample transport fails closed for production API, redirects, and account cookies', async () => {
  const api = new URL('http://127.0.0.1:3321');
  const page = new URL('http://127.0.0.1:5321');
  let called = 0;
  const guarded = isolatedSampleFetch(
    (async (_input, init) => {
      called++;
      expect(init?.credentials).toBe('omit');
      expect(init?.redirect).toBe('error');
      return new Response('{}');
    }) as typeof fetch,
    api,
    page,
  );
  await guarded(`${api}/drafts/sample/send`, { method: 'POST' });
  await expect(guarded('https://openduet.example/api/actions', { method: 'POST' })).rejects.toThrow(
    'isolated',
  );
  await expect(guarded(`${page}/api/actions`, { method: 'POST' })).rejects.toThrow('isolated');
  expect(called).toBe(1);
  for (const address of [
    'http://127.0.0.1:8787',
    'http://localhost:5321',
    'https://localhost:3321',
  ])
    expect(
      sampleRequestAllowed(new URL(`${address}/actions`), new URL(address), page, 'POST'),
    ).toBe(false);
  expect(
    sampleRequestAllowed(
      new URL('https://openduet.example/api'),
      new URL('https://openduet.example'),
      page,
    ),
  ).toBe(false);
});

test('sample transport strips account header credentials while preserving fixture request headers', async () => {
  const guarded = isolatedSampleFetch(
    (async (_input, init) => {
      const headers = new Headers(init?.headers);
      expect(headers.has('authorization')).toBe(false);
      expect(headers.has('cookie')).toBe(false);
      expect(headers.has('proxy-authorization')).toBe(false);
      expect(headers.get('idempotency-key')).toBe('sample-request');
      return new Response('{}');
    }) as typeof fetch,
    new URL('http://127.0.0.1:3321'),
    new URL('http://127.0.0.1:5321'),
  );
  await guarded(
    new Request('http://127.0.0.1:3321/actions', {
      method: 'POST',
      headers: {
        authorization: 'Bearer fixture-secret',
        cookie: 'account=fixture-session',
        'proxy-authorization': 'Basic fixture-secret',
        'idempotency-key': 'sample-request',
      },
    }),
  );
});
