import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ForwardingNote } from './FeedbackPanel.tsx';

test('before Send, the report panel says when reports go on to whoever runs OpenDuet', () => {
  const said = renderToStaticMarkup(<ForwardingNote forwarded />);
  expect(said).toContain('your email address');
  expect(said).toContain('whoever runs OpenDuet here');
  // Kept here only, nothing is said.
  expect(renderToStaticMarkup(<ForwardingNote forwarded={false} />)).toBe('');
});
