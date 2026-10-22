/**
 * A first request survives setup without turning profile answers into messages.
 * The stable draft ID is also the server submission key, so a lost response,
 * refresh or second tab resolves to the same task and first turn.
 */
import { API_BASE_URL, client, type Result } from './adapter.ts';

export type HandoffDraft = {
  id: string;
  text: string;
  attachments: string[];
  attachmentNames: string[];
  pasted: { start: number; end: number }[];
  createdAt: string;
  timeZone: string;
  attempted: boolean;
  conversationId: string | null;
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const KEY = 'openduet.first-handoff.v1';
const store = (): StorageLike | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};

export function loadHandoff(storage = store()): HandoffDraft | null {
  try {
    const raw: unknown = JSON.parse(storage?.getItem(KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return null;
    const draft = raw as Partial<HandoffDraft>;
    if (
      typeof draft.id !== 'string' ||
      typeof draft.text !== 'string' ||
      !Array.isArray(draft.attachments) ||
      !draft.attachments.every((id) => typeof id === 'string') ||
      !Array.isArray(draft.attachmentNames) ||
      !draft.attachmentNames.every((name) => typeof name === 'string') ||
      !Array.isArray(draft.pasted) ||
      !draft.pasted.every((span) => Number.isInteger(span.start) && Number.isInteger(span.end)) ||
      typeof draft.createdAt !== 'string' ||
      typeof draft.timeZone !== 'string' ||
      typeof draft.attempted !== 'boolean' ||
      !(draft.conversationId === null || typeof draft.conversationId === 'string')
    )
      return null;
    return draft as HandoffDraft;
  } catch {
    return null;
  }
}

/** A blocked browser store is an explicit failure: never silently lose a request. */
export function saveHandoff(draft: HandoffDraft, storage = store()): HandoffDraft {
  if (!storage) throw new Error('Allow browser storage to keep this request through setup.');
  const current = loadHandoff(storage);
  if (current?.id === draft.id && current.attempted) {
    const payload = (value: HandoffDraft) =>
      JSON.stringify([value.text, value.attachments, value.pasted, value.timeZone]);
    if (payload(current) !== payload(draft))
      throw new Error(
        'This request was already submitted. Recover its saved result before editing it.',
      );
    // Another tab may already hold the acceptance; a stale save cannot undo it.
    draft = {
      ...draft,
      attempted: true,
      conversationId: current.conversationId ?? draft.conversationId,
    };
  }
  storage.setItem(KEY, JSON.stringify(draft));
  return draft;
}

/** Persist a reviewed removal before the interface hides the saved attachment. */
export function removeHandoffAttachment(
  draft: HandoffDraft,
  id: string,
  storage = store(),
): HandoffDraft {
  if (draft.attempted) return draft;
  return saveHandoff(
    {
      ...draft,
      attachments: draft.attachments.filter((attachment) => attachment !== id),
      attachmentNames: draft.attachmentNames.filter((_, index) => draft.attachments[index] !== id),
    },
    storage,
  );
}

export function beginHandoff(
  text: string,
  attachments: readonly { id: string; name: string }[] = [],
  pasted: readonly { start: number; end: number }[] = [],
  storage = store(),
): HandoffDraft {
  return saveHandoff(
    {
      id: crypto.randomUUID(),
      text,
      attachments: attachments.map((file) => file.id),
      attachmentNames: attachments.map((file) => file.name),
      pasted: pasted.map((span) => ({ ...span })),
      createdAt: new Date().toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      attempted: false,
      conversationId: null,
    },
    storage,
  );
}

/** Removing the local copy never stops or changes a submitted task. */
export function discardHandoff(id?: string, storage = store()) {
  if (id && loadHandoff(storage)?.id !== id) return;
  storage?.removeItem(KEY);
}

type Acceptance = { conversation_id: string; turn_id: string; reference_id: string };
export type HandoffTransport = (draft: HandoffDraft) => Promise<Result<Acceptance>>;

const send: HandoffTransport = async (draft) => {
  try {
    const response = await client.options.fetch(`${API_BASE_URL}/personal-session/messages`, {
      method: 'POST',
      credentials: client.options.credentials,
      headers: {
        ...client.options.headers,
        'content-type': 'application/json',
        'Idempotency-Key': draft.id,
      },
      body: JSON.stringify({
        target: { kind: 'new_task' },
        text: draft.text,
        ...(draft.attachments.length ? { attachments: draft.attachments } : {}),
        ...(draft.pasted.length ? { pasted: draft.pasted } : {}),
        time_zone: draft.timeZone,
      }),
    });
    const body = await response.json();
    if (!response.ok)
      return {
        data: null,
        error:
          body?.error?.message ?? 'Couldn’t submit this task. Its saved request is still here.',
        unavailable: null,
      };
    return { data: body as Acceptance, error: null, unavailable: null };
  } catch {
    return {
      data: null,
      error: 'Couldn’t reach OpenDuet. Retry this saved request.',
      unavailable: null,
    };
  }
};

const pending = new Map<string, Promise<Result<Acceptance>>>();

/** Persist before the network call; the service owns the atomic deduplication. */
export async function submitHandoff(
  draft: HandoffDraft,
  transport: HandoffTransport = send,
  storage = store(),
): Promise<Result<Acceptance>> {
  if (draft.conversationId)
    return {
      data: { conversation_id: draft.conversationId, turn_id: '', reference_id: '' },
      error: null,
      unavailable: null,
    };
  const already = pending.get(draft.id);
  if (already) return already;
  const request = (async () => {
    saveHandoff({ ...draft, attempted: true }, storage);
    const accepted = await transport(draft);
    if (accepted.data)
      saveHandoff(
        { ...draft, attempted: true, conversationId: accepted.data.conversation_id },
        storage,
      );
    return accepted;
  })();
  pending.set(draft.id, request);
  try {
    return await request;
  } finally {
    pending.delete(draft.id);
  }
}
