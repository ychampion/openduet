/** Sign-in followed by an actual saved task, with optional model setup. */

import { useEffect, useRef, useState } from 'react';
import { useAttachments } from '../chat/attachments.ts';
import { Composer } from '../chat/Composer.tsx';
import { Icon } from '../design/icons.tsx';
import { LoadError } from '../design/LoadError.tsx';
import { OpenDuetMark } from '../design/mark.tsx';
import { Button, Field, Input, Select } from '../design/primitives.tsx';
import { NEW_PASSWORD_MIN } from '../experience/account.ts';
import { adapter } from '../experience/adapter.ts';
import {
  beginHandoff,
  discardHandoff,
  loadHandoff,
  removeHandoffAttachment,
  saveHandoff,
  submitHandoff,
} from '../experience/handoff.ts';
import { useApp, useLoad, useMedia } from '../experience/hooks.ts';
import { instanceName } from '../experience/instance.ts';
import { UNNAMED } from '../experience/profile.ts';
import { updateRequestDraft } from '../experience/request-draft.ts';
import { browserTimeZone, setupTimeZone, timeZoneChoices } from '../experience/timezone.ts';
import { models } from '../models/api.ts';
import { ActiveModel, ModelConnect } from '../models/ModelConnect.tsx';
import { primaryModelReady } from '../models/readiness.ts';
import { linkParam, navigate, useRoute } from '../router.ts';
import { sampleMode } from '../sample/mode.ts';
import { FirstTaskInvitation } from './FirstSteps.tsx';

const studio = {
  background: 'var(--studio)',
  backgroundImage:
    'radial-gradient(ellipse at 50% 0%, #2f5fd626, transparent 60%), linear-gradient(#ffffff07 1px, transparent 1px), linear-gradient(90deg, #ffffff07 1px, transparent 1px)',
  backgroundSize: '100% 100%, 24px 24px, 24px 24px',
  border: '1px solid var(--studio-line)',
  color: 'var(--studio-text)',
} as const;

/* ---------- sign in ---------- */

/** What a sign-in through the identity provider that came back refused says, by its code. */
const OIDC_ERRORS: Record<string, string> = {
  provider_unavailable: 'Couldn’t reach your identity provider. Try again in a moment.',
  signin_expired: 'That sign-in took too long or was already used. Try again.',
  signin_declined: 'Sign-in was cancelled at your identity provider.',
  signin_failed: 'Sign-in didn’t work. Try again.',
  email_unverified: 'Your identity provider hasn’t confirmed your email address yet.',
  not_allowed: 'Your account at the identity provider isn’t allowed into this OpenDuet.',
  no_account: 'There’s no account here for that email. Ask whoever runs this OpenDuet to add you.',
  account_disabled: 'This account is turned off. Ask whoever runs this OpenDuet.',
  account_conflict:
    'That email belongs to an account that signs in another way here. Ask whoever runs this OpenDuet.',
  setup_required: 'This OpenDuet has no account yet. Create the first one here.',
};

