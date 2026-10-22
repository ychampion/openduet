import { customerFollowupMessageQuery } from '@openduet/contracts';
import type { Context, Hono } from 'hono';
import { ServiceError } from '../api/errors.ts';
import { requireSessionSpace } from '../principals/session-space.ts';
import type { CustomerFollowupService } from './customer-followups.ts';

/** Scope and owner come from the authenticated session, never a watch request. */
export function mountCustomerFollowups(app: Hono, service: CustomerFollowupService) {
  const scope = (c: Context) => {
    const spaceId = c.get('sessionSpace')?.spaceId;
    if (!spaceId) throw new ServiceError('space_required', 'Select a personal space.', 409);
    requireSessionSpace(c, spaceId);
    return { principalId: c.get('owner').id, spaceId };
  };
  app.get('/customer-followups/sources', async (c) => {
    const { principalId, spaceId } = scope(c);
    return c.json({ sources: await service.sources(principalId, spaceId) });
  });
  app.post('/customer-followups/preview', async (c) => {
    const { principalId, spaceId } = scope(c);
    return c.json({ thread: await service.preview(principalId, spaceId, await c.req.json()) });
  });
  app.post('/customer-followups/messages', async (c) => {
    const { principalId, spaceId } = scope(c);
    const input = customerFollowupMessageQuery.parse(await c.req.json());
    return c.json({
      messages: await service.messages(
        principalId,
        spaceId,
        input.connection_id,
        input.query,
        input.folder,
      ),
    });
  });
  app.get('/customer-followups', async (c) => {
    const { principalId, spaceId } = scope(c);
    return c.json({ followups: await service.list(principalId, spaceId) });
  });
  app.post('/customer-followups', async (c) => {
    const { principalId, spaceId } = scope(c);
    return c.json(
      { followup: await service.create(principalId, spaceId, await c.req.json()) },
      201,
    );
  });
  for (const action of ['pause', 'resume', 'dismiss', 'send'] as const) {
    app.post(`/customer-followups/:id/${action}`, async (c) => {
      const { principalId, spaceId } = scope(c);
      const id = c.req.param('id');
      if (action === 'send') return c.json(await service.send(principalId, spaceId, id));
      return c.json({
        followup:
          action === 'dismiss'
            ? await service.dismiss(principalId, spaceId, id)
            : await service.setPaused(principalId, spaceId, id, action === 'pause'),
      });
    });
  }
}
