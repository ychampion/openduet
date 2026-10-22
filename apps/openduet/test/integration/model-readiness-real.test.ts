import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnv } from '../../src/env.ts';
import { checkModelRuntime } from '../../src/gateway/model-readiness.ts';

const proof = process.env.OPENDUET_READINESS_RUNTIME_PROOF === '1' ? test : test.skip;
const docker = process.env.OPENDUET_READINESS_PROOF_DOCKER === '1';

/** Real pinned Hermes and the production gateway/plugin; the provider is scripted and costs nothing. */
for (const allowTool of [true, false])
  proof(
    `selected-model readiness through actual Hermes ${allowTool ? 'verifies the read-only fixture' : 'refuses a model that never calls the tool'}`,
    async () => {
      const work = docker
        ? (process.env.OPENDUET_WORK_DIR ?? '/work')
        : await mkdtemp(join(tmpdir(), 'openduet-readiness-proof-'));
      const calls: string[] = [];
      try {
        const result = await checkModelRuntime({
          env: loadEnv({
            ...process.env,
            NODE_ENV: 'test',
            OPENDUET_WORK_DIR: work,
            OPENDUET_RUNTIME_SUPERVISOR: docker ? 'docker' : 'process',
            OPENDUET_RUNTIME_ADAPTER: docker ? 'docker' : 'hermes',
          }),
          provider: 'openai-compatible',
          model: 'readiness-proof-model',
          actor: 'proof-owner',
          spaceId: 'proof-personal',
          providers: [
            {
              name: 'openai-compatible',
              baseUrl: 'https://models.example.test/v1/',
              apiKey: 'fixture-not-a-real-key',
              protocols: ['chat/completions'],
            },
          ],
          onOutcome: (outcome) => {
            if (outcome.kind !== 'completed')
              process.stdout.write(`Readiness runtime outcome: ${JSON.stringify(outcome)}\n`);
          },
          fetch: async (request) => {
            const body = (await request.json()) as {
              model: string;
              stream?: boolean;
              tools?: {
                function: {
                  name: string;
                  parameters: { properties?: { note_id?: { enum?: string[] } } };
                };
              }[];
              messages?: { role: string; content: unknown }[];
            };
            calls.push(body.model);
            expect(body.model).toBe('readiness-proof-model');
            const tool = body.tools?.find(
              (entry) => entry.function.parameters.properties?.note_id?.enum?.length,
            );
            const receipts =
              body.messages
                ?.filter((entry) => entry.role === 'tool')
                .map((entry) =>
                  typeof entry.content === 'string' ? entry.content : JSON.stringify(entry.content),
                )
                .join('\n') ?? '';
            const value = /"note_value"\s*:\s*"([a-f0-9]+)"/.exec(receipts)?.[1];
            const message = !allowTool
              ? { role: 'assistant', content: '{"note_value":"guessed"}' }
              : value
                ? { role: 'assistant', content: JSON.stringify({ note_value: value }) }
                : {
                    role: 'assistant',
                    content: null,
                    tool_calls: [
                      {
                        id: 'call_readiness_note',
                        type: 'function',
                        function: {
                          name: tool?.function.name ?? 'missing_tool',
                          arguments: JSON.stringify({
                            note_id: tool?.function.parameters.properties?.note_id?.enum?.[0],
                          }),
                        },
                      },
                    ],
                  };
            const finish = value || !allowTool ? 'stop' : 'tool_calls';
            const usage = { prompt_tokens: 500, completion_tokens: 40, total_tokens: 540 };
            if (!body.stream)
              return Response.json({
                id: 'readiness-proof',
                object: 'chat.completion',
                model: body.model,
                choices: [{ index: 0, message, finish_reason: finish }],
                usage,
              });
            const delta =
              'tool_calls' in message
                ? {
                    role: 'assistant',
                    tool_calls: message.tool_calls?.map((call) => ({ index: 0, ...call })),
                  }
                : message;
            return new Response(
              `${[
                {
                  id: 'readiness-proof',
                  object: 'chat.completion.chunk',
                  model: body.model,
                  choices: [{ index: 0, delta, finish_reason: null }],
                },
                {
                  id: 'readiness-proof',
                  object: 'chat.completion.chunk',
                  model: body.model,
                  choices: [{ index: 0, delta: {}, finish_reason: finish }],
                  usage,
                },
              ]
                .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
                .join('')}data: [DONE]\n\n`,
              { headers: { 'content-type': 'text/event-stream' } },
            );
          },
        });
        expect(result).toMatchObject({
          inference: 'passed',
          tools: allowTool ? 'passed' : 'failed',
          code: allowTool ? 'ready' : 'tool_compatibility',
        });
        expect(calls.length).toBeGreaterThanOrEqual(allowTool ? 2 : 1);
        expect(calls.length).toBeLessThanOrEqual(3);
      } finally {
        if (!docker) await rm(work, { recursive: true, force: true });
      }
    },
    75_000,
  );
