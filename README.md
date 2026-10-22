<img src="apps/web/public/openduet-mark.svg" alt="OpenDuet" width="96" />

# OpenDuet

Your open-source, always-on work partner. Give it a task, step away, and come
back to the work and the decisions that need you.

Self-host the service, connect the model you choose, and use it from your
browser or install it on your phone's home screen. OpenDuet is an independent
alternative to Claude Duet. It is not affiliated with Anthropic.

[Desktop and phone screenshots](apps/web/docs/screens/README.md) ·
[Feature comparison](docs/CLAUDE_DUET_COMPARISON.md)

## Install from source

Use a Linux server with Docker Engine 28 or newer, Docker Compose 2.33.1 or newer,
Git, and Bun 1.3.13. Windows and macOS use Docker Desktop with Linux containers;
see [deployment requirements](docs/DEPLOYMENT.md). Allow 8 GB of RAM and 20 GB of
free disk for the stack and its builds. Model usage and optional services have
their own costs.

```sh
git clone https://github.com/ychampion/openduet.git
cd openduet
bun install --frozen-lockfile
bun run openduet init --connect-in-app
docker compose -f deploy/docker-compose.yml up -d --build --wait --wait-timeout 300
```

Open the one-time account setup link printed by `init`, create your account,
and connect your model in **Settings > Models**. The web app runs at
[localhost:3101](http://localhost:3101). Keys belong in the app or your local
`deploy/.env`, never in a Git commit.

For another installation on the same machine, give `init` its own project and
ports: `--project openduet-two --api-port 3200 --web-port 3201`.

Your server must stay on for background work; your phone and laptop can close
the app. For remote access and phone notifications, set up HTTPS or Tailscale
using the [deployment guide](docs/DEPLOYMENT.md).

An agent's browser is optional. After creating your account:

```sh
bun run openduet browser enable
```

The CLI starts it and records its Compose overlay for future CLI commands.
See [the browser worker](docs/browser-worker.md). Longer computer jobs use a
configured sandbox provider; see [capabilities](docs/CAPABILITIES.md).

## What you can use

- **Delegate work in chat.** Persistent jobs, progress, files and results, with
  pause, stop and requests for missing information.
- **Keep work moving.** Scheduled routines, daily briefs, watches and follow-ups
  run on your server. Configure schedules, connected accounts and model budgets.
- **Review decisions.** Outgoing effects pass through the policy and approval
  boundary. Review the destination and exact action before approving it.
- **Remember useful context.** Inspect, correct, export or forget memories and
  skills. Memory belongs to your installation.
- **Connect your tools.** Mail, calendars, files, MCP servers, and optional
  connector services. Each integration needs its own configuration and access.
- **Use its computer or yours.** Optional browser and sandbox workers, plus a
  paired device companion with explicit local permissions.
- **Talk when configured.** Speech and voice features require an ElevenLabs key.

The default installation keeps phone/SMS, the specialised Companies surface and
shared rooms off. Operators can enable them in `deploy/.env`.

For approval before every change, select **Settings > Approvals > Ask me for
everything**. Auto-review and the autonomy levels can allow actions without a
new approval; review those settings before connecting accounts.

## How it compares with Claude Duet

Read the [feature comparison](docs/CLAUDE_DUET_COMPARISON.md), dated October 22,
2026, and the [release verification](docs/RELEASE_READINESS.md). Implemented
features, fixture tests and live-provider evidence are reported separately.
OpenDuet does not claim Anthropic's connector count, native mobile apps, wallet
integrations or equivalent task quality across different models.

## Develop and verify

```sh
bun install --frozen-lockfile
bun run typecheck
bun run lint
bun run compose:check
bun run browser:compose:check
bun run tailscale:compose:check
bun run test
bun run test:plugin
bun run --cwd apps/web build
```

The full suite needs the disposable database and Python/runtime prerequisites
in [CONTRIBUTING.md](CONTRIBUTING.md). `bun run doctor` reports what is missing.
Use `bun run dev:mock` and `bun run dev:web` for scripted UI development; the mock
is a preview. `bun run icons` rebuilds the vector logo into home-screen icons.

The repository includes CI, image builds, clean-machine installation checks and
deployment conformance. Check their actual results before treating a checkout
as a tested release. Build locally until release images finish publishing.

## Architecture and license

The TypeScript service, Postgres job queue, React web app, Hermes runtime,
connectors and device companion are one self-hosted application. Start at
[ARCHITECTURE.md](docs/ARCHITECTURE.md) or use
[SETUP-WITH-AN-AGENT.md](SETUP-WITH-AN-AGENT.md) with your coding assistant.

Apache-2.0. Preserve [LICENSE](LICENSE), [NOTICE](NOTICE) and the
[source provenance](docs/PROVENANCE.md) in redistributions.
