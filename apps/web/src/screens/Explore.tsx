/** Outcome presets use the personal assistant; supplied context is a valid input. */
import { useState } from 'react';
import { Button } from '../design/primitives.tsx';
import { adapter } from '../experience/adapter.ts';
import { beginHandoff } from '../experience/handoff.ts';
import { useApp, useLoad } from '../experience/hooks.ts';
import { models } from '../models/api.ts';
import { navigate } from '../router.ts';
import { Shell } from '../shell/Shell.tsx';
import { OwnSkills } from './OwnSkills.tsx';

export const OUTCOME_PRESETS = [
  {
    id: 'meeting',
    title: 'Prepare for a meeting',
    outcome: 'Arrive with the context, open commitments and questions in one short brief.',
    example: 'A page covering the goal, decisions to make and three questions to ask.',
    prerequisites:
      'Meeting notes or an agenda. A connected calendar is optional for fresh event details.',
    request:
      'Prepare a concise meeting brief. Include open commitments, decisions and questions. Use the context I supply; tell me what is missing.\n\nMeeting context:\n',
  },
  {
    id: 'research',
    title: 'Research a decision',
    outcome: 'Compare your options and see the evidence behind a recommendation.',
    example: 'A shortlist with trade-offs, source links and unresolved questions.',
    prerequisites:
      'The decision, constraints and options. Fresh web research needs an available browser or research connection.',
    request:
      'Help me research a decision. Compare the options against my constraints and cite the sources you actually consult. Distinguish evidence from uncertainty.\n\nDecision and constraints:\n',
  },
  {
    id: 'follow-up',
    title: 'Follow up on a promise',
    outcome: 'Turn notes or a customer thread into a concise, editable follow-up.',
    example: 'A draft with one clear ask and the unresolved requirement kept explicit.',
    prerequisites:
      'Notes or an email thread are enough to draft. Watching future replies and sending require a connected mailbox.',
    request:
      'Prepare a customer follow-up from these notes. Identify open commitments, retain unresolved requirements without promising them, and draft one clear ask. Do not send anything.\n\nNotes or thread:\n',
  },
  {
    id: 'brief',
    title: 'Prepare my daily brief',
    outcome: 'Start with a short preparation of the day and the decisions that need you.',
    example: 'Today’s commitments, a preparation checklist and decisions you need to make.',
    prerequisites:
      'Supply today’s context or connect your sources. Scheduling a recurring brief is a separate, explicit choice.',
    request:
      'Prepare today’s brief from the context I provide and sources I can access. Include commitments, preparation and decisions needing me. This request does not start a recurring schedule.\n\nToday’s context:\n',
  },
  {
    id: 'style',
    title: 'Write in my usual style',
    outcome: 'Use a writing example and your saved preferences to revise a real piece of work.',
    example: 'A revised message that keeps the facts while following your stated style.',
    prerequisites:
      'A draft and a writing sample or explicit preference. Saved memory is used when relevant and enabled.',
    request:
      'Revise this draft in my usual style using relevant saved preferences and the example I supply. Keep the facts and flag missing information. Do not send it.\n\nDraft:\n\nStyle example or preference:\n',
  },
] as const;

