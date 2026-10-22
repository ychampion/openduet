import { expect, test } from 'bun:test';
import {
  hasUsefulOutput,
  type PersonalReference,
  targetOf,
  visibleReferences,
} from './personal-session.ts';

const reference = (change: Partial<PersonalReference> = {}): PersonalReference => ({
  id: 'result:yesterday',
  kind: 'result',
  conversation_id: 'routine-thread',
  turn_id: 'yesterday',
  title: 'Morning brief',
  status: 'done',
  updated_at: '2026-10-22T08:30:00Z',
  ...change,
});

test('replying to an older result retains its exact source even when a newer result exists', () => {
  const yesterday = reference();
  const today = reference({
    id: 'result:today',
    turn_id: 'today',
    updated_at: '2026-10-23T08:30:00Z',
  });
  const feed = visibleReferences([today, yesterday]);
  expect(feed).toEqual([yesterday, today]);
  expect(targetOf(feed[0] as PersonalReference)).toEqual({
    kind: 'reply_result',
    conversation_id: 'routine-thread',
    turn_id: 'yesterday',
  });
});

test('a draft awaiting a decision preserves the exact source for server-side approval invalidation', () => {
  expect(targetOf(reference({ conversation_id: 'email-task', status: 'needs_you' }))).toEqual({
    kind: 'reply_result',
    conversation_id: 'email-task',
    turn_id: 'yesterday',
  });
});

test('a result without an exact turn cannot silently target an arbitrary task turn', () => {
  expect(targetOf(reference({ turn_id: undefined }))).toBeNull();
});

test('a clicked task continuation preserves its explicit conversation and does not pick other active work', () => {
  const task = reference({
    kind: 'conversation',
    conversation_id: 'research-b',
    turn_id: undefined,
    status: 'working',
  });
  expect(targetOf(task)).toEqual({ kind: 'continue_task', conversation_id: 'research-b' });
});

test('finished task references collapse behind actual outputs without dropping historical results', () => {
  const old = reference();
  const current = reference({
    id: 'result:today',
    turn_id: 'today',
    updated_at: '2026-10-23T08:30:00Z',
  });
  const task = reference({
    id: 'chat:routine',
    kind: 'conversation',
    turn_id: undefined,
    updated_at: '2026-10-23T08:31:00Z',
  });
  expect(visibleReferences([task, current, old, current])).toEqual([old, current]);
});

test('active work remains visible alongside earlier completed outputs', () => {
  const old = reference();
  const active = reference({
    id: 'chat:routine',
    kind: 'conversation',
    turn_id: undefined,
    status: 'working',
    updated_at: '2026-10-23T08:30:00Z',
  });
  expect(visibleReferences([active, old])).toEqual([old, active]);
});

test('one pending result does not appear as a second competing task card', () => {
  const result = reference({ status: 'needs_you' });
  const task = reference({
    id: 'chat:routine',
    kind: 'conversation',
    turn_id: undefined,
    status: 'needs_you',
  });
  expect(visibleReferences([task, result])).toEqual([result]);
});

test('Done alone does not count as a useful result, while an actual answer does', () => {
  expect(hasUsefulOutput(' Done. ')).toBe(false);
  expect(hasUsefulOutput('All set!')).toBe(false);
  expect(hasUsefulOutput('')).toBe(false);
  expect(hasUsefulOutput('4')).toBe(true);
  expect(
    hasUsefulOutput('Security review is open. Ask Priya which requirement to prioritise.'),
  ).toBe(true);
});
