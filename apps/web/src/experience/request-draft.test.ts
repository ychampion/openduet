import { expect, test } from 'bun:test';
import type { HandoffDraft } from './handoff.ts';
import { updateRequestDraft } from './request-draft.ts';

const draft = (): HandoffDraft => ({
  id: 'request-1',
  text: '  Original notes\n\n',
  attachments: ['old-file'],
  attachmentNames: ['Original.pdf'],
  pasted: [],
  createdAt: '2026-10-23T08:00:00Z',
  timeZone: 'Asia/Kolkata',
  attempted: false,
  conversationId: null,
});

test('first handoff edits preserve the exact entered text and restored attachment references', () => {
  const text = '  Do not promise a launch date.\n\n  Keep this indentation.  ';
  const updated = updateRequestDraft(draft(), text, [{ id: 'new-file', name: 'Extra notes.txt' }]);
  expect(updated.text).toBe(text);
  expect(updated.attachments).toEqual(['old-file', 'new-file']);
  expect(updated.attachmentNames).toEqual(['Original.pdf', 'Extra notes.txt']);
  expect(updated.id).toBe('request-1');
});

test('explicitly removing a restored attachment removes only that reference', () => {
  const updated = updateRequestDraft(
    draft(),
    'Same notes',
    [{ id: 'new-file', name: 'Extra.txt' }],
    new Set(['old-file']),
  );
  expect(updated.attachments).toEqual(['new-file']);
  expect(updated.attachmentNames).toEqual(['Extra.txt']);
});

test('an attempted request remains immutable for safe receipt recovery after a lost response', () => {
  const attempted = { ...draft(), attempted: true };
  const retry = updateRequestDraft(
    attempted,
    'Changed text',
    [{ id: 'different', name: 'Other.txt' }],
    new Set(['old-file']),
  );
  expect(retry).toBe(attempted);
  expect(retry.text).toBe('  Original notes\n\n');
  expect(retry.attachments).toEqual(['old-file']);
});
