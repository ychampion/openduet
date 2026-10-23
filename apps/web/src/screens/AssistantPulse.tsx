import type { AssistantSnapshot, AssistantSuggestion } from '@openduet/contracts';
import type { AttachmentView } from '@openduet/contracts/attachments';
import { useEffect, useState } from 'react';
import { Icon } from '../design/icons.tsx';
import { Button } from '../design/primitives.tsx';
import { adapter } from '../experience/adapter.ts';
import { call } from '../experience/call.ts';
import { useLoad } from '../experience/hooks.ts';
import { href } from '../router.ts';
import { toast } from '../shell/Shell.tsx';
import './assistant-pulse.css';

export function AssistantPulse({
  onCollaborate,
}: {
  onCollaborate: (prompt: string, attachment: AttachmentView, item: AssistantSuggestion) => boolean;
}) {
  const snapshot = useLoad(() => call<AssistantSnapshot>('/assistant'), []);
  const memory = useLoad(() => adapter.memorySettings(), []);
  const details = useLoad(() => adapter.memory(), []);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    const refresh = () => {
      snapshot.reload();
      memory.reload();
      details.reload();
    };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [snapshot.reload, memory.reload, details.reload]);
  const view = snapshot.data;
  if (!view)
    return snapshot.error ? (
      <p className="assistant-pulse-error" role="status">
        Background status is unavailable. Your tasks remain in Work.{' '}
        <button type="button" onClick={snapshot.reload}>
          Retry
        </button>
      </p>
    ) : null;
  const update = async (enabled: boolean) => {
    setBusy('settings');
    const result = await call<AssistantSnapshot>('/assistant', {
      method: 'PATCH',
      body: { enabled },
    });
    setBusy(null);
    if (result.data) snapshot.set(result.data);
    else
      toast({
        kind: 'err',
        title: result.error ?? result.unavailable ?? 'Couldn’t change background noticing.',
      });
  };
  const mark = async (item: AssistantSuggestion, action: 'dismiss' | 'tomorrow') => {
    setBusy(item.id);
    const result = await call<AssistantSnapshot>(
      `/assistant/suggestions/${encodeURIComponent(item.id)}`,
      { method: 'POST', body: { action } },
    );
    setBusy(null);
    if (result.data) snapshot.set(result.data);
    else
      toast({
        kind: 'err',
        title: result.error ?? result.unavailable ?? 'Couldn’t save this choice.',
      });
  };
  const collaborate = async (item: AssistantSuggestion) => {
    setBusy(item.id);
    const result = await call<{ prompt: string; attachment: AttachmentView }>(
      `/assistant/suggestions/${encodeURIComponent(item.id)}/context`,
      { method: 'POST' },
    );
    setBusy(null);
    if (result.data) onCollaborate(result.data.prompt, result.data.attachment, item);
    else {
      snapshot.reload();
      toast({
        kind: 'err',
        title: result.error ?? result.unavailable ?? 'This source is no longer available.',
      });
    }
  };
  const status = {
    checking: 'Starting background checks',
    watching: 'Keeping an eye on things',
    paused: 'Suggestions paused',
    delayed: 'Background checks delayed',
  }[view.status];
  return (
    <section className="assistant-pulse" aria-label="Your collaborative assistant">
      <details className="assistant-presence">
        <summary>
          <span className="assistant-presence-dot" data-active={view.status === 'watching'} />
          {status}
          <span className="assistant-learning-label">
            {memory.data?.capture
              ? 'Automatic memory on'
              : memory.data
                ? 'Automatic learning paused'
                : 'Memory status unavailable'}
          </span>
          <Icon name="chevronDown" size={14} className="assistant-presence-chevron" />
        </summary>
        <div className="assistant-controls">
          <p>
            Checks run on your server every minute, including when this browser is closed. Connected
            sources follow their own polling interval. Keep your host running.
          </p>
          <p>
            {view.watched_connections} watched account{view.watched_connections === 1 ? '' : 's'}.{' '}
            {view.checked_at
              ? `Last checked ${new Date(view.checked_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`
              : 'Waiting for the server’s first check.'}{' '}
            <a href={href('/settings/connections')}>Manage sources</a>
          </p>
          <Button
            size="sm"
            variant="outline"
            loading={busy === 'settings'}
            disabled={busy !== null}
            onClick={() => void update(!view.enabled)}
          >
            {view.enabled ? 'Pause suggestions' : 'Resume suggestions'}
          </Button>
          <p>Pausing suggestions leaves your requested tasks, watches and routines running.</p>
          <label>
            <input
              type="checkbox"
              checked={memory.data?.capture ?? false}
              disabled={busy !== null || !memory.data}
              onChange={(event) => {
                const enabled = event.target.checked;
                setBusy('memory');
                void adapter.saveMemorySettings(enabled).then((result) => {
                  setBusy(null);
                  if (result.data) memory.set(result.data);
                  else
                    toast({
                      kind: 'err',
                      title:
                        result.error ?? result.unavailable ?? 'Couldn’t change automatic learning.',
                    });
                });
              }}
            />
            Learn lasting facts and preferences automatically
          </label>
          <p>
            A configured memory model extracts useful lasting details from your own words. One-off
            tasks and quoted content do not become your preferences. Start a message with “off the
            record” to skip it. <a href={href('/settings/memory')}>Review, edit or forget memory</a>
          </p>
          {details.data?.items.slice(0, 2).map((item) => (
            <p className="assistant-memory" key={item.id}>
              <span>{item.source === 'inferred' ? 'Inferred · review' : 'Remembered'}</span>
              {item.value}
            </p>
          ))}
          <a href={href('/settings/notifications')}>Choose what can notify you</a>
        </div>
      </details>
      {view.enabled && view.suggestions.length ? (
        <div className="assistant-suggestions">
          <h2>A useful next step</h2>
          <p>I’ve gathered the context. We can work through one of these together.</p>
          {view.suggestions.map((item) => (
            <article key={item.id}>
              <h3>{item.title}</h3>
              <p>{item.context}</p>
              <p className="assistant-because">
                {item.reason} · {item.source_label}
                {item.at
                  ? ` · ${new Date(item.at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`
                  : ''}
              </p>
              <div className="assistant-suggestion-actions">
                <Button
                  size="sm"
                  variant="outline"
                  loading={busy === item.id}
                  disabled={busy !== null}
                  onClick={() => void collaborate(item)}
                >
                  Plan together
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy !== null}
                  onClick={() => void mark(item, 'tomorrow')}
                >
                  Tomorrow
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy !== null}
                  onClick={() => void mark(item, 'dismiss')}
                >
                  Not useful
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
