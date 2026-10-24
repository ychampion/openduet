import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { type AttemptBundle, EMPTY_SINCE_LAST } from '@openduet/contracts';
import {
  brokerCatalogState,
  DEFAULT_COMPACTION_MAX_TOKENS,
  DEFAULT_ENGINE_MAX_TURNS,
  engineSettingsFromEnvironment,
  renderEngineConfig,
} from '@openduet/runtime-hermes';
import { parse } from 'yaml';
import {
  brokerUrlForBind,
  demonstrationWarnings,
  envSchema,
  FILE_SETTINGS,
  loadEnv,
  readEnv,
} from './env.ts';

const bundle: AttemptBundle = {
  attempt: {
    id: 'att_01J00000000000000000000000',
    job_id: 'job_01J00000000000000000000000',
    epoch: 1,
    revision: 0,
    token: 'only-this-attempt',
  },
  job: {
    title: 'Read the catalog',
    objective: 'Reach the broker this service bound',
    constraints: {},
    progress_summary: '',
    unresolved_questions: [],
    deliverable: {},
  },
  since_last: EMPTY_SINCE_LAST,
  inputs: { new_user_messages: [], approval_results: [], trigger_events: [], repair_briefs: [] },
  transcript: [],
  tools: [],
  skills: [],
  knowledge: [],
  workspace: { mount: '/work', files: [] },
  budget: { max_turns: 1, max_output_tokens: 100, max_wall_ms: 10000, max_actions: 1 },
  model: { provider: 'fake', model: 'scripted', fallback: null },
};

const unusedPort = () =>
  new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() =>
        typeof address === 'object' && address ? resolve(address.port) : reject(new Error('port')),
      );
    });
  });

/** The shape deploy/scripts/configure.ts writes. */
const GENERATED_DATABASE_URL = `postgres://openduet:${'0f'.repeat(24)}@postgres:5432/openduet`;

/** The environment Compose would hand the service, with every placeholder filled in. */
function composeServiceEnvironment(): Record<string, string> {
  const compose = parse(
    readFileSync(join(import.meta.dir, '../../../deploy/docker-compose.yml'), 'utf8'),
  ) as { services: { openduet: { environment: Record<string, string | number | boolean> } } };
  const environment: Record<string, string> = Object.fromEntries(
    Object.entries(compose.services.openduet.environment).map(([key, value]) => [
      key,
      String(value).replace(/\$\{[A-Z0-9_]+:([-?])([^}]*)\}/g, (_match, kind, fallback) =>
        kind === '-' ? fallback : key === 'DATABASE_URL' ? GENERATED_DATABASE_URL : 'x'.repeat(64),
      ),
    ]),
  );
  // What the service reads from the files the setup step and the cell service write.
  const written: Record<string, string> = {
    DATABASE_URL: GENERATED_DATABASE_URL,
    OPENDUET_EFFECTS_DATABASE_URL: GENERATED_DATABASE_URL,
    OPENDUET_CELLS_KEY: 'x'.repeat(64),
  };
  for (const name of FILE_SETTINGS)
    if (`${name}_FILE` in environment) {
      delete environment[`${name}_FILE`];
      environment[name] = written[name] ?? '';
    }
  return environment;
}

