import { z } from 'zod';
import { attachmentView } from './attachments.ts';

export const assistantSuggestion = z.strictObject({
  id: z.string(),
  kind: z.enum(['meeting', 'triage', 'situation', 'task']),
  title: z.string(),
  reason: z.string(),
  context: z.string(),
  source_label: z.string(),
  conversation_id: z.string().nullable(),
  at: z.string().nullable(),
});
export type AssistantSuggestion = z.infer<typeof assistantSuggestion>;
export const assistantSnapshot = z.strictObject({
  enabled: z.boolean(),
  checked_at: z.string().nullable(),
  status: z.enum(['checking', 'watching', 'paused', 'delayed']),
  watched_connections: z.number().int().nonnegative(),
  suggestions: z.array(assistantSuggestion),
});
export type AssistantSnapshot = z.infer<typeof assistantSnapshot>;
export const assistantSettingsUpdate = z.strictObject({ enabled: z.boolean() });
export const assistantSuggestionAction = z.strictObject({
  action: z.enum(['dismiss', 'tomorrow']),
});
export const assistantCollaboration = z.strictObject({
  prompt: z.string(),
  attachment: attachmentView,
});
