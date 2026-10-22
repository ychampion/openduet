# Personal assistant update: verification

Checked October 23, 2026 against the local product implementation. This report
covers the personal Chat/Work/Explore update; [earlier release evidence](RELEASE_READINESS.md)
and [v0.2.1 showcase verification](SHOWCASE_VERIFICATION.md) have separate revisions.

The app retains React/Vite, TypeScript/Bun, Postgres and Hermes. Migrations
0134–0137 add records and conservative delivery migration; existing work,
receipts, approvals, memory and connections are retained. Space/account cleanup
also removes the new scoped records and their children without clearing other
spaces or global model readiness.

## First use and returning use

**First use:** account → real task/notes/files → exact saved request → selected
model compatibility → one durable submission → concrete result/draft → correction
and optional explicit preference/procedure save. No tour/profile questionnaire
or synthetic profile message is required. Pasted context needs no mailbox.

**Returning use:** personal Chat references existing task/results and up to two
unfinished tasks. Start independent work or Continue the chosen task. A result
reply remains bound to its exact turn, including an old routine run, while its
future schedule remains active. Work separates decisions, active work, finished
results and recurring responsibilities. Explore offers five input-aware presets.

## Acceptance A–I

These tests use disposable PostgreSQL databases, the real job/submission and
broker services, and scripted provider/mailbox responses unless stated otherwise.
A test of recalled context proves what the next task receives; it does not prove
the quality of a live model's answer.

| Case | Exercised behavior | Evidence |
| --- | --- | --- |
| **A: first handoff** | Exact raw text, uploaded IDs, stable request key survive missing-model setup and refresh. File removal persists; storage-write failures remain visible. Repeated readiness events submit one task/turn and complete the profile once. Accepted-task refresh adds no submission. | `scripts/docs/check-handoff.py`: 11 browser checks, zero page errors; `experience/handoff.test.ts`, `request-draft.test.ts`; `personal-session.test.ts` covers transactional deduplication, conflict and attachment rollback. Readiness/profile are explicitly simulated in this browser proof. |
| **B: readiness** | Model listing succeeds while inference fails; tools remain unverified. Wrong/stale configuration cannot publish readiness. A model skipping the actual tool call fails. | `gateway/model-readiness.test.ts`, `integration/model-readiness.test.ts`, web `models/readiness.test.tsx`; actual pinned Hermes process and default Compose cell-host proofs each passed 2 tests, 9 assertions. |
| **C: parallel work** | Task B has a separate job; A keeps its running state/version and pending approval. B creates no steer event for A; stopping B leaves A intact. | `integration/personal-session.test.ts`; DB-backed action/approval fixture. |
| **D: targeted continuation** | Explicit Continue reaches only its selected task; ambiguous input is refused with a focused target question. Correcting a current exact draft withdraws only that affected approval. | `personal-session.test.ts`; web `personal-session.test.ts`, `composer-actions.test.tsx`. |
| **E: learning** | Save preference → next relevant recall contains it; edit → recall contains revised value and excludes old; forget → current recall excludes it. No job/trigger is created. Reviewed procedure persists through existing skills store and is available to matching selection. | `integration/personal-learning.test.ts`, `own-skills.test.ts`, `learning/learning.test.tsx`; scripted Sample day demonstrates later style. Live model preference adherence remains unmeasured. |
| **F: responsibility** | Ten unchanged checks produce one preparation/draft/notification; restart produces no duplicate. Fresh reply, pause, disconnect and revoked read scope block obsolete work. Scope/recipient mismatches fail. Changed deadline during a read uses the locked current deadline. Confirmed send occurs once with a receipt and ends the watch. | `integration/customer-followups.test.ts`; `connectors/customer-thread-readers.test.ts` covers archived replies, pagination, missing/oversized threads and IMAP withholding. |
| **G: delivery** | Concurrent brief setup resolves one actual trigger; editing time updates it. Paused remains paused. Suggestions off preserves requested reminders; simultaneous category changes preserve other opt-outs. Dispatch labels/categories match. Legacy opt-outs and history survive migration. | `integration/delivery-policy.test.ts`, `delivery-migration.test.ts`, `status-push.test.ts`; web `screens/notifications.test.ts`; mock push tests. |
| **H: old result** | Reply to yesterday's routine result retains its exact turn, leaves the next schedule enabled and preserves newer pending approvals. Nested historical watch discussions retain mailbox/customer restrictions and source revalidation. | `integration/personal-session.test.ts`, `customer-followups.test.ts`. |
| **I: sample** | Separate in-memory fixture instances; exact sample approval creates only a mock receipt. Fetch guard rejects production effect origins and page `/api` writes, omits credentials and rejects redirects. Notification setup neither prompts the browser nor registers a real device. Sample label remains visible through inspector and approvals. | `apps/mock-api/src/sample-day.test.ts`; `scripts/docs/capture-product.py`; sample banner geometry checks at 320/390/1440px. |

Integration paths above are relative to `apps/openduet/test/`, gateway/connector
paths to `apps/openduet/src/`, and web tests to `apps/web/src/`.

