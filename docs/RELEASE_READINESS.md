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

The complete Bun run and its final affected-file reruns are being collected.
Do not treat this paragraph as a passing full-suite result. The initial run
identified inherited fixed-length branding assertions, a DNS-dependent browser
fixture and database-wake test time budgets. Those fixtures were corrected;
the browser file passed all 12 tests on rerun. A machine interruption also
invalidated disposable login sessions. Final counts belong here before the
release is declared fully verified.

The repository's [CI](https://github.com/ychampion/openduet/actions/workflows/ci.yml),
[deployment conformance](https://github.com/ychampion/openduet/actions/workflows/conformance.yml),
[images](https://github.com/ychampion/openduet/actions/workflows/images.yml),
[installer](https://github.com/ychampion/openduet/actions/workflows/install.yml)
and [setup guide](https://github.com/ychampion/openduet/actions/workflows/setup-guide.yml)
provide independently inspectable results for each published revision.

## Evidence limits

- No paid model key or personal connected account was used. Live task quality,
  third-party OAuth and delivery through a real mail/calendar account remain
  unverified. Scripted tests establish wiring and enforcement, not model quality.
- Deployed conformance skipped four optional Docker stdio-MCP cases and the
  second live-provider comparison. Python skipped seven explicitly optional
  environment-dependent cases.
- Browser renderer sandbox proof, live S3 compatibility and optional external
  sandbox providers require their separate CI or operator environments. The
  browser Compose checks alone do not prove those runtime properties.
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
