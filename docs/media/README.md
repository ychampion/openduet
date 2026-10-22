# Showcase media

Captured October 23, 2026 for the OpenDuet README. The application screenshots
and recordings come from `apps/web`, using the documentation-only fixture
server in `scripts/docs/demo-server.ts`. The fixture runs only on loopback,
uses sample accounts and scripted model/tool responses, and performs no
external actions. It is not part of the installed application.

The videos show review and authorisation interactions; a fixture receipt is
not proof of live email delivery. The overview is a captioned presentation of
actual screenshots. Model names, usage figures, weather and account contents
shown in fixtures are example data. For production evidence, see
[the release report](../RELEASE_READINESS.md).

## Reproduce

From the repository root, after `bun install --frozen-lockfile`, start these
in separate terminals:

```sh
bun run scripts/docs/demo-server.ts
```

```sh
VITE_OPENDUET_API=http://127.0.0.1:3320 bun run --cwd apps/web dev --host 127.0.0.1 --port 5320 --strictPort
```

In PowerShell, set the environment separately:

```powershell
$env:VITE_OPENDUET_API = 'http://127.0.0.1:3320'
bun run --cwd apps/web dev --host 127.0.0.1 --port 5320 --strictPort
```

Install Python Playwright, then capture using disposable browser contexts:

```sh
python -m pip install playwright
python -m playwright install chromium
python scripts/docs/capture.py
```

The script checks seven routes at desktop and phone widths in both themes,
plus draft / receipt / routine states. It checks horizontal overflow, broken
images, page errors and keyboard access to search. Screenshots go here;
raw recordings and the report go into ignored `output/docs/`.

With FFmpeg installed, encode the two recordings:

```sh
ffmpeg -y -i output/docs/recordings/follow-up.webm -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -an -movflags +faststart output/docs/openduet-follow-up.mp4
ffmpeg -y -i output/docs/recordings/routines.webm -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -an -movflags +faststart output/docs/openduet-routines.mp4
```

The overview source is in `presentation/`. Its self-contained asset copies
must be refreshed from the captures after changes. Copy the four screenshots
and logo named in its HTML into `presentation/assets/`, then:

```sh
cd docs/media/presentation
bun install --frozen-lockfile
npm run check
bunx hyperframes@0.8.186 snapshot --at 3,10,17,24 --no-end
bunx hyperframes@0.8.186 render --workers 1 --low-memory-mode --fps 24 --output ../../../output/docs/openduet-overview.mp4
```

Back at the repository root, make the poster and small inline preview:

```sh
ffmpeg -y -ss 3 -i output/docs/openduet-overview.mp4 -frames:v 1 docs/media/overview-poster.png
ffmpeg -y -ss 0.5 -i output/docs/openduet-overview.mp4 -t 27.3 -filter_complex '[0:v]fps=5,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=5' -loop 0 docs/media/overview.gif
```

Review the snapshots before publishing. Readability holds and silence are
intentional for an inline documentation preview; use the full-size screenshots
to inspect application text. Videos are attached to the existing release as
documentation assets; application release tags are unchanged.

## Brand and licenses

The OpenDuet mark retains its original paired-stroke shape and now uses
`#d97757`, the terracotta accent documented in
[Anthropic's brand-skill example](https://claude.com/resources/articles/how-to-create-skills-key-steps-limitations-and-examples).
It is not Anthropic's symbol. OpenDuet is an independent project.

The overview uses DM Sans and Newsreader under the SIL Open Font License;
their notices are in `presentation/assets/`. GSAP 3.15.0 is a rendering-only
dependency under its [standard license](https://gsap.com/standard-license/),
installed separately and excluded from the app bundle. HyperFrames is a pinned
documentation tool. OpenDuet's application license and third-party notices
remain in [LICENSE](../../LICENSE) and [NOTICE](../../NOTICE).