Lifecycle regressions also cover a source chat deleted after nested result
discussions: mailbox/customer restrictions and fresh-source checks remain in
force. Missing preparation becomes a denied action rather than wider access.
`customer-followup-loader.test.ts` passed 5 tests / 11 assertions for slow
connector opens racing with removal, revocation, credential changes and another
loader; stale connectors are closed before they can be registered.
Web deadline tests also cover chosen zones with half-hour offsets, daylight
saving gaps, repeated wall times and invalid zones (4 tests / 8 assertions).

## Browser checks and media

`capture-product.py` passed **45 checks with zero page errors** at 1440×1000
and 390×844, both in light and dark appearance. It covers actual production UI components, inline
draft, source result, Back/Close, blocked production API, persistent watch pause,
five presets, keyboard search, memory controls and sample approval/receipt.
An additional responsive check covered 320→390→1440→320, actual banner height,
keyboard focus restoration, Escape and the sample label during approval.
Browser notification permission and real push subscriptions are blocked in
Sample day, including direct calls to the push helper.
The 11-check first-handoff proof uses real fixture uploads and submissions.
`check-task-dependency.py` adds **5 browser checks** with scripted repair/upload
responses and zero submissions, fixture mutations or page errors. Only the
affected task's recorded reconnect failure names a source. Connect preserves
the separate unsent request/files through refresh; Provide context opens that
task's real composer. Changing the selected target before submission retains
the same request key and file IDs. The check performs no source sign-in.

- [Personal Chat](media/sample-day/chat-desktop.png)
- [Result inspector](media/sample-day/result-desktop.png)
- [Phone result](media/sample-day/result-phone.png)
- [Dark appearance](media/sample-day/chat-dark.png)
- [Watch controls](media/sample-day/work-desktop.png)
- [Saved preference](media/sample-day/preference-desktop.png)
- [Recording](media/sample-day/review.mp4) and [media reproduction](media/sample-day/README.md)

The screenshot/recording data is fictional and visibly labeled. Sample day does
not run paid inference, poll a live inbox or send mail. Current files replace
the old navigation in the main showcase; v0.2.1 recordings are historical.

## Runtime proof and remaining live checks

Actual Hermes is pinned to engine commit
`2237be355906fbe6065ce1815711eee52b2d646e`.
`model-readiness-real.test.ts` is opt-in with
`OPENDUET_READINESS_RUNTIME_PROOF=1`. The process proof ran the production gateway,
supervisor and plugin; the Docker proof used the existing policy-scoped cell
service and pinned runtime image, with no Docker socket in the service container.
Both actually read the isolated note and reject a model response without tool
use. The provider responses were scripted for the exact selected fixture model.
The check does not silently substitute a practice or fallback model.

No live-provider credentials were available in the scoped workspace or test
environment. Live authentication, billing, inference and native tool behavior
therefore remain unverified. A paid/provider-backed task-quality
run, real Gmail account/Graph tenant and real external mail send remain unrun.
Compatibility checks do not establish autonomous judgment or preference-adherence
quality. No Claude Duet account or comparative quality benchmark was exercised.

Native Gmail/Graph complete-thread watches are implemented and fixture-tested.
IMAP and generic MCP watches remain unavailable until complete-thread state can
be guaranteed. The confirmed follow-up send ends this one-shot responsibility;
RFC threaded-reply headers and another automatic follow-up are not promised.

## Aggregate checks

The product source is checked with `bun run typecheck`, `bun run lint`,
`bun run --cwd apps/web build`, the three Compose check commands, and the full
`bun run test` suite on Linux with Node 22, Bun 1.3.13 and disposable PostgreSQL.
The latest typecheck, lint, production web build and all three Compose checks
passed. The runtime plugin suite passed **254 tests**, with **7 skips**.
The final affected Linux run passed **297 tests / 2,098 assertions** across
35 files, with **2 optional runtime-proof skips** and no failures.
Those two Hermes cases passed separately in both process and Docker proofs.
Those checks include handoff, learning, model readiness, composer, source
recovery and deadline conversion (**4 deadline tests / 8 assertions**).

The initial broad snapshot completed **9,871 passes, 71 skips, 2 todos,
8 failures and 1 linked unhandled error** across 938 files in 3,578.27 seconds.
It predates the final repairs. It exposed missing watch routes in the API
document, an obsolete mock onboarding expectation, missing space-removal
coverage, a missing readiness gateway logger and missing migration snapshots.
Those issues were repaired and their focused checks passed. Drizzle now reports
no schema changes against the final snapshot. An existing screenshot retry test
now waits for the actual retry event; its 12-test file passed in three separate
Linux processes.

A separate, unchanged CLI stream test hit Bun's `EBADF` error and the linked
unhandled assertion; its Linux file rerun passed **19 tests / 46 assertions**,
and the early-exiting sink case passed 30 further Linux repetitions.
An Undo Send test also failed once; its unchanged 19-test file passed on Windows
and the failing case passed three Linux repetitions. Those causes were not
reproduced and are not described as repaired. Final-source GitHub validation is
pending; the earlier failed snapshot is not counted as a passing full run.

The Vite build retains a bundle-size warning. Biome has 28 existing warnings and
2 infos with no lint errors after fixes. Scope-specific tests supplement, rather
than replace, the full run. Production live-provider behavior remains subject
to the limits above.
