import type { HandoffDraft } from './handoff.ts';

/** A request already attempted is immutable until its idempotent receipt is recovered. */
export function updateRequestDraft(
  draft: HandoffDraft,
  text: string,
  attached: readonly { id: string; name: string }[],
  removed: ReadonlySet<string> = new Set(),
): HandoffDraft {
  if (draft.attempted) return draft;
  const files = new Map(
    draft.attachments.flatMap((id, index) =>
      removed.has(id) ? [] : [[id, draft.attachmentNames[index] ?? 'Attached file'] as const],
    ),
  );
  for (const file of attached) files.set(file.id, file.name);
  return { ...draft, text, attachments: [...files.keys()], attachmentNames: [...files.values()] };
}
