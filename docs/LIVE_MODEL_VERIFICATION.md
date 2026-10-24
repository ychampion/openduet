# Live model: learning and background work

Checked October 24, 2026 with Anthropic `claude-opus-5-5` and Fireworks
`accounts/fireworks/models/deepseek-v4p1-flash`, in separate installations through the pinned Hermes engine
`2237be355906fbe6065ce1815711eee52b2d646e`. This exercised the production React
build, API, PostgreSQL memory store, learning worker and native scheduler.
The engine used the process supervisor in an isolated local installation.
The default Docker supervisor was not exercised by this run.

Customer names and notes were supplied examples. Model inference was real.
No mailbox was connected, no email was sent, and no provider credential is
included in the evidence. The installation started from `e6b113af`, with the
grounding instruction changes in this update applied before the final runs.

## Anthropic Opus 5.5

The selected and provider-reported model was `claude-opus-5-5`, including the
memory worker. The compatibility check passed credentials, inference and an
actual read-only tool call through Hermes: two requests and 103 output tokens.

The browser submitted a three-bullet follow-up signed “Regards, Sam.” The
learning worker captured that preference at **00:54:27 UTC**. A correction to one
paragraph under 60 words signed “Thanks, Sam” created revision 2 at **00:55:29
UTC**, superseding revision 1. No explicit memory-save control was used.

A separate customer task submitted at **00:56:33 UTC**, without restating the
style, used the corrected paragraph and sign-off. The backend was restarted at
**01:06:47 UTC**; an API read at **01:07:50 UTC** confirmed the same current claim
and revision. A native daily preparation was then created using the actual
**Run this automatically** controls.

| Final native Opus run, October 24 (UTC) | Time |
| --- | --- |
| Browser closed | 01:12:35.163 |
| Production web server stopped | 01:12:36.399 |
| Scheduled attempt started | 01:14:37.153 |
| Scheduled attempt finished | 01:15:00.379 |
| Completion observed with web server still unreachable | 01:15:32.601 |

The finished draft asks Daniel which onboarding details he needs, keeps data
residency unconfirmed, uses a paragraph under 60 words and signs “Thanks, Sam.”
It separately identifies the open residency decision. It claims no attachment,
completed checklist or agreed kickoff date, and sends nothing. The host, API,
database and workers stayed running. No manual wake or clock modification was
used. Both routines created in the Opus installation were paused afterward.

The [Opus execution record](media/live-assistant/opus-receipt.json) includes
the actual requests and answers, memory revisions, restart evidence, native
run times, usage model identities and hashes of the runtime sources loaded by
that run. Long-session compaction has separate regression coverage; this short
workflow does not establish long-session reliability.

After the auxiliary compaction fix, a fresh backend and Hermes startup passed
the real Opus compatibility check again at **01:19:05 UTC**: two requests and
97 output tokens. The final startup, with the optional engine output setting
blank and the default set to 4096 as Compose supplies them, passed all three
stages at **02:21:14 UTC**: two requests and 105 output tokens. The receipt records
both checks and their source hashes separately from the scheduled run.

## Fireworks workflow

1. Create an account through the browser. Submit a customer follow-up request
   before model setup, then reopen the browser and confirm the request survives.
2. Select the real provider and model. Pass the Hermes compatibility check:
   credentials, inference, and an actual read-only tool call. The initial cold
   start failed before inference; retry passed all stages.
3. Ask for three short bullets signed “Regards, Sam.” Confirm the result and
   automatic preference capture, without using the explicit Save control.
4. Reply: “Correction for all future customer follow-ups: replace my old
   bullet-point style with one short paragraph, under 60 words, and sign off
   'Thanks, Sam' instead of 'Regards, Sam'.” Confirm that the revised draft uses
   the new style and that memory supersedes the old revision.
5. Start a separate customer task without repeating the preference. Confirm
   that the new draft uses one short paragraph and “Thanks, Sam.”
6. Use **Run this automatically** on that result. Review the instruction,
   source scope, daily time and time zone through the real UI. Close the entire
   disposable browser, then stop the production web server as well.
7. Leave the API, scheduler, database and Hermes available. Observe the native
   scheduled attempt starting and completing through the API while the web
   server remains unreachable. No manual wake endpoint or clock modification
   is used.
8. Reopen the app and inspect the persisted result and corrected memory.
   Pause every routine created during verification to prevent further paid runs.

The [sanitized execution record](media/live-assistant/receipt.json) contains the
exact requests, model answers, memory revisions, provider usage and background
timestamps. Instruction and skill file hashes identify the final guidance used
by the scheduled run. Session cookies, installation keys and model credentials are
excluded.

### Observed Fireworks result

