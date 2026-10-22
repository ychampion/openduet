/** Keep inherited names out of shipped code while retaining legal provenance. */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const previousName = new RegExp(['me', 'lete'].join(''), 'i');
const attribution = new Set(['NOTICE', 'docs/PROVENANCE.md']);
const root = resolve(import.meta.dir, '..');
const listed = Bun.spawnSync(
  ['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
  { cwd: root },
);
if (listed.exitCode !== 0) throw new Error('Could not inspect release files');
const findings: string[] = [];
for (const path of new Set(listed.stdout.toString().split('\0').filter(Boolean))) {
  const file = resolve(root, path);
  if (!existsSync(file)) continue;
  if (previousName.test(path)) findings.push(`${path}: inherited file name`);
  if (attribution.has(path)) continue;
  const bytes = readFileSync(file);
  if (bytes.includes(0)) continue;
  const text = bytes.toString('utf8');
  if (previousName.test(text)) findings.push(`${path}: inherited product name`);
  // HTTP replays carry response bodies as base64; raw source scans miss names
  // inside those payloads even after the readable fixture body is renamed.
  for (const match of text.matchAll(/"base64"\s*:\s*"([A-Za-z0-9+/=]+)"/g)) {
    if (previousName.test(Buffer.from(match[1] ?? '', 'base64').toString('utf8'))) {
      findings.push(`${path}: inherited product name in encoded payload`);
      break;
    }
  }
}
if (findings.length) {
  process.stderr.write(`${findings.join('\n')}\n`);
  process.exitCode = 1;
} else process.stdout.write('OpenDuet branding: paths, text and encoded payloads passed\n');
