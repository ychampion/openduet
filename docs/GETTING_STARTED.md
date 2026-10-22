# Your first useful task in OpenDuet

Go from a fresh installation to one completed task, then a connected workflow.
For all operator options, use [DEPLOYMENT.md](DEPLOYMENT.md).

## Before you start

You need a host that can stay on, Docker Engine **28+**, Compose **2.33.1+**,
**8 GB RAM**, **20 GB free disk**, and outbound access to GitHub and your model
provider. Published images are **linux/amd64**. Use Linux x86-64 or Docker
Desktop with Linux containers on Windows / Intel Mac. ARM source builds are
not covered by the public-image install checks. Windows also needs Git for
Windows. The clean-machine installer check runs on Linux.

Check Docker in your terminal:

```sh
docker version
docker compose version
docker info --format '{{.OSType}} / {{.Architecture}}'
```

Expected: the server is reachable, Compose meets the minimum version, and the
engine reports Linux. Start Docker Desktop if the server cannot be reached.
Use the [Docker installation guide](https://docs.docker.com/get-started/get-docker/)
if Docker is missing.

## 1. Install the public images

Linux / macOS, in Bash:

```sh
curl -fsSL https://raw.githubusercontent.com/ychampion/openduet/main/install.sh | bash
```

Windows, in PowerShell:

```powershell
irm https://raw.githubusercontent.com/ychampion/openduet/main/install.ps1 | iex
```

The installer creates `~/openduet` and local configuration, pulls the images
and starts the services. It prints the web address and a one-time setup link.
Keep the setup code until you have created your account; it expires after
72 hours. On the host, the app is normally at **http://localhost:3101**.

Prefer to inspect the installer first? Download [install.sh](../install.sh)
or [install.ps1](../install.ps1), read it, then run the saved file. For another
directory, project name or ports, see the [deployment guide](DEPLOYMENT.md).

## 2. Create your account and connect a model

Open the setup link, create your account, and finish the first-run prompts.
Confirm your time zone so routines fire at the intended local time.

In **Settings → Models**, configure your provider, API key and model. Save the
configuration, return to chat and send a small request. The practice model
used before configuration is a demonstration; it cannot do general work.
Choose a model that supports the tool use your workflow needs. Providers and
local endpoints have different capabilities and quality.

![Model settings in the scripted showcase](media/models-1440-light.png)

In **Settings → Approvals**, select **Ask me for everything** while you learn
the system. Auto-review and other autonomy settings can permit changes
without a fresh approval.

## 3. Finish a small task

Paste this into a new chat; it needs only a real model:

```text
Turn these notes into a client update:
- Landing page copy is approved.
- Mobile screenshots are due Friday.
- Launch is Monday.

Give me a status, risks and next actions. Ask if a date is ambiguous.
Do not send anything.
```

You are done when you have a readable update, unresolved dates are called
out, and no message has been sent. Correct the result if needed. Then tell
OpenDuet a preference to remember and inspect it in **Memory**.

## 4. Connect one account, then try a draft

Open **Settings → Connections** and connect a mailbox using a provider your
installation supports. Depending on the connector, you may need app-specific
credentials, OAuth configuration or an optional connector service. Catalog
apps can require operator setup. See [CONNECTORS.md](CONNECTORS.md).

Ask for a short follow-up to a thread you can verify. Name the thread, desired
outcome and recipient; request a draft first. Check the recipient, subject,
body and proposed action before sending. A draft is not a delivery receipt.

![Reviewing an exact send action in the scripted walkthrough](media/review-draft.png)

## 5. Make recurring work explicit

Open **Automations → New routine**. Enter an instruction, days and time.
Include what counts as a useful change and what should wait for you. Start
with a report-only routine. Run a test, inspect its output, then leave it on.

For example: “Every Friday, review the supplier shortlist, link new sources
and list questions to verify. Do not contact suppliers.”

Your server must stay running. Closing the browser does not turn the host
into an always-on machine. Model budgets, missing credentials and disconnected
accounts can stop a routine; inspect its runs.

## Add a browser or phone access

Once your account exists, enable the browser worker from Bash:

```sh
curl -fsSL https://raw.githubusercontent.com/ychampion/openduet/main/install.sh | OPENDUET_BROWSER=1 bash
```

See [browser-worker.md](browser-worker.md) for Windows and source-install
alternatives. Browser access and a sandbox computer are separate capabilities.

For another device, follow the [HTTPS / Tailscale instructions](DEPLOYMENT.md).
Then open your server’s HTTPS address on the phone and use **Add to Home Screen**
or **Install app**. `localhost` on your phone means the phone itself, not your
server. PWA installation and push depend on browser support and a secure
origin. There are no native iOS or Android binaries in this release.

## When something does not work

| Symptom | Check |
| --- | --- |
| Docker cannot be reached | Start the daemon / Docker Desktop and check this account has access. |
| Unsupported engine / Compose | Update to Engine 28+ and Compose 2.33.1+. Use Linux containers. |
| No matching image manifest | Public images target linux/amd64. Check the host architecture. |
| The first download is slow | Allow the pull to finish; check network access and free Docker disk space. |
| The app is not reachable | Use the printed URL. Inspect Compose status and logs below. |
| Setup code is rejected | Check expiry and whether the first account exists. Follow account recovery in the deployment guide. |
| Replies look like a demonstration | Replace the practice model in Settings → Models with a real provider and valid model ID. |
| A tool is unavailable | Check the connection, credentials, agent access and any required worker. |
| A routine fires at the wrong time | Confirm the profile time zone and schedule; inspect its latest run. |
| Phone cannot connect | Use the server’s HTTPS / tailnet address, not localhost. |

For the default installation:

```sh
docker compose -f ~/openduet/deploy/docker-compose.yml ps
docker compose -f ~/openduet/deploy/docker-compose.yml logs --tail=100 openduet web
curl -fsS http://localhost:3101/api/health
```

The health endpoint should return a successful response. Remove account and
task details from logs before posting an issue. Substitute your custom
installation directory if you chose one.

## Keep the installation useful

Back up before updating. Running the installer again updates downloaded files
and images while keeping `deploy/.env`, configuration and volumes; it is not
a backup. See [deployment operations](DEPLOYMENT.md),
[upgrading and rollback](UPGRADING.md) and the
[CLI backup/restore commands](../packages/cli/src/main.ts).

Try another [workflow from the playbook](USE_CASES.md), or inspect the
[feature comparison](CLAUDE_DUET_COMPARISON.md) before choosing work to delegate.
