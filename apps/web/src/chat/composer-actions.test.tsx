import { afterAll, beforeAll, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { Composer } from './Composer.tsx';

const originalWindow = (globalThis as { window?: unknown }).window;
beforeAll(() => {
  Object.assign(globalThis, {
    window: {
      matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
      addEventListener() {},
      removeEventListener() {},
      localStorage: { getItem: () => null, setItem() {} },
    },
  });
});
afterAll(() => {
  if (originalWindow === undefined) delete (globalThis as { window?: unknown }).window;
  else Object.assign(globalThis, { window: originalWindow });
});

test('active work keeps the Send control visible rather than replacing it with Stop', () => {
  const html = renderToStaticMarkup(
    <Composer
      value="An independent request"
      onChange={() => {}}
      onSend={() => {}}
      working
      state="stop"
      onStop={() => {}}
    />,
  );
  expect(html).toContain('aria-label="Send"');
  expect(html).not.toContain('aria-label="Stop"');
  expect(html).not.toContain('press Stop');
});

test('paused work can be resumed without hiding Send', () => {
  const html = renderToStaticMarkup(
    <Composer
      value="Continue with this correction"
      onChange={() => {}}
      onSend={() => {}}
      state="resume"
      onResume={() => {}}
    />,
  );
  expect(html).toContain('aria-label="Send"');
  expect(html).toContain('aria-label="Resume this task"');
});

test('an unavailable submission never presents an enabled Send button', () => {
  const html = renderToStaticMarkup(
    <Composer value="Keep these notes" onChange={() => {}} onSend={() => {}} disabled />,
  );
  expect(html).toMatch(/aria-label="Send"[^>]*disabled/);
});