export function ExploreScreen() {
  const { member } = useApp();
  const [problem, setProblem] = useState<string | null>(null);
  const [tab, setTab] = useState<'outcomes' | 'skills' | 'connections'>('outcomes');
  const model = useLoad(() => models.settings(), []);
  const connections = useLoad(() => adapter.connections(), []);
  const ready =
    !!model.data?.active.connected &&
    model.data.readiness?.provider === model.data.active.provider &&
    model.data.readiness?.model === model.data.active.model &&
    model.data.readiness?.tools === 'passed';
  const tryPreset = (request: string) => {
    try {
      const draft = beginHandoff(request);
      // A starter opens the composer; the person adds their real context before Send.
      navigate(`/?starter=${encodeURIComponent(draft.id)}`);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Couldn’t keep this request.');
    }
  };
  return (
    <Shell title="Explore" rail={false}>
      <div
        className="col"
        style={{
          gap: 32,
          maxWidth: 960,
          margin: '0 auto',
          width: '100%',
          padding: '20px 20px 40px',
          boxSizing: 'border-box',
        }}
      >
        <header className="col" style={{ gap: 12 }}>
          <h1
            style={{
              fontFamily: 'var(--font-voice)',
              fontSize: 32,
              fontWeight: 500,
              color: 'var(--heading)',
              margin: 0,
            }}
          >
            A little more off your plate.
          </h1>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: 16, lineHeight: 1.6 }}>
            Start with an outcome. Your main assistant keeps the work, the result and what you teach
            it.
          </p>
        </header>
        <nav className="row" style={{ gap: 8, flexWrap: 'wrap' }} aria-label="Explore views">
          {(['outcomes', 'skills', 'connections'] as const).map((value) => (
            <Button
              key={value}
              variant={tab === value ? 'primary' : 'ghost'}
              onClick={() => setTab(value)}
              aria-pressed={tab === value}
            >
              {value === 'outcomes'
                ? 'Useful tasks'
                : value === 'skills'
                  ? 'Personal skills'
                  : 'Connections'}
            </Button>
          ))}
        </nav>
        {problem ? <p role="alert">{problem}</p> : null}
        {tab === 'outcomes' ? (
          <div className="col" style={{ gap: 20 }}>
            {OUTCOME_PRESETS.map((preset) => (
              <article key={preset.id} className="col card-12" style={{ padding: 20, gap: 12 }}>
                <div
                  className="row"
                  style={{ gap: 12, justifyContent: 'space-between', flexWrap: 'wrap' }}
                >
                  <h2 style={{ margin: 0, fontSize: 18, color: 'var(--heading)' }}>
                    {preset.title}
                  </h2>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                    {model.loading
                      ? 'Checking setup…'
                      : ready
                        ? 'Ready with your context'
                        : 'Needs attention · connect and check a model'}
                  </span>
                </div>
                <p style={{ margin: 0, lineHeight: 1.6 }}>{preset.outcome}</p>
                <div
                  style={{
                    padding: 12,
                    borderLeft: '2px solid var(--primary)',
                    background: 'var(--surface-2)',
                    fontSize: 14,
                  }}
                >
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>Example result</span>
                  <p style={{ margin: '6px 0 0', lineHeight: 1.5 }}>{preset.example}</p>
                </div>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--muted)' }}>
                  {preset.prerequisites}
                </p>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <Button onClick={() => tryPreset(preset.request)}>Try it</Button>
                  <Button variant="ghost" onClick={() => navigate('/settings/connections')}>
                    Connect a source
                  </Button>
                </div>
              </article>
            ))}
          </div>
        ) : null}
        {tab === 'skills' ? (
          <div className="col" style={{ gap: 20 }}>
            <p style={{ margin: 0, color: 'var(--muted)', lineHeight: 1.6 }}>
              After useful work, choose “Save these steps” to keep the exact procedure. A skill
              changes how relevant work is prepared; it grants no permission to send or schedule
              work.
            </p>
            {!member ? (
              <OwnSkills />
            ) : (
              <Button onClick={() => navigate('/settings/memory')}>Open memory and skills</Button>
            )}
          </div>
        ) : null}
        {tab === 'connections' ? (
          <div className="col" style={{ gap: 20 }}>
            <p style={{ margin: 0, color: 'var(--muted)', lineHeight: 1.6 }}>
              Installed tools, a connected account, its allowed access and a healthy source are
              separate states. A pasted document needs none of these account connections.
            </p>
            {(connections.data?.connections ?? [])
              .filter((connection) => !connection.builtin)
              .map((connection) => (
                <div className="col card-12" key={connection.id} style={{ gap: 8, padding: 16 }}>
                  <strong>{connection.label}</strong>
                  <span style={{ fontSize: 13 }}>
                    {connection.status === 'connected'
                      ? 'Connected'
                      : connection.status === 'available'
                        ? 'Installed · needs connection'
                        : connection.status === 'connecting'
                          ? 'Connecting'
                          : 'Needs attention'}{' '}
                    ·{' '}
                    {connection.access === 'read_only'
                      ? 'Read only'
                      : connection.access === 'draft_only'
                        ? 'Draft preparation'
                        : 'Follows approval settings'}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
                    {connection.problem
                      ? `Health needs attention: ${connection.problem.detail}`
                      : connection.status === 'connected'
                        ? 'No failure is currently reported. Open the connection to check its current health and authorization.'
                        : 'Health is not verified until this source is connected and checked.'}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => navigate('/settings/connections')}
                  >
                    Check access and health
                  </Button>
                </div>
              ))}
            {!connections.data?.connections.some((connection) => !connection.builtin) ? (
              <p>No personal accounts connected yet. You can still work with notes and files.</p>
            ) : null}
            <Button onClick={() => navigate('/settings/connections')}>
              Add or manage connections
            </Button>
          </div>
        ) : null}
        <details className="card-12" style={{ padding: 16 }}>
          <summary style={{ cursor: 'pointer', fontSize: 14 }}>Advanced</summary>
          <div className="row" style={{ gap: 12, paddingTop: 16, flexWrap: 'wrap' }}>
            <Button size="sm" variant="ghost" onClick={() => navigate('/agents')}>
              Create a separate specialist
            </Button>
            {!member ? (
              <Button size="sm" variant="ghost" onClick={() => navigate('/settings/connections')}>
                Custom MCP and technical manifests
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => navigate('/settings/memory')}>
              Memory controls
            </Button>
          </div>
        </details>
      </div>
    </Shell>
  );
}
