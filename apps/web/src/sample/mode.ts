import { isolatedSampleFetch } from './transport.ts';

export const sampleMode = import.meta.env.VITE_OPENDUET_SAMPLE === 'on';

// This module loads before the application adapters capture fetch. A typo in a
// demo URL fails closed instead of falling through to an authenticated service.
if (sampleMode && typeof window !== 'undefined') {
  const configured = import.meta.env.VITE_OPENDUET_API;
  const api = new URL(typeof configured === 'string' ? configured : 'https://invalid.example');
  window.fetch = isolatedSampleFetch(window.fetch.bind(window), api, new URL(window.location.href));
  document.documentElement.dataset.sampleDay = 'true';
}
