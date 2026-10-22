import { expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { sampleEnvironment } from './sample-environment.ts';

test('sample launch carries platform variables but no inherited account, service or public env settings', () => {
  const environment = sampleEnvironment({
    PATH: '/test/bin',
    SystemRoot: 'C:\\Windows',
    TEMP: 'C:\\Temp',
    DATABASE_URL: 'postgres://fixture:fixture@database/fixture',
    OPENAI_API_KEY: 'not-a-live-key',
    OPENDUET_MASTER_KEY: 'not-a-live-secret',
    VITE_OPENDUET_API: 'https://installation.example/api',
    VITE_ACCOUNT_TOKEN: 'not-a-live-token',
    NODE_OPTIONS: '--import=installation-loader.js',
  });
  expect(environment).toEqual({
    PATH: '/test/bin',
    SystemRoot: 'C:\\Windows',
    TEMP: 'C:\\Temp',
    NODE_ENV: 'development',
    VITE_OPENDUET_API: 'http://127.0.0.1:3321',
    VITE_OPENDUET_SAMPLE: 'on',
  });
});

test('the actual sample Vite configuration excludes dotenv secrets from served browser modules', async () => {
  const root = await mkdtemp(join(tmpdir(), 'openduet-sample-env-'));
  if (dirname(root) !== resolve(tmpdir())) throw new Error('Unexpected sample fixture directory');
  try {
    await writeFile(join(root, '.env'), 'VITE_INSTALL_SECRET=sample-dotenv-sentinel\n');
    await writeFile(join(root, '.env.local'), 'VITE_LOCAL_SECRET=sample-local-sentinel\n');
    await writeFile(
      join(root, 'probe.ts'),
      'export const settings = [import.meta.env.VITE_INSTALL_SECRET, import.meta.env.VITE_LOCAL_SECRET, import.meta.env.VITE_OPENDUET_API];',
    );
    const child = Bun.spawn(
      [
        process.execPath,
        '--no-env-file',
        '--eval',
        `import { createServer } from 'vite';
const server = await createServer({
  configFile: ${JSON.stringify(resolve(import.meta.dir, '../apps/web/vite.config.ts'))},
  root: ${JSON.stringify(root)},
  server: { host: '127.0.0.1', port: 0 },
});
try {
  await server.listen();
  const base = server.resolvedUrls.local[0];
  const response = await fetch(new URL('/probe.ts', base));
  const text = await response.text();
  if (!response.ok || text.includes('sample-dotenv-sentinel') || text.includes('sample-local-sentinel') || !text.includes('http://127.0.0.1:3321'))
    throw new Error('Sample dotenv boundary failed');
} finally { await server.close(); }`,
      ],
      {
        cwd: resolve(import.meta.dir, '../apps/web'),
        env: sampleEnvironment(process.env),
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    const [status, output, errors] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect({ status, output, errors }).toMatchObject({ status: 0 });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 20_000);