describe('the model defaults', () => {
  test('the default model is the identifier its provider serves', () => {
    const env = loadEnv({});
    expect(env.OPENDUET_DEFAULT_PROVIDER).toBe('fireworks');
    expect(env.OPENDUET_DEFAULT_MODEL).toBe('accounts/fireworks/models/deepseek-v4p1-flash');
  });

  test('the example configuration selects the same model as the service default', () => {
    const example = readFileSync(
      join(import.meta.dir, '../../../deploy/.env.example'),
      'utf8',
    ).split(/\r?\n/);
    expect(example).toContain(`OPENDUET_DEFAULT_MODEL=${loadEnv({}).OPENDUET_DEFAULT_MODEL}`);
    expect(example).toContain(
      `OPENDUET_DEFAULT_MAX_OUTPUT_TOKENS=${loadEnv({}).OPENDUET_DEFAULT_MAX_OUTPUT_TOKENS}`,
    );
  });

  test('the output limit for a request that names none is 4,096 and can be changed', () => {
    expect(loadEnv({}).OPENDUET_DEFAULT_MAX_OUTPUT_TOKENS).toBe(4096);
    expect(
      loadEnv({ OPENDUET_DEFAULT_MAX_OUTPUT_TOKENS: '2048' }).OPENDUET_DEFAULT_MAX_OUTPUT_TOKENS,
    ).toBe(2048);
    for (const value of ['0', '-1', '1.5', 'many'])
      expect(readEnv({ OPENDUET_DEFAULT_MAX_OUTPUT_TOKENS: value }).ok).toBe(false);
    expect(readEnv({ OPENDUET_DEFAULT_MAX_OUTPUT_TOKENS: '' }).ok).toBe(false);
  });

  test('legacy default output formats accepted at boot reach the renderer unchanged', () => {
    for (const value of ['1e3', ' 512 ', '0x200', '+512', '1.0', String(Number.MAX_SAFE_INTEGER)]) {
      for (const dedicated of [undefined, '']) {
        const source = {
          OPENDUET_ENGINE_MAX_OUTPUT_TOKENS: dedicated,
          OPENDUET_DEFAULT_MAX_OUTPUT_TOKENS: value,
        };
        expect(loadEnv(source).OPENDUET_DEFAULT_MAX_OUTPUT_TOKENS).toBe(Number(value));
        const settings = engineSettingsFromEnvironment(source);
        expect(
          renderEngineConfig({
            provider: 'fake',
            model: 'scripted',
            brokerUrl: 'http://openduet:8788',
            ...settings,
          }),
        ).toMatchObject({ model: { max_tokens: Number(value) } });
      }
    }
    for (const value of [
      '',
      ' ',
      '0',
      '-1',
      '1.5',
      'many',
      'NaN',
      'Infinity',
      '9007199254740992',
      '0x20000000000000',
    ]) {
      const source = {
        OPENDUET_ENGINE_MAX_OUTPUT_TOKENS: '',
        OPENDUET_DEFAULT_MAX_OUTPUT_TOKENS: value,
      };
      expect(readEnv(source).ok).toBe(false);
      expect(() => engineSettingsFromEnvironment(source)).toThrow(
        'OPENDUET_DEFAULT_MAX_OUTPUT_TOKENS',
      );
    }
  });

  test('the optional engine reply ceiling accepts Compose blanks and only positive safe integers', () => {
    expect(loadEnv({}).OPENDUET_ENGINE_MAX_OUTPUT_TOKENS).toBeUndefined();
    expect(
      loadEnv({ OPENDUET_ENGINE_MAX_OUTPUT_TOKENS: '' }).OPENDUET_ENGINE_MAX_OUTPUT_TOKENS,
    ).toBeUndefined();
    for (const value of ['1', '512', '000512', String(Number.MAX_SAFE_INTEGER)])
      expect(
        loadEnv({ OPENDUET_ENGINE_MAX_OUTPUT_TOKENS: value }).OPENDUET_ENGINE_MAX_OUTPUT_TOKENS,
      ).toBe(Number(value));
    for (const value of [
      '0',
      '-1',
      '1.5',
      '1e3',
      'NaN',
      'Infinity',
      ' 512',
      '512 ',
      '+512',
      '9007199254740992',
      '１２',
    ]) {
      const result = readEnv({ OPENDUET_ENGINE_MAX_OUTPUT_TOKENS: value });
      expect(result.ok).toBe(false);
      if (!result.ok)
        expect(
          result.issues.some((issue) => issue.startsWith('OPENDUET_ENGINE_MAX_OUTPUT_TOKENS:')),
        ).toBe(true);
    }
    const example = readFileSync(join(import.meta.dir, '../../../deploy/.env.example'), 'utf8');
    expect(example).toContain('\nOPENDUET_ENGINE_MAX_OUTPUT_TOKENS=\n');
  });

  test('automatic memory has no daily read limit unless the operator sets one', () => {
    expect(loadEnv({}).OPENDUET_MEMORY_DAILY_CALLS).toBeUndefined();
    expect(
      loadEnv({ OPENDUET_MEMORY_DAILY_CALLS: '' }).OPENDUET_MEMORY_DAILY_CALLS,
    ).toBeUndefined();
    expect(loadEnv({ OPENDUET_MEMORY_DAILY_CALLS: '500' }).OPENDUET_MEMORY_DAILY_CALLS).toBe(500);
    for (const value of ['-1', '1.5', 'many'])
      expect(readEnv({ OPENDUET_MEMORY_DAILY_CALLS: value }).ok).toBe(false);
    // Compose and the example leave it empty too, so an install made from them is not capped.
    expect(composeServiceEnvironment().OPENDUET_MEMORY_DAILY_CALLS ?? '').toBe('');
    const example = readFileSync(join(import.meta.dir, '../../../deploy/.env.example'), 'utf8');
    expect(example).toContain('\nOPENDUET_MEMORY_DAILY_CALLS=\n');
  });

  test('standing work never rests and routines are not limited unless the operator sets it', () => {
    const settings = [
      'OPENDUET_REST_ROUTINES_AFTER_DAYS',
      'OPENDUET_ROUTINES_PER_PERSON_MAX',
    ] as const;
    const example = readFileSync(join(import.meta.dir, '../../../deploy/.env.example'), 'utf8');
    for (const name of settings) {
      expect(loadEnv({})[name]).toBeUndefined();
      expect(loadEnv({ [name]: '' })[name]).toBeUndefined();
      expect(loadEnv({ [name]: '14' })[name]).toBe(14);
      for (const value of ['0', '-1', '1.5', 'many'])
        expect(readEnv({ [name]: value }).ok).toBe(false);
      expect(composeServiceEnvironment()[name] ?? '').toBe('');
      expect(example).toContain(`\n${name}=\n`);
    }
  });

  test('voice asides, computer awake time and long work are not limited unless the operator sets it', () => {
    const settings = [
      'OPENDUET_VOICE_DAILY_ASIDES',
      'OPENDUET_SANDBOX_AWAKE_SECONDS_PER_DAY',
      'OPENDUET_RUNS_ACTIVE_PER_SPACE_MAX',
    ] as const;
    const example = readFileSync(join(import.meta.dir, '../../../deploy/.env.example'), 'utf8');
    for (const name of settings) {
      expect(loadEnv({})[name]).toBeUndefined();
      expect(loadEnv({ [name]: '' })[name]).toBeUndefined();
      expect(loadEnv({ [name]: '14' })[name]).toBe(14);
      for (const value of ['-1', '1.5', 'many']) expect(readEnv({ [name]: value }).ok).toBe(false);
      // Compose and the example leave it empty too, so an install made from them is not capped.
      expect(composeServiceEnvironment()[name] ?? '').toBe('');
      expect(example).toContain(`\n${name}=\n`);
    }
  });

  test('Compose falls back to the same provider and model as the service and the example', () => {
    // Only a deploy/.env without these lines meets the fallback; it must not
    // select a provider the service then refuses to start with.
    const composed = composeServiceEnvironment();
    const env = loadEnv({});
    expect(composed.OPENDUET_DEFAULT_PROVIDER).toBe(env.OPENDUET_DEFAULT_PROVIDER);
    expect(composed.OPENDUET_DEFAULT_MODEL).toBe(env.OPENDUET_DEFAULT_MODEL);
    const example = readFileSync(join(import.meta.dir, '../../../deploy/.env.example'), 'utf8');
    expect(example).toContain(`\nOPENDUET_DEFAULT_PROVIDER=${env.OPENDUET_DEFAULT_PROVIDER}\n`);
    const runtime = readFileSync(
      join(import.meta.dir, '../../../deploy/docker-compose.yml'),
      'utf8',
    );
    expect(runtime).toContain(
      `OPENDUET_MODEL_PROVIDER: \${OPENDUET_DEFAULT_PROVIDER:-${env.OPENDUET_DEFAULT_PROVIDER}}`,
    );
    expect(runtime).toContain(
      `OPENDUET_MODEL_NAME: \${OPENDUET_DEFAULT_MODEL:-${env.OPENDUET_DEFAULT_MODEL}}`,
    );
  });

  test('model calls and connector events are kept for ever unless the operator sets a retention', () => {
    expect(loadEnv({}).OPENDUET_RETENTION_DAYS).toBeUndefined();
    expect(loadEnv({ OPENDUET_RETENTION_DAYS: '' }).OPENDUET_RETENTION_DAYS).toBeUndefined();
    expect(loadEnv({ OPENDUET_RETENTION_DAYS: '90' }).OPENDUET_RETENTION_DAYS).toBe(90);
    for (const value of ['34', '0', '-1', '90.5', 'many'])
      expect(readEnv({ OPENDUET_RETENTION_DAYS: value }).ok).toBe(false);
    expect(composeServiceEnvironment().OPENDUET_RETENTION_DAYS ?? '').toBe('');
    const example = readFileSync(join(import.meta.dir, '../../../deploy/.env.example'), 'utf8');
    expect(example).toContain('\nOPENDUET_RETENTION_DAYS=\n');
  });

  test('the first visitor is let in without a setup code only when the operator says true', () => {
    expect(loadEnv({}).OPENDUET_SETUP_OPEN).toBe(false);
    expect(loadEnv({ OPENDUET_SETUP_OPEN: '' }).OPENDUET_SETUP_OPEN).toBe(false);
    expect(loadEnv({ OPENDUET_SETUP_OPEN: 'false' }).OPENDUET_SETUP_OPEN).toBe(false);
    expect(loadEnv({ OPENDUET_SETUP_OPEN: 'true' }).OPENDUET_SETUP_OPEN).toBe(true);
    expect(readEnv({ OPENDUET_SETUP_OPEN: 'yes' }).ok).toBe(false);
    // Compose hands the service both, and the web origin it shares with the web server.
    const composed = composeServiceEnvironment();
    for (const name of ['OPENDUET_SETUP_OPEN', 'OPENDUET_SETUP_CODE_HASH', 'OPENDUET_WEB_ORIGIN'])
      expect([name, composed[name]]).toEqual([name, '']);
    const env = loadEnv(composed);
    expect(env.OPENDUET_SETUP_OPEN).toBe(false);
    expect(env.OPENDUET_SETUP_CODE_HASH).toBeUndefined();
    expect(env.OPENDUET_WEB_ORIGIN).toBeUndefined();
  });

  test('Compose passes the output limit through to the service', () => {
    expect(composeServiceEnvironment().OPENDUET_DEFAULT_MAX_OUTPUT_TOKENS).toBe('4096');
  });

  test('every service setting the example configuration lists reaches the service', () => {
    // Compose hands a container only the variables its file names, so a setting
    // written in deploy/.env and missing there is silently ignored.
    const example = readFileSync(join(import.meta.dir, '../../../deploy/.env.example'), 'utf8');
    const listed = [...example.matchAll(/^([A-Z_][A-Z0-9_]*)=/gm)].map((match) => match[1] ?? '');
    const read = Object.keys(envSchema.in.shape);
    const composed = composeServiceEnvironment();
    expect(listed).toContain('OPENDUET_ENGINE_MAX_TURNS');
    expect(listed.filter((name) => read.includes(name) && !(name in composed))).toEqual([]);
  });
});

