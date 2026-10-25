# Source provenance

OpenDuet is an independent, Apache-2.0 project derived from the author's
[Melete](https://github.com/ychampion/melete) at
`ca2d4b551696eefca1e1ded839c256a9ba5b177a` on October 22, 2026.
The initial OpenDuet commit consolidates that source into one new project
history; it does not imply that the underlying software was written in one day.

All inherited text source files were adapted for OpenDuet: product names,
package scopes, directories, environment variables, commands, URLs, database
identifiers, runtime hooks, Docker resources and test fixtures were renamed.
The logo, favicon and home-screen icons are new. The launch documentation and
comparison are new. The original license and notices are retained in LICENSE
and NOTICE. Third-party names and licenses retain their own identities.

Technical evidence in older design notes describes the source project's
historical tests. OpenDuet evidence is recorded by update and execution scope:

- [Release readiness](RELEASE_READINESS.md) records release and installation
  checks at its stated revision.
- [Product verification](PRODUCT_VERIFICATION.md) records the personal assistant
  regression and browser checks, with their revisions and fixture boundaries.
- [Live-model verification](LIVE_MODEL_VERIFICATION.md) records the October 24
  Anthropic Opus 5.5 and Fireworks runs: automatic correction learning, use in
  a separate task, restart persistence and native scheduled work with the
  browser and frontend server stopped.

The live report links the sanitized execution records and media. Earlier
scripted captures retain their labels and do not become live-model evidence.
This is a fresh installation, not a migration for existing Melete deployments:
its settings, containers and storage have separate names.

OpenDuet is not affiliated with or endorsed by Anthropic. Claude and Claude
Duet are Anthropic product names, used only to identify the comparison target.
