/**
 * The local end-to-end for code execution: a real Hermes API server from the
 * pinned tag, the real broker, the real model gateway with its fake provider,
 * the real adapter, and a real Python subprocess started inside the cell.
 *
 * The only thing that is not real is the model, and it is fake because the
 * point is the path an execution takes to the ledger, not what a language model
 * would have written.
 *
 * There is no Docker on this machine, so the runtime is a process rather than a
 * container and `/work` is a temporary directory rather than a mount. That is
 * the one difference from production and it is the reason this script proves
 * the ledger path and not the filesystem confinement: the container's read-only
 * root and single writable mount are asserted by the isolation probe, not here.
 *
 *   bun run packages/runtime-hermes/scripts/e2e-exec.ts
 */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type AttemptBundle, EMPTY_SINCE_LAST, type RuntimeEvent } from '@openduet/contracts';
import { createArtifactRecorder } from '../../../apps/openduet/src/artifact/record.ts';
import { signCapability } from '../../../apps/openduet/src/broker/capability.ts';
import { createInternalServer } from '../../../apps/openduet/src/broker/internal-server.ts';
import { recordId } from '../../../apps/openduet/src/broker/records.ts';
import { configuredConnectors } from '../../../apps/openduet/src/connectors/configured.ts';
import { createScriptedProvider, fakeProvider } from '../../../apps/openduet/src/gateway/index.ts';
import { defaultPrivacyRouter } from '../../../apps/openduet/src/privacy/index.ts';
import { seedJob } from '../../../apps/openduet/test/helpers/broker.ts';
import { createPostgresFixture } from '../../../apps/openduet/test/helpers/postgres.ts';
import { brokerCatalogState, brokerParkedActions, HermesRuntimeAdapter } from '../src/adapter.ts';
import { HERMES_SRC, hermesHome, PYTHON, ROOT } from './e2e.ts';

const CAPABILITY_KEY = 'e2e-capability-key-e2e-capability-key';
const APPROVAL_KEY = 'e2e-approval-key-e2e-approval-key-xx';
const API_KEY = 'e2e-api-server-key-0123456789abcdef';

const log = (line: string) => process.stdout.write(`${line}\n`);

/** The snippet the scripted model asks for. It writes the deliverable. */
const SNIPPET = [
  'import csv',
  "rows = [('desk', 60.0), ('chair', 40.0)]",
  "with open('out.csv', 'w', newline='') as handle:",
  '    writer = csv.writer(handle)',
  "    writer.writerow(['item', 'amount'])",
  '    for row in rows:',
  '        writer.writerow(row)',
  "    writer.writerow(['Total', sum(amount for _, amount in rows)])",
  "print('wrote out.csv')",
].join('\n');

async function freePort(): Promise<number> {
  const server = Bun.serve({ port: 0, fetch: () => new Response('') });
  const port = server.port ?? 0;
  if (port === 0) throw new Error('no port was allocated');
  server.stop(true);
  return port;
}

function startRuntime(
  home: string,
  port: number,
  token: string,
  attemptId: string,
  jobId: string,
  workDir: string,
) {
  const patched = spawnSync(
    PYTHON,
    [join(ROOT, 'packages/runtime-hermes/patches/observer_bridge.py'), HERMES_SRC],
    { encoding: 'utf8', windowsHide: true },
  );
  if (patched.status !== 0)
    throw new Error(`Observer patch refused: ${patched.stderr || patched.error}`);
  const lines: string[] = [];
  const clean = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !/_API_KEY$|^ANTHROPIC|^OPENAI|^GOOGLE|^GEMINI|^NOUS|^OPENROUTER/.test(key),
    ),
  );
  const child = spawn(PYTHON, ['-m', 'hermes_cli.main', 'gateway', 'run'], {
    cwd: home,
    windowsHide: true,
    env: {
      ...clean,
      HERMES_HOME: home,
      HERMES_EXEC_ASK: '1',
      HERMES_ACCEPT_HOOKS: '1',
      API_SERVER_ENABLED: '1',
      API_SERVER_KEY: API_KEY,
      API_SERVER_HOST: '127.0.0.1',
      API_SERVER_PORT: String(port),
      OPENDUET_BROKER_URL: process.env.OPENDUET_BROKER_URL ?? '',
      OPENDUET_ATTEMPT_TOKEN: token,
      OPENDUET_ATTEMPT_ID: attemptId,
      OPENDUET_JOB_ID: jobId,
      // In the container this is the mount and the default is right. Here the
      // workspace is a temporary directory, so the cell is told where it is.
      OPENDUET_WORK_DIR: workDir,
      OPENDUET_MODEL_KEY: `openduet-surrogate-${attemptId.replace(/[^A-Za-z0-9_-]/g, '')}`,
      PYTHONUNBUFFERED: '1',
    },
  });
  child.stdout.on('data', (d: Buffer) => lines.push(d.toString()));
  child.stderr.on('data', (d: Buffer) => lines.push(d.toString()));
  let exited = false;
  child.once('exit', () => {
    exited = true;
  });
  return {
    stop: () =>
      new Promise<void>((resolve) => {
        if (exited) return resolve();
        child.once('exit', () => resolve());
        child.kill('SIGTERM');
      }),
    log: () => lines.join(''),
  };
}