export function SignInScreen({ signedIn }: { signedIn: boolean }) {
  const { refreshProfile, setOnboarded } = useApp();
  const route = useRoute();
  // A fresh install has no account yet: it offers "Create your account"
  // instead of sign-in. Until the service answers, it is sign-in.
  const [creating, setCreating] = useState(false);
  // Whether creating it needs the installation's one-time setup code.
  const [codeRequired, setCodeRequired] = useState(false);
  // Whether this installation can email a sign-in link; until it says so, no.
  const [emailSignIn, setEmailSignIn] = useState(false);
  // Whether a password signs in here, and the identity provider's name when one is set up.
  const [passwordSignIn, setPasswordSignIn] = useState(true);
  const [provider, setProvider] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // The installer's link carries the code; otherwise it is typed.
  const [setupCode, setSetupCode] = useState(() => route.query.get('code') ?? '');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [linking, setLinking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Said under the field that needs fixing: toasts belong to the signed-in shell
  // and never show here.
  const [emailProblem, setEmailProblem] = useState<string | null>(null);
  const [passwordProblem, setPasswordProblem] = useState<string | null>(null);
  const [codeProblem, setCodeProblem] = useState<string | null>(null);
  const phone = useMedia('(max-width: 900px)');

  useEffect(() => {
    void adapter.setupStatus().then((r) => {
      setCreating(r.data?.needed === true);
      setCodeRequired(r.data?.code_required === true);
      setEmailSignIn(r.data?.email_sign_in === true);
      setPasswordSignIn(r.data?.signin?.password !== false);
      setProvider(r.data?.signin?.oidc?.label ?? null);
    });
  }, []);

  // The identity provider's sign-in comes back here with a reason when it did not work.
  const signInError = route.query.get('signin_error');
  useEffect(() => {
    if (!signInError) return;
    setNotice(OIDC_ERRORS[signInError] ?? OIDC_ERRORS.signin_failed ?? null);
    // Off the address bar and out of history, so a reload doesn't say it again.
    window.location.replace('#/welcome');
  }, [signInError]);
  const [leaving, setLeaving] = useState(false);
  const continueWithProvider = () => {
    setLeaving(true);
    setNotice(null);
    window.location.assign(
      adapter.oidcSignInUrl(route.parts[0] === 'welcome' || !route.path ? '/' : route.path),
    );
  };
  const passwordForm = creating || passwordSignIn;

  // A mailed sign-in link lands here with its token in the fragment. Opening it
  // spends nothing, because mail scanners open links too: the screen only asks
  // whose account it opens, and the link is used when the person presses Sign in.
  const linkToken = linkParam(route, 'token');
  const [link, setLink] = useState<{ token: string; account: string | null } | null>(null);
  const [usingLink, setUsingLink] = useState(false);
  useEffect(() => {
    if (!linkToken) {
      setLink(null);
      return;
    }
    let current = true;
    setLink({ token: linkToken, account: null });
    void adapter.checkMagicLink(linkToken).then((r) => {
      if (!current) return;
      if (r.data) {
        setLink({ token: linkToken, account: r.data.masked_email });
        return;
      }
      // Off the address bar and out of history, so a reload doesn't ask again.
      window.location.replace('#/welcome');
      setNotice(r.error ?? r.unavailable ?? 'That link did not work.');
    });
    return () => {
      current = false;
    };
  }, [linkToken]);

  const signInWithLink = async () => {
    if (!link) return;
    setUsingLink(true);
    setNotice(null);
    const result = await adapter.consumeMagicLink(link.token);
    setUsingLink(false);
    // Used or refused, the link is done: it leaves the address bar and history.
    window.location.replace(result.data ? '#/' : '#/welcome');
    if (result.data) refreshProfile();
    else setNotice(result.error ?? result.unavailable ?? 'That link did not work.');
  };

  const sendLink = async () => {
    if (!email.includes('@')) {
      setEmailProblem('Enter the email address to send the link to.');
      return;
    }
    setLinking(true);
    setNotice(null);
    const result = await adapter.magicLink(email);
    setLinking(false);
    if (result.data) setSent(true);
    else setNotice(result.error ?? result.unavailable ?? 'Couldn’t send the link.');
  };

  const submit = async () => {
    if (!email.includes('@')) {
      setEmailProblem('Enter your email address.');
      return;
    }
    if (creating ? password.length < NEW_PASSWORD_MIN : !password) {
      setPasswordProblem(
        creating
          ? `Choose a password of at least ${NEW_PASSWORD_MIN} characters.`
          : 'Enter your password.',
      );
      return;
    }
    if (creating && codeRequired && !setupCode.trim()) {
      setCodeProblem('Enter the setup code for this installation.');
      return;
    }
    setBusy(true);
    setNotice(null);
    if (creating) {
      const made = await adapter.createAccount(
        email,
        password,
        codeRequired ? setupCode.trim() : undefined,
      );
      if (made.data) {
        // Setup signs this browser in; sign in here only if it did not.
        const me = await adapter.profile();
        const session =
          me.error !== null && me.unauthorized ? await adapter.logIn(email, password) : me;
        setBusy(false);
        if (session.data === null) {
          setNotice(
            session.error ?? session.unavailable ?? 'Your account is made. Sign in to continue.',
          );
          setCreating(false);
          return;
        }
        setOnboarded(false);
        navigate('/setup');
        refreshProfile();
        return;
      }
      setBusy(false);
      // Someone else finished setup first: this installation now signs in.
      if (made.error !== null && /already/i.test(made.error)) setCreating(false);
      setNotice(made.error ?? made.unavailable ?? 'Couldn’t create the account.');
      return;
    }
    const result = await adapter.logIn(email, password);
    setBusy(false);
    if (result.data) {
      if (route.parts[0] === 'welcome') navigate('/');
      refreshProfile();
    } else setNotice(result.error ?? result.unavailable ?? 'Couldn’t sign in.');
  };

  return (
    <div
      className="row"
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: 'var(--canvas)',
        alignItems: 'stretch',
      }}
    >
      {!phone ? (
        <div
          className="signin-hero"
          style={{
            ...studio,
            width: '55%',
            flexShrink: 0,
            border: 0,
            overflow: 'hidden',
          }}
        >
          <div className="row" style={{ gap: 10 }}>
            <OpenDuetMark width={46} />
            <span style={{ fontFamily: 'var(--font-voice)', fontSize: 18, fontWeight: 700 }}>
              {instanceName()}
            </span>
          </div>
          <div className="col" style={{ gap: 12, maxWidth: 540, marginTop: 40, flexShrink: 0 }}>
            <span
              style={{
                fontFamily: 'var(--font-voice)',
                fontSize: 42,
                lineHeight: '48px',
                fontWeight: 700,
                letterSpacing: '-.02em',
                textWrap: 'balance',
              }}
            >
              Your personal AI. Already on it.
            </span>
            <span
              style={{
                fontSize: 16,
                lineHeight: '24px',
                color: 'var(--studio-muted)',
                maxWidth: 460,
                textWrap: 'pretty',
              }}
            >
              It remembers your work, learns the routines you teach it, and comes back with results.
              Run it on your own server with a model you choose.
            </span>
          </div>
          <div className="col" style={{ gap: 12, marginTop: 40, maxWidth: 420 }}>
            <span style={{ fontSize: 16, lineHeight: '26px', color: 'var(--studio-muted)' }}>
              Hand over a real task. Review the result, teach it a preference or procedure, and
              choose what it should prepare next time.
            </span>
            <span style={{ fontSize: 13, lineHeight: '22px', color: 'var(--studio-muted)' }}>
              Your model and hosting choices remain yours. An inbox or calendar is optional when you
              provide the context.
            </span>
          </div>
        </div>
      ) : null}
      {/* The form centres with auto margins rather than justify-content, so a
          form taller than the window scrolls from its top instead of being
          pushed above the scroll area where it cannot be reached. */}
      <div
        className="col grow"
        style={{
          alignItems: 'center',
          position: 'relative',
          minWidth: 0,
          padding: 24,
          overflowY: 'auto',
        }}
      >
        <div
          className="col"
          style={{ gap: 22, width: 400, maxWidth: '100%', marginBlock: 'auto', flexShrink: 0 }}
        >
          <div className="col" style={{ gap: 8 }}>
            <OpenDuetMark width={64} />
            <h1
              style={{
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: '-.01em',
                lineHeight: '34px',
                paddingTop: 6,
              }}
            >
              {creating ? 'Create your account' : `Welcome to ${instanceName()}`}
            </h1>
            <p style={{ fontSize: 15, lineHeight: '22px', color: 'var(--muted)' }}>
              {creating
                ? 'This is the first account on this installation. Hand off your first task next.'
                : link
                  ? 'Finish signing in with the link from your email.'
                  : provider && !passwordSignIn
                    ? `Sign in with ${provider}.`
                    : provider
                      ? `Sign in with ${provider}, or with your email and password.`
                      : 'Sign in with your email and password.'}
            </p>
          </div>
          {link ? (
            <SignInLinkCard
              account={link.account}
              busy={usingLink}
              onSignIn={() => void signInWithLink()}
              onElsewise={() => window.location.replace('#/welcome')}
            />
          ) : signedIn ? (
            <div className="col card" style={{ gap: 10, padding: 16 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--heading)' }}>
                You’re already signed in on this device.
              </span>
              <Button icon="chevronRight" onClick={() => navigate('/')}>
                Continue to {instanceName()}
              </Button>
            </div>
          ) : null}
          {link ? null : sent ? (
            <div className="col card" style={{ gap: 10, padding: 16 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--heading)' }}>
                Check your inbox
              </span>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                If {email} has an account here, a sign-in link is on its way. It works once and
                expires in ten minutes.
              </span>
            </div>
          ) : (
            <>
              {!creating && provider ? (
                <div className="col" style={{ gap: 12 }}>
                  <Button
                    size="lg"
                    variant={passwordSignIn ? 'outline' : 'primary'}
                    icon="user"
                    block
                    loading={leaving}
                    onClick={continueWithProvider}
                  >
                    Continue with {provider}
                  </Button>
                  {passwordSignIn ? (
                    <div
                      className="row"
                      style={{ gap: 10, fontSize: 12, color: 'var(--muted)' }}
                      aria-hidden="true"
                    >
                      <span className="grow" style={{ height: 1, background: 'var(--line)' }} />
                      or
                      <span className="grow" style={{ height: 1, background: 'var(--line)' }} />
                    </div>
                  ) : null}
                </div>
              ) : null}
              {passwordForm ? (
                <form
                  className="col"
                  style={{ gap: 12 }}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submit();
                  }}
                >
                  {creating && codeRequired ? (
                    <Field
                      label="Setup code"
                      hint={`Whoever set up this ${instanceName()} has it, and the link they sent fills it in. If that is you, run bun run openduet account setup-code on the host for one.`}
                    >
                      <Input
                        icon="lock"
                        value={setupCode}
                        onChange={(event) => {
                          setSetupCode(event.target.value);
                          setCodeProblem(null);
                        }}
                        placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
                        width="100%"
                        height={44}
                        autoComplete="one-time-code"
                        spellCheck={false}
                        error={codeProblem !== null}
                        aria-invalid={codeProblem !== null}
                      />
                    </Field>
                  ) : null}
                  {creating && codeRequired && codeProblem ? (
                    <span role="alert" style={{ fontSize: 13, color: 'var(--danger)' }}>
                      {codeProblem}
                    </span>
                  ) : null}
                  <Field label="Email">
                    <Input
                      type="email"
                      icon="mail"
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        setEmailProblem(null);
                      }}
                      placeholder="you@example.com"
                      width="100%"
                      height={44}
                      autoComplete="email"
                      error={emailProblem !== null}
                      aria-invalid={emailProblem !== null}
                    />
                  </Field>
                  {emailProblem ? (
                    <span role="alert" style={{ fontSize: 13, color: 'var(--danger)' }}>
                      {emailProblem}
                    </span>
                  ) : null}
                  <Field label="Password">
                    <Input
                      type="password"
                      icon="lock"
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        setPasswordProblem(null);
                      }}
                      placeholder={creating ? `At least ${NEW_PASSWORD_MIN} characters` : undefined}
                      width="100%"
                      height={44}
                      autoComplete={creating ? 'new-password' : 'current-password'}
                      error={passwordProblem !== null}
                      aria-invalid={passwordProblem !== null}
                    />
                  </Field>
                  {passwordProblem ? (
                    <span role="alert" style={{ fontSize: 13, color: 'var(--danger)' }}>
                      {passwordProblem}
                    </span>
                  ) : null}
                  <Button size="lg" icon="chevronRight" block type="submit" loading={busy}>
                    {creating ? 'Create account' : 'Sign in'}
                  </Button>
                  {creating || !emailSignIn ? null : (
                    <Button
                      variant="ghost"
                      icon="send"
                      block
                      loading={linking}
                      onClick={() => void sendLink()}
                    >
                      Email me a link instead
                    </Button>
                  )}
                  {creating ? null : (
                    <Button variant="ghost" size="sm" onClick={() => navigate('/reset')}>
                      Forgot your password?
                    </Button>
                  )}
                </form>
              ) : null}
              {notice ? (
                <div
                  className="row"
                  style={{
                    gap: 8,
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: 'var(--sand)',
                    color: 'var(--sand-ink)',
                    fontSize: 13,
                  }}
                >
                  <Icon name="info" size={14} />
                  <span>{notice}</span>
                </div>
              ) : null}
            </>
          )}
          <div className="col" style={{ gap: 10, alignItems: 'center', textAlign: 'center' }}>
            <span className="row" style={{ gap: 6, fontSize: 12, color: 'var(--muted)' }}>
              <Icon name="lock" size={13} />
              Your data stays yours.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * What a sign-in link opens to: whose account it is, and one button that uses
 * it. Until the button is pressed the link is unspent, so a mail scanner that
 * opens the page signs no one in.
 */
