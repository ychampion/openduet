import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

type Visit = { id: string; pid: number; preload: string };
type Result = {
  exitCode: number;
  stdout: string;
  stderr: string;
  visits: Visit[];
  preloadPids: number[];
};
type Fixture = { ids: string[]; run: (args?: string[], fail?: string) => Promise<Result> };

async function withFixtures(check: (fixture: Fixture) => Promise<void>, count = 32) {
  const root = await mkdtemp(join(tmpdir(), 'openduet-test-runner-'));
  const journal = join(root, 'visits.jsonl');
  const preloads = join(root, 'preloads.jsonl');
  const runner = resolve(import.meta.dir, '../../scripts/test.ts');
  const ids = Array.from(
    { length: count },
    (_, index) => `fixture${String(index).padStart(2, '0')}`,
  );
  let active: ReturnType<typeof Bun.spawn> | undefined;
  try {
    // Children own their preload; the repository's database preload stays outside.
    await writeFile(join(root, 'bunfig.toml'), '[test]\npreload = ["./fixture-preload.ts"]\n');
    await writeFile(
      join(root, 'fixture-preload.ts'),
      `import { appendFileSync } from 'node:fs';
appendFileSync(process.env.OPENDUET_RUNNER_PRELOADS, process.pid + '\\n');
globalThis.runnerPreload = process.env.OPENDUET_RUNNER_SENTINEL;\n`,
    );
    // Discovering the runner's own filename would recursively start another full suite.
    await mkdir(join(root, 'scripts'));
    await writeFile(
      join(root, 'scripts/test.ts'),
      "throw new Error('Native Bun unexpectedly discovered scripts/test.ts');\n",
    );
    await Promise.all(
      ids.map((id) =>
        writeFile(
          join(root, `${id}.test.ts`),
          `import { expect, test } from 'bun:test';
import { appendFileSync } from 'node:fs';
test(${JSON.stringify(id)}, () => {
  appendFileSync(process.env.OPENDUET_RUNNER_VISITS, JSON.stringify({
    id: ${JSON.stringify(id)}, pid: process.pid, preload: globalThis.runnerPreload,
  }) + '\\n');
  expect(globalThis.runnerPreload).toBe('owned-runner-preload');
  if (process.env.OPENDUET_RUNNER_FAIL === ${JSON.stringify(id)})
    throw new Error('Intentional runner fixture failure: ' + ${JSON.stringify(id)});
});\n`,
        ),
      ),
    );

    async function run(args: string[] = [], fail = ''): Promise<Result> {
      await writeFile(journal, '');
      await writeFile(preloads, '');
      const child = Bun.spawn([process.execPath, '--no-env-file', runner, ...args], {
        cwd: root,
        env: {
          ...process.env,
          OPENDUET_RUNNER_VISITS: journal,
          OPENDUET_RUNNER_PRELOADS: preloads,
          OPENDUET_RUNNER_SENTINEL: 'owned-runner-preload',
          OPENDUET_RUNNER_FAIL: fail,
        },
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
      });
      active = child;
      const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      active = undefined;
      const lines = async (path: string) =>
        (await readFile(path, 'utf8')).trim().split('\n').filter(Boolean);
      return {
        exitCode,
        stdout,
        stderr,
        visits: (await lines(journal)).map((line) => JSON.parse(line) as Visit),
        preloadPids: (await lines(preloads)).map(Number),
      };
    }
    await check({ ids, run });
  } finally {
    if (active) {
      active.kill('SIGTERM');
      await active.exited;
    }
    await rm(root, { recursive: true, force: true });
  }
}

test('native inventory evaluates no preload or case, then each file runs once in its own process', () =>
  withFixtures(async ({ ids, run }) => {
    const passed = await run();
    expect(passed).toMatchObject({ exitCode: 0 });
    const starts = ids.map((_, index) => `[test-runner] shard ${index + 1}/${ids.length}`);
    expect([...(passed.stdout.match(/\[test-runner\] shard \d+\/\d+/g) ?? [])]).toEqual(starts);
    expect(passed.visits.map(({ id }) => id).sort()).toEqual(ids);
    expect(new Set(passed.visits.map(({ pid }) => pid)).size).toBe(ids.length);
    expect(passed.visits.every(({ preload }) => preload === 'owned-runner-preload')).toBe(true);
    // A probe that evaluated any preload would contribute an extra entry/PID.
    expect(passed.preloadPids).toHaveLength(ids.length);
    expect([...passed.preloadPids].sort()).toEqual(passed.visits.map(({ pid }) => pid).sort());
    expect(passed.stdout + passed.stderr).not.toContain('4294967295/4294967295');
  }));

test('a failed first file makes the full command fail while every later native file shard still runs', () =>
  withFixtures(async ({ ids, run }) => {
    const failed = await run([], ids[0]);
    expect(failed.exitCode).not.toBe(0);
    expect(failed.stderr).toContain(`Intentional runner fixture failure: ${ids[0]}`);
    const starts = ids.map((_, index) => `[test-runner] shard ${index + 1}/${ids.length}`);
    expect([...(failed.stdout.match(/\[test-runner\] shard \d+\/\d+/g) ?? [])]).toEqual(starts);
    expect(failed.visits.map(({ id }) => id).sort()).toEqual(ids);
    expect(new Set(failed.visits.map(({ pid }) => pid)).size).toBe(ids.length);
  }));

test('explicit native shard and name-filter arguments run once in one process', () =>
  withFixtures(async ({ ids, run }) => {
    const filtered = await run(['--shard=1/1', '--test-name-pattern=^fixture0[0-3]$']);
    expect(filtered).toMatchObject({ exitCode: 0 });
    expect(filtered.stdout).not.toContain('[test-runner] shard');
    expect(filtered.visits.map(({ id }) => id).sort()).toEqual(ids.slice(0, 4));
    expect(new Set(filtered.visits.map(({ pid }) => pid)).size).toBe(1);
    expect(new Set(filtered.preloadPids).size).toBe(1);
  }));

test('an empty native inventory fails closed before starting any file shard', () =>
  withFixtures(async ({ run }) => {
    const empty = await run();
    expect(empty.exitCode).not.toBe(0);
    expect(empty.stderr).toContain('Could not inventory native Bun test files.');
    expect(empty.stdout).not.toContain('[test-runner] shard');
    expect(empty.visits).toEqual([]);
    expect(empty.preloadPids).toEqual([]);
  }, 0));
