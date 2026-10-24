# Live assistant captures

These images and recordings show the production OpenDuet web build connected
to its actual API and PostgreSQL data, using the pinned Hermes engine. Customer
notes were supplied examples; no mailbox was connected and nothing was sent.

| Files | Actual provider/model |
| --- | --- |
| `opus-*.png`, `opus-learning-and-background.mp4`, `opus-browser-checks.json`, `opus-receipt.json` | Anthropic `claude-opus-5-5` |
| Other PNGs, `learning-and-background.mp4`, `browser-checks.json`, `receipt.json` | Fireworks `accounts/fireworks/models/deepseek-v4p1-flash` |

Each receipt records the exact requests, correction, automatic memory revisions,
separate task, native scheduled result and provider usage. The corresponding
browser was closed before the final scheduled run; the frontend server was also
stopped until after the result completed. Read the
[verification report](../../LIVE_MODEL_VERIFICATION.md) for setup, fixes and
coverage limits. Usage records identify actual models and calls; they are not
provider invoices.

The PNGs show persisted results in desktop light/dark and phone layouts,
corrected memory, and recurring work. Both MP4s are H.264 conversions of
Playwright browser recordings, with no audio. They show reviewing the saved
preference and opening the completed routine result after returning to the app.
They do not depict a closed browser or time-lapse the scheduler; those times
are recorded separately in the receipts.

Disposable browser contexts were used. Requests and responses were not
intercepted or replaced. No pixels, conversation text or saved memory were
fabricated for the captures. Credentials and session state are excluded.
