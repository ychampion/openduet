import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runDeploy } from './commands/deploy.ts';
import { runRollback } from './commands/rollback.ts';
import { appendHistory } from './history.ts';
import { temporaryDeployDir } from './testing.ts';
import {
  asLocal,
  type DeployRig,
  deployRig,
  NEW,
  OLD,
  REGISTRY,
  release,
} from './testing-engine.ts';

const short = (commit: string) => commit.slice(0, 7);
const ref = (name: string, tag: string) => `${REGISTRY}/${name}:${tag}`;
const env = (deployDir: string) => readFileSync(join(deployDir, '.env'), 'utf8');

/** The computer image in the registry for both commits, the stack's at OLD, and openduet-sandbox:local. */
function withSandbox(rig: DeployRig, localId: string) {
  for (const [tag, commit] of [
    [short(OLD), OLD],
    [short(NEW), NEW],
    ['main', NEW],
  ] as const)
    rig.state.registry.set(ref('openduet-sandbox', tag), release('openduet-sandbox', commit));
  rig.state.local.set(
    ref('openduet-sandbox', 'main'),
    asLocal(ref('openduet-sandbox', 'main'), release('openduet-sandbox', OLD)),
  );
  rig.state.local.set('openduet-sandbox:local', {
    id: localId,
    repoDigests: [],
    layers: [],
    revision: null,
  });
}

describe('what deploy refuses before it acts', () => {
  test('a shell value that differs from deploy/.env refuses the deploy, naming it without its value', async () => {
    const deployDir = temporaryDeployDir();
    const rig = deployRig(deployDir);
    rig.context.environment = { OPENDUET_IMAGE_TAG: 'v0.9.0', COMPOSE_PROJECT_NAME: 'openduet' };
    expect(await runDeploy(rig.context, ['--checkout'], false, rig.dependencies)).toBe(2);
    const printed = rig.context.printed();
    expect(printed).toMatch(
      /fail\s+deploy\.shell\s+This shell sets OPENDUET_IMAGE_TAG, which Compose reads/,
    );
    expect(printed).not.toContain('v0.9.0');
    expect(printed).not.toContain('COMPOSE_PROJECT_NAME');
    expect(rig.state.calls).toEqual([]);
    expect(env(deployDir)).toBe(rig.envBefore);
  });

  test('a shell that sets OPENDUET_IMAGE_TAG at all refuses deploy and rollback, even to the same value', async () => {
    const deployDir = temporaryDeployDir();
    const rig = deployRig(deployDir);
    // Equal now, but deploy writes a new tag to deploy/.env and Compose would keep the shell's.
    rig.context.environment = { OPENDUET_IMAGE_TAG: 'main' };
    expect(await runDeploy(rig.context, ['--checkout'], false, rig.dependencies)).toBe(2);
    expect(rig.context.printed()).toMatch(
      /fail\s+deploy\.shell\s+This shell sets OPENDUET_IMAGE_TAG,/,
    );
    expect(rig.state.calls).toEqual([]);
    expect(env(deployDir)).toBe(rig.envBefore);

    rig.context.environment = {};
    expect(await runDeploy(rig.context, ['--checkout'], false, rig.dependencies)).toBe(0);
    rig.context.environment = { OPENDUET_IMAGE_TAG: short(NEW) };
    const calls = rig.state.calls.length;
    expect(await runRollback(rig.context, [], false, rig.dependencies)).toBe(2);
    expect(rig.context.errors()).toContain('This shell sets OPENDUET_IMAGE_TAG,');
    expect(rig.state.calls).toHaveLength(calls);
  });

  test('a setting deploy does not write may be set in the shell to the value deploy/.env holds', async () => {
    const deployDir = temporaryDeployDir();
    const rig = deployRig(deployDir);
    rig.context.environment = { OPENDUET_IMAGE_REGISTRY: '', COMPOSE_PROJECT_NAME: 'openduet' };
    expect(await runDeploy(rig.context, ['--checkout'], false, rig.dependencies)).toBe(0);
  });

  test('a renamed project with no containers, after deploys of another, is refused', async () => {
    const deployDir = temporaryDeployDir();
    const rig = deployRig(deployDir, { projects: { 'openduet-old': ['c0ffee'] } });
    appendHistory(deployDir, {
      at: '2026-10-01T10:00:00.000Z',
      command: 'deploy',
      from: { tag: 'main', revision: OLD },
      to: { tag: 'main', revision: OLD },
      checkout: null,
      migrations: { from: 68, to: 68 },
      project: 'openduet-old',
      backup: null,
      result: 'deployed',
      detail: '',
    });
    expect(await runDeploy(rig.context, ['--checkout'], false, rig.dependencies)).toBe(2);
    expect(rig.context.printed()).toMatch(
      /fail\s+deploy\.project\s+Compose project openduet has no containers, and earlier runs deployed project openduet-old/,
    );
    expect(rig.state.pulls).toEqual([]);

    // The same history with the project's containers present is an ordinary deploy.
    rig.state.projects.openduet = ['c0ffee'];
    expect(await runDeploy(rig.context, ['--checkout'], false, rig.dependencies)).toBe(0);
  });

  test('a full commit sha is deployed by the short tag it is published under', async () => {
    const deployDir = temporaryDeployDir();
    const rig = deployRig(deployDir);
    expect(
      await runDeploy(rig.context, ['--tag', NEW, '--checkout'], false, rig.dependencies),
    ).toBe(0);
    expect(rig.state.pulls).toContain(ref('openduet-service', short(NEW)));
    expect(env(deployDir)).toContain(`\nOPENDUET_IMAGE_TAG=${short(NEW)}\n`);
  });
});

describe('openduet-sandbox:local', () => {
  test('follows the published computer image when it was following it already', async () => {
    const deployDir = temporaryDeployDir();
    const rig = deployRig(deployDir, {}, { profiles: ['sandbox'] });
    withSandbox(rig, release('openduet-sandbox', OLD).digest);
    expect(await runDeploy(rig.context, ['--checkout'], false, rig.dependencies)).toBe(0);
    expect(rig.state.tagged).toEqual([
      [ref('openduet-sandbox', short(NEW)), 'openduet-sandbox:local'],
    ]);
  });

  test('is left alone when it is an image of its own', async () => {
    const deployDir = temporaryDeployDir();
    const rig = deployRig(deployDir, {}, { profiles: ['sandbox'] });
    withSandbox(rig, 'sha256:built-by-the-operator');
    expect(await runDeploy(rig.context, ['--checkout'], false, rig.dependencies)).toBe(0);
    expect(rig.state.tagged).toEqual([]);
    expect(rig.context.printed()).toMatch(
      /warn\s+switch\.sandbox_local\s+openduet-sandbox:local is not the published computer image of main/,
    );
  });
});
