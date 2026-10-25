import { expect, test } from 'bun:test';
import { readExtractionReply } from '../../apps/openduet/src/memory/extract.ts';
import { startScriptedProvider } from './provider.ts';
import { parseScenario } from './schema.ts';

test('two providers bound to ephemeral ports serve their own requests', async () => {
  const first = await startScriptedProvider(0);
  let second: Awaited<ReturnType<typeof startScriptedProvider>> | undefined;
  try {
    second = await startScriptedProvider(0);
    const request = {
      question: 'Unknown fact?',
      key: 'unknown',
      mode: 'current' as const,
      items: [],
    };
    expect((await first.ask(request)).answer).toBeNull();
    expect(first.calls.answer).toBe(1);
    expect(second.calls.answer).toBe(0);
    expect((await second.ask(request)).answer).toBeNull();
    expect(first.calls.answer).toBe(1);
    expect(second.calls.answer).toBe(1);
  } finally {
    second?.close();
    first.close();
  }
});

test('remembered facts and standing preferences survive while one-time requests stay no-ops', async () => {
  const provider = await startScriptedProvider(0);
  const source = { source_id: 'src_01ARZ3NDEKTSV4RRFFQ69G5FAV', source_version: '1' };
  const cases = [
    {
      path: 'scenarios/continuing-work/interrupted-work-resumes.json',
      name: 'venue-brief',
      request: 'Book the offsite venue for 4 September 2026.',
    },
    {
      path: 'scenarios/low-value-memory/noise-does-not-crowd-out.json',
      name: 'noise-reminder',
      request: 'Remind me ten minutes ahead.',
    },
    {
      path: 'scenarios/stable-personalization/recurring-plan-format.json',
      name: 'plan-day',
      request: 'Schedule my planning session on Mondays.',
    },
  ];
  try {
    for (const item of cases) {
      const scenario = parseScenario(
        await Bun.file(new URL(item.path, import.meta.url)).json(),
        item.path,
      );
      const step = scenario.steps.find((step) => step.step === 'say' && step.name === item.name);
      if (step?.step !== 'say' || !step.claim) throw new Error(`Missing fixture ${item.name}`);
      provider.script(source.source_id, {
        ...step.claim,
        valid_from: step.event_time,
        cite: null,
      });
      for (const [text, op] of [
        [item.request, 'no-op'],
        [step.text, 'add'],
      ] as const) {
        const raw = await provider.gateway.chat({
          messages: [
            { role: 'user', content: JSON.stringify({ evidence: { source, start: 0, text } }) },
          ],
          max_tokens: 400,
          signal: AbortSignal.timeout(5000),
        });
        const parsed = readExtractionReply(raw, { ...source, start: 0, text });
        expect(parsed.proposals.map((proposal) => proposal.op)).toEqual([op]);
        if (op === 'add')
          expect(parsed.proposals[0]).toMatchObject({
            domain_key: step.claim.key,
            content: step.claim.content,
            sources: [{ quote: step.text }],
          });
      }
    }
    expect(provider.calls.extraction).toBe(6);
  } finally {
    provider.close();
  }
});
