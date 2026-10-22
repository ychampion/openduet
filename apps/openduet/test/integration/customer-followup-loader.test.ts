import { afterAll, describe, expect, test } from 'bun:test';
import type { ConnectorFactory } from '../../src/connectors/configured.ts';
import { emailManifest } from '../../src/connectors/email.ts';
import { loadCurrentConnector } from '../../src/connectors/lazy.ts';
import { ConnectorRegistry } from '../../src/connectors/registry.ts';
import type { Connector } from '../../src/connectors/types.ts';
import { newId } from '../../src/ids.ts';
import { testDatabase } from '../helpers/database.ts';

const fixture = await testDatabase();
afterAll(async () => fixture?.close());

describe.if(fixture !== null)('customer follow-up connector loading', () => {
  if (!fixture) return;
  const { db, sql } = fixture;
  async function opening() {
    const spaceId = newId('sp');
    const connectionId = newId('conn');
    await sql`insert into space (id, name, git_path) values (${spaceId}, 'Loading', ${`/fixtures/${spaceId}`})`;
    await sql`insert into connection (id, space_id, provider, label, scopes)
      values (${connectionId}, ${spaceId}, 'gmail', 'Mailbox', '["email.read","email.draft"]'::jsonb)`;
    let closed = 0;
    let release!: () => void;
    let began!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      began = resolve;
    });
    const connector: Connector = {
      manifest: emailManifest,
      health: async () => {
        throw new Error('No health check belongs in a loader test.');
      },
      execute: async () => {
        throw new Error('No dispatch belongs in a loader test.');
      },
      verify: async () => {
        throw new Error('No dispatch belongs in a loader test.');
      },
      close: async () => {
        closed++;
      },
    };
    const registry = new ConnectorRegistry();
    const factory: Pick<ConnectorFactory, 'open' | 'register'> = {
      open: async () => {
        began();
        await held;
        return connector;
      },
      register: (destination, id, value) => {
        destination.register(id, value);
      },
    };
    const loading = loadCurrentConnector(db, registry, factory, connectionId);
    await started;
    return { spaceId, connectionId, connector, registry, loading, release, closed: () => closed };
  }

  test('a source still active after opening is published', async () => {
    const source = await opening();
    source.release();
    await source.loading;
    expect(source.registry.get(source.connectionId)).toBe(source.connector);
    expect(source.closed()).toBe(0);
    await source.registry.close();
  });

  for (const change of ['removed space', 'revoked connection', 'changed credential'] as const) {
    test(`a ${change} during opening closes the old connector without publishing it`, async () => {
      const source = await opening();
      if (change === 'removed space') {
        await sql`update space set removed_at = now(), removal_epoch = removal_epoch + 1 where id = ${source.spaceId}`;
        await source.registry.release(source.connectionId);
        // A real removal's registry verification can already have passed here.
        expect(source.registry.get(source.connectionId)).toBeUndefined();
        await sql`delete from connection where id = ${source.connectionId}`;
      } else if (change === 'revoked connection')
        await sql`update connection set status = 'revoked', generation = generation + 1 where id = ${source.connectionId}`;
      else
        await sql`update connection set generation = generation + 1 where id = ${source.connectionId}`;
      source.release();
      await source.loading;
      expect(source.registry.get(source.connectionId)).toBeUndefined();
      expect(source.closed()).toBe(1);
    });
  }

  test('another loader winning the registration keeps its connector', async () => {
    const source = await opening();
    const winner: Connector = { ...source.connector, close: async () => {} };
    source.registry.register(source.connectionId, winner);
    source.release();
    await source.loading;
    expect(source.registry.get(source.connectionId)).toBe(winner);
    expect(source.closed()).toBe(1);
    await source.registry.close();
  });
});
