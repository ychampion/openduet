import type {
  PersonalMessageTarget,
  PersonalSessionReference,
  PersonalSession as Session,
} from '@openduet/contracts';
import { API_BASE_URL, client, type Result } from './adapter.ts';
import { browserTimeZone } from './timezone.ts';

/** A feed reference never changes the execution/approval scope of its task. */
export type PersonalReference = PersonalSessionReference;
export type PersonalSession = Session;
export type PersonalTarget = PersonalMessageTarget;
export type PersonalAcceptance = {
  conversation_id: string;
  reference_id: string;
  turn_id: string;
  receipt: { id: string; status: 'accepted'; received_at: string };
};

async function request<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  key?: string,
): Promise<Result<T>> {
  try {
    const response = await client.options.fetch(`${API_BASE_URL}${path}`, {
      method,
      credentials: client.options.credentials,
      headers: {
        ...client.options.headers,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(key ? { 'Idempotency-Key': key } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok)
      return {
        data: null,
        error: data?.error?.message ?? 'Couldn’t load your conversation. Try again.',
        unavailable: null,
        ...(data?.error?.code ? { code: data.error.code } : {}),
      };
    return { data: data as T, error: null, unavailable: null };
  } catch {
    return {
      data: null,
      error: 'Couldn’t reach the service. Your message has not been sent.',
      unavailable: null,
    };
  }
}

export const personal = {
  session: () => request<{ session: PersonalSession }>('/personal-session'),
  message: (
    target: PersonalTarget,
    text: string,
    key: string,
    attachments: readonly string[] = [],
  ) => {
    const time_zone = browserTimeZone();
    return request<PersonalAcceptance>(
      '/personal-session/messages',
      'POST',
      {
        target,
        text,
        ...(attachments.length ? { attachments: [...attachments] } : {}),
        ...(time_zone ? { time_zone } : {}),
      },
      key,
    );
  },
  read: (reference_id: string) =>
    request<{ session: PersonalSession }>('/personal-session/read', 'PATCH', { reference_id }),
};

/** A bare completion acknowledgement is not a produced result or action receipt. */
export function hasUsefulOutput(answer: string): boolean {
  const text = answer.trim();
  return Boolean(text && !/^(?:done|all set|finished|complete|completed)[.!\s]*$/i.test(text));
}

/** Decisions are addressed only by clicked records; no title or pronoun guessing. */
export function targetOf(reference: PersonalReference): PersonalTarget | null {
  if (reference.kind === 'result' && !reference.turn_id) return null;
  return reference.kind === 'result' && reference.turn_id
    ? {
        kind: 'reply_result',
        conversation_id: reference.conversation_id,
        turn_id: reference.turn_id,
      }
    : { kind: 'continue_task', conversation_id: reference.conversation_id };
}

export function visibleReferences(references: readonly PersonalReference[]): PersonalReference[] {
  const seen = new Set<string>();
  const completed = new Set(
    references
      .filter((reference) => reference.kind === 'result')
      .map((reference) => reference.conversation_id),
  );
  const waiting = new Set(
    references
      .filter((reference) => reference.kind === 'result' && reference.status === 'needs_you')
      .map((reference) => reference.conversation_id),
  );
  return [...references]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .filter((reference) => {
      if (
        reference.kind !== 'result' &&
        reference.status === 'done' &&
        completed.has(reference.conversation_id)
      )
        return false;
      if (
        reference.kind !== 'result' &&
        reference.status === 'needs_you' &&
        waiting.has(reference.conversation_id)
      )
        return false;
      const key =
        reference.kind === 'result' && reference.turn_id
          ? `${reference.conversation_id}:${reference.turn_id}`
          : reference.conversation_id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .reverse();
}
