import { expect, test } from 'bun:test';
import * as C from '@openduet/contracts';
import { createMock } from './index.ts';
import { createSampleDay, SAMPLE_PREFERENCE } from './sample-day.ts';

async function call(
  app: ReturnType<typeof createMock>['app'],
  path: string,
  method = 'GET',
  body?: unknown,
) {
  const response = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() };
}

async function projections(app: ReturnType<typeof createMock>['app']) {
  return {
    items: C.memoryItemList.parse((await call(app, '/memory/items')).body).items,
    beliefs: C.beliefList.parse((await call(app, '/memory/beliefs')).body).beliefs,
  };
}

test('Sample day preference is visible as the same editable belief, with no other sample memories', async () => {
  const sample = await createSampleDay();
  const { items, beliefs } = await projections(sample.app);
  expect(items).toHaveLength(1);
  expect(beliefs).toHaveLength(1);
  expect(beliefs[0]).toMatchObject({
    id: sample.metadata.preference,
    value: SAMPLE_PREFERENCE,
    category: 'preferences',
    trust: 'yours',
    version: items[0]?.version,
    earlier: 0,
  });
});

test('same-key statements and corrections share one identity and version; stale edits change neither projection', async () => {
  const mock = createMock({ experience: { seed: false } });
  const input = { key: 'pref.client-followups.style', value: 'One short paragraph.' };
  const first = C.memoryItemResponse.parse(
    (await call(mock.app, '/memory/items', 'POST', input)).body,
  ).item;
  const repeated = C.memoryItemResponse.parse(
    (await call(mock.app, '/memory/items', 'POST', input)).body,
  ).item;
  expect(repeated).toEqual(first);
  const updated = C.memoryItemResponse.parse(
    (
      await call(mock.app, '/memory/items', 'POST', {
        ...input,
        value: 'One clear ask, under 120 words.',
      })
    ).body,
  ).item;
  expect(updated.id).toBe(first.id);
  expect(updated.version).not.toBe(first.version);
  expect(
    (
      await call(mock.app, `/memory/items/${first.id}`, 'PATCH', {
        value: 'Stale overwrite',
        version: first.version,
      })
    ).status,
  ).toBe(409);
  let view = await projections(mock.app);
  expect(view.beliefs).toHaveLength(1);
  expect(view.beliefs[0]).toMatchObject({
    id: updated.id,
    value: updated.value,
    version: updated.version,
    earlier: 1,
  });
  expect(view.items.find((item) => item.id === updated.id)).toEqual(updated);
  expect(
    (
      await call(mock.app, `/memory/items/${updated.id}`, 'PATCH', {
        value: 'Keep one clear ask and a warm sign-off.',
        version: updated.version,
      })
    ).status,
  ).toBe(200);
  view = await projections(mock.app);
  const corrected = view.beliefs[0];
  expect(corrected).toMatchObject({
    id: updated.id,
    value: 'Keep one clear ask and a warm sign-off.',
    corrected: true,
    earlier: 2,
  });
  expect(view.items.find((item) => item.id === updated.id)).toMatchObject({
    value: corrected?.value,
    version: corrected?.version,
  });
  expect(mock.experience.answers.get(input.key)).toBe(corrected?.value);
  const history = C.beliefHistory.parse(
    (await call(mock.app, `/memory/beliefs/${updated.id}/history`)).body,
  );
  expect(history.versions.map((version) => version.value)).toEqual([
    'Keep one clear ask and a warm sign-off.',
    updated.value,
    first.value,
  ]);
  expect((await call(mock.app, `/memory/items/${updated.id}`, 'DELETE')).status).toBe(200);
  view = await projections(mock.app);
  expect(view.beliefs).toHaveLength(0);
  expect(view.items.some((item) => item.id === updated.id)).toBe(false);
  expect(mock.experience.answers.has(input.key)).toBe(false);
  expect((await call(mock.app, `/memory/items/${updated.id}`, 'DELETE')).status).toBe(404);
});

test('blocking removes both projections and prevents relearning until unblocked', async () => {
  const sample = await createSampleDay();
  const id = sample.metadata.preference;
  expect((await call(sample.app, `/memory/beliefs/${id}/block`, 'POST', {})).status).toBe(200);
  expect(await projections(sample.app)).toEqual({ items: [], beliefs: [] });
  const input = { key: 'pref.client-followups.style', value: SAMPLE_PREFERENCE };
  expect((await call(sample.app, '/memory/items', 'POST', input)).status).toBe(409);
  expect(await projections(sample.app)).toEqual({ items: [], beliefs: [] });
  const block = [...sample.experience.beliefs.blocks.values()][0];
  if (!block) throw new Error('Missing memory block');
  expect((await call(sample.app, `/memory/blocks/${block.id}`, 'DELETE')).status).toBe(200);
  expect((await call(sample.app, '/memory/items', 'POST', input)).status).toBe(200);
  const restored = await projections(sample.app);
  expect(restored.beliefs).toHaveLength(1);
  expect(restored.items[0]?.version).toBe(restored.beliefs[0]?.version);
});

test('rewinding and undoing an explicit preference updates both projections and the applied answer', async () => {
  let now = new Date('2026-10-20T10:00:00Z');
  const mock = createMock({ now: () => now, experience: { seed: false } });
  const input = { key: 'pref.client-followups.style', value: 'Keep it short.' };
  const first = C.memoryItemResponse.parse(
    (await call(mock.app, '/memory/items', 'POST', input)).body,
  ).item;
  now = new Date('2026-10-21T10:00:00Z');
  await call(mock.app, `/memory/items/${first.id}`, 'PATCH', {
    value: 'Keep it short and warm.',
    version: first.version,
  });
  const result = await call(mock.app, '/memory/rewind', 'POST', {
    belief_id: first.id,
    since: '2026-10-21T00:00:00Z',
  });
  expect(result.status).toBe(200);
  const { rewind } = C.memoryRewindResponse.parse(result.body);
  let view = await projections(mock.app);
  expect(view.beliefs[0]?.value).toBe(input.value);
  expect(view.items.find((item) => item.id === first.id)?.version).toBe(view.beliefs[0]?.version);
  expect(mock.experience.answers.get(input.key)).toBe(input.value);
  expect((await call(mock.app, `/memory/rewinds/${rewind.id}/undo`, 'POST')).status).toBe(200);
  view = await projections(mock.app);
  expect(view.beliefs[0]?.value).toBe('Keep it short and warm.');
  expect(view.items.find((item) => item.id === first.id)?.version).toBe(view.beliefs[0]?.version);
  expect(mock.experience.answers.get(input.key)).toBe('Keep it short and warm.');
});