describe('the engine limits', () => {
  test('a malformed engine limit stops the service instead of every attempt', () => {
    // These are read again when an attempt starts, which is where they are
    // applied. If the only reading were there, a typo would let the service boot
    // healthy and then fail each attempt at launch, one at a time, for as long
    // as nobody looked at the environment.
    for (const name of [
      'OPENDUET_ENGINE_MAX_TURNS',
      'OPENDUET_ENGINE_MAX_OUTPUT_TOKENS',
      'OPENDUET_COMPACTION_MAX_TOKENS',
      'OPENDUET_MODEL_CONTEXT_WINDOW',
    ]) {
      for (const value of ['0', '-1', '1.5', 'many'])
        expect(readEnv({ [name]: value }).ok).toBe(false);
      expect(readEnv({ [name]: '64000' }).ok).toBe(true);
    }
  });

  test('Compose passes each limit through, and an empty one keeps the default', () => {
    const composed = composeServiceEnvironment();
    for (const name of [
      'OPENDUET_ENGINE_MAX_TURNS',
      'OPENDUET_ENGINE_MAX_OUTPUT_TOKENS',
      'OPENDUET_COMPACTION_MAX_TOKENS',
      'OPENDUET_MODEL_CONTEXT_WINDOW',
    ])
      expect(composed[name]).toBe('');
    const env = loadEnv(composed);
    expect(env.OPENDUET_ENGINE_MAX_TURNS).toBe(DEFAULT_ENGINE_MAX_TURNS);
    expect(env.OPENDUET_ENGINE_MAX_OUTPUT_TOKENS).toBeUndefined();
    expect(env.OPENDUET_COMPACTION_MAX_TOKENS).toBe(DEFAULT_COMPACTION_MAX_TOKENS);
    expect(env.OPENDUET_MODEL_CONTEXT_WINDOW).toBeUndefined();
    expect(env.OPENDUET_PUBLIC_URL).toBeUndefined();
  });

  test('Compose passes the plugin, start-up and speech settings through, and empty keeps the default', () => {
    const composed = composeServiceEnvironment();
    const names = [
      'OPENDUET_MCP_NODE_IMAGE',
      'OPENDUET_MCP_PYTHON_IMAGE',
      'OPENDUET_MCP_EGRESS_PORT',
      'OPENDUET_MCP_IDLE_MS',
      'OPENDUET_RUNTIME_START_TIMEOUT_MS',
      'OPENDUET_ENGINE_PREWARM',
      'OPENDUET_ATTEMPT_CONCURRENCY',
      'OPENDUET_SPEECH_MODEL',
    ];
    for (const name of names) expect(composed[name]).toBe('');
    const env = loadEnv(composed);
    const defaults = loadEnv({});
    for (const name of names)
      expect(env[name as keyof typeof env]).toEqual(defaults[name as keyof typeof defaults]);
    expect(env.OPENDUET_MCP_EGRESS_PORT).toBe(8789);
    expect(loadEnv({ OPENDUET_MCP_IDLE_MS: '60000' }).OPENDUET_MCP_IDLE_MS).toBe(60000);
  });

  test('spare engines and concurrent attempts are counts, with the old switch still read', () => {
    expect(loadEnv({}).OPENDUET_ENGINE_PREWARM).toBe(1);
    expect(loadEnv({ OPENDUET_ENGINE_PREWARM: 'true' }).OPENDUET_ENGINE_PREWARM).toBe(1);
    expect(loadEnv({ OPENDUET_ENGINE_PREWARM: 'false' }).OPENDUET_ENGINE_PREWARM).toBe(0);
    expect(loadEnv({ OPENDUET_ENGINE_PREWARM: '2' }).OPENDUET_ENGINE_PREWARM).toBe(2);
    expect(() => loadEnv({ OPENDUET_ENGINE_PREWARM: 'lots' })).toThrow();
    expect(loadEnv({}).OPENDUET_ATTEMPT_CONCURRENCY).toBe(4);
    expect(loadEnv({ OPENDUET_ATTEMPT_CONCURRENCY: '6' }).OPENDUET_ATTEMPT_CONCURRENCY).toBe(6);
    expect(() => loadEnv({ OPENDUET_ATTEMPT_CONCURRENCY: '0' })).toThrow();
  });

  test('the defaults are the ones the engine configuration renders', () => {
    const env = loadEnv({});
    expect(env.OPENDUET_ENGINE_MAX_TURNS).toBe(DEFAULT_ENGINE_MAX_TURNS);
    expect(env.OPENDUET_COMPACTION_MAX_TOKENS).toBe(DEFAULT_COMPACTION_MAX_TOKENS);
    expect(env.OPENDUET_MODEL_CONTEXT_WINDOW).toBeUndefined();
  });
});

