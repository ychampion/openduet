# OpenDuet browser verification

Captured October 22, 2026 from the production web image running against the
Linux Compose service, Postgres, broker and Hermes runtime. The disposable
installation used a scripted provider and test connector, with no live account
or model credentials.

The browser walk checked Home, new chat, plans, work, agents, memory,
automations, files, apps, connections and settings at 1440 × 900, 1024 × 768 and
390 × 844 in light and dark appearance: 66 checks passed. Each check asserted
the OpenDuet title, rendered content, no inherited product name, no horizontal
overflow, no broken images and no JavaScript exceptions. Six layout/theme
contexts also passed skip-to-main, keyboard focus and Ctrl+K/Escape checks.

- [Desktop, light](home-1440-light.png)
- [Desktop, dark](home-1440-dark.png)
- [Phone, light](home-390-light.png)

These screenshots show a disposable account and explicitly scripted test work.
See [release verification](../../../../docs/RELEASE_READINESS.md) for the other
checks and limits. The older demo recordings and screenshot gallery were
removed during the rebrand. `bun run --cwd apps/web screens` remains available
for the broader scripted-preview screen walk; its output is separate evidence.
