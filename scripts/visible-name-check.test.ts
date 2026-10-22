import { expect, test } from 'bun:test';
import { visibleNames } from './visible-name-check.ts';

const file = 'apps/web/src/screens/Planted.tsx';

test('a literal name in JSX text or a read attribute is caught', () => {
  const source = `export const A = () => (
  <div title="About OpenDuet">
    <p>OpenDuet checks what it needs.</p>
    <input placeholder="Ask OpenDuet to handle something" aria-label={'OpenDuet says'} />
    <span>{busy ? 'OpenDuet is working' : 'Done'}</span>
  </div>
);`;
  expect(visibleNames(file, source).map((finding) => finding.line)).toEqual([2, 3, 4, 4, 5]);
});

test('names read from the installation, code names and comments pass', () => {
  const source = `import { OpenDuetMark } from '../design/mark.tsx';
// OpenDuet is the default name.
export const A = () => (
  <div title={instanceName()}>
    {/* OpenDuet draws this */}
    <OpenDuetMark width={20} />
    <p>{assistantName()} checks what it needs.</p>
    <input placeholder={\`Ask \${assistantName()} to handle something\`} data-x="OpenDuet" />
  </div>
);`;
  expect(visibleNames(file, source)).toEqual([]);
});

test('the allow-list covers only its own file and words', () => {
  const line = '<p>On the computer, from a copy of OpenDuet with Bun installed:</p>';
  expect(visibleNames('apps/web/src/screens/Devices.tsx', line)).toEqual([]);
  expect(visibleNames(file, line)).toHaveLength(1);
});
