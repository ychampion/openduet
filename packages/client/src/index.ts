/**
 * @openduet/client is the typed way to talk to a OpenDuet service. The types are
 * generated from packages/contracts/openapi.json, so anything this client can
 * express, the API accepts, and a change to the contract breaks the callers
 * that need to know about it.
 */

export {
  createOpenDuetClient,
  errorMessage,
  type FetchCredentials,
  type OpenDuetClient,
  type OpenDuetClientOptions,
  openduetUrl,
  type QueryValue,
  type ResolvedClientOptions,
} from './client.ts';
export {
  fetchEventPage,
  type GapReason,
  type OpenDuetEvent,
  type OpenDuetStreamItem,
  parseEventData,
  type SubscribeOptions,
  subscribeEvents,
} from './events.ts';
export { parseFrame, readSse, type SseFrame, SseIdleError } from './sse.ts';
export type * from './types.ts';