The original preference was captured at **00:01:52 UTC**. The correction created
revision 2 at **00:02:59 UTC**, superseding revision 1 rather than leaving two
conflicting current preferences. The separate task started at **00:03:33 UTC**
and used the corrected paragraph and sign-off without a reminder. Service
restarts retained the corrected memory. The execution record includes the
backend process start at **00:20:52 UTC**, after the correction was saved and
before the final scheduled run used it; a subsequent API read confirmed the same
current claim and revision.

| Final native run, October 24 (UTC) | Time |
| --- | --- |
| Browser closed | 00:21:11.173 |
| Production web server stopped | 00:21:11.915 |
| Scheduled attempt started | 00:23:28.299 |
| Scheduled attempt finished | 00:23:44.508 |
| Completion observed with web server still unreachable | 00:24:01.037 |

The run produced one finished turn. Its draft asks Daniel which onboarding
details he needs, keeps data residency unconfirmed, uses one short paragraph
under 60 words and signs off “Thanks, Sam.” It contains no attachment placeholder,
promised date or claim of a completed checklist. It separately proposes choosing
a residency region as the open decision. Nothing was sent.

After reopening, six browser checks verified the saved result in desktop light,
desktop dark and phone views, current corrected memory, the native run in Work
and a recording of opening that result. There were no page errors or horizontal
page overflow. Every routine created in this installation was paused afterward.

## Fixes found through real inference

The first native Anthropic compatibility attempt failed before inference with
`token_cap_exceeded`. Hermes requested a model-native output allowance larger
than the attempt budget: its gateway constructor dropped the configured output
limit. OpenDuet now supplies a bounded per-response ceiling to process and Docker
supervisors, preserves it through boot and prewarmed handoff, and passes it into
Hermes agents through a source-hash-checked patch. Compatibility checks use a
512-token ceiling so several calls fit within their total allowance.

Owned runtime clients explicitly opt into shrinking that ceiling as earlier
calls spend the attempt budget. The gateway still refuses oversized ceilings
and exhausted budgets, reserves each call's allowance and strips the internal
header before contacting the provider. Regression checks cover Anthropic
Messages, OpenAI Chat and Responses. Native auxiliary compaction also honors
the configured ceiling when it omits its own limit; explicit limits and
unconfigured upstream behavior remain unchanged. A pinned-engine wire check
exercises the real compressor and Anthropic SDK against a local endpoint.

Compose forwards the dedicated engine output setting, including its empty
default. Empty falls back to the shared output ceiling. Validation and engine
startup agree on accepted values, including existing numeric formats for the
shared default; invalid or unsafe limits are rejected before launch.

An early scheduled answer turned an unconfirmed data residency region into a
definite kickoff blocker. A subsequent answer inserted an attachment placeholder
into a purportedly ready draft. The shared runtime instructions now require
drafts to assert supplied or verified facts, omit missing details, distinguish
inferences, and avoid invented attachments, progress, blockers, commitments or
decisions. The built-in writing skill also instructed the model to leave marked
gaps, which conflicted with a request for a ready draft. Both writing and
follow-up skills now remove unsupported claims and placeholders, avoid promises
such as “I'll confirm,” and respect the latest style correction. Clarification
is reserved for essential missing details, so a routine can still finish useful
work from the context it has. Skill and shared-context token caps still apply.

The final run is checked for the corrected sign-off, paragraph length and a
usable draft that does not claim an attachment, a confirmed region, a promised
date or completed checklist. These checks address the observed failures; they
do not guarantee that a probabilistic model will never make another mistake.
The existing identity and shared-context budget checks remain enforced.

## Regression checks

The complete local Bun run covered 9,988 checks across 944 files: 9,900 passed,
71 skipped, two were marked todo, and 15 failed with four errors. Every affected
file was rerun in a fresh process against the final source: all 76 checks passed,
with two intentional embedding-provider skips and no errors. The original full
run is not counted as a clean pass. The functional memory fixtures received a
longer read deadline; the production deadline and dedicated timeout checks were
unchanged. The other failures did not reproduce in their isolated file runs.

All 370 pinned-engine Python checks passed. The final environment/configuration
checks passed 61 cases, and Compose passed all 48 boundary checks. Typechecking,
lint and the production frontend build passed. The browser checks cover desktop
light, desktop dark, phone, memory, recurring work and the result recording.
Credential scanning covered the worktree, staged files, outgoing Git commit,
frontend build and verification output, with no copies of the supplied provider
key found. The temporary paid-inference services were stopped and their routines
were paused after evidence collection.

## Scope

These are live execution proofs for two provider/model combinations and one
supplied-context workflow. They establish automatic correction replacement, preference use in an
independent task, persistence across service restarts and scheduled work without
a browser. It is not a reliability benchmark or a comparison with Claude Duet.

Fresh mailbox/calendar access, outward sending, native push delivery, long-term
uptime and additional model providers were not exercised here. Server-side suggestions
and user-delegated model work have different behavior; see
[always-on collaboration](ALWAYS_ON.md). Earlier scripted regression coverage is
recorded separately in [product verification](PRODUCT_VERIFICATION.md).
