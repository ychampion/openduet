import type { Action } from '@openduet/contracts';
import { Button } from '../design/primitives.tsx';
import { adapter, type Result } from './adapter.ts';
import { call } from './call.ts';
import { useLoad } from './hooks.ts';
import type { Connection } from './types.ts';

type SourceAction = Pick<
  Action,
  'id' | 'job_id' | 'connection_id' | 'status' | 'repair_disposition' | 'created_at'
>;
export type TaskDependency = { connectionId: string; label: string; detail: string };
const WAITING = new Set(['needs_you', 'failed', 'stalled', 'paused']);

/** A disconnected account is relevant only when this task actually stopped on it. */
export function taskDependencies(
  conversationId: string,
  status: string,
  actions: readonly SourceAction[],
  connections: readonly Connection[],
): TaskDependency[] {
  if (!WAITING.has(status)) return [];
  const latest = new Map<string, SourceAction>();
  for (const action of [...actions].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    if (action.job_id === conversationId && !latest.has(action.connection_id))
      latest.set(action.connection_id, action);
  }
  return [...latest.values()].flatMap((action) => {
    if (action.status !== 'failed' || action.repair_disposition !== 'needs_reconnect') return [];
    const connection = connections.find((item) => item.id === action.connection_id);
    return [
      {
        connectionId: action.connection_id,
        label: connection?.label ?? `Connection ${action.connection_id}`,
        detail:
          connection?.problem?.detail ??
          'This task stopped because its recorded source needs to be reconnected.',
      },
    ];
  });
}

async function loadDependencies(
  conversationId: string,
  status: string,
): Promise<Result<TaskDependency[]>> {
  if (!WAITING.has(status)) return { data: [], error: null, unavailable: null };
  const [actions, connections] = await Promise.all([
    call<{ actions: SourceAction[] }>(
      `/actions?job_id=${encodeURIComponent(conversationId)}&view=full&limit=100`,
    ),
    adapter.connections(),
  ]);
  if (actions.data === null) return actions;
  if (connections.data === null) return connections;
  return {
    data: taskDependencies(
      conversationId,
      status,
      actions.data.actions,
      connections.data.connections,
    ),
    error: null,
    unavailable: null,
  };
}

export function DependencyRecovery({
  dependency,
  onConnect,
  onProvideContext,
}: {
  dependency: TaskDependency;
  onConnect: (dependency: TaskDependency) => void;
  onProvideContext: () => void;
}) {
  return (
    <section
      className="col card-12"
      style={{ gap: 10, padding: 14 }}
      aria-label="Missing task source"
    >
      <strong>{dependency.label} needs reconnecting for this task</strong>
      <p style={{ margin: 0, fontSize: 13 }}>{dependency.detail}</p>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
        Connect this source, or provide notes or a supported file to continue preparation. Fresh
        reads and sending still need the source. Your original request stays with this task.
      </p>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <Button size="sm" onClick={() => onConnect(dependency)}>
          Connect
        </Button>
        <Button size="sm" variant="outline" onClick={onProvideContext}>
          Provide context
        </Button>
      </div>
    </section>
  );
}

export function TaskDependencies({
  conversationId,
  status,
  updatedAt,
  onConnect,
  onProvideContext,
}: {
  conversationId: string;
  status: string;
  updatedAt: string;
  onConnect: (dependency: TaskDependency) => void;
  onProvideContext: () => void;
}) {
  const loaded = useLoad(
    () => loadDependencies(conversationId, status),
    [conversationId, status, updatedAt],
  );
  if (!WAITING.has(status)) return null;
  return (
    <>
      {loaded.data?.map((dependency) => (
        <DependencyRecovery
          key={dependency.connectionId}
          dependency={dependency}
          onConnect={onConnect}
          onProvideContext={onProvideContext}
        />
      ))}
    </>
  );
}
