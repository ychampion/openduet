import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { modelReadiness } from '../../src/db/schema.ts';
import { loadEnv } from '../../src/env.ts';
import { ModelSettingsService } from '../../src/gateway/model-settings.ts';
import { resetTestRows, testDatabase } from '../helpers/database.ts';

const handle = await testDatabase();
const suite = handle ? describe : describe.skip;
afterAll(async () => {
  await handle?.close();
});

suite('model readiness persistence (scripted runtime observations)', () => {
  beforeEach(async () => {
    if (!handle) return;
    await resetTestRows(handle.sql);
    await handle.db.delete(modelReadiness);
    await handle.sql`insert into owner(id,email) values ('readiness-owner','ready@example.test')`;
    await handle.sql`insert into principal(id,email) values ('readiness-owner','ready@example.test')`;
    await handle.sql`insert into space(id,name,git_path,owner_principal_id) values ('readiness-space','Personal','/tmp/readiness','readiness-owner')`;
  });

  test('listing models succeeds while inference fails; tool readiness stays unverified after refresh', async () => {
    if (!handle) throw new Error('Missing database');
    const service = new ModelSettingsService({
      db: handle.db,
      env: loadEnv({
        NODE_ENV: 'test',
        OPENAI_API_KEY: 'fixture-credential',
        OPENDUET_DEFAULT_PROVIDER: 'openai',
        OPENDUET_DEFAULT_MODEL: 'selected-model',
      }),
      fetch: async () => Response.json({ data: [{ id: 'selected-model' }] }),
      readinessProbe: async (options) => {
        expect(options.provider).toBe('openai');
        expect(options.model).toBe('selected-model');
        return {
          credentialsAccepted: false,
          inference: 'failed',
          tools: 'not_checked',
          code: 'billing',
          message: 'Account credit exhausted.',
          usage: { requests: 1, output_tokens: 0 },
        };
      },
    });
    expect(await service.test({ provider: 'openai' })).toMatchObject({
      ok: true,
      models: ['selected-model'],
    });
    expect(
      await service.checkReadiness('readiness-owner', {
        provider: 'openai',
        model: 'selected-model',
      }),
    ).toMatchObject({
      credentials: 'passed',
      inference: 'failed',
      tools: 'not_checked',
      code: 'billing',
    });
    expect((await service.view(true)).readiness).toMatchObject({
      credentials: 'passed',
      inference: 'failed',
      tools: 'not_checked',
    });
  });

  test('readiness persists but a model choice or changed operator credential invalidates it', async () => {
    if (!handle) throw new Error('Missing database');
    const env = loadEnv({
      NODE_ENV: 'test',
      OPENAI_API_KEY: 'fixture-credential',
      OPENDUET_DEFAULT_PROVIDER: 'openai',
      OPENDUET_DEFAULT_MODEL: 'selected-model',
    });
    const service = new ModelSettingsService({
      db: handle.db,
      env,
      fetch: async () => Response.json({ data: [] }),
      readinessProbe: async () => ({
        credentialsAccepted: true,
        inference: 'passed',
        tools: 'passed',
        code: 'ready',
        message: 'Scripted compatibility evidence.',
        usage: { requests: 2, output_tokens: 20 },
      }),
    });
    await service.checkReadiness('readiness-owner', {
      provider: 'openai',
      model: 'selected-model',
    });
    expect((await service.view(true)).readiness?.tools).toBe('passed');
    const changed = new ModelSettingsService({
      db: handle.db,
      env: { ...env, OPENAI_API_KEY: 'replacement-fixture-credential' },
    });
    expect((await changed.view(true)).readiness).toBeNull();
    await service.setDefault('openai', 'another-model', 'readiness-owner');
    expect((await service.view(true)).readiness).toBeNull();
    await service.setDefault('openai', 'selected-model', 'readiness-owner');
    expect((await service.view(true)).readiness).toBeNull();
  });

  test('a configuration edited during a check cannot publish readiness', async () => {
    if (!handle) throw new Error('Missing database');
    const env = loadEnv({
      NODE_ENV: 'test',
      OPENAI_API_KEY: 'fixture-credential',
      OPENDUET_DEFAULT_PROVIDER: 'openai',
      OPENDUET_DEFAULT_MODEL: 'selected-model',
    });
    const service = new ModelSettingsService({
      db: handle.db,
      env,
      fetch: async () => Response.json({ data: [] }),
      readinessProbe: async () => {
        env.OPENAI_API_KEY = 'changed-during-check';
        return {
          credentialsAccepted: true,
          inference: 'passed',
          tools: 'passed',
          code: 'ready',
          message: 'Scripted.',
          usage: { requests: 2, output_tokens: 20 },
        };
      },
    });
    expect(
      await service.checkReadiness('readiness-owner', {
        provider: 'openai',
        model: 'selected-model',
      }),
    ).toMatchObject({ code: 'configuration_changed', tools: 'not_checked' });
    expect((await service.view(true)).readiness).toBeNull();
  });
});