describe('the database address', () => {
  test('one the Postgres client cannot read stops start-up by name, without its password', () => {
    for (const value of [
      'postgres://openduet:hunter2-secret@postgres:54x2/openduet',
      'postgres://openduet:hunter2-secret%zz@postgres:5432/openduet',
      'openduet:hunter2-secret@postgres:5432/openduet',
      'mysql://openduet:hunter2-secret@postgres/openduet',
      'MongoDB+srv://openduet:hunter2-secret@postgres/openduet',
    ]) {
      const result = readEnv({ DATABASE_URL: value });
      expect(result.ok).toBe(false);
      const issues = result.ok ? '' : result.issues.join('\n');
      expect(issues).toStartWith('DATABASE_URL: ');
      expect(issues).not.toContain('hunter2');
    }
  });

  test('the addresses the client reads are kept as written', () => {
    for (const value of [
      GENERATED_DATABASE_URL,
      'postgres://openduet:p%40ss@postgres:5432/openduet',
      'postgresql://openduet:secret@db-a:5432,db-b:5433/openduet?sslmode=require',
      'postgres://openduet:secret@[::1]:5432/openduet',
      'postgres:///openduet?host=/var/run/postgresql',
      // The client ignores the scheme's name and case, and leading whitespace.
      'POSTGRES://openduet:secret@postgres:5432/openduet',
      'pg://openduet:secret@postgres:5432/openduet',
      ' postgres://openduet:secret@postgres:5432/openduet',
    ]) {
      const result = readEnv({ DATABASE_URL: value });
      expect(result.ok && result.env.DATABASE_URL).toBe(value);
    }
  });
});

