# A personal assistant that keeps the work

OpenDuet groups your work in one personal Chat while preserving the existing
durable chats, runs, tool permissions and receipts underneath it. Your own
server stores the working context. Choosing a different supported model does
not move that context to a new assistant.

## First use

After account creation, give it a real request. The three starters prepare a
meeting, research a decision or help with a follow-up. They populate the same
request composer; add your notes, pasted text or supported files and press Send.
No inbox or calendar is required when supplied context is sufficient.

The request and attachment references are saved before model setup. A missing
model opens setup without replacing the task with profile answers. The selected
model must pass the runtime tool check. Refreshes and safe retries use the same
submission key. If browser storage is unavailable, the app reports that it
cannot preserve the request instead of silently discarding it.

The app detects the browser's time zone and offers a correction. Personal
profile details remain optional settings.

If a task's recorded source action requires reconnecting, Chat names that
source and offers **Connect** or **Provide context**. Connect opens connection
settings while preserving a separate unsent request and its files. Provide
context opens only the affected task's existing notes/file composer and sends
nothing by itself. Supplied notes can support preparation; fresh reads and
sending still require the source. An unrelated disconnected account does not
become a prerequisite for your task.

## Returning to Chat

Chat shows actual tasks and their results, with up to two unfinished tasks to
continue. **New task** starts separate work. **Continue** targets the selected
ongoing task. **Reply to this result** names the precise source result; clear
that context before asking something unrelated. Stop belongs to the target task.

The persistent personal session is navigation and read-position state. It does
not combine authorization families. Sending unrelated task B cannot stop task A,
steer A's runtime, or withdraw A's pending approvals.

A reply to an older recurring run opens a source-bound discussion. The routine's
instruction, trigger and later runs remain intact. Source context does not grant
permission to change the source account or send a message. Historical customer
watch discussions retain the confirmed mailbox/customer fence, including nested replies.

## Useful output and review

A result provides its text or artifact, source context and originating task.
The draft surface shows the recipient, subject and full editable body. Prepared
work has a truthful state: a draft waiting for review is not a sent message.
A bare “Done” without concrete output is labeled as lacking a concrete output.

Review the exact action and choose an approval option before sending when
policy requires it. A confirmed connector receipt records the result. The
customer watch always separates preparation from the exact send review.

## Always-on noticing and collaboration

The server checks current saved state every minute while its workers are running;
closing the browser does not stop it. Chat shows the persisted heartbeat, including
starting, delayed and paused states. Suggestions cover upcoming watched meetings,
unresolved source signals and stalled personal tasks. Source polling follows its
own interval. No evidence means no invented next task.

**Plan together** attaches current source context to an editable, unsent request.
It preserves an existing request rather than replacing it. **Tomorrow** snoozes
for 24 hours; **Not useful** dismisses that source suggestion durably. Pausing
suggestions leaves already requested jobs, routines and watches running. Push
settings are independent. [Details and limits](ALWAYS_ON.md).

## Automatic memory, with explicit teaching controls

With automatic capture enabled and the memory model configured, the existing
memory worker extracts lasting facts and preferences from your own words. It
retains provenance, applies corrections and supports forgetting. One-off tasks,
quoted content and the assistant's guesses are not standing preferences. Start
a message with “off the record” to exclude it. Chat exposes the capture setting
and recent saved details; Settings → Memory provides review, edit and forget.

Automatic capture is model-dependent, asynchronous and subject to the configured
privacy and spending policy. The label “Automatic memory on” describes the setting;
it does not promise a successful extraction from every message.

After a useful result, choose one of three actions:

- **Remember this preference:** review its scope and exact wording, then save
  through the existing memory service. Edit or forget it in the result controls
  or Settings → Memory. A later relevant task receives current recalled memory.
- **Save these steps:** review the title, matching circumstances, inputs, steps
  and approval boundaries. It becomes a personal skill in the existing skills
  store, available to selection on subsequent matching work.
- **Run this automatically:** review a recurring preparation and schedule.
  Saving memory or a procedure alone does not create a trigger. Generic routines
  keep your existing personal permissions; use the dedicated watch below for the
  narrow customer-thread responsibility.

The interface confirms saved state only after the durable API succeeds. Model
selection and final answer quality remain model behavior; persistence and recall
tests are not evidence that every model follows every preference.

## Customer follow-up, from preparation to responsibility

First supply call notes or a customer thread. Ask for open commitments, unresolved
requirements and an editable draft. Correct the result, save any reusable
preference or procedure, and explicitly choose a future responsibility.

In **Work → Recurring → Watch a customer thread**:

1. Select an available native Gmail or Microsoft mailbox.
2. Find and inspect the actual thread and confirm the customer's email.
3. Enter the title, deadline and time zone; review the exact scope before saving.
4. At the confirmed deadline, if there is no reply, OpenDuet prepares a follow-up
   in Chat and links it from the watch. Inspect the draft and request send review.
5. Review the recipient and exact content. A confirmed send receipt completes
   this one-shot watch; create another responsibility explicitly if needed.

The worker checks persisted ownership, current source access and fresh thread
state before preparation and again before send. Preparation is deduplicated by
source version and type; repeated unchanged checks and restarts do not create
repeat drafts or completion notifications. A reply makes the preparation obsolete.
Pausing or disconnecting blocks further mailbox reads/admission and invalidates
pending watch sends. The preparation has access only to the confirmed connection
and draft operation; it cannot send mail itself or alter unrelated mail.

The supported native readers fetch the complete Gmail thread or Microsoft Graph
conversation, including archived replies, with bounded size checks. IMAP and
generic MCP mailboxes are withheld from this watch because their current APIs do
not prove complete-thread state. Missing, truncated or oversized data fails closed.
The send creates a new outgoing message; this release does not promise RFC
threaded reply headers or another automatic follow-up after that send.

## Delivery that matches the responsibility

Settings → Notifications separates decisions, your requested work, requested
reminders, the daily brief and unsolicited suggestions. Requested work includes
meaningful progress and results. Push for unsolicited suggestions defaults off;
existing opt-outs remain off through migration. In-app noticing defaults on and
can be paused independently from Chat.

The personal daily brief has one canonical persisted purpose and one actual
schedule. Changing its time edits the trigger. Pausing stops it; delivery opt-out
and scheduling are independent. Duplicate legacy brief triggers are disabled
without deleting past discussions/results or turning a paused brief back on.
Push permission is offered after a useful task completes, never merely for
opening the app or agreeing to an action.

## Screens and implementation

**Chat**, **Work** and **Explore** are the main navigation. Settings and advanced
surfaces remain reachable with their existing roles and deep links. Desktop uses
a compact sidebar and reading column, with a result inspector when space permits.
On phones, the result becomes a full sheet with Back; the composer accommodates
the visible keyboard and safe area. DM Sans is used for controls and task text;
Newsreader provides editorial headings. The accent follows the terracotta mark.

The implementation retains React/Vite, TypeScript/Bun, Postgres, the job queue
and Hermes. Additive migrations 0134–0138 add personal sessions, model readiness,
customer watches, delivery policy and assistant pulse state. Existing chats, artifacts, approvals,
connections and memory remain the execution sources. The personal session does
not introduce a second transcript or memory database.

See [verification and limitations](PRODUCT_VERIFICATION.md) and the
[isolated Sample day](SHOWCASE.md) before interpreting a demonstration as evidence.
