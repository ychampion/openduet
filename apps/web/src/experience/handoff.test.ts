import { expect, test } from 'bun:test';
import {
  beginHandoff,
  discardHandoff,
  type HandoffTransport,
  loadHandoff,
  removeHandoffAttachment,
  saveHandoff,
  submitHandoff,
} from './handoff.ts';
import { setupTimeZone } from './timezone.ts';

const storage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
};
const accepted = (conversation_id = 'job_first') => ({
  data: { conversation_id, turn_id: 'turn_first', reference_id: 'reference_first' },
  error: null,
  unavailable: null,
});

test('the real request and uploaded attachment references survive setup and reload byte for byte', () => {
  const kept = storage();
  const text = 'Please prepare this.\n\n  Priya: do NOT promise the pilot date.  ';
  const draft = beginHandoff(
    text,
    [{ id: 'file_notes', name: 'Call notes.pdf' }],
    [{ start: 23, end: text.length }],
    kept,
  );
  expect(loadHandoff(kept)).toEqual(draft);
  expect(loadHandoff(kept)?.text).toBe(text);
  expect(loadHandoff(kept)?.attachments).toEqual(['file_notes']);
  expect(draft).not.toHaveProperty('profile');
});

test('a lost reply followed by refresh uses the same task key and exact request', async () => {
  const kept = storage();
  const draft = beginHandoff(
    'Research suppliers\nConstraints: local delivery',
    [{ id: 'file_brief', name: 'Brief.docx' }],
    [],
    kept,
  );
  const received: unknown[] = [];
  const lost: HandoffTransport = async (request) => {
    received.push({ ...request });
    return { data: null, error: 'Connection closed', unavailable: null };
  };
  expect((await submitHandoff(draft, lost, kept)).data).toBeNull();
  const reloaded = loadHandoff(kept);
  expect(reloaded?.attempted).toBe(true);
  const retry: HandoffTransport = async (request) => {
    received.push({ ...request });
    return accepted();
  };
  if (!reloaded) throw new Error('The saved request disappeared');
  const result = await submitHandoff(reloaded, retry, kept);
  expect(result.data?.conversation_id).toBe('job_first');
  expect(received).toHaveLength(2);
  expect((received[0] as typeof draft).id).toBe((received[1] as typeof draft).id);
  expect((received[0] as typeof draft).text).toBe((received[1] as typeof draft).text);
  expect((received[0] as typeof draft).timeZone).toBe((received[1] as typeof draft).timeZone);
  expect(loadHandoff(kept)?.conversationId).toBe('job_first');
});

test('repeated Continue and post-acceptance refresh do not make a second submission', async () => {
  const kept = storage();
  const draft = beginHandoff('Prepare my meeting', [], [], kept);
  let calls = 0;
  let resolve: (() => void) | undefined;
  const gate = new Promise<void>((done) => {
    resolve = done;
  });
  const send: HandoffTransport = async () => {
    calls++;
    await gate;
    return accepted();
  };
  const first = submitHandoff(draft, send, kept);
  const second = submitHandoff(draft, send, kept);
  resolve?.();
  expect((await first).data).toEqual((await second).data);
  expect(calls).toBe(1);
  const reloaded = loadHandoff(kept);
  if (!reloaded) throw new Error('The saved request disappeared');
  await submitHandoff(reloaded, send, kept);
  expect(calls).toBe(1);
});

test('discarding an old draft cannot remove a newer request', () => {
  const kept = storage();
  const old = beginHandoff('first task', [], [], kept);
  const current = beginHandoff('another task', [], [], kept);
  discardHandoff(old.id, kept);
  expect(loadHandoff(kept)?.id).toBe(current.id);
  discardHandoff(current.id, kept);
  expect(loadHandoff(kept)).toBeNull();
});

test('blocked persistence never pretends the handoff was saved', () => {
  expect(() => beginHandoff('real task', [], [], null)).toThrow('browser storage');
});

