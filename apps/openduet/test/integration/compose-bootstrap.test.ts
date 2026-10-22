import { expect, spyOn, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HERMES_PINNED_COMMIT } from '@openduet/runtime-hermes';
import { parse } from 'yaml';
import { loadEnv } from '../../src/env.ts';
import { bootstrap } from '../../src/index.ts';
import { DockerSocketApi } from '../../src/runtime/docker.ts';
import { testDatabase, unusedTestPort } from '../helpers/database.ts';

test('Compose runtime selection boots the service and initializes its Docker supervisor', async () => {
  const handle = await testDatabase();
  if (!handle) throw new Error('Postgres unavailable');
  const root = await mkdtemp(join(tmpdir(), 'openduet-compose-bootstrap-'));
  const compose = parse(
    await readFile(new URL('../../../../deploy/docker-compose.yml', import.meta.url), 'utf8'),
  ) as { services: { openduet: { environment: Record<string, string> } } };
  const calls: Array<{ method: string; path: string }> = [];
  // Replace only daemon I/O: migrations, memory startup, queues and listeners are real.
  const daemon = spyOn(DockerSocketApi.prototype, 'request').mockImplementation(
    async (method, path) => {
      calls.push({ method, path });
      if (method !== 'GET') throw new Error('An empty installation must not mutate Docker');
      if (path === '/containers/compose-bootstrap/json')
        return {
          Id: 'compose-bootstrap',
          Config: {
            Labels: {
              'com.docker.compose.project': 'openduet',
              'com.docker.compose.service': 'openduet',
            },
          },
        };
      if (path.startsWith('/images/'))
        return {
          Id: `sha256:${'a'.repeat(64)}`,
          Config: {
            Labels: {
              'com.openduet.hermes.commit': HERMES_PINNED_COMMIT,
              'com.openduet.plugin.sha256': 'b'.repeat(64),
            },
          },
        };
      if (path.startsWith('/containers/json?') || path.startsWith('/networks?')) return [];
      if (path.startsWith('/volumes?')) return { Volumes: [] };
      throw new Error(`Unexpected daemon inspection: ${path}`);
    },
  );
  // The engine answers the unversioned preflight before any versioned request.
  const engine = spyOn(DockerSocketApi.prototype, 'version').mockImplementation(async () => {
    calls.push({ method: 'GET', path: '/version' });
    return { Version: '28.0.0', ApiVersion: '1.48', MinAPIVersion: '1.24' };
  });
  const priorHostname = process.env.HOSTNAME;
  process.env.HOSTNAME = 'compose-bootstrap';
  let service: Awaited<ReturnType<typeof bootstrap>> | undefined;
  try {
    const port = await unusedTestPort();
    service = await bootstrap({
      workers: false,
      env: loadEnv({
        NODE_ENV: 'test',
        DATABASE_URL: handle.url,
        OPENDUET_RUNTIME_ADAPTER: compose.services.openduet.environment.OPENDUET_RUNTIME_ADAPTER,
        OPENDUET_CAPABILITY_KEY: 'c'.repeat(32),
        OPENDUET_APPROVAL_KEY: 'a'.repeat(32),
        OPENDUET_RUNTIME_KEY: 'r'.repeat(32),
        OPENDUET_BROKER_BIND: `127.0.0.1:${port}`,
        OPENDUET_BROKER_URL: `http://127.0.0.1:${port}`,
        OPENDUET_SPACES_DIR: join(root, 'spaces'),
        OPENDUET_ARTIFACTS_DIR: join(root, 'artifacts'),
        OPENDUET_RESTRICTIONS_DIR: join(root, 'restrictions'),
        OPENDUET_WORK_DIR: join(root, 'work'),
      }),
    });
    const health = await service.app.request('/health');
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({
      status: 'ok',
      database: 'ok',
      runtime_adapter: 'docker',
    });
    expect(service.runner).toBeDefined();
    expect(service.broker).toBeDefined();
    expect(service.effectBoundary?.server.listening).toBe(true);
    expect((await service.app.request('/jobs')).status).toBe(401);
    // Six for the attempt supervisor; three for the plugin launcher looking for leftovers.
    expect(calls).toHaveLength(9);
    expect(
      calls.filter((call) =>
        decodeURIComponent(call.path).includes('com.openduet.mcp-launcher=v1'),
      ),
    ).toHaveLength(3);
    expect(calls[0]).toEqual({ method: 'GET', path: '/version' });
    expect(calls.every((call) => call.method === 'GET')).toBe(true);
  } finally {
    try {
      await service?.close();
    } finally {
      daemon.mockRestore();
      engine.mockRestore();
      if (priorHostname === undefined) delete process.env.HOSTNAME;
      else process.env.HOSTNAME = priorHostname;
      await handle.close();
      await rm(root, { recursive: true, force: true });
    }
  }
}, 30_000);
