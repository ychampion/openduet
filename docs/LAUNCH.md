# OpenDuet launch kit

Prepared copy for the self-hosted open-source launch. Nothing on this page has
been posted or sent. The [v0.3.0 release body](releases/v0.3.0.md) pins installation
to that tag and its images; publish those artifacts before using its commands.

## One-line description

An open-source personal assistant that learns your corrections and brings back
useful work, on your own server with a model you choose.

## Announcement

OpenDuet is an open-source personal assistant you run on your own server, with
a model you choose. Give it notes, review a useful draft, correct its style,
and let automatic memory carry that correction into future work. Turn a reviewed
instruction into a recurring responsibility and come back to results after
closing your browser.

It also notices upcoming watched meetings, unresolved source signals and stalled
tasks. Plan together brings the evidence into an editable request before you
send it.

We verified correction learning, reuse in a separate task and scheduled
preparation with real Anthropic Opus 5.5 and Fireworks models. The host and
backend stay on; model and connected-service costs apply. Apache-2.0. Install it,
inspect it, make it yours.

[Install OpenDuet](GETTING_STARTED.md) ·
[Watch the result and learned preference](media/live-assistant/opus-learning-and-background.mp4) ·
[Read the execution record](LIVE_MODEL_VERIFICATION.md)

## Show HN

**Title:** Show HN: OpenDuet, a self-hosted assistant with memory and background work

