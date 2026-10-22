/** Confirmed customer-thread responsibilities use the authenticated personal scope. */
import { z } from 'zod';
import { errorResponse } from './api.ts';
import {
  customerFollowupCreate,
  customerFollowupMessageQuery,
  customerFollowupPreview,
  customerFollowupView,
  customerThreadSnapshot,
} from './customer-followups.ts';
import { experienceDraft, experienceReceipt, permissionCard } from './experience.ts';

const json = (schema: z.ZodType) => ({ content: { 'application/json': { schema } } });
const response = (description: string, schema: z.ZodType) => ({ description, ...json(schema) });
const problem = (description: string) => response(description, errorResponse);
const saved = z.object({ followup: customerFollowupView });
const idParam = { path: z.object({ id: z.string().min(1) }) };

export const customerFollowupPaths = () => ({
  '/customer-followups': {
    get: {
      tags: ['responsibilities'],
      summary: 'List personal customer-thread watches and their prepared results',
      responses: {
        '200': response('Watches', z.object({ followups: z.array(customerFollowupView) })),
      },
    },
    post: {
      tags: ['responsibilities'],
      summary: 'Confirm a fresh thread preview, customer and future deadline',
      requestBody: json(customerFollowupCreate),
      responses: {
        '201': response('Confirmed watch', saved),
        '409': problem('The source changed or is no longer available'),
      },
    },
  },
  '/customer-followups/sources': {
    get: {
      tags: ['responsibilities'],
      summary: 'List available personal mailboxes with complete-thread reading',
      responses: {
        '200': response(
          'Supported mailboxes',
          z.object({ sources: z.array(z.object({ id: z.string(), label: z.string() })) }),
        ),
      },
    },
  },
  '/customer-followups/messages': {
    post: {
      tags: ['responsibilities'],
      summary: 'Find actual messages in one available mailbox',
      requestBody: json(customerFollowupMessageQuery),
      responses: {
        '200': response(
          'Messages',
          z.object({
            messages: z.array(
              z.object({
                key: z.union([z.number(), z.string()]),
                subject: z.string(),
                from: z.string(),
                date: z.string().nullable(),
                preview: z.string(),
              }),
            ),
          }),
        ),
        '409': problem('Complete thread search is unavailable'),
      },
    },
  },
  '/customer-followups/preview': {
    post: {
      tags: ['responsibilities'],
      summary: 'Read the fresh complete customer thread before confirming a watch',
      requestBody: json(customerFollowupPreview),
      responses: {
        '200': response(
          'Current thread',
          z.object({ thread: customerThreadSnapshot.extend({ connection_label: z.string() }) }),
        ),
        '409': problem('The complete thread is unavailable'),
      },
    },
  },
  ...Object.fromEntries(
    ['pause', 'resume', 'dismiss'].map((action) => [
      `/customer-followups/{id}/${action}`,
      {
        post: {
          tags: ['responsibilities'],
          summary: `${action} a personal customer watch`,
          requestParams: idParam,
          responses: {
            '200': response('Updated watch', saved),
            '404': problem('This watch is unavailable in the current personal scope'),
          },
        },
      },
    ]),
  ),
  '/customer-followups/{id}/send': {
    post: {
      tags: ['responsibilities'],
      summary: 'Revalidate the source and request review of the exact current draft',
      requestParams: idParam,
      responses: {
        '200': response(
          'Draft and exact send review',
          z.object({
            draft: experienceDraft,
            permission: permissionCard.nullable(),
            receipt: experienceReceipt.nullable(),
          }),
        ),
        '409': problem('The source changed or there is no current prepared draft'),
      },
    },
  },
});
