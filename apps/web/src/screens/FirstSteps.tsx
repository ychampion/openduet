/** Request starters and optional help after account setup. */
import { Button } from '../design/primitives.tsx';
import { navigate } from '../router.ts';

import './first-run.css';

export type FirstStep = 'calendar' | 'brief';

/**
 * Which rows to show. `null` is not known yet, and a row waits for its answer,
 * so nothing appears and then vanishes while the page loads.
 */
export function firstSteps(state: {
  calendar: boolean | null;
  brief: boolean | null;
  dismissed: ReadonlySet<FirstStep>;
}): FirstStep[] {
  const steps: FirstStep[] = [];
  if (state.calendar === false && !state.dismissed.has('calendar')) steps.push('calendar');
  if (state.brief === false && !state.dismissed.has('brief')) steps.push('brief');
  return steps;
}

/** Request starters share the ordinary assistant and need no connected account. */
export const FIRST_TASK_STARTERS = [
  {
    title: 'Prepare for a meeting',
    text: 'Prepare a concise meeting brief from the context I provide. Include open commitments, decisions and questions.\n\nMeeting context:\n',
  },
  {
    title: 'Research a decision',
    text: 'Help me research a decision. Compare the options, explain trade-offs and cite the sources you actually use.\n\nDecision and context:\n',
  },
  {
    title: 'Help with a follow-up',
    text: 'Prepare a follow-up from my notes. Keep unresolved requirements explicit and do not send anything.\n\nNotes or email thread:\n',
  },
] as const;

export function FirstTaskInvitation({
  onChoose,
  intro = true,
}: {
  onChoose: (text: string) => void;
  intro?: boolean;
}) {
  return (
    <section className="col" style={{ gap: 20 }} aria-label="Hand off a task">
      {intro ? (
        <div className="col" style={{ gap: 12 }}>
          <h1
            style={{
              fontFamily: 'var(--font-voice)',
              fontSize: 'clamp(28px, 4vw, 36px)',
              fontWeight: 500,
              lineHeight: 1.2,
              margin: 0,
              color: 'var(--heading)',
            }}
          >
            What would you like off your plate?
          </h1>
          <p style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--muted)', margin: 0 }}>
            Send a task, notes, or a file. I’ll keep the work and its result here.
          </p>
        </div>
      ) : null}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {FIRST_TASK_STARTERS.map((starter) => (
          <Button key={starter.title} variant="secondary" onClick={() => onChoose(starter.text)}>
            {starter.title}
          </Button>
        ))}
      </div>
    </section>
  );
}

/** Optional help remains discoverable after useful work, without a setup checklist. */
export function FirstSteps({ calendar: _calendar }: { calendar: boolean | null }) {
  return (
    <div className="row" style={{ gap: 8, fontSize: 13, color: 'var(--muted)' }}>
      <span>Need an idea?</span>
      <Button variant="ghost" size="sm" onClick={() => navigate('/explore')}>
        Explore useful tasks
      </Button>
    </div>
  );
}
