# OpenDuet v0.3.0 launch readiness

Prepared October 25, 2026 for a self-hosted, Apache-2.0 release. The launch
candidate fixes a device-permission race and recovery shutdown, refreshes
dependencies for security advisories, makes local runtime proof launchers
portable, and updates version
metadata, installation guidance, release materials and current evidence. Its
preceding published baseline is
[`229f0b1`](https://github.com/ychampion/openduet/commit/229f0b1f59f84114a35bb4eaa2f03d9c3cab3a82).
The checks below name that baseline explicitly; candidate checks are recorded
separately rather than treating an earlier green run as approval of later code.

## Installable product

The [first-task guide](GETTING_STARTED.md) covers account creation, model
compatibility, a useful first task, corrections, recurring work and remote
access. The main README uses actual model captures. The
[release body](releases/v0.3.0.md) pins both source and images to `v0.3.0`; use
those commands after the tag and all five versioned images are published.
Until then, the README's `main` installation uses the published baseline.

Published images target **linux/amd64**. Allow **8 GB RAM and 20 GB free disk**,
Docker Engine **28+**, and Compose **2.33.1+**. Linux installation has clean-runner
proof. Windows Docker Desktop, Intel macOS and source-build alternatives are
documented; native installations on those desktop hosts and native ARM images
were not verified by these runs. Phone checks use browser viewports rather
than physical iOS/Android devices.

## Baseline regression and installation evidence

These completed GitHub runs all checked `229f0b1`, not the later release
metadata changes. Their status was rechecked during launch preparation.

| Check | Result |
| --- | --- |
| [CI](https://github.com/ychampion/openduet/actions/runs/40053950409) | All nine jobs passed; full Bun suite: **9,820 passed, 224 skipped, 13 todo, 0 failed**, 10,057 tests across 944 files; Python: **305 passed, 12 skipped** |
| [Images](https://github.com/ychampion/openduet/actions/runs/40053950435) | All five public images published; anonymous registry checks confirmed each `main` digest matches `229f0b1` |
| [One-line installation](https://github.com/ychampion/openduet/actions/runs/40054126120) | Clean runner installed without Bun on its PATH, created the first account, enabled the browser worker, and retained data across repeat, separate and relocated installations |
| [Setup guide](https://github.com/ychampion/openduet/actions/runs/40054126198) | The guide's commands, setup and browser enablement passed |
| [Conformance and upgrade](https://github.com/ychampion/openduet/actions/runs/40053950430) | All four jobs passed, including deployment boundaries, upgrade and external-database/bucket restore |

CI includes actual Docker background processes, real browser renderer and app
isolation checks, sign-out, containerized stdio MCP and scripted capability
evaluations. Skips and todo entries retain their environment prerequisites;
these totals do not imply every optional provider or connector was exercised.

## Actual model behavior

The [live execution record](LIVE_MODEL_VERIFICATION.md) and timestamped
[Opus receipt](media/live-assistant/opus-receipt.json) establish that:

- Anthropic `claude-opus-5-5` learned a style correction automatically, replaced
  the earlier preference, reused the current value in a separate task without
  restatement, and retained it through a backend restart.
- A native scheduled preparation ran from **01:14:37 to 01:15:00 UTC** with
  the browser closed since **01:12:35** and frontend stopped since **01:12:36**.
  The host, API, database and workers remained running. The result followed the
  supplied notes and corrected style without sending anything.
- A separate Fireworks model completed the same learning and browser-closed
  workflow. A fresh Opus compatibility check verified credentials, inference
  and actual read-only tool use with the default bounded output allowance.

The screenshots and MP4s show the real app and model results. Customer notes
were supplied examples. No live mailbox/calendar, external send or native push
delivery was exercised. The live runs used process supervision; Docker
supervision and long-session auxiliary compaction have separate regression
coverage. These runs establish this workflow, not broad reliability or
comparative quality against Claude Duet. No Claude Duet account was benchmarked.

## Candidate checks

The candidate aligns package, service, device, mock and OpenAPI versions at
**0.3.0** and makes targeted updates to pinned dependencies for validation,
mail parsing and delivery, MCP, Hono, YAML, Vite and Wrangler. The browser image's
independent Zod pin is also updated to **4.6.7**. Local Hermes proof launchers
honor configured engine and Python paths and choose the appropriate Unix or
Windows virtual-environment layout.

Seven root security overrides retain fixed transitive versions while parent
packages update their own dependency ranges: `body-parser@2.4.0`,
`brace-expansion@2.1.7`, `esbuild@0.28.2`, `fast-uri@3.1.9`, `hono@4.13.13`,
`ip-address@10.7.4` and `undici@7.30.1`. The esbuild override replaces the legacy
**0.18.20** copy brought in by `@esbuild-kit`; the migration tooling's TypeScript
configuration still loads, as checked by `drizzle-kit check`. See
[CONTRIBUTING.md](../CONTRIBUTING.md) for maintenance guidance. CI now runs
`bun audit` at every advisory severity.

The checks below distinguish results on the final dependency tree from the
earlier full run. Hosted checks and the fresh version-pinned installation are
publication gates; their workflow links remain available after preparation.

| Check | Result |
| --- | --- |
| Frozen dependency installation | Passed on Windows and Linux with the final dependency resolutions |
| Dependency audit | Full `bun audit`, covering all severities, exited 0 with “No vulnerabilities found”; the initial audit had reported 22 high-severity advisories |
| TypeScript and production web build | Passed on the final dependencies; existing chunk-size warning remains |
| Lint, source scrub and branding | Passed on the final dependencies: 28 existing warnings, two informational diagnostics, no errors |
| Compose boundary checks | All 77 passed on the final dependencies: 48 main, 14 browser and 15 Tailscale checks |
| Migration tooling and generated contracts | `drizzle-kit check` passed with esbuild 0.28.2; OpenAPI and client regeneration produced no schema changes |
| Pinned-engine Python | 370 passed, 0 skipped on the final dependencies |
| Full Bun suite before the security updates | 9,934 passed, 71 skipped, 2 todo, 0 failed across 944 files; this run includes the device-permission fix but does not validate the updated dependencies |
| Full Bun suite on final dependencies | 9,955 passed, 69 conditional skips, 2 existing todo entries, 0 failed; 10,026 tests across 945 files and 226,015 assertions. All 944 baseline files and the new runner acceptance file executed exactly once; source remained unchanged |
| Real-engine opt-in regressions | All seven cases passed: the five-stage strict capability proof, readiness success and refusal, lifecycle hooks, compaction, identity and wired correction repair |
| Standalone runtime proofs | Discovery, approval/execution and Python execution passed through the pinned engine, including exact output and ledger receipts |
| Memory conformance | All ten active scenarios passed; all ten withheld-memory counterfactuals exercised recall. One existing expense-procedure scenario remains explicitly deferred; typed procedure promotion, held-out evaluation, canary reuse and rollback have separate integration coverage |
| Upgrade and fixture regressions | Four upgrade checks passed with another database deliberately holding the same advisory-lock key. Memory-provider checks passed with 16 assertions covering lasting facts and one-time requests. Seven mail-reply checks passed with 43 assertions for safely quoted spoofing names, authoritative addresses, round-trip parsing and malformed-header rejection |
| Additional local opt-ins | The ten-reply public corpus passed 52 assertions; both native AWS CLI checks passed 16 assertions against a disposable local simulator, including signature rejection and an approved write that lands once |
| Acknowledgement ordering | All 19 checks passed with 99 assertions. Positive cases wait for a committed acknowledgement; genuine deadline and late-writer cancellation cases remain in place. The full runner uses Bun's fresh global context for each file |
| Lease fixture database boundary | All nine checks passed with 49 assertions. A held lease in a second database remains untouched while local leadership is terminated, taken over and closed |
| Candidate CI | Require the candidate's [CI](https://github.com/ychampion/openduet/actions/workflows/ci.yml), [Conformance and upgrade](https://github.com/ychampion/openduet/actions/workflows/conformance.yml), [Installation](https://github.com/ychampion/openduet/actions/workflows/install.yml) and [Setup guide](https://github.com/ychampion/openduet/actions/workflows/setup-guide.yml) checks before merge |
| Device permission boundary | 49 device integration, hub and connector tests passed, including four real-database regressions for stale Settings/companion grants during execution and verification; stale execution and both verification permission sources had observed failures before their fixes |
| Live browser input | The ten new actual-Chromium target and control-lifecycle checks failed nine cases against the previous production code; the complete live file passed all 26 tests and 72 assertions after the fix. Remaining and queued input never replays to a replacement view; ordinary protocol errors and revocation remain enforced |
| Undo dispatch completion | A controlled transaction-commit regression failed before the fixture completion barrier and passed afterward. All 20 Undo checks passed with 98 assertions, retaining cancellation, restart and exactly-once checks; production broker source is unchanged |
| Recovery shutdown | Two real-PgBoss barrier regressions failed against the previous runner and passed with six assertions after the fix; the complete runner integration file passed all 46 tests and 267 assertions. Shutdown drains admitted recovery work and refuses callbacks delivered afterward |
| Documentation | 240 local or mapped version-pinned targets and 88 heading links verified; install, model readiness, browser and backup commands reviewed against source |
| Release media | Seven files match the original committed bytes and their SHA-256 manifest; the 13.12-second MP4 decoded and played in real Chromium |
| Supplied credential scan | Exact-byte scans found zero matches in source, the index, outgoing commits, build and verification output, and release assets; repeat after the final commit and before pushing |

The final full local suite completed before candidate publication. Native Bun
discovery selected every file; each ran in a fresh sequential process with the
existing isolation, concurrency and per-test deadlines. No failing case was
disabled or weakened. Runtime and test bytes are compared with the verified
source snapshot before publication. The final scan
must cover the supplied
credential's exact bytes in tracked files, the index, outgoing commits, build
output, verification output, release assets and the isolated Linux run's source
and output. Only the whitelisted public assets in
[the asset manifest](releases/v0.3.0-assets.json) belong in the draft release.
Private verification files and model credentials remain outside Git and release
uploads. Paid-model validation services are stopped and their routines paused.

Private vulnerability reporting, secret scanning and push protection are enabled
on the GitHub repository. Report vulnerabilities through the
[private advisory form](https://github.com/ychampion/openduet/security/advisories/new).
See [SECURITY.md](../SECURITY.md) and the [threat model](THREAT-MODEL.md) for the
authorization boundary, observed enforcement and limits.

## Publication sequence

1. Review the launch PR and require its final dependency audit, full local suite
   and candidate CI checks to pass.
2. Merge the reviewed candidate; confirm main CI and image publication succeed.
3. Tag the reviewed release commit `v0.3.0`. Wait for the Images workflow to
   publish all five versioned images; verify anonymous pulls and matching commit
   digests. This public tag is the first release-publication action.
4. Exercise the pinned installer from the release body against those versioned
   images on a fresh Linux host, then verify account setup and model readiness.
   Keep the install isolated from existing personal data.
5. Publish the prepared draft release with the whitelisted media and checksum
   file. Use the [launch kit](LAUNCH.md) when announcing it.

The draft and prepared copy do not publish a release, a tag or social posts.
Keep the server running for background work. Operators manage HTTPS, backups,
provider costs and approvals; see [deployment](DEPLOYMENT.md),
[upgrading](UPGRADING.md) and [always-on controls](ALWAYS_ON.md). Native mobile
binaries, wallets and Claude-account context sync are outside this release.

The [initial v0.2.1 report](releases/v0.2.1-verification.md) is preserved as
historical evidence. For local prerequisites and reproduction commands, use
[CONTRIBUTING.md](../CONTRIBUTING.md) and `bun run doctor`.