test('removing a kept attachment survives refresh and excludes it from the eventual task', async () => {
  const kept = storage();
  const original = beginHandoff(
    'Use the revised notes.',
    [
      { id: 'file_old', name: 'Old notes.pdf' },
      { id: 'file_revised', name: 'Revised notes.pdf' },
    ],
    [],
    kept,
  );
  const removed = removeHandoffAttachment(original, 'file_old', kept);
  const reloaded = loadHandoff(kept);
  expect(reloaded).toEqual(removed);
  expect(reloaded?.id).toBe(original.id);
  expect(reloaded?.attachments).toEqual(['file_revised']);
  expect(reloaded?.attachmentNames).toEqual(['Revised notes.pdf']);
  if (!reloaded) throw new Error('The request disappeared');
  let submitted: string[] = [];
  await submitHandoff(
    reloaded,
    async (draft) => {
      submitted = draft.attachments;
      return accepted();
    },
    kept,
  );
  expect(submitted).toEqual(['file_revised']);
});

test('a failed removal does not hide an attachment that would return after refresh', () => {
  const kept = storage();
  const original = beginHandoff(
    'Use these notes.',
    [{ id: 'file_notes', name: 'Notes.pdf' }],
    [],
    kept,
  );
  const blocked = {
    ...kept,
    setItem() {
      throw new Error('Storage is full');
    },
  };
  expect(() => removeHandoffAttachment(original, 'file_notes', blocked)).toThrow('Storage is full');
  expect(loadHandoff(kept)).toEqual(original);
  expect(original.attachments).toEqual(['file_notes']);
});

test('an attempted request cannot remove the attachment needed for its original receipt', () => {
  const kept = storage();
  const original = beginHandoff(
    'Use these notes.',
    [{ id: 'file_notes', name: 'Notes.pdf' }],
    [],
    kept,
  );
  const attempted = { ...original, attempted: true };
  expect(removeHandoffAttachment(attempted, 'file_notes', kept)).toBe(attempted);
  expect(loadHandoff(kept)?.attachments).toEqual(['file_notes']);
});

test('a stale setup tab cannot remove an attachment after another tab started the request', () => {
  const kept = storage();
  const stale = beginHandoff(
    'Use these notes.',
    [{ id: 'file_notes', name: 'Notes.pdf' }],
    [],
    kept,
  );
  saveHandoff({ ...stale, attempted: true }, kept);
  expect(() => removeHandoffAttachment(stale, 'file_notes', kept)).toThrow('already submitted');
  expect(loadHandoff(kept)?.attempted).toBe(true);
  expect(loadHandoff(kept)?.attachments).toEqual(['file_notes']);
});

test('a stale readiness callback cannot erase the acceptance saved by another tab', () => {
  const kept = storage();
  const stale = beginHandoff('Prepare this meeting.', [], [], kept);
  saveHandoff({ ...stale, attempted: true, conversationId: 'job_accepted' }, kept);
  saveHandoff(stale, kept);
  expect(loadHandoff(kept)?.attempted).toBe(true);
  expect(loadHandoff(kept)?.conversationId).toBe('job_accepted');
});

test('a reviewed request zone survives setup refresh and an attempted retry without browser replacement', async () => {
  const kept = storage();
  const draft = beginHandoff('Prepare my Thursday call.', [], [], kept);
  saveHandoff({ ...draft, timeZone: 'America/New_York' }, kept);
  const reloaded = loadHandoff(kept);
  if (!reloaded) throw new Error('The saved request disappeared');
  const zone = setupTimeZone(
    { time_zone: 'UTC', time_zone_confirmed: true },
    'Asia/Kolkata',
    reloaded.timeZone,
  );
  expect(zone).toBe('America/New_York');
  const reviewed = saveHandoff({ ...reloaded, timeZone: zone }, kept);
  const received: string[] = [];
  await submitHandoff(
    reviewed,
    async (request) => {
      received.push(request.timeZone);
      return { data: null, error: 'Response lost', unavailable: null };
    },
    kept,
  );
  const attempted = loadHandoff(kept);
  if (!attempted) throw new Error('The attempted request disappeared');
  expect(() => saveHandoff({ ...attempted, timeZone: 'Asia/Kolkata' }, kept)).toThrow(
    'already submitted',
  );
  await submitHandoff(
    attempted,
    async (request) => {
      received.push(request.timeZone);
      return accepted();
    },
    kept,
  );
  expect(received).toEqual(['America/New_York', 'America/New_York']);
  expect(attempted.id).toBe(draft.id);
});