export function SignInLinkCard({
  account,
  busy,
  onSignIn,
  onElsewise,
}: {
  /** The account's address, masked; null while the link is being checked. */
  account: string | null;
  busy: boolean;
  onSignIn: () => void;
  onElsewise: () => void;
}) {
  return (
    <div className="col card" style={{ gap: 12, padding: 16 }}>
      {account === null ? (
        <span className="row" style={{ gap: 8, fontSize: 14, color: 'var(--muted)' }}>
          <Icon name="loader" size={14} stroke={2} className="spin" />
          Checking your sign-in link…
        </span>
      ) : (
        <>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--heading)' }}>
            Sign in as <span style={{ overflowWrap: 'anywhere' }}>{account}</span>
          </span>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            This link works once, and only after you press Sign in.
          </span>
          <Button
            size="lg"
            icon="chevronRight"
            block
            loading={busy}
            disabled={busy}
            onClick={onSignIn}
          >
            Sign in
          </Button>
        </>
      )}
      <Button variant="ghost" size="sm" onClick={onElsewise}>
        Sign in another way
      </Button>
    </div>
  );
}

/* ---------- first real handoff ---------- */

/** Account setup ends with the person's actual task. Profile settings can wait. */
export function OnboardingScreen() {
  const { profile, setOnboarded, refreshProfile, refreshConversations } = useApp();
  const initial = loadHandoff();
  const [saved, setSaved] = useState(initial);
  const [text, setText] = useState(initial?.text ?? '');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [resumeAfterCheck, setResumeAfterCheck] = useState(false);
  const [zone, setZone] = useState(() =>
    setupTimeZone(profile, browserTimeZone(), initial?.timeZone),
  );
  const [zoneOpen, setZoneOpen] = useState(false);
  const files = useAttachments();
  const model = useLoad(() => models.settings(), []);
  // A click and a readiness event may arrive before React paints busy=true.
  const inFlight = useRef(false);
  const resumingDraft = useRef<string | null>(null);
  const modelReady =
    !!model.data?.active.connected && (sampleMode || primaryModelReady(model.data));
  const canSend = !!text.trim() || !!saved?.attachments.length || files.ready.length > 0;

  const finishProfile = async () => {
    const result = await adapter.saveProfile({
      name: profile?.name || UNNAMED,
      time_zone: zone,
      day_hours: profile?.day_hours ?? { start: '08:00', end: '22:00' },
      time_zone_confirmed: true,
      onboarded: true,
    });
    if (!result.data)
      throw new Error(result.error ?? result.unavailable ?? 'Couldn’t save your time zone.');
    refreshProfile();
    setOnboarded(true);
  };

  const handOff = async () => {
    if (inFlight.current || busy || files.uploading || !canSend) return;
    if (files.files.some((file) => file.state !== 'ready')) {
      setProblem('Wait for each file to finish uploading, or remove a file that could not upload.');
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setProblem(null);
    try {
      // Once attempted, a retry keeps identical bytes and its original key.
      const current = saved?.attempted
        ? saved
        : saved
          ? saveHandoff(updateRequestDraft(saved, text, files.ready))
          : beginHandoff(text, files.ready);
      if (!current.attempted) {
        current.timeZone = zone;
        saveHandoff(current);
      }
      setSaved(current);
      if (!saved?.attempted) files.clear();
      if (!current.conversationId) {
        const fresh = await models.settings();
        if (fresh.data) model.set(fresh.data);
        if (!fresh.data?.active.connected || (!sampleMode && !primaryModelReady(fresh.data))) {
          resumingDraft.current = null;
          if (!fresh.data)
            setProblem(
              fresh.error ?? 'Couldn’t verify the current model. Your request is kept here.',
            );
          setConnecting(true);
          return;
        }
      }
      const result = await submitHandoff(current);
      if (!result.data)
        throw new Error(result.error ?? result.unavailable ?? 'Couldn’t start this task.');
      await finishProfile();
      files.clear();
      setResumeAfterCheck(false);
      discardHandoff(current.id);
      refreshConversations();
      navigate(`/chat/${result.data.conversation_id}`);
    } catch (error) {
      resumingDraft.current = null;
      setProblem(
        error instanceof Error ? error.message : 'Your saved request is still here. Try again.',
      );
      setSaved(loadHandoff());
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  // An event resumes the latest reviewed draft, without replaying on unrelated renders.
  const handOffNow = useRef(handOff);
  handOffNow.current = handOff;

  useEffect(() => {
    const ready = () => {
      const draftId = loadHandoff()?.id;
      if (!draftId || resumingDraft.current === draftId) return;
      // Claim the resume before the settings request: duplicate events can
      // otherwise resolve after submission and recreate a completed draft.
      resumingDraft.current = draftId;
      setConnecting(true);
      // reload() retains old data; only the awaited response may trigger a resume.
      void models.settings().then((fresh) => {
        if (resumingDraft.current !== draftId || loadHandoff()?.id !== draftId) return;
        if (fresh.data) {
          model.set(fresh.data);
          if (fresh.data.active.connected && (sampleMode || primaryModelReady(fresh.data)))
            setResumeAfterCheck(true);
          else resumingDraft.current = null;
        } else {
          resumingDraft.current = null;
          setProblem(fresh.error ?? 'Couldn’t verify the current model. Try again.');
        }
      });
    };
    window.addEventListener('openduet:model-ready', ready);
    return () => window.removeEventListener('openduet:model-ready', ready);
  }, [model.set]);

  useEffect(() => {
    if (!resumeAfterCheck || !modelReady || busy) return;
    setResumeAfterCheck(false);
    void handOffNow.current();
    // The ready event is the one resume trigger; retries retain the same key.
  }, [resumeAfterCheck, modelReady, busy]);

  const changeText = (next: string) => {
    setText(next);
    if (!saved || saved.attempted) return;
    try {
      const changed = saveHandoff({ ...saved, text: next });
      setSaved(changed);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Couldn’t keep these changes.');
    }
  };

  const changeZone = (next: string) => {
    setZone(next);
    if (!saved || saved.attempted) return;
    try {
      setSaved(saveHandoff({ ...saved, timeZone: next }));
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Couldn’t keep this time zone.');
    }
  };

  const later = async () => {
    if (inFlight.current || saved?.attempted) return;
    inFlight.current = true;
    setBusy(true);
    setProblem(null);
    try {
      let waiting = saved;
      if (canSend) {
        waiting = saved
          ? saveHandoff(updateRequestDraft(saved, text, files.ready))
          : beginHandoff(text, files.ready);
        waiting = saveHandoff({ ...waiting, timeZone: zone });
        setSaved(waiting);
        files.clear();
      }
      await finishProfile();
      navigate(waiting ? `/?starter=${encodeURIComponent(waiting.id)}` : '/');
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Couldn’t finish account setup.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <main
      className="col"
      style={{ width: '100%', height: '100%', overflowY: 'auto', background: 'var(--canvas)' }}
    >
      <header
        className="row"
        style={{ gap: 10, minHeight: 64, padding: '12px 24px', flexShrink: 0 }}
      >
        <OpenDuetMark width={40} />
        <span style={{ fontFamily: 'var(--font-voice)', fontSize: 18, color: 'var(--heading)' }}>
          {instanceName()}
        </span>
        <div className="grow" />
        <Button
          variant="ghost"
          size="sm"
          disabled={busy || files.uploading || saved?.attempted}
          onClick={() => void later()}
        >
          Do this later
        </Button>
      </header>
      <div
        className="col"
        style={{
          width: 744,
          maxWidth: '100%',
          margin: 'auto',
          padding: '32px 20px',
          gap: 24,
          boxSizing: 'border-box',
        }}
      >
        <FirstTaskInvitation
          onChoose={(request) => {
            if (!saved?.attempted) changeText(request);
          }}
        />
        {saved?.attachments.length ? (
          <div className="col card-12" style={{ gap: 8, padding: 12 }}>
            <span style={{ fontSize: 13 }}>Files kept with this request</span>
            {saved.attachments.map((id, i) => (
              <div className="row" key={id} style={{ gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, overflowWrap: 'anywhere' }}>
                  {saved.attachmentNames[i] ?? 'Attached file'}
                </span>
                {!saved.attempted ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      try {
                        setSaved(removeHandoffAttachment(saved, id));
                        setProblem(null);
                      } catch (error) {
                        setProblem(
                          error instanceof Error
                            ? error.message
                            : 'Couldn’t keep this file removal. The attachment is still included.',
                        );
                      }
                    }}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        {saved?.attempted ? (
          <div
            className="card-12"
            style={{ padding: 16, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
          >
            {saved.text}
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>
              This request has been submitted or is awaiting confirmation. Retry safely with the
              same request.
            </p>
            <Button loading={busy} onClick={() => void handOff()}>
              Continue saved request
            </Button>
          </div>
        ) : (
          <Composer
            allowModelSetup
            value={text}
            onChange={changeText}
            onSend={() => void handOff()}
            attachments={files}
            disabled={busy}
            placeholder="Paste your task, notes, or context…"
          />
        )}
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Icon name="globe" size={14} />
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>Time zone: {zone}</span>
          <Button variant="ghost" size="sm" onClick={() => setZoneOpen(!zoneOpen)}>
            Change
          </Button>
          {zoneOpen ? (
            <Select
              value={zone}
              onChange={changeZone}
              options={timeZoneChoices(zone).map((value) => ({
                value,
                label: value.replaceAll('_', ' '),
              }))}
              label="Time zone"
              width="100%"
            />
          ) : null}
        </div>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
          Pasted notes and supported files are enough to begin. Connect an inbox or calendar only
          when a task needs fresh information from it.
        </p>
        {problem ? (
          <p role="alert" style={{ color: 'var(--red-ink)' }}>
            {problem}
          </p>
        ) : null}
        {connecting ? (
          <section
            className="col card-12"
            style={{ padding: 20, gap: 16 }}
            aria-label="Connect a model for your saved task"
          >
            <h2 style={{ fontSize: 20, margin: 0 }}>
              Your request is saved. Connect a model to continue.
            </h2>
            {model.error ? (
              <LoadError what="your model settings" error={model.error} onRetry={model.reload} />
            ) : null}
            {model.data ? (
              <>
                <ActiveModel settings={model.data} onChanged={model.set} />
                <ModelConnect settings={model.data} onChanged={model.set} />
              </>
            ) : null}
            <Button disabled={!modelReady || busy} loading={busy} onClick={() => void handOff()}>
              Continue this request
            </Button>
            <Button variant="ghost" onClick={() => setConnecting(false)}>
              Back to my request
            </Button>
          </section>
        ) : null}
      </div>
    </main>
  );
}
