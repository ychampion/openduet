import { expect, test } from 'bun:test';
import { API_BASE_URL } from './adapter.ts';

test('a build that was not told the API address uses its own /api, not the mock', () => {
  // Outside development, with no VITE_OPENDUET_API, the client talks to the
  // origin it was served from; the development mock is never the default.
  expect(import.meta.env.VITE_OPENDUET_API).toBeUndefined();
  expect(API_BASE_URL).toBe('http://localhost/api');
});
