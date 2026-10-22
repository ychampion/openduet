# OpenDuet release verification

Verified October 22–23, 2026. This report distinguishes a working source
installation, scripted execution evidence and live-provider evidence. The
[feature comparison](CLAUDE_DUET_COMPARISON.md) describes Claude Duet's published
research preview; no Duet account was benchmarked.

The release is a fresh installation. Keep it separate from existing assistant
deployments; no existing database, profile, device pairing or configuration is
migrated. Tests use disposable data and browser contexts.

## Completed locally

| Check | Result |
| --- | --- |
| Frozen dependency installation | Passed on Windows and Linux with Bun 1.3.13 |
| TypeScript and production web build | Passed; the bundle retains a size warning |
| Release lint, source scrub and product-name checks | Passed; 28 existing lint warnings, no errors |
| Main Compose boundary and runtime-plugin digest checks | 48 passed |
| Optional browser Compose configuration | 14 passed |
| Optional Tailscale Compose configuration | 15 passed |
| Python runtime plugin | 254 passed, 7 skipped |
| Deployed conformance | 69 passed, 5 skipped, 0 failed across 13 files |
| Production browser views | 66 passed: 11 routes × 3 viewports × 2 appearances |
| Keyboard navigation | Skip-to-main, focus, Ctrl+K and Escape passed in all 6 viewport/theme contexts |
| Scripted-preview browser views | A separate 66-view walk passed |
| Fresh account and chat | One-time setup, password sign-in, onboarding, timezone selection and a real Hermes scripted answer passed through the production web proxy |
| Pending work in the browser | Work displayed its pending action, withheld approval for an incomplete message preview, and accepted the owner's decline |

The deployment was built from source on Ubuntu in WSL 2, using Docker Engine
29.1.3, Compose 2.40.3, Bun 1.3.13 and Node 22.22.2. The stack's five
long-running services became healthy. Postgres and the scripted Hermes runtime
were real processes; the model and connector destination were fixtures.

Deployment conformance verified approval binding to the exact payload, one
destination effect after approval, retained receipts, restart recovery, memory
retraction, and a real attempt container's inability to call the owner approval
API. It also probed denied internet, database, metadata, sibling-workspace and
host access, with positive controls for the permitted broker/gateway route.
The tests explicitly selected **Ask me for everything**; auto-review can
authorize actions under other settings.

The [committed screenshots](../apps/web/docs/screens/README.md) show the current
production UI. The static design-reference screenshots were also regenerated
with the OpenDuet mark. Old demo recordings were removed.

## Full-suite status

The initial full CI run completed 9,934 tests across 922 files: 9,635 passed,
222 skipped, 13 todo and 64 failed. Every failure came from the three optional
sandbox adapters' replay fixtures: readable names had changed, but request
hashes and encoded response bodies still represented the original brand.
Those fixtures have now been regenerated through their documented stand-ins;
all 109 authoring tests and all 109 subsequent replay tests passed. The release
branding check now also inspects encoded payloads. A fresh full CI result is
required before final verification. The 13 todo entries identify the full-suite
runner's missing Chromium prerequisite; separate real-browser CI jobs passed.

Earlier affected-file reruns corrected fixed-length branding assertions, a
DNS-dependent browser fixture and database-wake time budgets. The browser file
passed all 12 tests. Two database clock-skew tests now advance their stored
deadlines explicitly rather than racing a 30 ms registration window; both
complete files passed all 62 tests. A machine interruption invalidated the
disposable sessions in the initial local full run; it is not a passing result.

## Published installation and independent checks

The initial code revision is
`bd0f0ef586ffbacbfd1c7f588f7473a0f1f15b2a`. These checks ran on fresh GitHub
runners against that revision:

| Check | Result |
| --- | --- |
| [Images](https://github.com/ychampion/openduet/actions/runs/39834651121) | All five images built and published; anonymous requests to every `main` manifest returned HTTP 200 |
| [One-line installer](https://github.com/ychampion/openduet/actions/runs/39835200682) | Passed without Bun on the installer's PATH: public-image pull, first account, browser enablement, repeat installation, separate installation and relocated installation |
| [Setup guide](https://github.com/ychampion/openduet/actions/runs/39835200560) | Passed the guide's own commands, account setup, browser enablement and repeat setup |
| [Deployment conformance](https://github.com/ychampion/openduet/actions/runs/39834651215) | 69 passed, 5 skipped, 0 failed; external Postgres and S3-compatible backup/restore passed in both required and verify-full modes |
| [Scripted capability evaluations](https://github.com/ychampion/openduet/actions/runs/39834651116/job/120019641489) | 24 passed, 1 skipped, 0 failed; all baseline scenarios held |
| [Docker sandboxes](https://github.com/ychampion/openduet/actions/runs/39834651116/job/120019641809) | Passed real-engine execution, persistent background processes, wake-up, brokered internet and GitLab/npm access, and isolation between users |
| [Browser renderer](https://github.com/ychampion/openduet/actions/runs/39834651116/job/120019641911) | Sandbox proof passed inside the shipped browser container |
| [App isolation](https://github.com/ychampion/openduet/actions/runs/39834651116/job/120019641772) | Published apps and agent-server previews stayed inside their frames and permitted ports in real Chromium and Firefox |
| [Browser sign-out](https://github.com/ychampion/openduet/actions/runs/39834651116/job/120019641678) | Passed profile clearing and the signed-in-sites UI check |
| [Containerized stdio MCP](https://github.com/ychampion/openduet/actions/runs/39834651116/job/120019642074) | Separate Docker launcher conformance passed |

The upgrade job was deliberately skipped for the parentless initial commit:
there is no preceding OpenDuet release to upgrade from.

## Evidence limits

- No paid model key or personal connected account was used. Live task quality,
  third-party OAuth and delivery through a real mail/calendar account remain
  unverified. Scripted tests establish wiring and enforcement, not model quality.
- Deployed conformance skipped four optional Docker stdio-MCP cases and the
  second live-provider comparison. Python skipped seven explicitly optional
  environment-dependent cases.
- The S3 checks used an S3-compatible fixture service. They do not establish
  compatibility with every cloud storage vendor. Optional external sandbox
  providers still require their own operator configuration and verification.
- Mobile testing used Chromium viewports, not physical iOS/Android devices.
  Native apps, wallet integrations and Claude-account context sync are absent.
- The release starts a new installation. Backups, HTTPS, external connectors,
  spending limits and keeping the host online remain operator setup tasks.

## Reproduce

Use [CONTRIBUTING.md](../CONTRIBUTING.md) for the disposable Postgres, browser and
Python prerequisites, then run the commands in the README's verification
section. `bun run doctor` checks the test environment.

For a disposable Compose stack, `bun run openduet init --fake` explicitly enables
the scripted provider and test connector. Follow [conformance/README.md](../conformance/README.md)
to opt into deployed scenarios. Never enable those fixture services on a
personal installation with real connected accounts.
