# Changelog

## 0.3.1

- Fix installer reruns on Windows when Docker Compose and Git Bash name the same installation directory differently. Existing configuration and data stay in place; another installation remains protected.
- Make service-instance takeover compare the observed nonce and exact heartbeat atomically, so a concurrent heartbeat cannot be overwritten.
- Clarify that OpenDuet runs on one host and is accessed through the web app on other devices. Document HTTPS for Safari sign-in and the published x86-64 images.
- Pin the README and first-task installation commands to matching v0.3.1 deployment files and images.
- Align package, service, device, mock and OpenAPI versions at 0.3.1.

See the [release notes](docs/releases/v0.3.1.md).

## 0.3.0

- Fence in-flight computer permission reads when Settings or the companion
  changes access, and require current file permissions during write verification.
- Synchronize queued-request regression coverage with the actual device queue;
  cover stale permission reads against real database snapshots and HTTP changes.
- Drain admitted recovery scans during shutdown and refuse callbacks delivered
  after stopping, so recovery cannot keep using a closed database.
- Refresh pinned validation, mail, MCP, Hono, YAML, frontend build and Cloudflare
  tooling dependencies to address security advisories, including the browser
  image's independent Zod pin.
- Pin seven transitive security fixes and run dependency audits at every
  advisory severity in CI.
- Run the full suite in sequential native Bun shards with one fresh process
  per file; synchronize acknowledgement checks
  with committed events instead of fixed pauses.
- Make local Hermes proof launchers honor configured engine and Python paths,
  with the appropriate virtual-environment layout on Unix and Windows.
- Run actual-engine capability, identity, repair, discovery and execution proofs
  in CI; check upgrade lock release in its own database and distinguish lasting
  memory from one-time requests in conformance fixtures.
- Learn lasting preferences automatically from corrections, reuse the latest
  value across tasks, and retain it across backend restarts.
- Run reviewed recurring work on the server while the browser is closed;
  offer source-backed suggestions and an editable **Plan together** request.
- Verify the selected model's credentials, inference and read-only tool use
  before continuing the saved first task.
- Carry bounded output allowances through runtime supervisors, the model
  gateway and native Anthropic auxiliary calls without bypassing attempt budgets.
- Ground writing in supplied evidence, omit unsupported commitments and
  attachments, and follow the latest correction.
- Refresh installation and first-task guidance, real Opus and Fireworks
  execution evidence, screenshots, recordings and launch materials.
- Align package, service, device, mock and OpenAPI versions at 0.3.0.

See the [release notes](docs/releases/v0.3.0.md),
[live execution record](docs/LIVE_MODEL_VERIFICATION.md) and
[release readiness](docs/RELEASE_READINESS.md). Earlier development entries
are retained below.

## Always-on collaboration

- Server-side noticing runs every minute without an open browser, with persisted heartbeat and personal-space suggestions.
- Upcoming meetings, unresolved source signals and stalled tasks offer reasons, source context and an editable Plan together request.
- Durable dismissal, 24-hour snooze and pause survive repeated scans and restart; removed or obsolete sources disappear.
- Chat exposes existing automatic memory capture, recent saved details and review/edit/forget controls.
- Collaborative instructions carry forward context, apply corrections and suggest evidence-backed next steps.
- Migration 0138 adds scoped pulse and source-reference records, included in space removal.

See [operation and verification](docs/ALWAYS_ON.md).

## Personal assistant update

- Start with a real saved task; resume exact text/files once after selected-model setup.
- Verify credentials, inference and actual read-only tool use through the pinned Hermes runtime.
- Personal Chat, Work and Explore navigation with exact task/result continuation and phone result sheets.
- Explicit preference memory, reviewed personal procedures and separately confirmed routines.
- Scoped native Gmail/Graph customer-thread watches, fresh source checks, exact send review and receipts.
- Typed delivery settings and one actual personal daily-brief schedule; preserve existing opt-outs.
- Isolated, labeled local Sample day with new screenshots, browser recording and setup guide.
- Additive migrations 0134–0137 preserve existing work and authorization families.

See [product verification and limits](docs/PRODUCT_VERIFICATION.md).

## Initial OpenDuet release

- Independent OpenDuet project with a consolidated initial Git history.
- Complete product, package, configuration, CLI, Docker and runtime rename.
- New paired-stroke logo, favicon and home-screen icons.
- Self-hosted installation and a focused default feature configuration.
- Claude Duet comparison and release verification evidence.

See [source provenance](docs/PROVENANCE.md) for attribution and the starting
revision. Earlier source-project release notes are not OpenDuet releases.
