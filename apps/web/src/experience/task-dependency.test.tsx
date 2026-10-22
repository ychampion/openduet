import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { DependencyRecovery, taskDependencies } from './task-dependency.tsx';
import type { Connection } from './types.ts';

const source = {
  id: 'conn_mail',
  app: 'gmail',
  label: 'Client Gmail',
  status: 'connected',
  access: 'asks_before_acting',
} satisfies Connection;
const unrelated = {
  ...source,
  id: 'conn_calendar',
  label: 'Private Calendar',
  status: 'error',
} as Connection;
const stopped = {
  id: 'act_mail',
  job_id: 'job_followup',
  connection_id: source.id,
  status: 'failed' as const,
  repair_disposition: 'needs_reconnect' as const,
  created_at: '2026-10-23T10:00:00Z',
};

test('only the task-recorded reconnect fault names a missing source, even before health catches up', () => {
  expect(taskDependencies('job_followup', 'needs_you', [], [unrelated])).toEqual([]);
  expect(
    taskDependencies(
      'job_followup',
      'needs_you',
      [
        stopped,
        { ...stopped, id: 'act_elsewhere', job_id: 'job_other', connection_id: unrelated.id },
      ],
      [source, unrelated],
    ),
  ).toEqual([
    {
      connectionId: source.id,
      label: 'Client Gmail',
      detail: 'This task stopped because its recorded source needs to be reconnected.',
    },
  ]);
});

test('historical and uncertain effects never become a demand to reconnect', () => {
  const succeeded = {
    ...stopped,
    id: 'act_recovered',
    status: 'succeeded' as const,
    repair_disposition: 'completed' as const,
    created_at: '2026-10-23T10:01:00Z',
  };
  expect(taskDependencies('job_followup', 'needs_you', [stopped, succeeded], [source])).toEqual([]);
  expect(taskDependencies('job_followup', 'done', [stopped], [source])).toEqual([]);
  expect(
    taskDependencies(
      'job_followup',
      'needs_you',
      [{ ...stopped, status: 'unknown', repair_disposition: 'needs_reconciliation' }],
      [source],
    ),
  ).toEqual([]);
});

test('the recovery view names its source and offers both actions without claiming a send', () => {
  const [dependency] = taskDependencies(
    'job_followup',
    'needs_you',
    [stopped],
    [source, unrelated],
  );
  if (!dependency) throw new Error('The recorded reconnect fault disappeared');
  const html = renderToStaticMarkup(
    <DependencyRecovery
      dependency={dependency}
      onConnect={() => {
        throw new Error('Rendering must not connect');
      }}
      onProvideContext={() => {
        throw new Error('Rendering must not submit context');
      }}
    />,
  );
  expect(html).toContain('Client Gmail needs reconnecting for this task');
  const visibleText = html.replace(/<[^>]*>/g, ' ');
  expect(visibleText).toContain(' Connect ');
  expect(visibleText).toContain(' Provide context ');
  expect(html).toContain('notes or a supported file');
  expect(html).toContain('Fresh reads and sending still need the source.');
  expect(html).not.toContain('Private Calendar');
});
