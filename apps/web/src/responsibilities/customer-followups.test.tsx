import { expect, test } from 'bun:test';
import { zonedInstant } from './CustomerFollowups.tsx';

test('a watch deadline uses the chosen zone, including half-hour offsets', () => {
  expect(zonedInstant('2026-10-23T09:15', 'Asia/Kolkata')).toBe('2026-10-23T03:45:00.000Z');
  expect(zonedInstant('2026-10-23T09:15', 'America/New_York')).toBe('2026-10-23T13:15:00.000Z');
  expect(zonedInstant('2026-10-23T09:15', 'Australia/Adelaide')).toBe('2026-10-22T22:45:00.000Z');
});

test('a nonexistent spring-forward deadline is refused rather than silently moved', () => {
  expect(zonedInstant('2026-03-08T02:30', 'America/New_York')).toBeNull();
});

test('an autumn repeated wall time resolves to an actual matching instant', () => {
  const instant = zonedInstant('2026-11-01T01:30', 'America/New_York');
  expect(['2026-11-01T05:30:00.000Z', '2026-11-01T06:30:00.000Z']).toContain(instant);
});

test('an unknown zone or incomplete deadline cannot create a schedule', () => {
  expect(zonedInstant('2026-10-23T09:15', 'Invalid/Zone')).toBeNull();
  expect(zonedInstant('', 'UTC')).toBeNull();
  expect(zonedInstant('2026-10-23', 'UTC')).toBeNull();
});
