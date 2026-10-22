import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReadinessResult, TestResult } from './ModelConnect.tsx';
import { primaryModelReady } from './readiness.ts';

test('handoff readiness requires all three stages for the exact connected active model', () => {
  const selection = {
    active: { provider: 'openai', model: 'selected', connected: true },
    readiness: {
      provider: 'openai' as const,
      model: 'selected',
      credentials: 'passed' as const,
      inference: 'passed' as const,
      tools: 'passed' as const,
    },
  };
  expect(primaryModelReady(selection)).toBe(true);
  for (const stage of ['credentials', 'inference', 'tools'] as const)
    for (const status of ['failed', 'not_checked'] as const)
      expect(
        primaryModelReady({ ...selection, readiness: { ...selection.readiness, [stage]: status } }),
      ).toBe(false);
  expect(primaryModelReady({ ...selection, readiness: null })).toBe(false);
  expect(
    primaryModelReady({ ...selection, active: { ...selection.active, model: 'another-model' } }),
  ).toBe(false);
  expect(
    primaryModelReady({ ...selection, active: { ...selection.active, provider: 'anthropic' } }),
  ).toBe(false);
  expect(
    primaryModelReady({ ...selection, active: { ...selection.active, connected: false } }),
  ).toBe(false);
});

test('a successful provider model list explicitly does not claim inference or tools', () => {
  const html = renderToStaticMarkup(
    <TestResult result={{ ok: true, models: ['selected'], latency_ms: 3 }} />,
  );
  expect(html).toContain('Credentials accepted');
  expect(html).toContain('Inference and tool use are not checked');
  expect(html).not.toContain('Tool use verified: Yes');
});

test('the UI separates accepted credentials from failed inference and unchecked tools', () => {
  const html = renderToStaticMarkup(
    <ReadinessResult
      result={{
        provider: 'openai',
        model: 'selected',
        credentials: 'passed',
        inference: 'failed',
        tools: 'not_checked',
        code: 'billing',
        message: 'The provider reports a credit limit.',
        checked_at: '2026-10-23T00:00:00Z',
        usage: { requests: 1, output_tokens: 0 },
      }}
    />,
  );
  expect(html).toContain('Credentials accepted');
  expect(html).toContain('Model responded');
  expect(html).toContain('Not verified');
  expect(html).toContain('Tool use verified');
  expect(html).toContain('Not checked');
  expect(html).toContain('credit limit');
});
