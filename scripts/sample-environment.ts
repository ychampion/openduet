/** Only platform plumbing reaches the fixture and Vite; installation settings never do. */
export function sampleEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const name of [
    'PATH',
    'Path',
    'SystemRoot',
    'SYSTEMROOT',
    'WINDIR',
    'COMSPEC',
    'PATHEXT',
    'TEMP',
    'TMP',
    'TMPDIR',
    'LANG',
    'LC_ALL',
  ]) {
    if (source[name]) result[name] = source[name];
  }
  return {
    ...result,
    NODE_ENV: 'development',
    VITE_OPENDUET_API: 'http://127.0.0.1:3321',
    VITE_OPENDUET_SAMPLE: 'on',
  };
}
