---
name: openduet-setup
description: Install and set up OpenDuet, the open-source self-hosted assistant, on this computer or a server with Docker. Use when the person asks to install, set up, start, check, update or extend a OpenDuet installation (model, computer, voice, mail and calendar, public address, MCP server).
---

# Set up OpenDuet

The steps live in one guide, kept current with the code:

- In a OpenDuet checkout: `SETUP-WITH-AN-AGENT.md` at the repository root.
- Otherwise: https://raw.githubusercontent.com/ychampion/openduet/main/SETUP-WITH-AN-AGENT.md

Read the whole guide before running anything, then follow it from the top.
Every step in it is safe to run again.

The rules that matter most:

- The person types every password and key, into OpenDuet's Settings or their own
  terminal. Never ask for one in the chat, and never print `deploy/.env`.
- Ask before installing Docker, creating a server, or deleting anything.
- `bun run openduet status` reports where the installation stands and
  what to do next.
