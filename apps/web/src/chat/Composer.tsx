/**
 * Text and a consistently available Send button. Stop belongs to the active
 * task row; a paused task can additionally expose Resume beside Send. The
 * message target is selected by the containing task or personal session.
 *
 * Where the box is given `attachments`, files come in three ways: the
 * paperclip, a drop on the box, or a paste. Each shows as a tile above the
 * words (a thumbnail for a picture, a name for a document) while it uploads,
 * and a file OpenDuet cannot take is refused with a sentence saying why.
 * Taking a tile out moves focus to the next tile, or to the paperclip when
 * none are left, so the keyboard never drops back to the top of the page.
 *
 * When the installation transcribes speech, a microphone sits beside the
 * state button: tap to record, tap again to stop, and the words land in the
 * box for the person to read and send. Nothing is sent by voice alone.
 */
import { ATTACHMENT_ACCEPT, attachmentSize } from '@openduet/contracts/attachments';
import {
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Icon } from '../design/icons.tsx';
import { IconButton } from '../design/primitives.tsx';
import { useLoad } from '../experience/hooks.ts';
import type { ComposerState } from '../experience/types.ts';
import { openFeedback } from '../feedback/FeedbackPanel.tsx';
import { models } from '../models/api.ts';
import { href } from '../router.ts';
import {
  type AttachmentsControl,
  attachmentUrl,
  fileNote,
  type PendingFile,
} from './attachments.ts';
import { elapsed, useNowTick, useRecorder, type VoicePlace } from './voice.ts';
import './composer.css';
import './message-files.css';
import { assistantName } from '../experience/instance.ts';

/**
 * Said above the box while no model is connected, since nothing sent could be
 * answered: why, and the one step that fixes it.
 */
export function ModelMissing({
  canEdit,
  setupHref = '/settings/models',
}: {
  canEdit: boolean;
  setupHref?: string;
}) {
  return (
    <div className="composer-missing" role="status">
      <Icon name="info" size={15} />
      <span className="grow">
        {canEdit
          ? `${assistantName()} needs a model to answer. Connect one and you can start.`
          : `${assistantName()} needs a model to answer. The person who runs this server can connect one.`}
      </span>
      {canEdit ? (
        <a className="composer-missing-link" href={href(setupHref)}>
          Connect a model
          <Icon name="chevronRight" size={13} />
        </a>
      ) : null}
    </div>
  );
}