describe('the address the service reads its own tool catalog from', () => {
  test('follows the bound broker when only the bind is configured', () => {
    expect(loadEnv({}).OPENDUET_BROKER_URL).toBe('http://127.0.0.1:3112');
    expect(loadEnv({ OPENDUET_BROKER_BIND: '0.0.0.0:8788' }).OPENDUET_BROKER_URL).toBe(
      'http://127.0.0.1:8788',
    );
    expect(loadEnv({ OPENDUET_BROKER_BIND: '127.0.0.1:3172' }).OPENDUET_BROKER_URL).toBe(
      'http://127.0.0.1:3172',
    );
  });

  test('a wildcard bind is reached over loopback and a named bind by its name', () => {
    expect(brokerUrlForBind('[::]:8788')).toBe('http://[::1]:8788');
    expect(brokerUrlForBind('[::1]:9000')).toBe('http://[::1]:9000');
    expect(brokerUrlForBind('broker.internal:8788')).toBe('http://broker.internal:8788');
    expect(brokerUrlForBind('0.0.0.0')).toBeNull();
    expect(brokerUrlForBind('0.0.0.0:0')).toBeNull();
    expect(brokerUrlForBind('0.0.0.0:70000')).toBeNull();
  });

  test('a catalog request reaches a broker bound to every interface', async () => {
    const port = await unusedPort();
    const requests: string[] = [];
    const broker = Bun.serve({
      hostname: '127.0.0.1',
      port,
      fetch: (request) => {
        requests.push(new URL(request.url).pathname);
        return Response.json({ tools: [] });
      },
    });
    try {
      const env = loadEnv({ OPENDUET_BROKER_BIND: `0.0.0.0:${port}` });
      expect(await brokerCatalogState({ brokerUrl: env.OPENDUET_BROKER_URL })(bundle)).toEqual([]);
      expect(requests).toEqual(['/tools']);
    } finally {
      await broker.stop(true);
    }
  });

  test('the shipped Compose environment targets the port its broker binds', () => {
    const source = composeServiceEnvironment();
    const env = loadEnv(source);
    expect(env.OPENDUET_BROKER_BIND).toBe('0.0.0.0:8788');
    expect(new URL(env.OPENDUET_BROKER_URL).port).toBe('8788');
  });

  test('an explicit address on another port stops the service at start-up', () => {
    const result = readEnv({
      OPENDUET_BROKER_BIND: '0.0.0.0:8788',
      OPENDUET_BROKER_URL: 'http://127.0.0.1:3112',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.join('\n')).toContain('OPENDUET_BROKER_URL');
      expect(result.issues.join('\n')).toContain('OPENDUET_BROKER_BIND');
      expect(result.issues.join('\n')).toContain('8788');
    }
  });

  test('a loopback listener cannot be addressed by another name, nor the reverse', () => {
    expect(
      readEnv({
        OPENDUET_BROKER_BIND: '127.0.0.1:8788',
        OPENDUET_BROKER_URL: 'http://openduet:8788',
      }).ok,
    ).toBe(false);
    expect(
      readEnv({
        OPENDUET_BROKER_BIND: '10.0.0.4:8788',
        OPENDUET_BROKER_URL: 'http://127.0.0.1:8788',
      }).ok,
    ).toBe(false);
  });

  test('an explicit address that can reach the listener is kept as written', () => {
    expect(
      loadEnv({ OPENDUET_BROKER_BIND: '0.0.0.0:8788', OPENDUET_BROKER_URL: 'http://openduet:8788' })
        .OPENDUET_BROKER_URL,
    ).toBe('http://openduet:8788');
    expect(
      loadEnv({
        OPENDUET_BROKER_BIND: '127.0.0.1:3172',
        OPENDUET_BROKER_URL: 'http://localhost:3172',
      }).OPENDUET_BROKER_URL,
    ).toBe('http://localhost:3172');
  });

  test('a bind that is not host:port is refused before anything listens', () => {
    const result = readEnv({ OPENDUET_BROKER_BIND: 'not-an-address' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.join('\n')).toContain('OPENDUET_BROKER_BIND');
  });
});

describe('demonstration settings beside a real provider', () => {
  test('the test connector on beside a real provider is warned about at start-up', () => {
    const warnings = demonstrationWarnings(
      loadEnv({ OPENDUET_ENABLE_TEST_CONNECTOR: 'true', OPENDUET_DEFAULT_PROVIDER: 'anthropic' }),
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('OPENDUET_ENABLE_TEST_CONNECTOR=true');
    expect(warnings[0]).toContain('anthropic');
  });

  test('the scripted provider on beside a real provider is warned about too', () => {
    const warnings = demonstrationWarnings(
      loadEnv({ OPENDUET_ENABLE_FAKE_PROVIDER: 'true', OPENDUET_DEFAULT_PROVIDER: 'anthropic' }),
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('OPENDUET_ENABLE_FAKE_PROVIDER=true');
  });

  test('the demonstration itself, and a production configuration, are quiet', () => {
    expect(
      demonstrationWarnings(
        loadEnv({
          OPENDUET_ENABLE_TEST_CONNECTOR: 'true',
          OPENDUET_ENABLE_FAKE_PROVIDER: 'true',
          OPENDUET_DEFAULT_PROVIDER: 'fake',
        }),
      ),
    ).toEqual([]);
    expect(demonstrationWarnings(loadEnv({ OPENDUET_DEFAULT_PROVIDER: 'anthropic' }))).toEqual([]);
  });
});

describe('what a computer may reach', () => {
  test('extra hosts are DNS names or .suffixes, and anything else stops the service', () => {
    const read = (value: string) => readEnv({ OPENDUET_SANDBOX_EGRESS_EXTRA_HOSTS: value });
    const hosts = (value: string) => {
      const result = read(value);
      return result.ok ? result.env.OPENDUET_SANDBOX_EGRESS_EXTRA_HOSTS : null;
    };
    expect(hosts('')).toEqual([]);
    expect(hosts('registry.npmjs.org, .PyPI.org,1.example.com')).toEqual([
      'registry.npmjs.org',
      '.pypi.org',
      '1.example.com',
    ]);
    for (const value of [
      '10.0.0.1',
      '*.example.com',
      'example.com:443',
      'https://example.com',
      '..x',
      '.com',
      '.io',
    ])
      expect([value, read(value).ok]).toEqual([value, false]);
  });

  test('records are kept 30 days unless told otherwise, and the default computer may hold to its hosts', () => {
    const result = readEnv({ OPENDUET_SANDBOX_DOCKER_EGRESS: 'connected_hosts_only' });
    if (!result.ok) throw new Error(result.issues.join('; '));
    expect(result.env.OPENDUET_EGRESS_RECORD_DAYS).toBe(30);
    expect(result.env.OPENDUET_SANDBOX_DOCKER_EGRESS).toBe('connected_hosts_only');
    expect(readEnv({ OPENDUET_EGRESS_RECORD_DAYS: '0' }).ok).toBe(false);
  });
});

describe('internal hosts everyone may reach', () => {
  test('off by default, and Compose and the example leave it empty', () => {
    expect(loadEnv({}).OPENDUET_PRIVATE_HOSTS).toBe('');
    expect(composeServiceEnvironment().OPENDUET_PRIVATE_HOSTS).toBe('');
    const example = readFileSync(join(import.meta.dir, '../../../deploy/.env.example'), 'utf8');
    expect(example).toContain('\nOPENDUET_PRIVATE_HOSTS=\n');
  });

  test('names, wildcards and ranges start the service; anything else stops it and says which', () => {
    expect(
      readEnv({
        OPENDUET_PRIVATE_HOSTS: 'mcp.corp.internal, *.corp.internal, 10.20.0.0/16, fd00::/8',
      }).ok,
    ).toBe(true);
    for (const value of ['*.internal', '10.20.0.1/16', '0.0.0.0/0', 'https://mcp.corp.internal']) {
      const result = readEnv({ OPENDUET_PRIVATE_HOSTS: value });
      expect([value, result.ok]).toEqual([value, false]);
      if (!result.ok) expect(result.issues.join('\n')).toContain('OPENDUET_PRIVATE_HOSTS');
    }
  });

  test('a range over OpenDuet’s own networks is refused, wherever the pool is', () => {
    const overlapping = readEnv({ OPENDUET_PRIVATE_HOSTS: '10.0.0.0/8' });
    expect(overlapping.ok).toBe(false);
    if (!overlapping.ok) expect(overlapping.issues.join('\n')).toContain('OPENDUET_NETWORK_POOL');
    const inside = readEnv({ OPENDUET_PRIVATE_HOSTS: '10.215.3.0/24' });
    expect(inside.ok).toBe(false);
    if (!inside.ok) expect(inside.issues.join('\n')).toContain('list a range outside it');
    expect(readEnv({ OPENDUET_PRIVATE_HOSTS: '::ffff:10.215.3.0/120' }).ok).toBe(false);
    expect(readEnv({ OPENDUET_PRIVATE_HOSTS: '10.20.0.0/16' }).ok).toBe(true);
    expect(
      readEnv({ OPENDUET_PRIVATE_HOSTS: '10.0.0.0/8', OPENDUET_NETWORK_POOL: '172.30.0.0/16' }).ok,
    ).toBe(true);
    expect(readEnv({ OPENDUET_PRIVATE_HOSTS: '10.0.0.0/8', OPENDUET_NETWORK_POOL: 'off' }).ok).toBe(
      true,
    );
  });
});
