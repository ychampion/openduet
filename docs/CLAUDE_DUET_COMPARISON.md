# OpenDuet and Claude Duet

Checked October 22, 2026. Claude Duet's column describes Anthropic's published
research preview, not a benchmark we ran against a Duet account. OpenDuet's
implementation comes from this repository; current test results are in
[RELEASE_READINESS.md](RELEASE_READINESS.md).

Sources: [announcement](https://claude.com/resources/articles/claude-duet),
[product page](https://claude.com/product/claude-duet),
[getting started and limitations](https://support.claude.com/en/articles/17631495-get-started-with-claude-duet).

| Capability | Claude Duet research preview | OpenDuet | Evidence and limit |
| --- | --- | --- | --- |
| Background work | Runs on Anthropic's cloud computer | Durable jobs on your server | `apps/openduet/test/integration/background.test.ts`, `conformance/`; host must remain on |
| Morning brief | Email/calendar brief and follow-ups | Scheduled briefs and routines | `experience-routines.test.ts`, `docs/SITUATIONAL-AWARENESS.md`; requires connected data |
| Attention | Periodic account checks and prioritisation | Watches, triage and attention queue | `watch.test.ts`, `triage.test.ts`, `attention.test.ts`; judgment depends on your model |
| Text and continuity | Main thread plus topic channels | Persistent chats, shared memory, task runs | `chat-pages.test.ts`, `long-chat.test.ts`; different interaction design |
| Memory and skills | Uses your Claude account's context | Inspectable memory and editable skills | `memory-settings.test.ts`, `memory-search.test.ts`, `learning-chat-journey.test.ts`; no Claude account sync |
| Approvals | Approval before messages, payments, signatures and deletion | Broker policy, exact-action approvals and receipts | `conformance/` scenarios 1-5; deployment approval tests explicitly select "Ask me for everything". Auto-review/autonomy can permit actions without a new approval; connector effect declarations must be correct |
| Browser | Cloud browser; no viewing or takeover yet | Optional browser worker with viewing/control | `browser-broker.test.ts`, `browser-controller.test.ts`; operator setup required |
| Computer and files | Own VM; no local computer file access | Sandbox adapters and optional paired-device companion | `sandbox-wiring.test.ts`, `packages/device/`; permissions apply on both ends |
| Deliverables | Briefs, financial models, decks, dashboards | Files, generated artifacts and sandboxed apps | `generated-artifacts.test.ts`, `documents.test.ts`, `docs/APPS.md`; formats and quality depend on tools/model |
| Voice | Typed and spoken messages | Optional transcription, speech and voice mode | `voice.test.ts`, `docs/VOICE.md`; ElevenLabs configuration required |
| Connectors | Marketplace advertises over 6,000; individual limits apply | Native connectors, MCP and optional catalog providers | `docs/CONNECTORS.md`; no equivalent connector count or blanket compatibility claim |
| Wallets | Link and Shop Pay integrations | No built-in equivalent | Explicit gap; do not advertise wallet parity |
| Mobile | Native iOS and Android apps, plus web | Responsive web app and installable PWA | Manifest, service worker and mobile browser checks; no native binaries |
| Model choice | Opus 5.5; model cannot be selected | Your configured provider or compatible local endpoint | `docs/DEPLOYMENT.md`, gateway tests; models are not interchangeable in quality |
| Hosting and access | US Pro/Max waitlist | Self-hosted Apache-2.0 source | Operator manages uptime, backups, HTTPS and model/service costs |

Integration test filenames in this table are relative to
`apps/openduet/test/integration/` unless a full path is given. Fixture tests use
scripted providers and disposable data. They prove wiring, permissions and
state transitions; they do not prove autonomous performance on a real inbox,
financial work, or a live third-party service.

The intended first release is useful self-hosted delegation, memory, routines,
connections and review of actions. Native mobile clients, wallet integrations,
and task-quality parity remain separate work. A successful mock demonstration
is never evidence of live-model or live-connector parity.