async function waitForApi(port: number, deadlineMs = 120_000): Promise<number> {
  const started = Date.now();
  while (Date.now() - started < deadlineMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/capabilities`, {
        headers: { authorization: `Bearer ${API_KEY}` },
      });
      if (response.ok) return Date.now() - started;
    } catch {
      // not listening yet
    }
    await Bun.sleep(500);
  }
  throw new Error(`the API server did not answer within ${deadlineMs}ms`);
}

async function main() {
  const db = await createPostgresFixture();
  if (!db) throw new Error('no database: set DATABASE_URL or install embedded-postgres');

  const brokerPort = Number(process.env.OPENDUET_E2E_BROKER_PORT) || (await freePort());
  const apiPort = Number(process.env.OPENDUET_E2E_RUNTIME_PORT) || (await freePort());
  const scopes = ['exec.run', 'exec.python', 'files.read', 'files.write', 'files.list'];
  // What a reply may cost. It is also what decides how much room is left for
  // the request: the input allowance is the model's window less this, so a cap
  // larger than the window leaves nothing for the conversation and every turn
  // is refused for size before it is ever sent.
  const { claims } = await seedJob(db.sql, {
    scopes,
    provider: 'files',
    budget: { max_output_tokens: 20_000 },
  });
  const execConnection = recordId('conn');
  await db.sql`insert into connection (id, space_id, provider, label, scopes)
    values (${execConnection}, ${claims.space_id}, 'exec', 'Cell', ${JSON.stringify(scopes)}::jsonb)`;
  const token = signCapability(claims, CAPABILITY_KEY);

  const workRoot = mkdtempSync(join(tmpdir(), 'openduet-e2e-exec-work-'));
  const spacesRoot = mkdtempSync(join(tmpdir(), 'openduet-e2e-exec-spaces-'));
  const workspace = join(workRoot, claims.job_id);
  mkdirSync(workspace, { recursive: true });

  const registry = await configuredConnectors({
    sql: db.sql,
    workRoot,
    spacesRoot,
    connections: [],
  });

  const captures: Record<string, unknown>[] = [];
  const scripted = createScriptedProvider([
    { tool: { name: 'load_tool', arguments: { name: 'exec.python' }, id: 'load_exec' } },
    { tool: { name: 'exec.python', arguments: { code: SNIPPET }, id: 'call_exec_1' } },
    { text: 'The snippet ran and out.csv is in the workspace.' },
  ]);
  const internal = createInternalServer({
    privacy: defaultPrivacyRouter(),
    artifactRoots: { workRoot, spacesRoot },
    sql: db.sql,
    connectors: registry,
    capabilityKey: CAPABILITY_KEY,
    approvalKey: APPROVAL_KEY,
    providers: [fakeProvider],
    defaultProvider: 'fake',
    fake: async (body, attemptId, protocol) => {
      assert.equal(attemptId, claims.attempt_id);
      captures.push(structuredClone(body));
      return scripted(body, attemptId, protocol);
    },
  });
  await new Promise<void>((resolve) => internal.server.listen(brokerPort, '127.0.0.1', resolve));
  log(`broker + gateway on 127.0.0.1:${brokerPort}`);
  process.env.OPENDUET_BROKER_URL = `http://127.0.0.1:${brokerPort}`;
  void createArtifactRecorder;

  const bundle: AttemptBundle = {
    attempt: {
      id: claims.attempt_id,
      job_id: claims.job_id,
      epoch: claims.epoch,
      revision: claims.revision,
      token,
    },
    job: {
      title: 'Produce the expense table',
      objective: 'Run a snippet that writes out.csv, then report.',
      constraints: {},
      progress_summary: '',
      unresolved_questions: [],
      deliverable: {},
    },
    inputs: { new_user_messages: [], approval_results: [], trigger_events: [], repair_briefs: [] },
    since_last: EMPTY_SINCE_LAST,
    transcript: [],
    tools: await internal.broker.catalog(claims),
    skills: [],
    knowledge: [],
    workspace: { mount: '/work', files: [] },
    budget: { max_turns: 4, max_output_tokens: 2000, max_wall_ms: 120_000, max_actions: 4 },
    model: { provider: 'fake', model: 'scripted', fallback: null },
  };

  const events: RuntimeEvent[] = [];
  const sink = { emit: async (event: RuntimeEvent) => void events.push(event) };
  const adapter = new HermesRuntimeAdapter({
    baseUrl: `http://127.0.0.1:${apiPort}`,
    token: API_KEY,
    catalogState: brokerCatalogState({ brokerUrl: `http://127.0.0.1:${brokerPort}` }),
    parkedActions: brokerParkedActions({
      brokerUrl: `http://127.0.0.1:${brokerPort}`,
      serviceKey: APPROVAL_KEY,
      spaceId: claims.space_id,
    }),
  });

  // The same rendered engine home the other end-to-end scripts build. This one
  // used to spell its own, which is how it came to be starting an engine with
  // both built-in memory stores on.
  const home = hermesHome(brokerPort, apiPort, token);
  const runtime = startRuntime(home, apiPort, token, claims.attempt_id, claims.job_id, workspace);
  try {
    log(`cold start: ${await waitForApi(apiPort)} ms`);
    const outcome = await adapter.start(bundle, sink, new AbortController().signal);
    log(`outcome: ${JSON.stringify(outcome)}`);
    log(`events: ${events.map((e) => e.type).join(', ')}`);
    assert.equal(outcome.kind, 'completed');
    const names = (body: Record<string, unknown>) =>
      ((body.tools ?? []) as { function?: { name?: string } }[]).map((tool) => tool.function?.name);
    assert(captures.length >= 3, 'The engine must load the tool, execute it and report.');
    assert(!names(captures[0] ?? {}).includes('exec.python'));
    assert(
      captures.slice(1).some((body) => names(body).includes('exec.python')),
      'The execution schema must reach the provider after loading.',
    );
    assert(
      captures.some((body) =>
        ((body.messages ?? []) as { role?: string; content?: unknown }[]).some(
          (message) =>
            message.role === 'tool' &&
            typeof message.content === 'string' &&
            message.content.includes('schema_fingerprint') &&
            message.content.includes('exec.python'),
        ),
      ),
      'Discovery must return the execution schema fingerprint.',
    );

    const actions = await db.sql`select id, kind, status, effect_class, receipt from action
      where job_id = ${claims.job_id} order by created_at`;
    log(`actions: ${JSON.stringify(actions.map(({ receipt: _r, ...rest }) => rest))}`);
    const execution = actions.find((row) => row.kind === 'exec.python');
    if (!execution)
      throw new Error(
        `the ledger has no execution; provider requests: ${JSON.stringify(captures)}`,
      );
    assert.equal(actions.length, 1, 'The snippet must execute exactly once.');
    log(`ledger receipt: ${JSON.stringify(execution.receipt?.detail)}`);
    assert.equal(execution.receipt?.detail?.command, SNIPPET);
    assert.equal(execution.receipt?.detail?.language, 'python');
    assert.equal(execution.receipt?.detail?.exit_code, 0);
    assert.equal(execution.receipt?.detail?.timed_out, false);
    if (execution.status !== 'succeeded')
      throw new Error(`the execution is ${execution.status}, not succeeded`);
    if (execution.effect_class !== 'write_reversible')
      throw new Error(`the execution is ${execution.effect_class}, not write_reversible`);

    const approvals = await db.sql`select count(*)::int as n from approval
      where action_id = ${execution.id}`;
    log(`approvals asked for the execution: ${approvals[0]?.n}`);
    if (approvals[0]?.n !== 0) throw new Error('an execution should not have parked for approval');

    const produced = readFileSync(join(workspace, 'out.csv'), 'utf8');
    log(`out.csv:\n${produced}`);
    assert.equal(
      produced.replaceAll('\r\n', '\n'),
      'item,amount\ndesk,60.0\nchair,40.0\nTotal,100.0\n',
    );
    log('PASS: the snippet ran in the cell and the ledger records it without approval');
  } finally {
    await runtime.stop();
    writeFileSync(join(home, 'runtime.log'), runtime.log(), 'utf8');
    writeFileSync(join(home, 'provider-requests.json'), `${JSON.stringify(captures, null, 2)}\n`);
    log(`runtime log: ${join(home, 'runtime.log')}`);
    await new Promise<void>((resolve) => internal.server.close(() => resolve()));
    await db.close();
  }
}

await main();
