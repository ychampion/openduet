import { and, eq, isNull } from 'drizzle-orm';
import type { Database } from '../db/client.ts';
import { connection, space } from '../db/schema.ts';
import type { ConnectorFactory } from './configured.ts';
import type { ConnectorRegistry } from './registry.ts';

/** A slow open cannot publish credentials after removal or revocation released them. */
export async function loadCurrentConnector(
  db: Database,
  registry: ConnectorRegistry,
  factory: Pick<ConnectorFactory, 'open' | 'register'>,
  id: string,
): Promise<void> {
  if (registry.get(id)) return;
  const [source] = await db
    .select({ connection, removalEpoch: space.removalEpoch })
    .from(connection)
    .innerJoin(space, eq(space.id, connection.spaceId))
    .where(and(eq(connection.id, id), eq(connection.status, 'active'), isNull(space.removedAt)));
  if (!source) return;
  const opened = await factory.open({
    id: source.connection.id,
    spaceId: source.connection.spaceId,
    provider: source.connection.provider,
    secretRef: source.connection.secretRef,
    configuration: source.connection.configuration,
  });
  if (!opened) return;
  let published = false;
  try {
    await db.transaction(async (tx) => {
      // Match the removal/revocation lock order and keep both fences through
      // synchronous publication, so a later release always sees this connector.
      const [parent] = await tx
        .select()
        .from(space)
        .where(eq(space.id, source.connection.spaceId))
        .for('share');
      if (!parent || parent.removedAt || parent.removalEpoch !== source.removalEpoch) return;
      const [current] = await tx
        .select()
        .from(connection)
        .where(eq(connection.id, id))
        .for('share');
      if (
        !current ||
        current.spaceId !== source.connection.spaceId ||
        current.status !== 'active' ||
        current.generation !== source.connection.generation ||
        registry.get(id)
      )
        return;
      factory.register(registry, id, opened);
      published = true;
    });
  } catch (error) {
    if (published) await registry.remove(id, opened);
    else await opened.close?.();
    throw error;
  }
  if (!published) await opened.close?.();
}