export function Composer({
  value,
  onChange,
  onSend,
  onResume,
  state = 'send',
  agentName = assistantName(),
  placeholder = `Message ${agentName}`,
  disabled = false,
  autoFocus = false,
  working = false,
  voice,
  attachments,
  onPasteText,
  modelSetupHref,
  allowModelSetup = false,
  readOnly = false,
  retainedAttachments = 0,
}: {
  value: string;
  onChange: (next: string) => void;
  onSend: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onStop?: () => void;
  state?: ComposerState;
  /** Who answers here: OpenDuet unless the chat or the turn under way has another agent. */
  agentName?: string;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  /** The rim travels while an agent works on the task. */
  working?: boolean;
  /**
   * Present when push-to-talk is available: the longest clip the service takes,
   * where the words will be used, and why voice is off there, if it is.
   */
  voice?: { maxSeconds: number; place: VoicePlace; off: string | null };
  /** The files in the box, where files can be sent. */
  attachments?: AttachmentsControl;
  /** Told the text of each paste, so the message can say which words were pasted. */
  onPasteText?: (text: string) => void;
  modelSetupHref?: string;
  /** The first handoff saves the request before opening model setup. */
  allowModelSetup?: boolean;
  readOnly?: boolean;
  retainedAttachments?: number;
}) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  const [dropping, setDropping] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  /** Where focus goes once a removed tile is gone: a tile's key, or null for the paperclip. */
  const focusAfter = useRef<string | null | undefined>(undefined);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the box resizes on every keystroke
  useEffect(() => {
    const node = textRef.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, 168)}px`;
  }, [value]);

  useEffect(() => {
    if (autoFocus) textRef.current?.focus();
  }, [autoFocus]);

  // Read on each mount, so a model connected in Settings counts at once on return.
  const model = useLoad(() => models.settings(), []);
  const noModel = model.data !== null && !model.data.active.connected;
  const files = attachments?.files ?? [];

  const removeFile = (key: string) => {
    const at = files.findIndex((file) => file.key === key);
    focusAfter.current = files[at + 1]?.key ?? files[at - 1]?.key ?? null;
    attachments?.remove(key);
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once the removed tile has left the list
  useEffect(() => {
    const target = focusAfter.current;
    if (target === undefined) return;
    focusAfter.current = undefined;
    const card = cardRef.current;
    const next = target
      ? card?.querySelector<HTMLElement>(`[data-key="${CSS.escape(target)}"] .attach-x`)
      : card?.querySelector<HTMLElement>('.attach-btn');
    next?.focus();
  }, [files]);
  const waiting = files.some((file) => file.state !== 'ready');
  const canSend =
    (value.trim().length > 0 || (attachments?.ready.length ?? 0) > 0 || retainedAttachments > 0) &&
    !waiting &&
    (allowModelSetup || !noModel) &&
    !disabled;
  const latest = useRef(value);
  latest.current = value;
  const recorder = useRecorder({
    maxSeconds: voice?.maxSeconds ?? 120,
    ...(voice ? { place: voice.place, off: voice.off } : {}),
    onText: (heard) => {
      const current = latest.current;
      onChange(current.trim() ? `${current.replace(/\s+$/, '')} ${heard}` : heard);
      textRef.current?.focus();
    },
  });
  const recording = recorder.state === 'recording';
  const now = useNowTick(recording);

  // `/feedback`, with or without words after it, opens a problem report instead of sending.
  const send = () => {
    const command = /^\/feedback(?:\s+([\s\S]*))?$/i.exec(value.trim());
    if (command) {
      onChange('');
      openFeedback(command[1]?.trim() ?? '');
      return;
    }
    onSend();
  };

  // Sending is the same action for touch, keyboard and mouse. Stop belongs to
  // the task row, so active work never takes away the ability to hand off work.
  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (canSend) send();
    }
  };

  const stateButton = (
    <IconButton
      name="arrowUp"
      label="Send"
      variant={canSend ? 'primary' : 'mutedFill'}
      disabled={!canSend}
      title={
        noModel
          ? allowModelSetup
            ? 'Keep your request and connect a model'
            : 'Connect a model to send'
          : undefined
      }
      onClick={send}
    />
  );

  // Only a drag that carries files is a drop for the box; dragged text is left alone.
  const carriesFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false;
  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!attachments || disabled || readOnly || !carriesFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDropping(true);
  };
  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setDropping(false);
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!attachments || disabled || readOnly || !carriesFiles(event)) return;
    event.preventDefault();
    setDropping(false);
    attachments.add([...event.dataTransfer.files]);
    textRef.current?.focus();
  };
  // A pasted picture (a screenshot, say) is attached; pasted text stays text.
  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const text = event.clipboardData.getData('text/plain');
    if (text) onPasteText?.(text);
    if (!attachments || readOnly) return;
    const pasted = [...event.clipboardData.files];
    if (!pasted.length || event.clipboardData.types.includes('text/plain')) return;
    event.preventDefault();
    attachments.add(pasted);
  };
  const note = fileNote(attachments?.problem ?? null, files);

  return (
    <div className="composer" data-disabled={disabled ? 'true' : undefined}>
      {noModel && model.data ? (
        allowModelSetup ? (
          <div className="composer-missing" role="status">
            Your request will be kept through model setup.
          </div>
        ) : (
          <ModelMissing canEdit={model.data.can_edit} setupHref={modelSetupHref} />
        )
      ) : null}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: a drop target only; the paperclip is the keyboard way in */}
      <div
        ref={cardRef}
        className="composer-card"
        data-dropping={dropping ? 'true' : undefined}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {working ? <div className="rim" aria-hidden="true" /> : null}
        {files.length ? (
          <ul className="composer-tiles" aria-label="Files to send">
            {files.map((file) => (
              <FileTile
                key={file.key}
                file={file}
                onRemove={() => removeFile(file.key)}
                readOnly={readOnly}
              />
            ))}
          </ul>
        ) : null}
        {dropping ? (
          <div className="composer-drop" aria-hidden="true">
            <Icon name="paperclip" size={16} />
            Drop to attach
          </div>
        ) : null}
        <div className="composer-row" style={{ paddingLeft: attachments ? 0 : 6 }}>
          {attachments ? (
            <>
              <IconButton
                name="paperclip"
                label="Attach files"
                className="attach-btn"
                disabled={disabled || readOnly}
                onClick={() => pickRef.current?.click()}
              />
              <input
                ref={pickRef}
                type="file"
                multiple
                accept={ATTACHMENT_ACCEPT}
                hidden
                tabIndex={-1}
                aria-hidden="true"
                data-testid="attach-input"
                onChange={(event) => {
                  attachments.add([...(event.target.files ?? [])]);
                  event.target.value = '';
                  textRef.current?.focus();
                }}
              />
            </>
          ) : null}
          <textarea
            ref={textRef}
            rows={1}
            value={value}
            placeholder={placeholder}
            disabled={disabled}
            readOnly={readOnly}
            aria-label={placeholder}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={onKey}
            onPaste={onPaste}
          />
          {voice ? (
            <button
              type="button"
              className="mic-btn"
              data-state={recorder.state}
              aria-label={
                recording
                  ? 'Stop recording'
                  : recorder.state === 'transcribing'
                    ? 'Transcribing your voice message'
                    : 'Record a voice message'
              }
              aria-pressed={recording}
              title={recording ? 'Stop recording' : (voice.off ?? 'Record a voice message')}
              data-off={voice.off ? 'true' : undefined}
              disabled={disabled}
              // Busy rather than disabled: a disabled button drops keyboard focus mid-press.
              aria-disabled={recorder.state === 'starting' || recorder.state === 'transcribing'}
              onClick={recorder.toggle}
            >
              {recording ? (
                <>
                  <span className="mic-dot" aria-hidden="true" />
                  <span className="mic-time">{elapsed(now - recorder.startedAt)}</span>
                </>
              ) : recorder.state === 'transcribing' ? (
                <Icon name="loader" size={16} className="spin" />
              ) : (
                <Icon name="mic" size={16} />
              )}
            </button>
          ) : null}
          {state === 'resume' && onResume ? (
            <IconButton name="play" label="Resume this task" onClick={onResume} />
          ) : null}
          {stateButton}
        </div>
      </div>
      {note ? (
        <div className="composer-note composer-problem" role="alert">
          {note}
        </div>
      ) : null}
      {voice ? (
        <div className="composer-note" role="status" aria-live="polite">
          {recording
            ? `Recording. Tap stop when you are done; it stops by itself at ${voice.maxSeconds / 60} minutes.`
            : recorder.state === 'transcribing'
              ? 'Turning your voice message into text…'
              : (recorder.problem ?? '')}
        </div>
      ) : null}
    </div>
  );
}

/** One file in the box: a thumbnail or a name, its state, and a way to take it out. */
function FileTile({
  file,
  onRemove,
  readOnly = false,
}: {
  file: PendingFile;
  onRemove: () => void;
  readOnly?: boolean;
}) {
  // A file waiting to be tried again looks like one that failed, with its own words.
  const failed = file.state === 'failed' || file.state === 'retrying';
  const picture =
    file.kind === 'image'
      ? (file.thumb ?? (file.view?.has_preview ? attachmentUrl(file.view.id, true) : null))
      : null;
  const state =
    file.state === 'uploading'
      ? 'Uploading'
      : failed
        ? (file.error ?? 'Didn’t upload')
        : attachmentSize(file.size);
  return (
    <li
      className="attach-tile"
      data-key={file.key}
      data-doc={picture ? undefined : 'true'}
      data-state={file.state}
      title={`${file.name} · ${state}`}
    >
      {picture ? (
        <img src={picture} alt={file.name} />
      ) : (
        <>
          <Icon name={failed ? 'alert' : 'fileText'} size={16} />
          <span className="attach-name">
            <span className="attach-title">{file.name}</span>
            <span className="attach-meta">{state}</span>
          </span>
        </>
      )}
      {file.state === 'uploading' ? (
        <span className="attach-busy" role="status" aria-label={`Uploading ${file.name}`}>
          <Icon name="loader" size={14} className="spin" />
        </span>
      ) : failed && picture ? (
        <span className="attach-busy" data-failed="true" role="img" aria-label={state}>
          <Icon name="alert" size={14} />
        </span>
      ) : null}
      <button
        type="button"
        className="attach-x"
        aria-label={`Remove ${file.name}`}
        disabled={readOnly}
        onClick={onRemove}
      >
        <span>
          <Icon name="x" size={10} stroke={3} />
        </span>
      </button>
    </li>
  );
}
