# Branding and showcase verification

Checked October 23, 2026. Application/UI source: `cb0b5882c33a6a6b4fee9850292f718418f64f06`.
Later changes in this update affect the README badge, troubleshooting text and
this evidence only. The application logic is unchanged by the branding update.

## Visuals and documentation

| Check | Result |
| --- | --- |
| Logo color and shape | SVG stroke is `#d97757`; rebuilt PNG contains that exact opaque RGB value. Its alpha channel matches the previous mark, preserving the shape. |
| Application build | Type checking and the production web build pass. |
| Repository checks | Lint, source-name / branding scans, scrub and all three Compose checks pass. |
| UI capture | 33 checks: seven routes × two sizes × two themes, plus draft, receipt and routine states. No page errors, broken images or horizontal overflow. |
| Keyboard | Search opens and dismisses by keyboard in all four desktop/phone/theme contexts. |
| Presentation | HyperFrames full check passes with zero errors; actual snapshots and encoded frames were inspected. Still holds, crossfades and silence are deliberate. |
| Documentation links | 72 local links/assets resolve; GitHub Markdown rendering succeeds. |
| Published README | Images load on GitHub; desktop and 390 px phone layouts checked, with no horizontal overflow. Install anchor reaches the setup steps. |
| Public video assets | All three release URLs return HTTP 200 with `video/mp4`. GitHub SHA-256 digests match the encoded local files. |

## Videos

| Asset | Duration | Encoding |
| --- | --- | --- |
| OpenDuet overview | 28.5 seconds | H.264 MP4, 1440 × 1080, silent |
| Client follow-up | 20 seconds | H.264 MP4, 1440 × 960, silent |
| Routines | 13.32 seconds | H.264 MP4, 1440 × 960, silent |

The inline GIF is approximately 1.4 MiB. The MP4s total approximately 3.2 MiB.
The [showcase](SHOWCASE.md) includes video links and text alternatives.

## Clean-run evidence

The clean [CI run](https://github.com/ychampion/openduet/actions/runs/39854131619) passed all nine jobs. Its full Bun suite ran 9,934 tests across 922 files: **9,699 passed, 222 skipped, 13 todo, zero failures**. The Hermes plugin suite passed **254 tests, seven skipped**. Real-engine Docker sandboxes, browser isolation, scripted capability evaluations, and stdio MCP conformance passed separately. Published-image installation and setup-guide checks also passed.

## What this establishes

The media reproduces actual application interactions with documentation-only
fixtures. The send walkthrough reaches an exact-action review, a once-only
authorisation and a sample receipt. The fixture delivers no email. The routine
walkthrough tests the interface; real background execution has separate CI
coverage. These are not recordings of a paid model using a real inbox, and no
Claude Duet task-quality benchmark was performed.

A local whole-suite attempt lost its disposable Postgres fixture and is not
used as completion evidence. A separate Bun process-fixture error passed its
isolated 19-test rerun. The clean CI run above is the whole-suite evidence;
the local runtime-plugin suite also passed 254 tests with seven skips.

Reproduce the media with [the capture instructions](media/README.md).
