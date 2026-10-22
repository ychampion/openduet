import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppContext, type AppContextValue } from '../experience/hooks.ts';
import { OUTCOME_PRESETS } from '../screens/Explore.tsx';
import { FIRST_TASK_STARTERS, FirstTaskInvitation } from '../screens/FirstSteps.tsx';
import { LearningActions, preferenceKey, procedureBody } from './LearningActions.tsx';

test('the first invitation accepts real context and offers three ordinary task starters', () => {
  const html = renderToStaticMarkup(<FirstTaskInvitation onChoose={() => {}} />);
  expect(html).toContain('What would you like off your plate?');
  expect(html).toContain('Send a task, notes, or a file.');
  expect(FIRST_TASK_STARTERS.map((entry) => entry.title)).toEqual([
    'Prepare for a meeting',
    'Research a decision',
    'Help with a follow-up',
  ]);
  expect(html).not.toContain('Connect calendar');
  expect(html).not.toContain('Where are you based');
});

test('Explore explains five outcomes with examples and actual prerequisites', () => {
  expect(OUTCOME_PRESETS.map((entry) => entry.title)).toEqual([
    'Prepare for a meeting',
    'Research a decision',
    'Follow up on a promise',
    'Prepare my daily brief',
    'Write in my usual style',
  ]);
  expect(
    OUTCOME_PRESETS.every((entry) => entry.example && entry.prerequisites && entry.request),
  ).toBe(true);
  expect(OUTCOME_PRESETS.find((entry) => entry.id === 'follow-up')?.prerequisites).toContain(
    'Watching future replies',
  );
  expect(OUTCOME_PRESETS.find((entry) => entry.id === 'brief')?.request).toContain(
    'does not start a recurring schedule',
  );
});

test('reviewed steps retain inputs, outcome and exceptions without implying action authority', () => {
  const body = procedureBody({
    applies: 'client follow-up',
    inputs: 'meeting notes',
    steps: '1. Identify open commitments.\n2. Draft one clear ask.',
    result: 'editable draft',
    exceptions: 'Ask for missing information.',
  });
  expect(body).toContain('When it applies: client follow-up');
  expect(body).toContain('Inputs: meeting notes');
  expect(body).toContain('Expected result: editable draft');
  expect(body).toContain('Exceptions and missing information: Ask for missing information.');
  expect(body).toContain('Preparing a draft does not authorize sending it.');
  expect(preferenceKey('Client Follow-ups', 't_first')).not.toBe(
    preferenceKey('Client Follow-ups', 't_second'),
  );
});

test('learning actions expose three separate choices without an automatic mutation', () => {
  const context = { profile: null, member: false } as AppContextValue;
  const html = renderToStaticMarkup(
    <AppContext.Provider value={context}>
      <LearningActions
        source={{
          conversationId: 'job_source',
          turnId: 't_source',
          title: 'Client follow-up',
          text: 'An actual reviewed draft.',
        }}
      />
    </AppContext.Provider>,
  );
  expect(html).toContain('Remember this preference');
  expect(html).toContain('Save these steps');
  expect(html).toContain('Run this automatically');
  expect(html).not.toContain('Preference saved');
  expect(html).not.toContain('Scheduled:');
});
