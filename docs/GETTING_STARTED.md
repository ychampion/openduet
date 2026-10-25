# Your first useful task in OpenDuet

Go from a fresh installation to one completed task, then a connected workflow.
For all operator options, use [DEPLOYMENT.md](DEPLOYMENT.md).

Install the server once, then use the web app from Windows, macOS, Linux or a
phone. Only the host running the server needs Docker. Your other devices
connect to that host's web address.

## Before you start

You need a host that can stay on, Docker Engine **28+**, Compose **2.33.1+**,
**8 GB RAM**, **20 GB free disk**, and outbound access to GitHub and your model
provider. Published images are **linux/amd64**. Use Linux x86-64 or Docker
Desktop with Linux containers on Windows / Intel Mac. On an Apple Silicon Mac,
use the web app hosted on a supported host; local ARM installations require
building images from source. Windows also needs Git for Windows.

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

Linux / Intel Mac, in Bash:

```sh
curl -fsSL https://raw.githubusercontent.com/ychampion/openduet/v0.3.1/install.sh | OPENDUET_REF=v0.3.1 OPENDUET_IMAGE_TAG=v0.3.1 bash
```

Windows, in PowerShell:

```powershell
$env:OPENDUET_REF = 'v0.3.1'
$env:OPENDUET_IMAGE_TAG = 'v0.3.1'
irm https://raw.githubusercontent.com/ychampion/openduet/v0.3.1/install.ps1 | iex
```

The installer creates `~/openduet` and local configuration, pulls the images
and starts the services. It prints the web address and a one-time setup link.
Keep the setup code until you have created your account; it expires after
72 hours. On the host, the app is normally at **http://localhost:3101**.

