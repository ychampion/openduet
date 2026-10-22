/** Explicit learning is three independent mutations, bound to the selected result. */
import { useState } from 'react';
import { ownSpaceId } from '../companies/api.ts';
import { Button, Field, Input, Select } from '../design/primitives.tsx';
import { adapter } from '../experience/adapter.ts';
import { call } from '../experience/call.ts';
import { useApp, useLoad } from '../experience/hooks.ts';
import { instanceName } from '../experience/instance.ts';
import type { Automation, MemoryItem, OwnSkill } from '../experience/types.ts';
import { href, navigate } from '../router.ts';

export type LearningSource = {
  conversationId: string;
  turnId: string;
  title: string;
  text: string;
};

export const preferenceKey = (scope: string, slot = 'style') => {
  const domain = scope
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  const leaf =
    slot
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'style';
  return domain ? `pref.${domain}.${leaf}` : null;
};

export function procedureBody(input: {
  applies: string;
  inputs: string;
  steps: string;
  result: string;
  exceptions: string;
}) {
  return [
    `When it applies: ${input.applies.trim()}`,
    `Inputs: ${input.inputs.trim()}`,
    `Steps:\n${input.steps.trim()}`,
    `Expected result: ${input.result.trim()}`,
    `Exceptions and missing information: ${input.exceptions.trim()}`,
    'Authority: Preparing a draft does not authorize sending it. Ask before taking an outward action according to the current approval settings.',
  ].join('\n\n');
}

const slug = (text: string) => {
  const value =
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50) || 'my-procedure';
  return /^[a-z]/.test(value) ? value : `my-${value}`;
};
const problemOf = (result: { error: string | null; unavailable: string | null }) =>
  result.error ?? result.unavailable ?? 'Couldn’t save this. Try again.';
const textArea = {
  minHeight: 96,
  width: '100%',
  resize: 'vertical' as const,
  padding: 12,
  font: 'inherit',
  lineHeight: 1.6,
  border: '1px solid var(--line)',
  borderRadius: 8,
  background: 'var(--surface)',
  color: 'var(--text)',
  boxSizing: 'border-box' as const,
};

