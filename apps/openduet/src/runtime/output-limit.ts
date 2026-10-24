import type { AttemptBundle } from '@openduet/contracts';

/** Bound the engine's explicit output request before it reaches the gateway's hard ceiling. */
export function runtimeOutputLimit(
  budget: Pick<AttemptBundle['budget'], 'max_output_tokens'> | undefined,
  configured = 4096,
): number {
  return Math.min(configured, budget?.max_output_tokens ?? configured);
}