**URL:** [github.com/ychampion/openduet](https://github.com/ychampion/openduet)

**Maker comment:**

```text
I wanted an assistant I could teach once, delegate recurring preparation to, and
keep on my own server with a model I choose. OpenDuet brings tasks, memory,
connected accounts and recurring work into one app.

Start with a task and your own notes. Review the result, reply with a correction,
and inspect what automatic memory saved. You can also review an exact preference
or reusable procedure before saving it. Run this automatically lets you confirm
the instruction and schedule. Plan together turns a source-backed suggestion
into an editable request; it stays unsent until you choose Send.

For the launch, we ran real Anthropic Opus 5.5 and Fireworks workflows through
Hermes. Each learned a corrected writing preference, reused it in an independent
task, retained it across a backend restart, and completed a native scheduled
preparation with the browser closed and frontend stopped. The host, API and
workers remained running. The notes were supplied examples; no mailbox was
connected and nothing was sent. The receipts include the actual requests,
answers, memory revisions and times.

It's Apache-2.0 and self-hosted, with Docker installation instructions. You manage
uptime, backups and provider costs. Your approval policy governs actions; choose
Ask me for everything if you want to review each consequential action. The live
runs cover two model/provider combinations and one workflow, rather than a
general reliability or competitor benchmark.

I'd especially like feedback on correction handling, the usefulness of suggested
next steps, and which recurring preparations would save you time.

Source and installation: https://github.com/ychampion/openduet
Execution record: https://github.com/ychampion/openduet/blob/main/docs/LIVE_MODEL_VERIFICATION.md
Architecture: https://github.com/ychampion/openduet/blob/main/docs/ARCHITECTURE.md
```

## Short social copy

OpenDuet: your personal AI, on your own server. Choose your model, teach it
through corrections, and review results from recurring work after closing the
browser. Apache-2.0. Real Opus + Fireworks runs, with receipts.
https://github.com/ychampion/openduet

## A truthful 90-second demo

Use the production app with completed work from a real model. This is a live UI
walkthrough of results and their evidence; inference and the scheduled run happen
before the presentation. Keep the original timestamps visible when describing
the earlier browser-closed run.

| Time | Show | Say |
| --- | --- | --- |
| 0–12s | Chat with a completed customer draft and its supplied notes | “This is OpenDuet on our server, using Opus 5.5. These are supplied customer notes; nothing is being sent.” |
| 12–30s | The correction and the current preference in Settings → Memory | “I changed the style to one paragraph under 60 words, signed ‘Thanks, Sam.’ It learned that correction without the explicit Save control. I can inspect, edit or forget it.” |
| 30–45s | The separate task and its answer | “This task didn't repeat the preference. The answer used the corrected paragraph and sign-off.” |
| 45–60s | Work → Recurring, the schedule, latest result and pause controls | “I reviewed the recurring instruction and schedule. This is its completed preparation; routines have their own pause controls.” |
| 60–76s | The live report and Opus receipt's browser-close and run times | “The browser closed at 01:12 UTC. The scheduled run finished at 01:15 while the frontend was stopped. The backend and workers stayed on.” |
| 76–90s | An eligible Chat suggestion and Plan together, or the behavior guide if none is present | “Suggestions explain their source. Plan together gathers context into an editable request. I choose when to send it.” |

For the last segment, use an actual eligible suggestion in the demonstration
installation. If none exists, open the [behavior guide](ALWAYS_ON.md) and explain
it there. Do not invent a source event or relabel Sample day as a live-model run.
The [recording](media/live-assistant/opus-learning-and-background.mp4) shows
reviewing saved memory and the completed result after returning to the app; it
does not film the browser being closed or compress a scheduled wait into real time.

## FAQ

**What do I install?** A self-hosted web app and its supporting services. Use a
Linux x86-64 host or Docker Desktop with Linux containers on Windows / Intel Mac,
Docker Engine 28+, Compose 2.33.1+, 8 GB RAM and 20 GB free disk. Windows also
needs Git for Windows. Follow the [first-task guide](GETTING_STARTED.md).

**Will it keep working when I close the browser?** Delegated jobs and enabled
routines run on the server. Keep the host, backend, database and worker services
running. Sleeping or shutting down the host stops work. The
[live execution report](LIVE_MODEL_VERIFICATION.md) records completed scheduled
preparations with both browser and frontend stopped.

**Does it learn everything I say?** Automatic capture extracts lasting facts and
preferences when enabled and a memory model is configured. It is asynchronous
and subject to privacy and spending settings. Review what was actually saved in
Settings → Memory; edit or forget it there. Start a message with **off the record**
to exclude it. Explicit preference and procedure saves are also available.

**What makes it proactive?** The server checks saved evidence every minute for
upcoming watched meetings, unresolved source signals and stalled personal tasks.
It offers up to three suggestions with reasons. Plan together gathers context
without submitting the request. A suggestion doesn't grant permission for an
action or continuously run model inference. [See the controls](ALWAYS_ON.md).

**Who decides what gets sent or changed?** Your approval policy. Choose
**Settings → Approvals → Ask me for everything** to review consequential actions.
Other autonomy settings can allow actions under existing policy. Inspect the
exact action and destination; a draft is not a send receipt.

**What does it cost?** The source is Apache-2.0. You supply the host and model;
model providers and connected services may charge. Compatibility checks and
automatic memory can make model requests. Self-hosting also means maintaining
uptime, HTTPS, updates and backups.

**Which models and connections work?** Configure a supported provider or compatible
endpoint, then check the exact selected model's credentials, inference and tool
use. The supplied-context launch workflow has real Opus 5.5 and Fireworks proof.
Other combinations need their own validation. Account connections have their own
setup and permissions; the launch proof did not exercise a live inbox, external
sending or native push. [Connector guide](CONNECTORS.md).

**Can I use it on my phone?** Use the responsive web app or install its PWA from a
supported browser over HTTPS. There are no native iOS or Android binaries in this
release. [Remote access and HTTPS](DEPLOYMENT.md).

## Assets and supporting details

| Asset | Link |
| --- | --- |
| Logo | [SVG mark](../apps/web/public/openduet-mark.svg) |
| Opus result | [Desktop light](media/live-assistant/opus-result-desktop.png) · [Desktop dark](media/live-assistant/opus-result-dark.png) · [Phone](media/live-assistant/opus-result-phone.png) |
| Learned correction | [Memory screenshot](media/live-assistant/opus-memory-desktop.png) |
| Recurring work | [Completed preparations and routine controls](media/live-assistant/opus-recurring-desktop.png) |
| Opus recording | [MP4](media/live-assistant/opus-learning-and-background.mp4) |
| Fireworks recording | [MP4](media/live-assistant/learning-and-background.mp4) |
| What the media depicts | [Capture notes](media/live-assistant/README.md) |
| Actual execution evidence | [Live report](LIVE_MODEL_VERIFICATION.md) · [Opus receipt](media/live-assistant/opus-receipt.json) · [Fireworks receipt](media/live-assistant/receipt.json) |
| Start and extend | [First task](GETTING_STARTED.md) · [Workflows](USE_CASES.md) · [Architecture](ARCHITECTURE.md) |
| Release copy | [v0.3.0](releases/v0.3.0.md) |
| Download checksums | [Asset names, source paths and SHA-256](releases/v0.3.0-assets.json) |

The draft release attaches only the original logo, five Opus screenshots, the
Opus recording and `SHA256SUMS`. Before publishing, follow the
[release sequence](RELEASE_READINESS.md#publication-sequence): merge the reviewed
candidate, publish the version tag and images, verify the pinned installation,
then publish the draft. The copy above is ready for the announcement that follows.

OpenDuet is independent of Anthropic. These workflows and captures do not establish
Claude Duet parity or comparative quality. Preserve the
[license](../LICENSE), [notices](../NOTICE) and [source provenance](PROVENANCE.md)
when redistributing the project.
