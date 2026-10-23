import { useCallback, useEffect, useRef, useState } from 'react';
import { useAttachments } from '../chat/attachments.ts';
import { ChatScreen } from '../chat/Chat.tsx';
import { Composer } from '../chat/Composer.tsx';
import { Markdown } from '../chat/Markdown.tsx';
import { Icon } from '../design/icons.tsx';
import { LoadError } from '../design/LoadError.tsx';
import { Button, IconButton } from '../design/primitives.tsx';
import { adapter } from '../experience/adapter.ts';
import {
  beginHandoff,
  discardHandoff,
  type HandoffDraft,
  handoffHasTarget,
  loadHandoff,
  saveHandoff,
  submitHandoff,
} from '../experience/handoff.ts';
import { messageKey, useApp, useDecisions, useLoad, useMedia } from '../experience/hooks.ts';
import { assistantName } from '../experience/instance.ts';
import {
  hasUsefulOutput,
  type PersonalReference,
  type PersonalTarget,
  personal,
  targetOf,
  visibleReferences,
} from '../experience/personal-session.ts';
import { givenName } from '../experience/profile.ts';
import { markValueMoment } from '../experience/push.ts';
import { updateRequestDraft } from '../experience/request-draft.ts';
import { TaskDependencies, type TaskDependency } from '../experience/task-dependency.tsx';
import { LearningActions } from '../learning/LearningActions.tsx';
import { models } from '../models/api.ts';
import { primaryModelReady } from '../models/readiness.ts';
import { href, navigate, useRoute } from '../router.ts';
import { sampleMode } from '../sample/mode.ts';
import { Shell, toast } from '../shell/Shell.tsx';
import { PushOffer } from './Notifications.tsx';
import './personal-chat.css';
import { AssistantPulse } from './AssistantPulse.tsx';

const ACTIVE = new Set(['queued', 'running', 'working', 'streaming', 'stalled']);

export const HANDOFF_STARTERS = [
  { label: 'Prepare for a meeting', text: 'Prepare for a meeting. Here is the context: ' },
  { label: 'Research a decision', text: 'Help me research a decision. I need to decide: ' },
  { label: 'Help with a follow-up', text: 'Help with a follow-up. Here are my notes: ' },
] as const;

