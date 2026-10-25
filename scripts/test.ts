/** Bound native Bun's process lifetime while retaining its own test discovery and isolation. */
import { stripVTControlCharacters } from 'node:util';

const args = process.argv.slice(2);
const inventoryShard = '4294967295/4294967295';
const exits: number[] = [];
let active: ReturnType<typeof Bun.spawn> | undefined;
let interrupted: 'SIGINT' | 'SIGTERM' | undefined;
let killTimer: ReturnType<typeof setTimeout> | undefined;

function interrupt(signal: 'SIGINT' | 'SIGTERM') {
  if (interrupted) return;
  interrupted = signal;
  const child = active;
  if (!child) return;
  child.kill(signal);
  // Let Bun close its fixtures, but do not leave a child that ignores the signal running.
  killTimer = setTimeout(() => {
    if (child.exitCode === null) child.kill('SIGKILL');
  }, 5000);
  killTimer.unref();
}

const onInterrupt = () => interrupt('SIGINT');
const onTerminate = () => interrupt('SIGTERM');
process.on('SIGINT', onInterrupt);
process.on('SIGTERM', onTerminate);

async function invoke(forwarded: string[], capture = false) {
  const child = Bun.spawn(
    [process.execPath, 'test', '--isolate', '--max-concurrency=2', '--timeout=30000', ...forwarded],
    {
      stdin: 'inherit',
      stdout: capture ? 'pipe' : 'inherit',
      stderr: capture ? 'pipe' : 'inherit',
    },
  );
  active = child;
  try {
    const [exit, stdout, stderr] = await Promise.all([
      child.exited,
      capture ? new Response(child.stdout).text() : '',
      capture ? new Response(child.stderr).text() : '',
    ]);
    return { exit, stdout, stderr };
  } finally {
    clearTimeout(killTimer);
    killTimer = undefined;
    active = undefined;
  }
}

try {
  let invocations = [args];
  if (!args.length) {
    // An empty native shard discovers the complete inventory without evaluating
    // tests or preloads. Bun 1.3.13 sorts paths and assigns them round-robin.
    const inventory = await invoke([`--shard=${inventoryShard}`], true);
    if (!interrupted) {
      const output = stripVTControlCharacters(inventory.stdout + inventory.stderr);
      const matches = [
        ...output.matchAll(
          /^--shard=4294967295\/4294967295: running (\d+)\/(\d+) test files?\r?$/gm,
        ),
      ];
      const selected = Number(matches[0]?.[1]);
      const total = Number(matches[0]?.[2]);
      if (
        inventory.exit !== 0 ||
        matches.length !== 1 ||
        selected !== 0 ||
        !Number.isSafeInteger(total) ||
        total <= 0 ||
        total >= 4294967295
      )
        throw new Error(`Could not inventory native Bun test files.\n${output}`);
      // One file per process bounds retained VM/JIT state as well as globals.
      invocations = Array.from({ length: total }, (_, index) => [`--shard=${index + 1}/${total}`]);
    }
  }
  for (const [index, forwarded] of invocations.entries()) {
    if (interrupted) break;
    if (!args.length)
      process.stdout.write(`[test-runner] shard ${index + 1}/${invocations.length}\n`);
    try {
      exits.push((await invoke(forwarded)).exit);
    } catch (error) {
      console.error(error);
      exits.push(1);
    }
  }
} catch (error) {
  console.error(error);
  exits.push(1);
} finally {
  process.off('SIGINT', onInterrupt);
  process.off('SIGTERM', onTerminate);
}
process.exitCode = interrupted
  ? interrupted === 'SIGINT'
    ? 130
    : 143
  : exits.some((code) => code !== 0)
    ? 1
    : 0;
