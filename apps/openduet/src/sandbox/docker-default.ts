/**
 * What `OPENDUET_SANDBOX_PROVIDER=docker` sets up: the engine and limits every
 * docker sandbox gets, and the sandbox connection each space is given, so an
 * agent has a shell and a desktop without anyone installing one.
 */
import type { SandboxConnectionConfig } from '@openduet/contracts';
import type { DockerEndpoint } from '../runtime/cell-host-local.ts';

/**
 * How this service reaches the engine: through the cell service when one is
 * configured (OPENDUET_CELLS_URL with its key), and otherwise over the socket.
 */
export function dockerEndpoint(env: {
  OPENDUET_DOCKER_SOCKET: string;
  OPENDUET_CELLS_URL?: string | undefined;
  OPENDUET_CELLS_KEY?: string | undefined;
}): DockerEndpoint {
  if (!env.OPENDUET_CELLS_URL) return env.OPENDUET_DOCKER_SOCKET;
  if (!env.OPENDUET_CELLS_KEY) throw new Error('OPENDUET_CELLS_URL needs OPENDUET_CELLS_KEY');
  return { url: env.OPENDUET_CELLS_URL, key: env.OPENDUET_CELLS_KEY };
}

import { DOCKER_SANDBOX_DEFAULTS, type DockerSandboxSettings } from './adapters/docker.ts';

export type DockerSandboxEnv = {
  OPENDUET_RUNTIME_ADAPTER: string;
  OPENDUET_DOCKER_SOCKET: string;
  /** Set when the cell service holds the socket; the service then reaches the engine through it. */
  OPENDUET_CELLS_URL?: string;
  OPENDUET_CELLS_KEY?: string;
  OPENDUET_SANDBOX_PROVIDER?: 'docker';
  OPENDUET_SANDBOX_PROJECT?: string;
  OPENDUET_COMPOSE_PROJECT?: string;
  OPENDUET_SANDBOX_DOCKER_IMAGE?: string;
  OPENDUET_SANDBOX_DOCKER_CPUS?: number;
  OPENDUET_SANDBOX_DOCKER_MEMORY_MB?: number;
  OPENDUET_SANDBOX_DOCKER_PIDS?: number;
  OPENDUET_SANDBOX_DOCKER_DISK_MB?: number;
  OPENDUET_SANDBOX_DOCKER_EGRESS?: 'open' | 'connected_hosts_only' | 'deny_all';
  OPENDUET_SANDBOX_DOCKER_IDLE_SECONDS?: number;
  OPENDUET_SANDBOX_EGRESS_PORT?: number;
  OPENDUET_SANDBOX_EGRESS_EXTRA_HOSTS?: readonly string[];
};

/**
 * The service's own container, when it runs in one on the engine it drives:
 * Docker names a container's host after its short id. Only then can it join a
 * sandbox's network as the one way out.
 */
export function serviceContainerId(
  env: Pick<DockerSandboxEnv, 'OPENDUET_RUNTIME_ADAPTER'>,
  hostname = process.env.HOSTNAME ?? '',
): string | undefined {
  return env.OPENDUET_RUNTIME_ADAPTER === 'docker' && /^[a-f0-9]{12,64}$/.test(hostname)
    ? hostname
    : undefined;
}

export function dockerSandboxSettings(
  env: DockerSandboxEnv,
  hostname?: string,
): DockerSandboxSettings {
  const selfId = serviceContainerId(env, hostname);
  return {
    socket: dockerEndpoint(env),
    project: env.OPENDUET_SANDBOX_PROJECT ?? '',
    ...(env.OPENDUET_COMPOSE_PROJECT ? { installProject: env.OPENDUET_COMPOSE_PROJECT } : {}),
    cpus: env.OPENDUET_SANDBOX_DOCKER_CPUS ?? DOCKER_SANDBOX_DEFAULTS.cpus,
    memoryMb: env.OPENDUET_SANDBOX_DOCKER_MEMORY_MB ?? DOCKER_SANDBOX_DEFAULTS.memoryMb,
    pids: env.OPENDUET_SANDBOX_DOCKER_PIDS ?? DOCKER_SANDBOX_DEFAULTS.pids,
    diskMb: env.OPENDUET_SANDBOX_DOCKER_DISK_MB ?? DOCKER_SANDBOX_DEFAULTS.diskMb,
    idleSeconds: env.OPENDUET_SANDBOX_DOCKER_IDLE_SECONDS ?? DOCKER_SANDBOX_DEFAULTS.idleSeconds,
    egressPort: env.OPENDUET_SANDBOX_EGRESS_PORT ?? DOCKER_SANDBOX_DEFAULTS.egressPort,
    ...(selfId ? { selfId } : {}),
    ...(env.OPENDUET_SANDBOX_EGRESS_EXTRA_HOSTS?.length
      ? { egressExtraHosts: [...env.OPENDUET_SANDBOX_EGRESS_EXTRA_HOSTS] }
      : {}),
  };
}

/** How long one default sandbox may run before it is stopped; it starts again when used. */
export const DEFAULT_SANDBOX_LIFETIME_SECONDS = 8 * 3600;

/**
 * The configuration of the sandbox each space is given, or null when the
 * deployment asked for none. Open egress needs the service in a container on
 * the same engine; elsewhere the default is narrowed to no network, never
 * widened.
 */
export function defaultSandboxConfig(
  env: DockerSandboxEnv,
  hostname?: string,
): SandboxConnectionConfig | null {
  if (env.OPENDUET_SANDBOX_PROVIDER !== 'docker' || !env.OPENDUET_SANDBOX_PROJECT) return null;
  const wanted = env.OPENDUET_SANDBOX_DOCKER_EGRESS ?? 'open';
  // Both kinds with a network leave only through the guard in the service's container.
  const egress = wanted !== 'deny_all' && !serviceContainerId(env, hostname) ? 'deny_all' : wanted;
  return {
    adapter: 'docker',
    image: env.OPENDUET_SANDBOX_DOCKER_IMAGE ?? 'openduet-sandbox:local',
    egress,
    persistence: 'pause',
    lifetime_seconds: DEFAULT_SANDBOX_LIFETIME_SECONDS,
  };
}