/** One exact task/result, read from the existing transcript rather than invented feed copy. */
function FeedResult({
  reference,
  onOpen,
  onReply,
  onConnectSource,
  onProvideContext,
}: {
  reference: PersonalReference;
  onOpen: (reference: PersonalReference) => void;
  onReply: (reference: PersonalReference, turnId?: string) => void;
  onConnectSource: (dependency: TaskDependency) => void;
  onProvideContext: (reference: PersonalReference) => void;
}) {
  const result = useLoad(
    () => adapter.turnsPage(reference.conversation_id, { limit: 8, events: true }),
    [reference.conversation_id, reference.updated_at],
  );
  const drafts = useLoad(
    () => adapter.drafts(reference.conversation_id),
    [reference.conversation_id, reference.updated_at],
  );
  const turns = result.data?.turns ?? [];
  const turn = reference.turn_id
    ? turns.find((item) => item.id === reference.turn_id)
    : turns.at(-1);
  const answer = turn?.answer ?? reference.output ?? '';
  const latest = !reference.turn_id || turns.at(-1)?.id === reference.turn_id;
  const exactDraft = (result.data?.events ?? [])
    .flatMap((event) =>
      event.turn_id === turn?.id && event.item.type === 'permission' && event.item.permission.draft
        ? [event.item.permission.draft]
        : [],
    )
    .at(-1);
  const draft =
    exactDraft ??
    (latest
      ? drafts.data?.drafts.find(
          (item) => item.status === 'draft' || item.status === 'awaiting_permission',
        )
      : undefined);
  const draftReady = draft && (draft.status === 'draft' || draft.status === 'awaiting_permission');
  const sourceEntries = (result.data?.events ?? []).flatMap((event) =>
    event.turn_id === turn?.id && event.item.type === 'action' ? event.item.sources : [],
  );
  const sources = [
    ...new Map(
      sourceEntries.map((source) => [
        `${source.connection_id}:${source.title}:${source.url ?? ''}`,
        source,
      ]),
    ).values(),
  ];
  const receipts = (result.data?.events ?? []).flatMap((event) =>
    event.turn_id === turn?.id && event.item.type === 'receipt' ? [event.item.receipt] : [],
  );
  const previous = useRef(reference.status);
  useEffect(() => {
    if (ACTIVE.has(previous.current) && reference.status === 'done' && hasUsefulOutput(answer))
      markValueMoment();
    previous.current = reference.status;
  }, [reference.status, answer]);
  const working = ACTIVE.has(reference.status);
  const produced = hasUsefulOutput(answer) || receipts.length > 0 || draftReady;
  return (
    <article className="personal-turn" data-status={reference.status}>
      {turn?.text ? (
        <div className="personal-user-message">
          <p>{turn.text}</p>
        </div>
      ) : null}
      <div className="personal-result-head">
        <Icon
          name={working ? 'loader' : reference.status === 'needs_you' ? 'hand' : 'fileText'}
          size={16}
          className={working ? 'spin' : undefined}
        />
        <button type="button" onClick={() => onOpen(reference)}>
          {reference.title}
        </button>
        <span>
          {draftReady
            ? 'Draft prepared'
            : working
              ? 'In progress'
              : reference.status === 'done'
                ? produced
                  ? 'Finished'
                  : 'Task ended'
                : reference.status.replaceAll('_', ' ')}
        </span>
      </div>
      <TaskDependencies
        conversationId={reference.conversation_id}
        status={reference.status}
        updatedAt={reference.updated_at}
        onConnect={onConnectSource}
        onProvideContext={() => onProvideContext(reference)}
      />
      {answer.trim() ? (
        <div className="personal-answer">
          <Markdown
            text={answer.length > 1400 ? `${answer.slice(0, 1400)}…` : answer}
            streaming={working}
          />
        </div>
      ) : result.error ? (
        <p className="personal-muted" role="alert">
          {result.error}
        </p>
      ) : (
        <p className="personal-muted">
          {working
            ? 'The task is running. You can start another while it continues.'
            : reference.status === 'needs_you'
              ? 'Open this task to review the exact decision.'
              : 'Open the task for its output and activity.'}
        </p>
      )}
      {reference.status === 'done' && !produced ? (
        <p className="personal-muted">
          This task ended without a concrete output. Open its activity to review or continue.
        </p>
      ) : null}
      {draftReady ? (
        <div className="personal-draft">
          <div>
            <span>To</span>
            <strong>{draft.recipient}</strong>
          </div>
          {draft.subject ? (
            <div>
              <span>Subject</span>
              <strong>{draft.subject}</strong>
            </div>
          ) : null}
          <p>{draft.body}</p>
          <small>
            Prepared for your review.{' '}
            {draft.status === 'awaiting_permission'
              ? 'A decision is waiting; edits require a fresh approval.'
              : 'This draft has not been sent.'}
          </small>
        </div>
      ) : null}
      {receipts.map((receipt) => (
        <p key={receipt.id} className="personal-receipt">
          <Icon name="circleCheck" size={14} />
          {receipt.what} · {receipt.where}
        </p>
      ))}
      {sources.length ? (
        <details className="personal-sources">
          <summary>
            {sources.length} source{sources.length === 1 ? '' : 's'}
          </summary>
          {sources.map((source) =>
            source.url ? (
              <a
                key={`${source.connection_id}:${source.title}:${source.url ?? ''}`}
                href={source.url}
                target="_blank"
                rel="noreferrer"
              >
                {source.title}
              </a>
            ) : (
              <span key={`${source.connection_id}:${source.title}`}>
                {source.title} · {source.app}
              </span>
            ),
          )}
        </details>
      ) : null}
      <div className="personal-result-actions">
        <Button size="sm" variant="outline" onClick={() => onOpen(reference)}>
          {draftReady
            ? 'Review and send'
            : reference.status === 'needs_you'
              ? 'Review decision'
              : 'Open result'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon="pencil"
          onClick={() => onReply(reference, turn?.id)}
        >
          {draftReady
            ? 'Edit draft'
            : reference.status === 'done'
              ? 'Revise or continue'
              : 'Continue task'}
        </Button>
        <a
          href={href(
            `/chat/${reference.conversation_id}${reference.turn_id ? `?turn=${encodeURIComponent(reference.turn_id)}` : ''}`,
          )}
        >
          Originating task
          <Icon name="arrowUpRight" size={12} />
        </a>
      </div>
      {reference.status === 'done' && produced && (turn?.id ?? reference.turn_id) ? (
        <LearningActions
          key={`${reference.conversation_id}:${turn?.id ?? reference.turn_id}`}
          source={{
            conversationId: reference.conversation_id,
            turnId: (turn?.id ?? reference.turn_id) as string,
            title: reference.title,
            text: draftReady
              ? draft.body
              : hasUsefulOutput(answer)
                ? answer
                : receipts.map((receipt) => `${receipt.what} · ${receipt.where}`).join('\n'),
          }}
        />
      ) : null}
    </article>
  );
}

export function PersonalChatScreen() {
  const { profile, conversations, refreshConversations } = useApp();
  const decisions = useDecisions();
  const route = useRoute();
  const session = useLoad(() => personal.session(), []);
  const model = useLoad(() => models.settings(), []);
  const [savedDraft, setSavedDraft] = useState<HandoffDraft | null>(() => {
    const draft = loadHandoff();
    return draft &&
      (route.query.get('handoff') === draft.id || route.query.get('starter') === draft.id)
      ? draft
      : null;
  });
  const [text, setText] = useState(() => savedDraft?.text ?? route.query.get('request') ?? '');
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [target, setTarget] = useState<{ value: PersonalTarget; title: string } | null>(() =>
    savedDraft?.target && savedDraft.target.kind !== 'new_task'
      ? { value: savedDraft.target, title: savedDraft.targetTitle ?? 'Selected task' }
      : null,
  );
  const [selected, setSelected] = useState<PersonalReference | null>(null);
  const [contextFor, setContextFor] = useState<string | null>(null);
  const [stopping, setStopping] = useState<string | null>(null);
  const files = useAttachments();
  const composeRef = useRef<HTMLDivElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const submission = useRef<{ identity: string; key: string } | null>(null);
  const autoAttempted = useRef<string | null>(null);
  const observedActive = useRef(new Set<string>());
  const localFileIds = useRef(new Set<string>());
  const phone = useMedia('(max-width: 767px)');
  const overlay = useMedia('(max-width: 1391px)');
  const references = visibleReferences(session.data?.session.references ?? []);
  const visible = showAll ? references : references.slice(-8);
  const active = conversations.filter((conversation) => ACTIVE.has(conversation.status));
  const unfinished = conversations
    .filter((conversation) => conversation.status !== 'done' && conversation.status !== 'stopped')
    .slice(0, 2);
  const newResults = references.filter(
    (reference) =>
      reference.status === 'done' &&
      session.data?.session.read_at &&
      reference.updated_at > session.data.session.read_at,
  );
  const pending = [
    ...decisions.permissions.map((permission) => ({
      id: permission.id,
      title: permission.what,
      conversation_id: permission.conversation_id,
    })),
    ...decisions.questions.map((question) => ({
      id: question.id,
      title: question.text,
      conversation_id: question.conversation_id,
    })),
  ];
  const noModel = model.data && !model.data.active.connected;
  const ready = Boolean(
    model.data?.active.connected && (sampleMode || primaryModelReady(model.data)),
  );
  useEffect(() => {
    const current = session.data?.session.references ?? [];
    if (
      current.some(
        (reference) =>
          reference.status === 'done' &&
          hasUsefulOutput(reference.output ?? '') &&
          observedActive.current.has(reference.conversation_id),
      )
    )
      markValueMoment();
    observedActive.current = new Set(
      current
        .filter((reference) => ACTIVE.has(reference.status))
        .map((reference) => reference.conversation_id),
    );
  }, [session.data]);

  useEffect(() => {
    const id = route.query.get('handoff') ?? route.query.get('starter');
    if (!id) return;
    const draft = loadHandoff();
    if (draft?.id === id) {
      setSavedDraft(draft);
      setText(draft.text);
      setTarget(
        draft.target && draft.target.kind !== 'new_task'
          ? { value: draft.target, title: draft.targetTitle ?? 'Selected task' }
          : null,
      );
    }
  }, [route.query]);
  useEffect(() => {
    if (
      (!noModel && !savedDraft) ||
      savedDraft?.attempted ||
      (target && !savedDraft) ||
      (!text.trim() && !files.ready.length)
    )
      return;
    try {
      const current = savedDraft ?? beginHandoff(text, files.ready);
      const ids = new Set(files.ready.map((file) => file.id));
      const removed = new Set([...localFileIds.current].filter((id) => !ids.has(id)));
      localFileIds.current = ids;
      const next = {
        ...updateRequestDraft(current, text, files.ready, removed),
        target: target?.value ?? { kind: 'new_task' as const },
        targetTitle: target?.title,
      };
      if (JSON.stringify(current) !== JSON.stringify(next) || !savedDraft) {
        saveHandoff(next);
        setSavedDraft(next);
      }
    } catch (error) {
      toast({
        kind: 'err',
        title: error instanceof Error ? error.message : 'Couldn’t keep this request through setup.',
      });
    }
  }, [noModel, target, text, files.ready, savedDraft]);
  useEffect(() => {
    const onReady = () => {
      autoAttempted.current = null;
      model.reload();
    };
    window.addEventListener('openduet:model-ready', onReady);
    return () => window.removeEventListener('openduet:model-ready', onReady);
  }, [model.reload]);
  useEffect(() => {
    if (
      !savedDraft ||
      route.query.get('handoff') !== savedDraft.id ||
      !ready ||
      autoAttempted.current === savedDraft.id
    )
      return;
    autoAttempted.current = savedDraft.id;
    setBusy(true);
    void (async () => {
      const fresh = await models.settings();
      if (fresh.data) model.set(fresh.data);
      if (!fresh.data?.active.connected || (!sampleMode && !primaryModelReady(fresh.data))) {
        if (!fresh.data)
          toast({ kind: 'err', title: fresh.error ?? 'Couldn’t verify the current model.' });
        return null;
      }
      return submitHandoff(savedDraft);
    })().then((result) => {
      setBusy(false);
      if (!result) return;
      if (!result.data) {
        setSavedDraft(loadHandoff());
        toast({
          kind: 'err',
          title: result.error ?? 'The saved request is still here. Retry when ready.',
        });
        return;
      }
      discardHandoff(savedDraft.id);
      refreshConversations();
      navigate(`/chat/${result.data.conversation_id}`);
    });
  }, [savedDraft, route.query, ready, refreshConversations, model.set]);

  useEffect(() => {
    const timer = setInterval(session.reload, 6000);
    return () => clearInterval(timer);
  }, [session.reload]);
  useEffect(() => {
    const request = route.query.get('request');
    if (request) setText(request);
  }, [route.query]);
  const focusComposer = () =>
    requestAnimationFrame(() => composeRef.current?.querySelector('textarea')?.focus());
  const closeInspector = useCallback(() => {
    setSelected(null);
    setContextFor(null);
    opener.current?.focus();
  }, []);
  useEffect(() => {
    if (!selected) return;
    if (overlay) inspectorRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeInspector();
      }
      if (event.key !== 'Tab' || !overlay) return;
      const controls = inspectorRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
      );
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === inspectorRef.current)
      ) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, overlay, closeInspector]);

  const open = (reference: PersonalReference) => {
    opener.current = document.activeElement as HTMLElement | null;
    setSelected(reference);
    setContextFor(null);
    if (session.data?.session.references.some((item) => item.id === reference.id))
      void personal.read(reference.id).then(() => session.reload());
  };
  const preserveBeforeRecovery = (): boolean => {
    if (!text.trim() && !files.ready.length && !savedDraft?.attachments.length) return true;
    if (files.uploading || files.files.some((file) => file.state !== 'ready')) {
      toast({
        kind: 'err',
        title: 'Wait for your files to finish uploading before opening setup.',
      });
      return false;
    }
    try {
      const kept = savedDraft?.attempted
        ? savedDraft
        : saveHandoff({
            ...updateRequestDraft(savedDraft ?? beginHandoff(text, files.ready), text, files.ready),
            target: target?.value ?? { kind: 'new_task' },
            targetTitle: target?.title,
          });
      setSavedDraft(kept);
      navigate(`/?starter=${encodeURIComponent(kept.id)}`);
      return true;
    } catch (error) {
      toast({
        kind: 'err',
        title: error instanceof Error ? error.message : 'Couldn’t keep your request.',
      });
      return false;
    }
  };
  const connectSource = (dependency: TaskDependency) => {
    if (!preserveBeforeRecovery()) return;
    window.open(href('/settings/connections'), '_blank', 'noopener,noreferrer');
    toast({
      kind: 'info',
      title: `Reconnect ${dependency.label} in Connections, then return to this task.`,
    });
  };
  const provideContext = (reference: PersonalReference) => {
    if (!preserveBeforeRecovery()) return;
    open(reference);
    setContextFor(reference.conversation_id);
    requestAnimationFrame(() => inspectorRef.current?.querySelector('textarea')?.focus());
  };
  const reply = (reference: PersonalReference, turnId?: string) => {
    const value = targetOf({
      ...reference,
      ...(turnId && reference.status === 'done' ? { kind: 'result', turn_id: turnId } : {}),
    });
    if (!value) {
      toast({
        kind: 'info',
        title: 'Which result would you like to revise?',
        sub: 'Open a specific result, then use Reply to this result.',
      });
      return;
    }
    setTarget({ value, title: reference.title });
    if (phone) setSelected(null);
    focusComposer();
  };
  const start = async () => {
    const clean = text.trim();
    if ((!clean && !files.ready.length && !savedDraft?.attachments.length) || busy) return;
    const value = target?.value ?? { kind: 'new_task' as const };
    const ids = files.ready.map((file) => file.id);
    const identity = JSON.stringify({ value, text, ids });
    if (submission.current?.identity !== identity)
      submission.current = { identity, key: messageKey() };
    let held: HandoffDraft | null = null;
    try {
      if (savedDraft?.attempted && !handoffHasTarget(savedDraft, value))
        throw new Error('Recover the submitted request before choosing another task.');
      held = savedDraft
        ? saveHandoff({
            ...updateRequestDraft(savedDraft, text, files.ready),
            target: value,
            targetTitle: target?.title,
          })
        : null;
    } catch (error) {
      toast({
        kind: 'err',
        title: error instanceof Error ? error.message : 'Couldn’t keep your request.',
      });
      return;
    }
    setBusy(true);
    if (held) {
      const fresh = await models.settings();
      if (fresh.data) model.set(fresh.data);
      if (!fresh.data?.active.connected || (!sampleMode && !primaryModelReady(fresh.data))) {
        setBusy(false);
        navigate(`/settings/models?handoff=${encodeURIComponent(held.id)}`);
        return;
      }
    }
    const accepted = held
      ? await submitHandoff(held)
      : await personal.message(value, text, submission.current.key, ids);
    setBusy(false);
    if (!accepted.data) {
      if (held) setSavedDraft(loadHandoff());
      toast({
        kind: 'err',
        title: 'Your message has not been sent',
        sub: accepted.error ?? accepted.unavailable ?? 'Try again.',
      });
      return;
    }
    submission.current = null;
    if (held) discardHandoff(held.id);
    setSavedDraft(null);
    setText('');
    files.clear();
    setTarget(null);
    refreshConversations();
    session.reload();
    // A submitted message is a task of its own unless the person explicitly targeted a result.
    setSelected(null);
    focusComposer();
  };
  const stop = async (conversationId: string) => {
    setStopping(conversationId);
    const stopped = await adapter.stop(conversationId);
    setStopping(null);
    if (!stopped.data) toast({ kind: 'err', title: stopped.error ?? 'Couldn’t stop this task' });
    refreshConversations();
    session.reload();
  };
  const selectConversation = (id: string, title: string) =>
    open(
      references.find(
        (reference) => reference.conversation_id === id && reference.kind === 'conversation',
      ) ??
        references.filter((reference) => reference.conversation_id === id).at(-1) ?? {
          id,
          kind: 'conversation',
          conversation_id: id,
          title,
          status:
            conversations.find((conversation) => conversation.id === id)?.status ?? 'needs_you',
          updated_at: '',
        },
    );

  const inspector = selected ? (
    <aside
      className="personal-inspector"
      role="dialog"
      aria-modal={overlay}
      aria-label={selected.title}
      ref={inspectorRef}
      tabIndex={-1}
    >
      <header>
        <Button variant="ghost" size="sm" icon="chevronLeft" onClick={closeInspector}>
          {phone ? 'Back' : 'Close'}
        </Button>
        <span className="clamp1 personal-inspector-title">{selected.title}</span>
        <Button size="sm" variant="outline" onClick={() => reply(selected)}>
          Reply to this result
        </Button>
      </header>
      <ChatScreen
        key={`${selected.conversation_id}:${selected.turn_id ?? ''}`}
        id={selected.conversation_id}
        embedded
        focusTurnId={selected.turn_id}
        hideComposer={contextFor !== selected.conversation_id}
      />
    </aside>
  ) : null;

  return (
    <Shell title="Chat" rail={false} panel={!overlay ? inspector : undefined}>
      <div className="personal-chat">
        <header className="personal-chat-head">
          <span>{assistantName()}</span>
          <a href={href('/chats')} className="personal-muted">
            Task history
            <Icon name="chevronRight" size={14} />
          </a>
        </header>
        <div className="personal-scroll">
          <div className="personal-reading">
            <AssistantPulse
              onCollaborate={(prompt, attachment, item) => {
                if (
                  text.trim() ||
                  files.files.length ||
                  target ||
                  savedDraft?.attempted ||
                  savedDraft?.attachments.length
                ) {
                  toast({
                    kind: 'info',
                    title:
                      'Finish or clear your current request first. Your words and files are still here.',
                  });
                  return false;
                }
                try {
                  const nextTarget: PersonalTarget = item.conversation_id
                    ? { kind: 'continue_task', conversation_id: item.conversation_id }
                    : { kind: 'new_task' };
                  const draft = saveHandoff({
                    ...beginHandoff(prompt, [attachment]),
                    target: nextTarget,
                    targetTitle: item.context,
                  });
                  setSavedDraft(draft);
                  setText(prompt);
                  files.restore([attachment]);
                  setTarget(
                    nextTarget.kind === 'new_task'
                      ? null
                      : { value: nextTarget, title: item.context },
                  );
                  navigate(`/?starter=${encodeURIComponent(draft.id)}`);
                  focusComposer();
                  toast({
                    kind: 'info',
                    title: 'Context is ready. Add your thoughts, then Send when you’re ready.',
                  });
                  return true;
                } catch (error) {
                  toast({
                    kind: 'err',
                    title: error instanceof Error ? error.message : 'Couldn’t keep this request.',
                  });
                  return false;
                }
              }}
            />
            {!references.length ? (
              <header className="personal-invitation">
                <h1>
                  {unfinished.length
                    ? `Welcome back${givenName(profile) ? `, ${givenName(profile)}` : ''}.`
                    : 'What would you like off your plate?'}
                </h1>
                <p>Send a task, notes, or a file. I’ll keep the work and its result here.</p>
              </header>
            ) : null}
            {session.error ? (
              <LoadError
                what="your personal conversation"
                error={session.error}
                onRetry={session.reload}
              />
            ) : null}
            {newResults.length ? (
              <section className="personal-since">
                <h2>Since you were here</h2>
                {newResults.slice(-2).map((reference) => (
                  <button key={reference.id} type="button" onClick={() => open(reference)}>
                    <Icon name="circleCheck" size={15} />
                    {reference.title}
                    <Icon name="chevronRight" size={14} />
                  </button>
                ))}
              </section>
            ) : null}
            {pending.length ? (
              <section className="personal-decisions">
                <div>
                  <h2>Needs you</h2>
                  <a href={href('/work?view=needs')}>
                    Show all{pending.length > 3 ? ` (${pending.length})` : ''}
                  </a>
                </div>
                {pending.slice(0, 3).map((decision) => (
                  <button
                    key={decision.id}
                    type="button"
                    onClick={() =>
                      decision.conversation_id
                        ? selectConversation(decision.conversation_id, decision.title)
                        : navigate('/work?view=needs')
                    }
                  >
                    <Icon name="hand" size={15} />
                    <span>{decision.title}</span>
                    <Icon name="chevronRight" size={14} />
                  </button>
                ))}
              </section>
            ) : null}
            {active.length ? (
              <section className="personal-active" aria-label="Active work">
                <Icon name="loader" size={14} className="spin" />
                <span>
                  {active.length} task{active.length === 1 ? '' : 's'} in progress
                </span>
                {active.slice(0, 2).map((conversation) => (
                  <div key={conversation.id}>
                    <button
                      type="button"
                      onClick={() => selectConversation(conversation.id, conversation.title)}
                    >
                      {conversation.title}
                    </button>
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={stopping === conversation.id}
                      onClick={() => void stop(conversation.id)}
                    >
                      Stop<span className="sr-only"> {conversation.title}</span>
                    </Button>
                  </div>
                ))}
                {active.length > 2 ? <a href={href('/work?view=progress')}>View all</a> : null}
              </section>
            ) : null}
            {!references.length && unfinished.length ? (
              <div className="personal-unfinished">
                {unfinished.map((conversation) => (
                  <div key={conversation.id}>
                    <span>{conversation.title}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setTarget({
                          value: { kind: 'continue_task', conversation_id: conversation.id },
                          title: conversation.title,
                        });
                        focusComposer();
                      }}
                    >
                      Continue
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
            {references.length > 8 && !showAll ? (
              <Button size="sm" variant="ghost" onClick={() => setShowAll(true)}>
                Show earlier tasks
              </Button>
            ) : null}
            {visible.map((reference) => (
              <FeedResult
                key={`${reference.id}:${reference.turn_id ?? ''}`}
                reference={reference}
                onOpen={open}
                onReply={reply}
                onConnectSource={connectSource}
                onProvideContext={provideContext}
              />
            ))}
            {!references.length && !unfinished.length ? (
              <div className="personal-starters">
                {HANDOFF_STARTERS.map((starter) => (
                  <button
                    key={starter.label}
                    type="button"
                    onClick={() => {
                      setText(starter.text);
                      focusComposer();
                    }}
                  >
                    <Icon name="plus" size={15} />
                    {starter.label}
                  </button>
                ))}
              </div>
            ) : null}
            <PushOffer />
          </div>
        </div>
        <div className="personal-compose" ref={composeRef}>
          {target ? (
            <div className="personal-reply-context">
              <Icon name="chat" size={14} />
              <span>Replying to: {target.title}</span>
              <IconButton
                name="x"
                label="Remove reply context and start a new task"
                onClick={() => setTarget(null)}
              />
            </div>
          ) : null}
          <div className="personal-compose-mode">
            <span>{target ? 'Continue selected work' : 'New task'}</span>
            <button
              type="button"
              onClick={() => {
                setTarget(null);
                if (savedDraft?.attempted) {
                  discardHandoff(savedDraft.id);
                  setSavedDraft(null);
                  setText('');
                  files.clear();
                }
                focusComposer();
              }}
            >
              <Icon name="plus" size={13} />
              New task
            </button>
          </div>
          {savedDraft && (!ready || savedDraft.attempted) ? (
            <div className="personal-saved-request">
              <strong>Your request is kept here</strong>
              <p>{savedDraft.text}</p>
              {savedDraft.attachmentNames.map((name, index) => (
                <span key={savedDraft.attachments[index]} className="row" style={{ gap: 8 }}>
                  {name}
                  {!savedDraft.attempted ? (
                    <IconButton
                      name="x"
                      label={`Remove ${name}`}
                      onClick={() => {
                        const next = updateRequestDraft(
                          savedDraft,
                          text,
                          [],
                          new Set([savedDraft.attachments[index] as string]),
                        );
                        saveHandoff(next);
                        setSavedDraft(next);
                        const file = files.files.find(
                          (item) => item.view?.id === savedDraft.attachments[index],
                        );
                        if (file) files.remove(file.key);
                      }}
                    />
                  ) : null}
                </span>
              ))}
              {savedDraft.attempted ? (
                <p>
                  The request is kept exactly as sent. Retry recovers its existing receipt; New task
                  starts separate work.
                </p>
              ) : (
                <a href={href(`/settings/models?handoff=${encodeURIComponent(savedDraft.id)}`)}>
                  Connect and check model
                </a>
              )}
            </div>
          ) : null}
          <Composer
            value={text}
            onChange={setText}
            onSend={() => void start()}
            placeholder={`Ask ${assistantName()} to handle something`}
            attachments={files}
            disabled={busy}
            readOnly={savedDraft?.attempted}
            retainedAttachments={savedDraft?.attachments.length}
            allowModelSetup={Boolean(savedDraft && !ready)}
            modelSetupHref={
              savedDraft
                ? `/settings/models?handoff=${encodeURIComponent(savedDraft.id)}`
                : undefined
            }
          />
          <p className="personal-compose-note">
            {target
              ? 'This message refers to the selected task. Editing a draft requires a fresh review before sending.'
              : 'A new task runs independently. Work already in progress keeps going.'}
          </p>
        </div>
      </div>
      {overlay && selected ? (
        <div className="personal-inspector-overlay">
          <button
            type="button"
            className="personal-inspector-scrim"
            aria-label="Close result"
            tabIndex={-1}
            onClick={closeInspector}
          />
          {inspector}
        </div>
      ) : null}
    </Shell>
  );
}
