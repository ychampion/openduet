/**
 * The runtime image's spare engine on a real Docker engine: it loads with
 * nothing of an attempt, takes one over its port, and serves with the
 * attempt's capability, sooner than an engine started with its attempt.
 * Runs with `OPENDUET_RUNTIME_LIVE=docker` and the image named by
 * `OPENDUET_RUNTIME_LIVE_IMAGE` (default `openduet-runtime:ci`); never part of an
 * ordinary run. The supervisor's side is covered by docker-spare.test.ts.
 */
import { afterAll, describe, expect, test } from 'bun:test';
import { CONTAINER_ATTEMPT_KEYS, SPARE_HANDOFF_PATH } from './docker.ts';

const live = process.env.OPENDUET_RUNTIME_LIVE === 'docker';
const image = process.env.OPENDUET_RUNTIME_LIVE_IMAGE ?? 'openduet-runtime:ci';
const started: string[] = [];

async function docker(args: string[]): Promise<string> {
  const child = Bun.spawn(['docker', ...args], { stdout: 'pipe', stderr: 'pipe' });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) throw new Error(`docker ${args[0]} failed: ${err.trim()}`);
  return out.trim();
}

/** Both of a container's streams: an engine reports why it stopped on stderr. */
async function logs(name: string, tail = '40'): Promise<string> {
  const child = Bun.spawn(['docker', 'logs', '--tail', tail, name], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [out, err] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return `${out}${err}`.trim();
}

/** The attempt container's own limits, as the supervisor starts it, on the default bridge. */
async function run(name: string, environment: Record<string, string>) {
  started.push(name);
  await docker([
    'run',
    '--detach',
    '--name',
    name,
    '--read-only',
    '--user',
    '10001:10001',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges:true',
    '--tmpfs',
    '/tmp:rw,size=64m,mode=1777',
    '--tmpfs',
    '/var/lib/hermes:rw,size=64m,uid=10001,gid=10001,mode=0700',
    '--tmpfs',
    '/work:rw,size=16m,uid=10001,gid=10001,mode=0770',
    ...Object.entries(environment).flatMap(([key, value]) => ['--env', `${key}=${value}`]),
    image,
  ]);
  const address = await docker(['inspect', '--format', '{{.NetworkSettings.IPAddress}}', name]);
  return `http://${address}:8790`;
}

async function until(
  url: string,
  key: string,
  ok: (status: number) => boolean,
  name: string,
): Promise<number> {
  const from = Date.now();
  while (Date.now() - from < 180_000) {
    try {
      const response = await fetch(url, {
        headers: { authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(2000),
      });
      await response.body?.cancel();
      if (ok(response.status)) return Date.now() - from;
    } catch {}
    await Bun.sleep(50);
  }
  throw new Error(`${name} did not answer ${url}: ${await logs(name)}`);
}

const base = (key: string) => ({
  HERMES_HOME: '/var/lib/hermes',
  API_SERVER_KEY: key,
  OPENDUET_BROKER_URL: 'http://openduet:8788',
  OPENDUET_MODEL_PROVIDER: 'fireworks',
  OPENDUET_MODEL_NAME: 'accounts/fireworks/models/deepseek-v4p1-flash',
  OPENDUET_MODEL_API_MODE: 'chat_completions',
});
const attempt = (suffix: string) => ({
  OPENDUET_ATTEMPT_TOKEN: `live-capability-${suffix}`,
  OPENDUET_ATTEMPT_ID: `att_01J000000000000000000000${suffix}`,
  OPENDUET_JOB_ID: `job_01J000000000000000000000${suffix}`,
  OPENDUET_MODEL_KEY: `openduet-surrogate-att_01J000000000000000000000${suffix}`,
  HERMES_TIMEZONE: 'Europe/Paris',
});

afterAll(async () => {
  for (const name of started) await docker(['rm', '--force', name]).catch(() => {});
});

describe.skipIf(!live)('the runtime image on a real engine', () => {
  test('a spare loads without its attempt, takes it over its port, and serves sooner', async () => {
    const suffix = String(process.pid % 100).padStart(2, '0');
    const coldKey = 'c'.repeat(64);
    const coldName = `openduet-live-cold-${suffix}`;
    const coldAt = Date.now();
    const coldUrl = await run(coldName, { ...base(coldKey), ...attempt('C1') });
    await until(`${coldUrl}/v1/capabilities`, coldKey, (s) => s === 200, coldName);
    const coldMs = Date.now() - coldAt;

    const spareKey = 's'.repeat(64);
    const spareName = `openduet-live-spare-${suffix}`;
    const spareAt = Date.now();
    const spareUrl = await run(spareName, {
      ...base(spareKey),
      OPENDUET_RUNTIME_SPARE: '1',
      OPENDUET_RUNTIME_SPARE_KEYS: CONTAINER_ATTEMPT_KEYS.join(','),
    });
    // Loaded: the handoff path answers. The engine's own API does not, yet.
    await until(`${spareUrl}${SPARE_HANDOFF_PATH}`, spareKey, (s) => s === 200, spareName);
    const loadMs = Date.now() - spareAt;
    const capabilities = await fetch(`${spareUrl}/v1/capabilities`, {
      headers: { authorization: `Bearer ${spareKey}` },
    });
    expect(capabilities.status).not.toBe(200);
    const wrong = await fetch(`${spareUrl}${SPARE_HANDOFF_PATH}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${'w'.repeat(64)}` },
      body: '{}',
    });
    expect(wrong.status).toBe(401);
    const inspected = await docker(['inspect', '--format', '{{json .Config.Env}}', spareName]);
    expect(inspected).not.toContain('live-capability');
    for (const key of CONTAINER_ATTEMPT_KEYS) expect(inspected).not.toContain(`"${key}=`);

    const handedAt = Date.now();
    const handoff = await fetch(`${spareUrl}${SPARE_HANDOFF_PATH}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${spareKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ cwd: '/work', env: attempt('S1') }),
    });
    expect(handoff.status).toBe(204);
    await until(`${spareUrl}/v1/capabilities`, spareKey, (s) => s === 200, spareName);
    const handoffMs = Date.now() - handedAt;
    const config = await docker(['exec', spareName, 'cat', '/var/lib/hermes/config.yaml']);
    expect(config).toContain('x-openduet-capability: live-capability-S1');
    expect(await logs(spareName, 'all')).not.toContain('openduet-spare:unusable');
    // What either engine makes under /work keeps the group's write bit, so the
    // service, in that group, can move and remove it.
    for (const name of [coldName, spareName])
      expect(await docker(['exec', name, 'grep', '^Umask:', '/proc/1/status'])).toMatch(
        /^Umask:\s+0002$/,
      );
    process.stdout.write(
      `engine ready: started with its attempt ${coldMs} ms; spare loaded in ${loadMs} ms, ` +
        `then ready ${handoffMs} ms after its handoff\n`,
    );
    expect(handoffMs).toBeLessThan(coldMs);
  }, 400_000);
});
