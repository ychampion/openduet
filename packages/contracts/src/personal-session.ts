import { z } from 'zod';
import { ATTACHMENT_LIMITS } from './attachments.ts';
import { MESSAGE_SPAN_LIMIT, messageSpan } from './reactions.ts';

const id = z.string().min(1).max(240);
const date = z.iso.datetime({ offset: true });

/** Navigation references never merge the execution or approval scope of their jobs. */
export const personalSessionReference = z.strictObject({
  id,
  kind: z.enum(['conversation', 'run', 'result']),
  conversation_id: id,
  run_id: id.optional(),
  turn_id: id.optional(),
  discussion_id: id.optional(),
  title: z.string(),
  status: z.string(),
  updated_at: date,
  output: z.string().optional(),
});
export type PersonalSessionReference = z.infer<typeof personalSessionReference>;
export const personalSessionResponse = z.strictObject({
  session: z.strictObject({
    id,
    space_id: id,
    read_at: date.nullable(),
    read_reference_id: id.nullable(),
    references: z.array(personalSessionReference),
  }),
});
export type PersonalSession = z.infer<typeof personalSessionResponse>['session'];
export const personalMessageTarget = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('new_task') }),
  z.strictObject({ kind: z.literal('continue_task'), conversation_id: id }),
  z.strictObject({ kind: z.literal('reply_result'), conversation_id: id, turn_id: id }),
]);
export type PersonalMessageTarget = z.infer<typeof personalMessageTarget>;
export const personalSessionMessage = z
  .strictObject({
    target: personalMessageTarget,
    text: z.string().max(100000),
    attachments: z.array(id).max(ATTACHMENT_LIMITS.per_message_ceiling).optional(),
    pasted: z.array(messageSpan).max(MESSAGE_SPAN_LIMIT).optional(),
    time_zone: z.string().min(1).max(64).optional(),
  })
  .refine((value) => value.text.trim().length > 0 || Boolean(value.attachments?.length), {
    message: 'A message needs words or a file.',
    path: ['text'],
  });
export const personalSessionAcceptance = z.strictObject({
  conversation_id: id,
  reference_id: id,
  turn_id: id,
  receipt: z.strictObject({ id, status: z.literal('accepted'), received_at: date }),
  steer: z.strictObject({ id, state: z.literal('queued') }).optional(),
});
export const personalSessionRead = z.strictObject({ reference_id: id });
