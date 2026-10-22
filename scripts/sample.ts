/** Starts separate local fixtures after removing inherited installation settings. */
import { sampleEnvironment } from './sample-environment.ts';

// `bun run sample` itself can inherit an already loaded .env. Scrub before
// importing fixture modules, and prevent both Bun and Vite loading it again.
const environment = sampleEnvironment(process.env);
for (const name of Object.keys(process.env)) delete process.env[name];
Object.assign(process.env, environment);
const { createSampleDay } = await import('../apps/mock-api/src/sample-day.ts');

const sample = await createSampleDay();
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 3321,
  idleTimeout: 0,
  fetch: sample.app.fetch,
});
const web = Bun.spawn(
  [
    process.execPath,
    '--no-env-file',
    'run',
    '--cwd',
    'apps/web',
    'dev',
    '--host',
    '127.0.0.1',
    '--port',
    '5321',
    '--strictPort',
  ],
  {
    env: environment,
    stdout: 'inherit',
    stderr: 'inherit',
  },
);
function stop() {
  web.kill();
  server.stop(true);
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
process.stdout.write(
  '\nSample day: http://127.0.0.1:5321\nScripted fixtures. No model usage, real mail, or account connections. Stop with Ctrl+C.\n\n',
);
await web.exited;
server.stop(true);