export function LearningActions({ source }: { source: LearningSource }) {
  const { profile, member } = useApp();
  const [action, setAction] = useState<'preference' | 'steps' | 'routine' | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [scope, setScope] = useState(
    /follow.?up|customer|client/i.test(source.title) ? 'client-followups' : 'writing',
  );
  const [preference, setPreference] = useState('');
  const [savedPreference, setSavedPreference] = useState<MemoryItem | null>(null);
  const [preferenceNotice, setPreferenceNotice] = useState<string | null>(null);
  const [name, setName] = useState(slug(source.title));
  const [applies, setApplies] = useState(
    /follow.?up|customer|client/i.test(source.title)
      ? 'client follow-up'
      : /research/i.test(source.title)
        ? 'research a decision'
        : /meeting/i.test(source.title)
          ? 'meeting preparation'
          : source.title.slice(0, 80),
  );
  const [inputs, setInputs] = useState('');
  const [steps, setSteps] = useState('');
  const [expected, setExpected] = useState('');
  const [exceptions, setExceptions] = useState(
    'Ask for missing information. Do not invent commitments.',
  );
  const [savedSkill, setSavedSkill] = useState<OwnSkill | null>(null);
  const [instruction, setInstruction] = useState('');
  const [connectionId, setConnectionId] = useState('context');
  const [sourceScope, setSourceScope] = useState('');
  const [at, setAt] = useState('08:30');
  const [frequency, setFrequency] = useState('weekdays');
  const [routine, setRoutine] = useState<Automation | null>(null);
  const connections = useLoad(() => adapter.connections(), []);
  const key = preferenceKey(scope, source.turnId);
  const body = procedureBody({ applies, inputs, steps, result: expected, exceptions });
  const connection = connections.data?.connections.find((entry) => entry.id === connectionId);

  const remember = async () => {
    if (busy || !preference.trim() || !key) return;
    setBusy(true);
    setProblem(null);
    setPreferenceNotice(null);
    try {
      if (savedPreference) {
        const edited = await adapter.editMemory(
          savedPreference.id,
          preference.trim(),
          savedPreference.version,
        );
        if (!edited.data) throw new Error(problemOf(edited));
        const current = await adapter.memory();
        const changed = current.data?.items.find((item) => item.id === savedPreference.id);
        if (!changed)
          throw new Error(
            'The change saved, but its current version could not be read. Open Memory to review it.',
          );
        setSavedPreference(changed);
        setPreferenceNotice(
          'Preference updated in memory. Future relevant work uses the current version.',
        );
      } else {
        const saved = await adapter.createMemoryItem({
          key,
          value: preference.trim(),
          statement: preference.trim(),
        });
        if (!saved.data) throw new Error(problemOf(saved));
        setSavedPreference(saved.data.item);
        setPreference(saved.data.item.value);
        setPreferenceNotice('Preference saved in memory. No skill or routine was created.');
      }
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Couldn’t save the preference.');
    } finally {
      setBusy(false);
    }
  };

  const forget = async () => {
    if (!savedPreference || busy) return;
    setBusy(true);
    setProblem(null);
    const result = await adapter.deleteMemory(savedPreference.id);
    setBusy(false);
    if (!result.data) {
      setProblem(problemOf(result));
      return;
    }
    setSavedPreference(null);
    setPreference('');
    setPreferenceNotice('Forgotten. This preference is no longer part of current memory recall.');
  };

  const saveSteps = async () => {
    if (
      busy ||
      savedSkill ||
      !applies.trim() ||
      !inputs.trim() ||
      !steps.trim() ||
      !expected.trim() ||
      body.length > 1400
    )
      return;
    setBusy(true);
    setProblem(null);
    try {
      const space = await ownSpaceId();
      if (!space.data) throw new Error(problemOf(space));
      const result = await call<{ skill: OwnSkill }>('/own-skills', {
        method: 'POST',
        body: {
          space_id: space.data,
          name,
          description: applies,
          triggers: [applies.slice(0, 80)],
          body,
        },
      });
      if (!result.data) throw new Error(problemOf(result));
      setSavedSkill(result.data.skill);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Couldn’t save these steps.');
    } finally {
      setBusy(false);
    }
  };

  const createRoutine = async () => {
    if (busy || routine || !instruction.trim() || !sourceScope.trim()) return;
    if (connectionId !== 'context' && connection?.status !== 'connected') {
      setProblem('Connect the selected source before scheduling work with it.');
      return;
    }
    setBusy(true);
    setProblem(null);
    const result = await adapter.createAutomation({
      title: source.title,
      instruction: `${instruction.trim()}\n\nSource and scope: ${connection ? `${connection.label}: ` : 'Supplied context only: '}${sourceScope.trim()}\nReference result: conversation ${source.conversationId}, turn ${source.turnId}. This is context, not permission to send or perform outward actions. Follow current approval settings.`,
      weekdays: frequency === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5],
      at,
    });
    setBusy(false);
    if (!result.data) {
      setProblem(
        `${problemOf(result)} Check Work → Recurring before trying again if the server response was lost.`,
      );
      return;
    }
    setRoutine(result.data.automation);
  };

  return (
    <section
      className="col"
      style={{ gap: 12, paddingTop: 20, borderTop: '1px solid var(--line)' }}
      aria-label={`Teach ${instanceName()} from ${source.title}`}
    >
      <span style={{ fontSize: 13, color: 'var(--muted)' }}>Keep what worked for next time</span>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setAction(action === 'preference' ? null : 'preference');
            setProblem(null);
          }}
        >
          Remember this preference
        </Button>
        {!member ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setAction(action === 'steps' ? null : 'steps');
              setProblem(null);
            }}
          >
            Save these steps
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setAction(action === 'routine' ? null : 'routine');
            setProblem(null);
          }}
        >
          Run this automatically
        </Button>
      </div>
      {action ? (
        <div className="col card-12" style={{ gap: 16, padding: 16 }}>
          <details>
            <summary style={{ cursor: 'pointer', fontSize: 13 }}>Based on: {source.title}</summary>
            <p
              style={{
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
                fontSize: 14,
                lineHeight: 1.6,
              }}
            >
              {source.text}
            </p>
            <a href={href(`/chat/${source.conversationId}?turn=${source.turnId}`)}>
              Open originating result
            </a>
          </details>
          {action === 'preference' ? (
            <>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
                Write the exact preference to use in relevant future work. This saves memory only.
              </p>
              <Field label="When this preference applies">
                <Input
                  value={scope}
                  onChange={(event) => setScope(event.target.value)}
                  disabled={!!savedPreference}
                  maxLength={60}
                  width="100%"
                  placeholder="client-followups"
                />
              </Field>
              <Field label="Exact preference">
                <textarea
                  aria-label="Exact preference"
                  value={preference}
                  onChange={(event) => setPreference(event.target.value)}
                  placeholder="For client follow-ups, keep the message under 120 words and make one clear ask."
                  maxLength={16000}
                  style={textArea}
                />
              </Field>
              {savedPreference ? (
                <p style={{ margin: 0, fontSize: 13 }}>
                  Saved in memory: “{savedPreference.value}”
                </p>
              ) : null}
              {preferenceNotice ? (
                <p role="status" style={{ margin: 0, fontSize: 13 }}>
                  {preferenceNotice}
                </p>
              ) : null}
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <Button
                  loading={busy}
                  disabled={busy || !preference.trim() || !key}
                  onClick={() => void remember()}
                >
                  {savedPreference ? 'Save correction' : 'Save this preference'}
                </Button>
                {savedPreference ? (
                  <Button variant="ghost" disabled={busy} onClick={() => void forget()}>
                    Forget this preference
                  </Button>
                ) : null}
                <Button variant="ghost" onClick={() => navigate('/settings/memory')}>
                  Memory controls
                </Button>
              </div>
            </>
          ) : null}
          {action === 'steps' ? (
            savedSkill ? (
              <>
                <p role="status">
                  Saved “{savedSkill.name}” as a personal skill. It can be used on the next matching
                  task. No schedule was created.
                </p>
                <Button variant="ghost" onClick={() => navigate('/explore')}>
                  Review or edit personal skills
                </Button>
              </>
            ) : (
              <>
                <p style={{ margin: 0, fontSize: 13 }}>
                  Review the procedure you are teaching. It keeps steps, inputs and exceptions
                  without granting permission to send.
                </p>
                <Field
                  label="Skill name"
                  hint="Lowercase letters, digits and dashes; start with a letter."
                >
                  <Input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="client-follow-up"
                    maxLength={64}
                    width="100%"
                  />
                </Field>
                <Field label="When it applies">
                  <Input
                    value={applies}
                    onChange={(event) => setApplies(event.target.value)}
                    maxLength={80}
                    width="100%"
                  />
                </Field>
                <Field label="Inputs it needs">
                  <Input
                    value={inputs}
                    onChange={(event) => setInputs(event.target.value)}
                    placeholder="Meeting notes or an email thread"
                    maxLength={200}
                    width="100%"
                  />
                </Field>
                <Field label="Steps">
                  <textarea
                    aria-label="Steps"
                    value={steps}
                    onChange={(event) => setSteps(event.target.value)}
                    placeholder="1. Identify open commitments. 2. Check the latest supplied context. 3. Draft one clear ask in my preferred style."
                    style={textArea}
                    maxLength={900}
                  />
                </Field>
                <Field label="Expected result">
                  <Input
                    value={expected}
                    onChange={(event) => setExpected(event.target.value)}
                    placeholder="An editable follow-up draft with unresolved requirements explicit"
                    maxLength={200}
                    width="100%"
                  />
                </Field>
                <Field label="Exceptions or missing information">
                  <Input
                    value={exceptions}
                    onChange={(event) => setExceptions(event.target.value)}
                    maxLength={250}
                    width="100%"
                  />
                </Field>
                <details open>
                  <summary>Exact procedure to save · {body.length}/1400 characters</summary>
                  <pre
                    style={{
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'anywhere',
                      font: 'inherit',
                      fontSize: 13,
                      lineHeight: 1.6,
                    }}
                  >
                    {body}
                  </pre>
                </details>
                <Button
                  loading={busy}
                  disabled={
                    busy ||
                    body.length > 1400 ||
                    !/^[a-z][a-z0-9-]{0,63}$/.test(name) ||
                    !inputs.trim() ||
                    !steps.trim() ||
                    !expected.trim() ||
                    applies.trim().length < 2
                  }
                  onClick={() => void saveSteps()}
                >
                  Save this procedure
                </Button>
              </>
            )
          ) : null}
          {action === 'routine' ? (
            routine ? (
              <>
                <p role="status">
                  Scheduled: {routine.schedule}. Results will appear in Chat and Work → Recurring.
                </p>
                <Button
                  disabled={busy || !routine.enabled}
                  onClick={async () => {
                    setBusy(true);
                    const result = await adapter.pauseAutomation(routine.id);
                    setBusy(false);
                    if (result.data) setRoutine(result.data.automation);
                    else setProblem(problemOf(result));
                  }}
                >
                  {routine.enabled ? 'Pause routine' : 'Routine paused'}
                </Button>
                <Button variant="ghost" onClick={() => navigate('/work?view=recurring')}>
                  Open recurring work
                </Button>
              </>
            ) : (
              <>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
                  A saved preference or skill never turns on recurring work. Confirm a separate
                  schedule here, or choose a scoped customer-thread watch.
                </p>
                <Button variant="secondary" onClick={() => navigate('/work?view=recurring')}>
                  Watch a customer thread
                </Button>
                <Field label="What may it prepare?">
                  <textarea
                    value={instruction}
                    aria-label="What may it prepare?"
                    onChange={(event) => setInstruction(event.target.value)}
                    placeholder="Prepare a brief of open commitments for my review. Do not send anything."
                    style={textArea}
                    maxLength={4000}
                  />
                </Field>
                <Select
                  width="100%"
                  label="Connected source"
                  value={connectionId}
                  onChange={setConnectionId}
                  options={[
                    { value: 'context', label: 'Supplied context only · no fresh monitoring' },
                    ...(connections.data?.connections ?? [])
                      .filter((entry) => entry.status === 'connected' && !entry.builtin)
                      .map((entry) => ({ value: entry.id, label: entry.label })),
                  ]}
                />
                <Field label="Source scope">
                  <Input
                    value={sourceScope}
                    onChange={(event) => setSourceScope(event.target.value)}
                    placeholder="The notes or exact folder, calendar or thread this work covers"
                    width="100%"
                    maxLength={600}
                  />
                </Field>
                <Select
                  width="100%"
                  label="Timing"
                  value={frequency}
                  onChange={setFrequency}
                  options={[
                    { value: 'weekdays', label: 'Every weekday' },
                    { value: 'daily', label: 'Every day' },
                  ]}
                />
                <Field label={`At · ${profile?.time_zone ?? 'account time zone'}`}>
                  <Input
                    type="time"
                    value={at}
                    onChange={(event) => setAt(event.target.value)}
                    width="100%"
                  />
                </Field>
                <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                  Results appear in Chat and Work. Outward actions follow your current approval
                  settings; this preparation request does not approve sending. Pause the routine
                  from its result or Work → Recurring.
                </p>
                <Button
                  loading={busy}
                  disabled={busy || !instruction.trim() || !sourceScope.trim()}
                  onClick={() => void createRoutine()}
                >
                  Create this recurring preparation
                </Button>
              </>
            )
          ) : null}
          {problem ? (
            <p role="alert" style={{ margin: 0, color: 'var(--danger)', lineHeight: 1.6 }}>
              {problem}
            </p>
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => setAction(null)}>
            Close
          </Button>
        </div>
      ) : null}
    </section>
  );
}
