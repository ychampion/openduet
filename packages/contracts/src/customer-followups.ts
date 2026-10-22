import { z } from 'zod';

const key = z.union([z.number().int().positive(), z.string().min(1).max(512)]);
const zone = z
  .string()
  .min(1)
  .max(64)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, 'Choose a valid time zone.');

/** A watch begins with a fresh preview. Its version binds confirmation to what the person saw. */
export const customerFollowupPreview = z.strictObject({
  connection_id: z.string().min(1),
  thread_key: key,
  customer_email: z.email(),
});
export const customerFollowupCreate = customerFollowupPreview.extend({
  source_version: z.string().regex(/^[a-f0-9]{64}$/),
  deadline_at: z.iso.datetime({ offset: true }),
  time_zone: zone,
  title: z.string().trim().min(1).max(200),
  skill_refs: z.array(z.string().min(1).max(200)).max(20).default([]),
  preference_refs: z.array(z.string().min(1).max(200)).max(20).default([]),
});
export type CustomerFollowupCreate = z.infer<typeof customerFollowupCreate>;
export const customerThreadMessage = z.object({
  key: z.string(),
  message_id: z.string().nullable(),
  from: z.string(),
  to: z.string(),
  subject: z.string(),
  text: z.string(),
  date: z.string(),
  own: z.boolean(),
});
export type CustomerThreadMessage = z.infer<typeof customerThreadMessage>;
export const customerThreadSnapshot = z.object({
  version: z.string(),
  subject: z.string(),
  messages: z.array(customerThreadMessage),
  latest_outgoing: z.string().nullable(),
  replied: z.boolean(),
});
export type CustomerThreadSnapshot = z.infer<typeof customerThreadSnapshot>;
export const customerFollowupView = z.object({
  id: z.string(),
  title: z.string(),
  connection_id: z.string(),
  connection_label: z.string(),
  thread_key: key,
  customer_email: z.string(),
  deadline_at: z.string(),
  time_zone: z.string(),
  state: z.enum([
    'watching',
    'preparing',
    'prepared',
    'replied',
    'failed',
    'paused',
    'dismissed',
    'completed',
  ]),
  next_check_at: z.string().nullable(),
  checked_at: z.string().nullable(),
  failure: z.string().nullable(),
  source_version: z.string(),
  skill_refs: z.array(z.string()),
  preference_refs: z.array(z.string()),
  result: z
    .object({
      id: z.string(),
      conversation_id: z.string(),
      draft_action_id: z.string().nullable(),
      source_version: z.string(),
      state: z.string(),
      summary: z.string(),
      recipient: z.string().nullable(),
      subject: z.string().nullable(),
      body: z.string().nullable(),
      receipt: z.unknown().nullable(),
    })
    .nullable(),
});
export type CustomerFollowupView = z.infer<typeof customerFollowupView>;
export const customerFollowupMessageQuery = z.strictObject({
  connection_id: z.string().min(1),
  query: z.string().max(300),
  folder: z.enum(['inbox', 'sent']),
});
