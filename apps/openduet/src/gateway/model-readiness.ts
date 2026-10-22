/** A disposable, capability-scoped Hermes check. This broker has no real account tools. */
import { randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
import {
  type AttemptBundle,
  type AttemptOutcome,
  EMPTY_SINCE_LAST,
  type ModelReadiness,
  type RuntimeAdapter,
  type ToolSpec,
} from '@openduet/contracts';
import { HermesRuntimeAdapter } from '@openduet/runtime-hermes';
import type { Env } from '../env.ts';
import { newId } from '../ids.ts';
import { instanceId } from '../ops/instance.ts';
import { defaultPrivacyRouter } from '../privacy/index.ts';
import { DockerSocketApi, LocalCellHost } from '../runtime/cell-host-local.ts';
import { DockerHermesRuntimeAdapter } from '../runtime/docker.ts';
import {
  DockerRuntimeSupervisor,
  ProcessRuntimeSupervisor,
  type RuntimeSupervisor,
} from '../runtime/supervisor.ts';
import { LocalWorkspaceFs } from '../runtime/workspace-fs.ts';
import { dockerEndpoint } from '../sandbox/docker-default.ts';
import { createModelGateway } from './index.ts';
import {
  GatewayError,
  type GatewayProvider,
  type GatewaySettlement,
  type GatewaySpending,
} from './types.ts';

export const READINESS_LIMITS = { wallMs: 45_000, requests: 3, outputTokens: 1536 } as const;

export interface ReadinessProbeOptions {
  env: Env;
  provider: string;
  model: string;
  actor: string;
  spaceId: string;
  providers: GatewayProvider[];
  spending?: GatewaySpending;
  /** Only tests inject transports and runtime adapters; the API cannot select them. */
  fetch?: (request: Request) => Promise<Response>;
  onOutcome?: (outcome: AttemptOutcome) => void;
  runtime?: (
    brokerUrl: string,
    bundle: AttemptBundle,
  ) => Promise<{
    adapter: RuntimeAdapter;
    close(): Promise<void>;
  }>;
}

const failure = (code: ModelReadiness['code']): string => {
  switch (code) {
    case 'authentication':
      return 'The provider refused the credential. Reconnect this account or replace its API key.';
    case 'billing':
      return 'The provider reports a billing or credit limit. Check the provider account, then try again.';
    case 'model_unavailable':
      return 'The selected model is unavailable to this account. Check its exact ID and account access.';
    case 'endpoint':
      return 'The model endpoint could not serve this request. Check its address, protocol and server network.';
    case 'rate_limited':
      return 'The provider is limiting requests. Wait briefly, then try again.';
    case 'timeout':
      return 'The bounded check timed out. The selected model has not been verified; try again when it can respond promptly.';
    case 'tool_compatibility':
      return 'The model responded, but did not read the fixture note and return the required result. Tool use is not verified.';
    case 'runtime_unavailable':
      return 'The Hermes runtime could not start. Check the runtime image or Python installation and retry.';
    default:
      return 'The selected model did not produce a usable response. Check provider access and retry.';
  }
};

export function readinessFailureCode(
  settlement?: GatewaySettlement,
  reason = '',
): ModelReadiness['code'] {
  switch (settlement?.failure) {
    case 'key_refused':
      return 'authentication';
    case 'quota':
      return 'billing';
    case 'model_not_found':
      return 'model_unavailable';
    case 'rate_limited':
      return 'rate_limited';
    case 'provider_down':
      return 'endpoint';
    default:
      if (
        /provider_key_(?:unavailable|refused)|provider_sign_in_required|provider_credential_unavailable/.test(
          reason,
        )
      )
        return 'authentication';
      if (/spending_limit_reached|provider_quota/.test(reason)) return 'billing';
      if (
        /protocol_not_supported|endpoint_not_found|provider_denied|provider_unreachable/.test(
          reason,
        )
      )
        return 'endpoint';
      return settlement?.httpStatus === 400 ? 'tool_compatibility' : 'inference';
  }
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

function hasFixtureResult(summary: string, noteValue: string): boolean {
  try {
    const answer: unknown = JSON.parse(
      summary.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/, '$1'),
    );
    return Boolean(
      answer &&
        typeof answer === 'object' &&
        !Array.isArray(answer) &&
        Object.keys(answer).length === 1 &&
        (answer as { note_value?: unknown }).note_value === noteValue,
    );
  } catch {
    return false;
  }
}

export async function checkModelRuntime(options: ReadinessProbeOptions): Promise<{
  inference: ModelReadiness['inference'];
  tools: ModelReadiness['tools'];
  credentialsAccepted: boolean;
  code: ModelReadiness['code'];
  message: string;
  usage: ModelReadiness['usage'];
}> {
  if (
    options.provider === 'fake' ||
    options.providers.some((p) => p.name === options.provider && p.fake)
  )
    throw new Error('Readiness cannot use a practice provider');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), READINESS_LIMITS.wallMs);
  const token = randomBytes(32).toString('base64url');
  const noteId = randomBytes(12).toString('hex');
  // The answer is absent from the prompt. Only the exact read can reveal it.
  const noteValue = randomBytes(12).toString('hex');
  const connectionId = newId('conn');
  const actionId = newId('act');
  const jobId = newId('job');
  const attemptId = newId('att');
  const tool: ToolSpec = {
    name: 'readiness.read_note',
    description:
      'Read the disposable model-check note by its note_id. Read-only; no external accounts.',
    input_schema: {
      type: 'object',
      properties: { note_id: { type: 'string', enum: [noteId] } },
      required: ['note_id'],
      additionalProperties: false,
    },
    connection_id: connectionId,
    effect_class: 'read',
  };
  let read = false;
  let requests = 0;
  let outputTokens = 0;
  let heldTokens = 0;
  let runtimeStarted = false;
  const settlements: GatewaySettlement[] = [];
  const bundle: AttemptBundle = {
    attempt: { id: attemptId, job_id: jobId, epoch: 1, revision: 0, token },
    job: {
      title: 'Check selected model',
      objective: `This is a bounded connection check, not a real user task. Call readiness.read_note with note_id ${noteId}. Return only a JSON object {"note_value":"the value read from the note"}. Do not guess. Do not call any other tool.`,
      constraints: {},
      progress_summary: '',
      unresolved_questions: [],
      deliverable: {},
    },
    inputs: { new_user_messages: [], approval_results: [], trigger_events: [], repair_briefs: [] },
    since_last: EMPTY_SINCE_LAST,
    transcript: [],
    tools: [tool],
    skills: [],
    knowledge: [],
    workspace: { mount: '/work', files: [] },
    budget: {
      max_turns: 3,
      max_output_tokens: READINESS_LIMITS.outputTokens,
      max_wall_ms: READINESS_LIMITS.wallMs,
      max_actions: 1,
    },
    model: { provider: options.provider, model: options.model, fallback: null },
  };
  const gateway = createModelGateway({
    privacy: defaultPrivacyRouter(),
    providers: options.providers.filter((p) => p.name === options.provider && !p.fake),
    defaultProvider: options.provider,
    defaultMaxTokens: 512,
    timeoutMs: 20_000,
    spending: options.spending,
    ...(options.fetch ? { fetch: options.fetch } : {}),
    authenticate: async (candidate) => {
      if (candidate !== token || controller.signal.aborted)
        throw new GatewayError(401, 'capability_required');
      return {
        jobId,
        attemptId,
        epoch: 1,
        revision: 0,
        actor: options.actor,
        privacy: {
          kind: 'service',
          purpose: 'model-readiness',
          spaceId: options.spaceId,
          sourceJobId: null,
        },
        maxRequests: READINESS_LIMITS.requests,
        maxTokens: Math.max(1, READINESS_LIMITS.outputTokens - heldTokens),
        remainingTokens: Math.max(1, READINESS_LIMITS.outputTokens - heldTokens),
        maxInputTokens: 16_000,
        allowedModels: [{ provider: options.provider, model: options.model }],
      };
    },
    budget: {
      reserve: async (request) => {
        if (
          ++requests > READINESS_LIMITS.requests ||
          heldTokens + request.maxOutputTokens > READINESS_LIMITS.outputTokens
        )
          throw new GatewayError(429, 'token_cap_exceeded');
        heldTokens += request.maxOutputTokens;
        return { id: crypto.randomUUID() };
      },
      settle: async (_reservation, settlement) => {
        settlements.push(settlement);
        outputTokens += settlement.usage?.outputTokens ?? 0;
      },
    },
    brokerFetch: async (request) => {
      if (request.headers.get('authorization') !== `Bearer ${token}` || controller.signal.aborted)
        return Response.json({ error: { code: 'capability_required' } }, { status: 401 });
      const path = new URL(request.url).pathname;
      if (request.method === 'GET' && path === '/tools') return Response.json({ tools: [tool] });
      if (request.method === 'GET' && path === `/actions/${actionId}` && read)
        return Response.json({
          action: { id: actionId, receipt: { note_id: noteId, note_value: noteValue } },
        });
      if (request.method === 'POST' && path === '/actions') {
        const body = (await request.json()) as {
          kind?: string;
          connection_id?: string;
          payload?: Record<string, unknown>;
        };
        if (
          body.kind === tool.name &&
          body.connection_id === connectionId &&
          body.payload?.note_id === noteId &&
          Object.keys(body.payload).length === 1
        ) {
          read = true;
          return Response.json({
            action_id: actionId,
            status: 'succeeded',
            requires_approval: false,
          });
        }
      }
      return Response.json(
        {
          error: {
            code: 'readiness_scope',
            message: 'Only the disposable fixture note can be read during this check.',
          },
        },
        { status: 403 },
      );
    },
  });
  let runtime: Awaited<ReturnType<NonNullable<ReadinessProbeOptions['runtime']>>> | undefined;
  let supervisor: RuntimeSupervisor | undefined;
  let ownWorkspace = false;
  let capabilitiesDuringStart = false;
  try {
    const docker =
      options.env.OPENDUET_RUNTIME_SUPERVISOR === 'docker' ||
      options.env.OPENDUET_RUNTIME_ADAPTER === 'docker';
    // Docker engines use the configured service hostname on their internal network.
    await new Promise<void>((resolve, reject) => {
      gateway.once('error', reject);
      gateway.listen(0, docker ? '0.0.0.0' : '127.0.0.1', resolve);
    });
    const address = gateway.address();
    if (!address || typeof address === 'string') throw new Error('Readiness listener unavailable');
    const broker = new URL(
      docker ? (options.env.OPENDUET_BROKER_URL ?? 'http://openduet:3112') : 'http://127.0.0.1',
    );
    broker.port = String(address.port);
    const brokerUrl = broker.origin;
    if (options.runtime) runtime = await options.runtime(brokerUrl, bundle);
    else if (options.env.OPENDUET_RUNTIME_ADAPTER === 'docker') {
      const owner = instanceId(options.env.OPENDUET_INSTANCE_ID);
      const host = new LocalCellHost({
        project: options.env.OPENDUET_COMPOSE_PROJECT,
        image: options.env.OPENDUET_RUNTIME_IMAGE,
        workRoot: options.env.OPENDUET_WORK_DIR,
        workVolume: options.env.OPENDUET_WORK_VOLUME,
        docker: new DockerSocketApi(dockerEndpoint(options.env)),
        instance: { id: owner, running: async () => new Set([owner]) },
      });
      const adapter = new DockerHermesRuntimeAdapter({
        project: options.env.OPENDUET_COMPOSE_PROJECT,
        image: options.env.OPENDUET_RUNTIME_IMAGE,
        socket: dockerEndpoint(options.env),
        workRoot: options.env.OPENDUET_WORK_DIR,
        workVolume: options.env.OPENDUET_WORK_VOLUME,
        probeUrl: options.env.OPENDUET_RUNTIME_URL,
        probeKey: options.env.OPENDUET_RUNTIME_KEY ?? token,
        brokerPort: address.port,
        startTimeoutMs: 25_000,
        parkedActions: async () => [],
        host: {
          id: host.id,
          verify: () => host.verify(),
          // The application's supervisor owns reconciliation. A check must not sweep its cells.
          reconcile: async () => {},
          cell: (spec) => host.cell(spec),
        },
      });
      runtime = { adapter, close: () => adapter.close() };
      ownWorkspace = true;
      // start() verifies the actual newly created cell, rather than the shared warm probe.
      capabilitiesDuringStart = true;
    } else {
      const Supervisor = docker ? DockerRuntimeSupervisor : ProcessRuntimeSupervisor;
      supervisor = new Supervisor({
        workRoot: options.env.OPENDUET_WORK_DIR,
        brokerUrl,
        engineRoot: options.env.OPENDUET_HERMES_ROOT,
        python: options.env.OPENDUET_HERMES_PYTHON,
        runtimePackage: options.env.OPENDUET_RUNTIME_PACKAGE,
        dockerImage: options.env.OPENDUET_RUNTIME_IMAGE,
        dockerNetwork: options.env.OPENDUET_RUNTIME_NETWORK,
        dockerWorkVolume: options.env.OPENDUET_RUNTIME_WORK_VOLUME,
        startupTimeoutMs: 25_000,
      });
      const instance = await supervisor.launch(bundle, controller.signal);
      ownWorkspace = true;
      runtime = {
        adapter: new HermesRuntimeAdapter({
          baseUrl: instance.baseUrl,
          token: instance.token,
          parkedActions: async () => [],
        }),
        close: () => instance.stop(),
      };
    }
    if (!capabilitiesDuringStart) {
      await runtime.adapter.capabilities();
      runtimeStarted = true;
    }
    const outcome = await runtime.adapter.start(
      bundle,
      { emit: async () => {} },
      controller.signal,
    );
    runtimeStarted = true;
    options.onOutcome?.(outcome);
    const inferred = settlements.some(
      (s) => s.status === 'succeeded' && s.provider === options.provider,
    );
    const structured = outcome.kind === 'completed' && hasFixtureResult(outcome.summary, noteValue);
    const ready = inferred && read && structured;
    const code = ready
      ? 'ready'
      : inferred
        ? 'tool_compatibility'
        : readinessFailureCode(settlements.at(-1), outcome.kind === 'failed' ? outcome.reason : '');
    return {
      inference: inferred ? 'passed' : 'failed',
      tools: ready ? 'passed' : inferred ? 'failed' : 'not_checked',
      credentialsAccepted: inferred,
      code,
      message: ready
        ? 'The selected model responded through Hermes, read the disposable note with the allowed tool, and returned its value. This checks compatibility, not general intelligence.'
        : failure(code),
      usage: {
        requests: Math.min(requests, READINESS_LIMITS.requests),
        output_tokens: outputTokens,
      },
    };
  } catch {
    const inferred = settlements.some((s) => s.status === 'succeeded');
    const code = controller.signal.aborted
      ? 'timeout'
      : settlements.length
        ? readinessFailureCode(settlements.at(-1))
        : runtimeStarted
          ? 'endpoint'
          : 'runtime_unavailable';
    return {
      inference: inferred ? 'passed' : 'failed',
      tools: inferred ? 'failed' : 'not_checked',
      credentialsAccepted: inferred,
      code,
      message: failure(code),
      usage: {
        requests: Math.min(requests, READINESS_LIMITS.requests),
        output_tokens: outputTokens,
      },
    };
  } finally {
    clearTimeout(timer);
    controller.abort();
    await runtime?.close().catch(() => {});
    await supervisor?.close().catch(() => {});
    if (ownWorkspace || supervisor)
      await new LocalWorkspaceFs(options.env.OPENDUET_WORK_DIR).remove(jobId).catch(() => {});
    if (gateway.listening) await closeServer(gateway);
  }
}
