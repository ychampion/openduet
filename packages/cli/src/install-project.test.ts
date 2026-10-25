import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const installer = readFileSync(resolve(import.meta.dir, '../../../install.sh'), 'utf8').replace(
  /\r\n/g,
  '\n',
);
const bash = Bun.which('bash');

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'openduet-project-'));
  const library = join(root, 'install-lib.sh');
  expect(installer.endsWith('\nmain "$@"\n')).toBe(true);
  writeFileSync(library, installer.slice(0, -'main "$@"\n'.length));
  writeFileSync(join(root, '.env'), 'COMPOSE_PROJECT_NAME=openduet\n');
  return { root, library };
}

function guard(
  own: ReturnType<typeof fixture>,
  containerDirectory: string,
  newInstallation = false,
) {
  // Only the ownership query is supplied by the fixture; no daemon is used.
  return Bun.spawnSync(
    [
      bash ?? 'bash',
      '-c',
      `source "$LIB"
docker() {
  case "$1" in
    ps) printf 'fixture-container|%s\\n' "$CONTAINER_DIR" ;;
    volume) return 0 ;;
    *) return 19 ;;
  esac
}
check_project_free openduet "$NEW_INSTALLATION"`,
    ],
    {
      env: {
        ...process.env,
        LIB: own.library,
        DIR: own.root,
        DEPLOY: own.root,
        CONTAINER_DIR: containerDirectory,
        NEW_INSTALLATION: newInstallation ? '1' : '0',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
}

describe('installer project ownership', () => {
  test.skipIf(!bash)('accepts the same existing folder under a different path spelling', () => {
    const own = fixture();
    const result = guard(own, `${own.root}/.`);
    expect(result.stderr.toString()).toBe('');
    expect(result.exitCode).toBe(0);
  });

  test.skipIf(!bash || process.platform !== 'win32')(
    'accepts the native Windows path emitted by Compose for its Git Bash folder',
    () => {
      const own = fixture();
      const result = guard(own, own.root.replaceAll('/', '\\'));
      expect(result.stderr.toString()).toBe('');
      expect(result.exitCode).toBe(0);
    },
  );

  test.skipIf(!bash)('refuses a different live installation with the same project name', () => {
    const own = fixture();
    const other = fixture();
    const result = guard(own, other.root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain('Another installation');
  });

  test.skipIf(!bash)('refuses a new installation even if the container names its folder', () => {
    const own = fixture();
    const result = guard(own, own.root, true);
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain('already has containers');
  });

  test.skipIf(!bash)('refuses containers whose original folder is unknown', () => {
    const result = guard(fixture(), '');
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain('does not say which folder started it');
  });

  test.skipIf(!bash)('keeps supporting an installation moved away from its old folder', () => {
    const own = fixture();
    const result = guard(own, join(own.root, 'removed-original'));
    expect(result.stderr.toString()).toBe('');
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain('before it moved');
  });
});
