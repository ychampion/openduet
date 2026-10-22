import { expect, spyOn, test } from 'bun:test';
import type { AttemptBundle, RuntimeAdapter } from '@openduet/contracts';
import { loadEnv } from '../env.ts';
import { checkModelRuntime, type ReadinessProbeOptions } from './model-readiness.ts';

const provider = {
  name: 'openai',
  baseUrl: 'https://api.openai.com/v1/',
  apiKey: 'fixture-key-only',
  protocols: ['chat/completions' as const],
};

/** Scripted adapter exercises the real gateway and capability broker, without a live model. */
function probe(
  options: {
    status?: number;
    text?: string;
    read?: boolean;
    badResult?: boolean;
    triesOutside?: boolean;
  } = {},
) {
  const seen: { url: string; model: unknown }[] = [];
  let checkedBundle: AttemptBundle | undefined;
  const setup: ReadinessProbeOptions = {
    env: loadEnv({ NODE_ENV: 'test' }),
    provider: 'openai',
    model: 'selected-fixture',
    actor: 'owner',
    spaceId: 'personal',
    providers: [provider],
    fetch: async (request) => {
      seen.push({ url: request.url, model: ((await request.json()) as { model: string }).model });
      return options.status
        ? new Response(options.text ?? 'refused', { status: options.status })
        : Response.json({
            model: 'selected-fixture',
            choices: [
              { message: { role: 'assistant', content: 'fixture' }, finish_reason: 'stop' },
            ],
            usage: { prompt_tokens: 40, completion_tokens: 4, total_tokens: 44 },
          });
    },
    runtime: async (broker, bundle) => {
      checkedBundle = bundle;
      const auth = {
        authorization: `Bearer ${bundle.attempt.token}`,
        'content-type': 'application/json',
      };
      const adapter: RuntimeAdapter = {
        capabilities: async () => ({
          tools: true,
          streaming: true,
          interrupt: true,
          version: 'scripted-test',
        }),
        start: async () => {
          const inference = await fetch(`${broker}/providers/openai/v1/chat/completions`, {
            method: 'POST',
            headers: {
              ...auth,
              authorization: `Bearer openduet-surrogate-${bundle.attempt.id}`,
              'x-openduet-capability': bundle.attempt.token,
            },
            body: JSON.stringify({
              model: bundle.model.model,
              messages: [{ role: 'user', content: 'Read the check note.' }],
              max_tokens: 32,
            }),
          });
          await inference.text();
          if (!inference.ok)
            return { kind: 'failed', reason: 'provider refused', retryable: false };
          if (options.triesOutside) {
            const denied = await fetch(`${broker}/actions`, {
              method: 'POST',
              headers: auth,
              body: JSON.stringify({
                kind: 'email.send',
                connection_id: 'real',
                payload: { to: 'person@example.test' },
              }),
            });
            expect(denied.status).toBe(403);
            const wrongToken = await fetch(`${broker}/tools`, {
              headers: { authorization: 'Bearer other-check' },
            });
            expect(wrongToken.status).toBe(401);
          }
          if (!options.read)
            return { kind: 'completed', summary: '{"note_value":"guessed"}', evidence: [] };
          const catalog = (await (await fetch(`${broker}/tools`, { headers: auth })).json()) as {
            tools: {
              name: string;
              connection_id: string;
              input_schema: { properties: { note_id: { enum: string[] } } };
            }[];
          };
          const tool = catalog.tools[0];
          if (!tool) throw new Error('Missing fixture tool');
          const action = (await (
            await fetch(`${broker}/actions`, {
              method: 'POST',
              headers: auth,
              body: JSON.stringify({
                kind: tool.name,
                connection_id: tool.connection_id,
                payload: { note_id: tool.input_schema.properties.note_id.enum[0] },
              }),
            })
          ).json()) as { action_id: string };
          const receipt = (await (
            await fetch(`${broker}/actions/${action.action_id}`, { headers: auth })
          ).json()) as { action: { receipt: { note_value: string } } };
          return {
            kind: 'completed',
            evidence: [],
            summary: JSON.stringify({
              note_value: options.badResult ? 'wrong' : receipt.action.receipt.note_value,
            }),
          };
        },
      };
      return { adapter, close: async () => {} };
    },
  };
  return { run: () => checkModelRuntime(setup), seen, bundle: () => checkedBundle };
}

test('an inference response without the required tool call is not tool-ready', async () => {
  const scripted = probe();
  expect(await scripted.run()).toMatchObject({
    inference: 'passed',
    tools: 'failed',
    code: 'tool_compatibility',
  });
  expect(scripted.seen).toEqual([
    { url: 'https://api.openai.com/v1/chat/completions', model: 'selected-fixture' },
  ]);
  expect(scripted.bundle()?.model).toEqual({
    provider: 'openai',
    model: 'selected-fixture',
    fallback: null,
  });
});

test('only a real fixture read plus its structured returned value verifies tools; outward calls are denied', async () => {
  expect(await probe({ read: true, triesOutside: true }).run()).toMatchObject({
    inference: 'passed',
    tools: 'passed',
    code: 'ready',
    usage: { requests: 1, output_tokens: 4 },
  });
  expect(await probe({ read: true, badResult: true }).run()).toMatchObject({
    tools: 'failed',
    code: 'tool_compatibility',
  });
});

test('provider failures distinguish authentication, billing, missing models and endpoints', async () => {
  for (const [status, text, code] of [
    [401, 'bad key', 'authentication'],
    [402, 'credits', 'billing'],
    [404, 'model not found', 'model_unavailable'],
    [503, 'offline', 'endpoint'],
  ] as const)
    expect(await probe({ status, text }).run()).toMatchObject({
      inference: 'failed',
      tools: 'not_checked',
      code,
    });
});

test('a readiness refusal reaches its named operator log with the provider key redacted', async () => {
  const stderr = spyOn(process.stderr, 'write').mockImplementation(() => true);
  try {
    const result = await probe({
      status: 400,
      text: JSON.stringify({
        error: {
          type: 'invalid_request_error',
          message: 'unsupported tool schema; credential fixture-key-only',
        },
      }),
    }).run();
    const logged = stderr.mock.calls.map((call) => String(call[0])).join('');
    expect(logged).toContain(
      'model-readiness gateway: provider_rejected: openai/selected-fixture answered 400 (invalid_request_error: unsupported tool schema; credential [redacted])',
    );
    expect(logged).not.toContain(provider.apiKey);
    expect(result).toMatchObject({ inference: 'failed', tools: 'not_checked' });
    expect(result.message).not.toContain('unsupported tool schema');
    expect(result.message).not.toContain(provider.apiKey);
  } finally {
    stderr.mockRestore();
  }
});

test('a practice provider is refused before launching or calling anything', async () => {
  await expect(
    checkModelRuntime({
      env: loadEnv({ NODE_ENV: 'test' }),
      provider: 'fake',
      model: 'practice',
      actor: 'owner',
      spaceId: 'personal',
      providers: [],
    }),
  ).rejects.toThrow('practice provider');
});