Open that local HTTP address in Chrome or Edge. Safari requires HTTPS for
OpenDuet's secure sign-in cookies, including on localhost. To use Safari,
configure [HTTPS](DEPLOYMENT.md#configuration-and-browser-access) or
[Tailscale](DEPLOYMENT.md#tailscale) and open the HTTPS address.

Prefer to inspect the installer first? Download [install.sh](../install.sh)
or [install.ps1](../install.ps1), read it, then run the saved file. For another
directory, project name or ports, see the [deployment guide](DEPLOYMENT.md).

## 2. Give it a real task

Open the setup link and create your account. The next screen asks **What would
you like off your plate?** Choose a starter or enter your own task, then paste
notes or attach a supported file. Time zone is detected automatically; use
**Change** if it is wrong. No personal questionnaire is required.

Try this request with notes you can check:

```text
Priya at Northstar needs a security review before choosing a pilot date.
We have not confirmed SSO support. Prepare a short follow-up asking which
security questions her team needs answered. Do not promise SSO or send anything.
```

Pasted context is enough for this draft. You can connect an inbox later.

## 3. Connect and verify the model

Press Send. If a model is missing or unchecked, your exact text and uploaded
attachment references are kept while setup opens. Configure the provider and
selected model, then review the three separate check stages:

| Stage | What it proves |
| --- | --- |
| Credentials accepted | The provider accepted the configured credentials. Listing models alone proves no inference capability. |
| Model responded | The exact selected model produced an inference response through the gateway and Hermes. |
| Tool use verified | That model called the isolated read-only note tool and returned its actual value. |

The check uses up to three model requests, 1,536 output tokens and 45 seconds
of runtime. Provider billing can apply. It has no access to your actual accounts.
IDs and custom endpoints are under Advanced. Changing relevant model configuration
invalidates earlier readiness. A failed check shows its stage and reason; fix
credentials, billing, endpoint, model ID or tool compatibility before retrying.
No other model is silently selected.

After a successful check, the saved request continues once. Refreshes or retries
reuse its submission key. Do not retype it into another task to recover a lost
response. The check verifies compatibility, not the quality of every future answer.

In **Settings → Approvals**, choose **Ask me for everything** while learning the
system. Other autonomy settings can permit actions under existing policy.

## 4. Inspect, correct and teach

Your task and its useful output appear in **Chat**. Open the result to see the
source context and full draft. A draft has not been sent. Correct it with
**Reply to this result**. Make an ongoing preference explicit, for example:

```text
Correction for all future customer follow-ups: use one short paragraph,
under 60 words, and sign off "Thanks, Sam" instead of "Regards, Sam".
```

Use your own name and preferred style. With automatic capture enabled and a
memory model configured, OpenDuet learns lasting preferences from your own
words. Corrections replace the earlier value. Capture runs asynchronously and
depends on the model and your privacy and spending settings; review the saved
detail in **Settings → Memory** before relying on it for another task.

**Learn from my chats** controls automatic capture. Review, edit or forget saved
details in **Settings → Memory**. Start a message with **off the record** to
exclude it from learning. Then try a separate, relevant task without repeating
the style and inspect the result.

Use **Remember this preference** to review and explicitly save the exact style
instruction. Use **Save these steps** for a reusable personal procedure. Both
have review fields; neither starts a routine. Manage procedures in
**Explore → Skills**.

The captures below show Anthropic Opus 5.5 using supplied customer notes. It
learned the correction automatically, used it in a separate task, and prepared
the shown result on a schedule with the browser and frontend server stopped.
No mailbox was connected and nothing was sent. The same workflow also ran with
a Fireworks model; see the [live execution record](LIVE_MODEL_VERIFICATION.md)
for the requests, answers and timing.

![A completed Opus follow-up using the corrected paragraph and sign-off](media/live-assistant/opus-result-desktop.png)

![The automatically learned correction in Settings → Memory](media/live-assistant/opus-memory-desktop.png)

**[Watch the saved preference and completed result](media/live-assistant/opus-learning-and-background.mp4)**.
The recording shows reviewing them after returning to the app; the execution
record documents when the background run completed.

## 5. Delegate a future responsibility explicitly

For report-only scheduled work, choose **Run this automatically** after a result
and review the instruction, source scope, time and time zone. Return to **Work**
for the result and questions that need you. Manage the schedule or pause it in
**Work → Recurring**. For a daily brief, use the dedicated brief settings so
there is one actual daily schedule.

For a customer follow-up, connect a native Gmail or Microsoft mailbox in
**Settings → Connections**. Operator OAuth/app setup can be required; see
[CONNECTORS.md](CONNECTORS.md). Open **Work → Recurring → Watch a customer thread**,
select the actual mailbox and thread, inspect its contents, and confirm the
customer email, deadline and time zone. IMAP and generic MCP sources are not
currently offered for this watch.

If no reply arrives by the confirmed time, a draft returns for review. A fresh
reply, paused watch or revoked account access prevents obsolete preparation and
send. Review the exact message before authorizing its send; a receipt completes
the one-shot watch. Use Pause watch to stop its actual future checks.

Your host must stay on. Closing a browser does not stop its server, but turning
off the host does. Budgets, failed checks and disconnected accounts are shown
rather than treated as successful work. See the [complete behavior guide](PERSONAL_ASSISTANT.md).

## Plan the next useful step

With suggestions enabled, the server checks saved source state every minute
for upcoming watched meetings, unresolved source signals and stalled personal
tasks. Chat shows up to three suggestions with a reason and source.

Choose **Plan together** to gather the current context into an editable request
with an attached source note, then press Send when ready. **Tomorrow** snoozes
that suggestion for 24 hours; **Not useful** dismisses it. **Pause suggestions**
stops noticing while already delegated tasks, routines and watches keep their
own controls. Suggestions gather saved context; scheduled jobs perform the
model work. See [always-on collaboration](ALWAYS_ON.md) for the source conditions
and delivery settings.

## Add a browser or phone access

Once your account exists, enable the browser worker from Bash:

```sh
curl -fsSL https://raw.githubusercontent.com/ychampion/openduet/main/install.sh | OPENDUET_BROWSER=1 bash
```

For a tagged installation, keep the same tag in the download URL,
`OPENDUET_REF` and `OPENDUET_IMAGE_TAG` when adding the worker or updating.
Use the [matching release commands](releases/v0.3.0.md#optional-browser-worker)
for v0.3.0. The command above tracks `main` deployment files.

See [browser-worker.md](browser-worker.md) for Windows and source-install
alternatives. Browser access and a sandbox computer are separate capabilities.

For another device, follow the [HTTPS / Tailscale instructions](DEPLOYMENT.md).
Then open your server’s HTTPS address on the phone and use **Add to Home Screen**
or **Install app**. `localhost` on your phone means the phone itself, not your
server. PWA installation and push depend on browser support and a secure
origin. There are no native iOS or Android binaries in this release.

## Before updating an existing installation

Read the target release notes and make a backup first. The installer retains
local settings and volumes when run again; it does not create a backup.

The operator CLI needs Git and Bun 1.3.13 on the host. An installation made by
the one-line installer has no source checkout, so put the CLI in a separate
directory and point it at the existing deployment. For a published v0.3.0:

```sh
git clone --branch v0.3.0 --depth 1 https://github.com/ychampion/openduet.git ~/openduet-tools
cd ~/openduet-tools
bun install --frozen-lockfile
bun run openduet --deploy-dir ~/openduet/deploy backup --estimate
bun run openduet --deploy-dir ~/openduet/deploy backup
```

Use your installation's actual `deploy` directory if you chose another location.
Keep the master key separately as described in
[backup and restore](DEPLOYMENT.md#backup-and-restore). Verify the backup and read
[upgrading and rollback](UPGRADING.md) before re-running the installer with the
target release in its URL, `OPENDUET_REF` and `OPENDUET_IMAGE_TAG`.

## Use OpenDuet from another computer or phone

On the host running OpenDuet, open **http://localhost:3101**. On a Mac or
another device, open the host's configured HTTPS address and sign in to your
account. `localhost` always means the device where the browser is running.

Configure [Tailscale](DEPLOYMENT.md#tailscale) for private access, or use your
own HTTPS reverse proxy as described in the deployment guide. With Tailscale,
follow [From a phone or a laptop](DEPLOYMENT.md#from-a-phone-or-a-laptop) to
connect each device. Keep the host and its Docker services running so tasks
and routines can continue after you close the browser.

## When something does not work

| Symptom | Check |
| --- | --- |
| Docker cannot be reached | Start the daemon / Docker Desktop and check this account has access. |
| Unsupported engine / Compose | Update to Engine 28+ and Compose 2.33.1+. Use Linux containers. |
| No matching image manifest | Public images target linux/amd64. Check the host architecture. |
| The first download is slow | Allow the pull to finish; check network access and free Docker disk space. |
| The app is not reachable | Use the printed URL. Inspect Compose status and logs below. |
| Sign-in succeeds but Safari returns to the sign-in screen | Use the host's HTTPS / Tailscale address. For HTTP localhost, use Chrome or Edge. |
| Setup code is rejected | Check expiry and whether the first account exists. Follow account recovery in the deployment guide. |
| Request stays in setup | Check the selected model’s credentials, inference and tool results. Fix the stated failure, then retry the saved request. |
| A tool is unavailable | Check the connection, credentials, agent access and any required worker. |
| A task's source needs reconnecting | Use **Connect**, or **Provide context** to add notes/files to that exact task. The separate unsent request is preserved. Fresh reads and sending still need the source. |
| A routine fires at the wrong time | Confirm the profile time zone and schedule; inspect its latest run. |
| No proactive suggestions | Open the Chat status row and confirm suggestions are enabled. Connect a watched source, or check whether a personal task meets the [noticing conditions](ALWAYS_ON.md). No evidence means no invented task. |
| Background checks are delayed | Keep the host and worker services running. Closing a browser is fine; suspending the host stops its workers. Inspect service status and logs below. |
| Automatic memory has no new details | Check capture is enabled, the memory model is configured and privacy/spending policy permits extraction. Lasting details are learned asynchronously; review actual saved items in Memory. |
| Phone cannot connect | Use the server’s HTTPS / tailnet address, not localhost. |

For the default installation, in Bash:

```sh
docker compose -f ~/openduet/deploy/docker-compose.yml ps
docker compose -f ~/openduet/deploy/docker-compose.yml logs --tail=100 openduet web
curl -fsS http://localhost:3101/api/health
```

In PowerShell:

```powershell
docker compose -f "$HOME/openduet/deploy/docker-compose.yml" ps
docker compose -f "$HOME/openduet/deploy/docker-compose.yml" logs --tail=100 openduet web
Invoke-RestMethod http://localhost:3101/api/health
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
