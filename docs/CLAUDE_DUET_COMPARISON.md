# OpenDuet and Claude Duet

Claude Duet sources checked October 23, 2026; OpenDuet evidence updated October
24. Claude Duet's column describes Anthropic's published
research preview, not a benchmark we ran against a Duet account. OpenDuet's
implementation comes from this repository; current test results are in
[PRODUCT_VERIFICATION.md](PRODUCT_VERIFICATION.md).

Sources: [announcement](https://claude.com/resources/articles/claude-duet),
[product page](https://claude.com/product/claude-duet),
[getting started and limitations](https://support.claude.com/en/articles/17631495-get-started-with-claude-duet).

| Capability | Claude Duet research preview | OpenDuet | Evidence and limit |
| --- | --- | --- | --- |
| Background work | Runs on Anthropic's cloud computer | Durable jobs and scheduled preparations on your server | [Live Opus and Fireworks runs](LIVE_MODEL_VERIFICATION.md) completed with browser and frontend stopped; host and workers must remain on |
| Morning brief | Email/calendar brief and follow-ups | One canonical personal daily brief with an editable actual trigger | `delivery-policy.test.ts`, `delivery-migration.test.ts`; source access and a running host required |
| Attention | Periodic account checks and prioritisation | Scoped customer-thread watches plus existing attention workflows | `customer-followups.test.ts`; native Gmail/Graph complete threads, one-shot follow-up, fresh source/send checks; no IMAP/MCP watch |
| Text and continuity | Main thread plus topic channels | Personal Chat over separate durable tasks and exact result replies | `personal-session.test.ts`; unrelated tasks preserve each other’s running work and approvals |
| Memory and skills | Uses your Claude account's context | Automatic preference learning and correction replacement, reviewed procedures, durable recall, edit/forget controls | [Live correction evidence](LIVE_MODEL_VERIFICATION.md): old revision superseded, new style reused in separate and scheduled tasks after restart; no Claude account sync or head-to-head quality benchmark |
| Approvals | Approval before messages, payments, signatures and deletion | Broker policy, exact-action approvals and receipts | `conformance/` scenarios 1-5; deployment approval tests explicitly select "Ask me for everything". Auto-review/autonomy can permit actions without a new approval; connector effect declarations must be correct |
| Browser | Cloud browser; no viewing or takeover yet | Optional browser worker with viewing/control | `browser-broker.test.ts`, `browser-controller.test.ts`; operator setup required |
| Computer and files | Own VM; no local computer file access | Sandbox adapters and optional paired-device companion | `sandbox-wiring.test.ts`, `packages/device/`; permissions apply on both ends |
| Deliverables | Briefs, financial models, decks, dashboards | Files, generated artifacts and sandboxed apps | `generated-artifacts.test.ts`, `documents.test.ts`, `docs/APPS.md`; formats and quality depend on tools/model |
| Voice | Typed and spoken messages | Optional transcription, speech and voice mode | `voice.test.ts`, `docs/VOICE.md`; ElevenLabs configuration required |
| Connectors | Marketplace advertises over 6,000; individual limits apply | Native connectors, MCP and optional catalog providers | `docs/CONNECTORS.md`; no equivalent connector count or blanket compatibility claim |
| Wallets | Link and Shop Pay integrations | No built-in equivalent | Explicit gap; do not advertise wallet parity |
| Mobile | Native iOS and Android apps, plus web | Responsive web app and installable PWA | Manifest, service worker and mobile browser checks; no native binaries |
| Model choice | Opus 5.5; model cannot be selected | Your configured provider or compatible local endpoint | [Opus 5.5 and Fireworks live evidence](LIVE_MODEL_VERIFICATION.md), plus provider compatibility checks; other models and workflows need their own validation |
| Hosting and access | US Pro/Max waitlist | Self-hosted Apache-2.0 source | Operator manages uptime, backups, HTTPS and model/service costs |

Integration test filenames in this table are relative to
`apps/openduet/test/integration/` unless a full path is given. Fixture tests use
scripted providers and disposable data. They prove wiring, permissions and
state transitions; they do not prove autonomous performance on a real inbox,
financial work, or a live third-party service.

OpenDuet focuses on self-hosted delegation, memory, routines,
connections and review of actions. Native mobile clients, wallet integrations,
and task-quality parity remain separate work. A successful mock demonstration
is never evidence of live-model or live-connector parity.

The product page advertises Microsoft/Office 365 in the marketplace illustration,
while the help center currently says Microsoft 365 is unavailable in Duet. The
comparison therefore does not infer availability from a marketplace logo or
connector count. OpenDuet’s native Microsoft watch has scripted Graph reader
and broker integration coverage; a live tenant was not exercised.
