import type { CustomerFollowupView, CustomerThreadSnapshot } from '@openduet/contracts';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '../design/primitives.tsx';
import { call } from '../experience/call.ts';
import { instanceName } from '../experience/instance.ts';

type Source = { id: string; label: string };
type Message = {
  key: number | string;
  subject: string;
  from: string;
  date: string | null;
  preview: string;
};
type Preview = CustomerThreadSnapshot & { connection_label: string };
type Props = {
  onOpenConversation: (id: string) => void;
  initialConnectionId?: string;
  initialThreadKey?: number | string;
  initialCustomerEmail?: string;
};
const fieldStyle = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--text)',
  background: 'var(--surface)',
  font: 'inherit',
};
const at = (instant: string, zone: string) =>
  new Intl.DateTimeFormat(undefined, {
    timeZone: zone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(instant));

/** This form confirms a real source and a deadline; pasted notes never claim fresh access. */
export function CustomerFollowups({
  onOpenConversation,
  initialConnectionId,
  initialThreadKey,
  initialCustomerEmail,
}: Props) {
  const [sources, setSources] = useState<Source[]>([]);
  const [followups, setFollowups] = useState<CustomerFollowupView[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [connection, setConnection] = useState(initialConnectionId ?? '');
  const [customer, setCustomer] = useState(initialCustomerEmail ?? '');
  const [query, setQuery] = useState('');
  const [folder, setFolder] = useState<'inbox' | 'sent'>('sent');
  const [messages, setMessages] = useState<Message[]>([]);
  const [selected, setSelected] = useState<number | string | null>(initialThreadKey ?? null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [title, setTitle] = useState('');
  const [deadline, setDeadline] = useState('');
  const [zone, setZone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const refresh = useCallback(async () => {
    const [sourceResponse, listResponse] = await Promise.all([
      call<{ sources: Source[] }>('/customer-followups/sources'),
      call<{ followups: CustomerFollowupView[] }>('/customer-followups'),
    ]);
    setSources(sourceResponse.data?.sources ?? []);
    if (sourceResponse.data?.sources[0]) {
      const first = sourceResponse.data.sources[0].id;
      setConnection((previous) => previous || first);
    }
    if (listResponse.data) setFollowups(listResponse.data.followups);
    setProblem(sourceResponse.error ?? listResponse.error ?? null);
    setLoading(false);
  }, []);
  useEffect(() => {
    void refresh();
    const changed = () => {
      if (!document.hidden) void refresh();
    };
    const timer = setInterval(changed, 30_000);
    document.addEventListener('visibilitychange', changed);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', changed);
    };
  }, [refresh]);
  const action = async (id: string, verb: 'pause' | 'resume' | 'dismiss' | 'send') => {
    setBusy(true);
    setProblem(null);
    setNotice(null);
    const response = await call<{ action?: { status?: string }; draft?: unknown }>(
      `/customer-followups/${encodeURIComponent(id)}/${verb}`,
      { method: 'POST' },
    );
    if (response.error) setProblem(response.error);
    else {
      if (verb === 'send') {
        const selectedResult = followups.find((item) => item.id === id)?.result;
        setNotice(
          'The exact message is in its conversation for approval. Its send receipt will appear there.',
        );
        if (selectedResult) onOpenConversation(selectedResult.conversation_id);
      }
      await refresh();
    }
    setBusy(false);
  };
  const search = async () => {
    setBusy(true);
    setProblem(null);
    setPreview(null);
    setSelected(null);
    const response = await call<{ messages: Message[] }>('/customer-followups/messages', {
      method: 'POST',
      body: { connection_id: connection, query, folder },
    });
    if (response.error) setProblem(response.error);
    setMessages(response.data?.messages ?? []);
    setBusy(false);
  };
  const read = async (key: number | string) => {
    setBusy(true);
    setProblem(null);
    setPreview(null);
    setSelected(key);
    const response = await call<{ thread: Preview }>('/customer-followups/preview', {
      method: 'POST',
      body: { connection_id: connection, thread_key: key, customer_email: customer },
    });
    if (response.error) setProblem(response.error);
    if (response.data) {
      setPreview(response.data.thread);
      setTitle(response.data.thread.subject.replace(/^re:\s*/i, ''));
    }
    setBusy(false);
  };
  const confirm = async () => {
    if (!preview || selected === null || !deadline) return;
    setBusy(true);
    setProblem(null);
    // A wall-clock time is explicitly paired with a zone; the server also validates its UTC instant.
    const utc = zonedInstant(deadline, zone);
    if (!utc) {
      setProblem('Choose a valid time in this time zone.');
      setBusy(false);
      return;
    }
    const response = await call('/customer-followups', {
      method: 'POST',
      body: {
        connection_id: connection,
        thread_key: selected,
        customer_email: customer,
        source_version: preview.version,
        deadline_at: utc,
        time_zone: zone,
        title,
      },
    });
    if (response.error) setProblem(response.error);
    else {
      setOpen(false);
      setPreview(null);
      setNotice(
        'Watch saved. If there is no reply at the confirmed time, a draft will wait here and in Chat. Sending needs your separate approval.',
      );
      await refresh();
    }
    setBusy(false);
  };
  return (
    <section
      aria-label="Customer follow-up responsibilities"
      className="col"
      style={{ gap: 20, width: '100%', minWidth: 0 }}
    >
      <header
        className="row"
        style={{ gap: 12, justifyContent: 'space-between', flexWrap: 'wrap' }}
      >
        <div className="col" style={{ gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Customer follow-ups</h2>
          <p style={{ margin: 0, color: 'var(--secondary)', fontSize: 13 }}>
            One confirmed thread. One deadline. A prepared draft when you need it.
          </p>
        </div>
        <Button onClick={() => setOpen(!open)} aria-expanded={open}>
          Watch a customer thread
        </Button>
      </header>
      {problem ? (
        <p role="alert" style={{ color: 'var(--danger)', overflowWrap: 'anywhere' }}>
          {problem}
        </p>
      ) : null}
      {notice ? (
        <p role="status" style={{ color: 'var(--secondary)' }}>
          {notice}
        </p>
      ) : null}
      {open ? (
        <form
          className="col card-12"
          style={{ padding: 20, gap: 20 }}
          onSubmit={(event) => {
            event.preventDefault();
            void confirm();
          }}
        >
          {!sources.length ? (
            <p>
              Watching future replies requires a connected Gmail or Microsoft mailbox that can read
              the complete thread. IMAP watches are unavailable until all-folder completeness can be
              guaranteed. You can prepare today’s draft from pasted notes in Chat.{' '}
              <a href="#/connections">Connect a mailbox</a>
            </p>
          ) : (
            <>
              <label className="col" style={{ gap: 8 }}>
                Connected mailbox
                <select
                  style={fieldStyle}
                  value={connection}
                  onChange={(event) => {
                    setConnection(event.target.value);
                    setPreview(null);
                    setMessages([]);
                  }}
                >
                  {sources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="col" style={{ gap: 8 }}>
                Customer’s email
                <input
                  type="email"
                  required
                  style={fieldStyle}
                  value={customer}
                  onChange={(event) => {
                    setCustomer(event.target.value);
                    setPreview(null);
                  }}
                  placeholder="priya@example.com"
                />
              </label>
              <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
                <label className="col grow" style={{ gap: 8, minWidth: 160 }}>
                  Find the thread
                  <input
                    style={fieldStyle}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Customer or subject"
                  />
                </label>
                <label className="col" style={{ gap: 8 }}>
                  Folder
                  <select
                    style={fieldStyle}
                    value={folder}
                    onChange={(event) => setFolder(event.target.value as 'inbox' | 'sent')}
                  >
                    <option value="sent">Sent</option>
                    <option value="inbox">Inbox</option>
                  </select>
                </label>
                <Button
                  type="button"
                  disabled={busy || !customer || !connection}
                  onClick={() => void search()}
                >
                  Find messages
                </Button>
              </div>
              <div className="col" style={{ gap: 8 }}>
                {messages.map((message) => (
                  <button
                    type="button"
                    key={String(message.key)}
                    disabled={busy || !customer}
                    onClick={() => void read(message.key)}
                    style={{ ...fieldStyle, textAlign: 'left' }}
                    aria-pressed={selected === message.key}
                  >
                    <strong>{message.subject || 'Untitled message'}</strong>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 13,
                        color: 'var(--secondary)',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {message.from}
                      {message.date ? ` · ${new Date(message.date).toLocaleDateString()}` : ''}
                    </span>
                  </button>
                ))}
              </div>
              {selected !== null && !preview && !messages.length ? (
                <Button
                  type="button"
                  disabled={busy || !customer}
                  onClick={() => void read(selected)}
                >
                  Read selected thread
                </Button>
              ) : null}
              {preview ? (
                <div className="col" style={{ gap: 20 }}>
                  <div style={{ borderLeft: '2px solid var(--primary)', paddingLeft: 12 }}>
                    <strong>{preview.subject}</strong>
                    <p style={{ margin: '8px 0', fontSize: 13 }}>
                      {preview.connection_label} · {preview.messages.length} messages · {customer}
                    </p>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--secondary)' }}>
                      {preview.replied
                        ? 'This customer has already replied. Continue the conversation instead.'
                        : 'The current thread has no customer reply after your latest sent message.'}
                    </p>
                  </div>
                  <details>
                    <summary>Review current thread</summary>
                    <div className="col" style={{ gap: 12, paddingTop: 12 }}>
                      {preview.messages.map((message) => (
                        <article
                          key={message.key}
                          style={{
                            padding: 12,
                            background: 'var(--hover)',
                            borderRadius: 8,
                            overflowWrap: 'anywhere',
                          }}
                        >
                          <strong>{message.from}</strong>
                          <p style={{ fontSize: 13, whiteSpace: 'pre-wrap', marginBottom: 0 }}>
                            {message.text}
                          </p>
                        </article>
                      ))}
                    </div>
                  </details>
                  <label className="col" style={{ gap: 8 }}>
                    What this follow-up is about
                    <input
                      style={fieldStyle}
                      value={title}
                      required
                      maxLength={200}
                      onChange={(event) => setTitle(event.target.value)}
                    />
                  </label>
                  <label className="col" style={{ gap: 8 }}>
                    Prepare if there is no reply by
                    <input
                      type="datetime-local"
                      required
                      value={deadline}
                      style={fieldStyle}
                      onChange={(event) => setDeadline(event.target.value)}
                    />
                  </label>
                  <label className="col" style={{ gap: 8 }}>
                    Time zone
                    <input
                      value={zone}
                      required
                      style={fieldStyle}
                      onChange={(event) => setZone(event.target.value)}
                    />
                  </label>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--secondary)' }}>
                    Only this thread will be watched. {instanceName()} may prepare a local draft
                    using your relevant saved preferences and skills. Preparing it does not
                    authorize sending. Results wait in Chat and Work, even when push is unavailable.
                    You can pause this watch here.
                  </p>
                  <Button type="submit" disabled={busy || preview.replied || !deadline || !title}>
                    Confirm thread and timing
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </form>
      ) : null}
      {loading ? <p role="status">Loading responsibilities…</p> : null}
      {!loading && !followups.length && !open ? (
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>
          No customer threads are being watched.
        </p>
      ) : null}
      {followups.map((item) => (
        <article key={item.id} className="col card-12" style={{ gap: 12, padding: 20 }}>
          <div
            className="row"
            style={{ gap: 12, justifyContent: 'space-between', flexWrap: 'wrap' }}
          >
            <strong>{item.title}</strong>
            <span style={{ fontSize: 13, color: 'var(--secondary)' }}>
              {item.state === 'replied'
                ? 'Customer replied'
                : item.state === 'failed'
                  ? 'Needs attention'
                  : item.state}
            </span>
          </div>
          <p
            style={{ margin: 0, fontSize: 13, color: 'var(--secondary)', overflowWrap: 'anywhere' }}
          >
            {item.connection_label} · {item.customer_email}
            <br />
            Follow up at {at(item.deadline_at, item.time_zone)} ({item.time_zone})
            {item.next_check_at ? (
              <>
                <br />
                Next check: {at(item.next_check_at, item.time_zone)}
              </>
            ) : null}
          </p>
          {item.failure ? (
            <p role="status" style={{ margin: 0, color: 'var(--danger)' }}>
              {item.failure}
            </p>
          ) : null}
          {item.result ? (
            <div className="col" style={{ gap: 12 }}>
              <p style={{ margin: 0, fontSize: 14 }}>{item.result.summary}</p>
              {item.result.body ? (
                <div
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: 12,
                    overflowWrap: 'anywhere',
                  }}
                >
                  <p style={{ margin: '0 0 8px', fontSize: 13 }}>
                    To: {item.result.recipient}
                    <br />
                    Subject: {item.result.subject}
                  </p>
                  <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                    {item.result.body}
                  </p>
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--secondary)' }}>
                  Preparation is in progress. Open its conversation for current state.
                </p>
              )}
              {item.result.state === 'obsolete' ? (
                <p role="status">
                  The source changed. This draft is kept for reference and cannot be sent from this
                  watch.
                </p>
              ) : null}
              {item.result.state === 'sent' ? (
                <p role="status">Sent. Open the conversation for the action receipt.</p>
              ) : null}
              <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
                <Button
                  variant="ghost"
                  onClick={() => onOpenConversation(item.result?.conversation_id as string)}
                >
                  {item.result.state === 'sent'
                    ? 'View receipt'
                    : item.result.body && item.result.state === 'prepared'
                      ? 'Edit draft'
                      : 'Open conversation'}
                </Button>
                {item.state === 'prepared' && item.result.state === 'prepared' ? (
                  <Button disabled={busy} onClick={() => void action(item.id, 'send')}>
                    Send
                  </Button>
                ) : null}
                {item.state !== 'dismissed' ? (
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void action(item.id, 'dismiss')}
                  >
                    Dismiss
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
          {!['dismissed', 'replied', 'completed'].includes(item.state) ? (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void action(item.id, item.state === 'paused' ? 'resume' : 'pause')}
            >
              {item.state === 'paused' ? 'Resume watch' : 'Pause watch'}
            </Button>
          ) : null}
        </article>
      ))}
    </section>
  );
}

/** Resolve an explicitly chosen wall time in its IANA zone, refusing nonexistent DST times. */
export function zonedInstant(local: string, timeZone: string): string | null {
  const match = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)$/.exec(local);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  const wanted = Date.UTC(
    parts[0] as number,
    (parts[1] as number) - 1,
    parts[2],
    parts[3],
    parts[4],
  );
  let guess = wanted;
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    for (let step = 0; step < 4; step++) {
      const values = Object.fromEntries(
        formatter.formatToParts(new Date(guess)).map((part) => [part.type, Number(part.value)]),
      );
      if (
        [values.year, values.month, values.day, values.hour, values.minute].some(
          (value) => value === undefined || !Number.isFinite(value),
        )
      )
        return null;
      const shown = Date.UTC(
        values.year as number,
        (values.month as number) - 1,
        values.day,
        values.hour,
        values.minute,
      );
      if (shown === wanted) return new Date(guess).toISOString();
      guess += wanted - shown;
    }
  } catch {
    return null;
  }
  return null;
}
