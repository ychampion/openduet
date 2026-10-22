import type { ModelReadiness } from './api.ts';

type Selection = {
  active: { connected: boolean; provider: string; model: string };
  readiness?: Pick<
    ModelReadiness,
    'provider' | 'model' | 'credentials' | 'inference' | 'tools'
  > | null;
};

/** The server only returns evidence for the current configuration; every stage must agree. */
export function primaryModelReady(settings: Selection | null | undefined): boolean {
  return Boolean(
    settings?.active.connected &&
      settings.readiness?.provider === settings.active.provider &&
      settings.readiness?.model === settings.active.model &&
      settings.readiness?.credentials === 'passed' &&
      settings.readiness?.inference === 'passed' &&
      settings.readiness?.tools === 'passed',
  );
}
