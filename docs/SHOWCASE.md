# See OpenDuet at work

These walkthroughs show the real React application with scripted API responses,
sample accounts and no external actions. They explain the product interaction;
they are not recordings of a live model completing a real customer task.
Production execution and isolation checks are recorded separately in
[RELEASE_READINESS.md](RELEASE_READINESS.md).

All videos are silent and use visible captions. The descriptions below provide
a text alternative. Download the MP4 if your browser does not play the link.

## Overview

[![Play the OpenDuet overview](media/overview-poster.png)](https://github.com/ychampion/openduet/releases/download/v0.2.1/openduet-overview.mp4)

**[Play / download the overview, 29 seconds](https://github.com/ychampion/openduet/releases/download/v0.2.1/openduet-overview.mp4)**

| Time | What appears | Why it matters |
| --- | --- | --- |
| 0–7 s | Home with tasks, priorities and work in progress | One place to start work and return to decisions. |
| 7–14 s | A client follow-up draft | Inspect the full message before authorising a send. |
| 14–21 s | A morning brief and recurring research | Give repeatable work a schedule and inspect its runs. |
| 21–29 s | Model settings | Configure the model for your own installation. |

## Client follow-up

[![Play the client follow-up walkthrough](media/review-draft.png)](https://github.com/ychampion/openduet/releases/download/v0.2.1/openduet-follow-up.mp4)

**[Play / download the follow-up walkthrough, 20 seconds](https://github.com/ychampion/openduet/releases/download/v0.2.1/openduet-follow-up.mp4)**

The owner asks OpenDuet to read the Northstar proposal thread and draft a
short follow-up. The scripted response reads the sample thread and prepares
a draft to `sam@example.com`. The owner presses **Review and send**, inspects
the recipient, subject and body, then selects **Allow once**. The app displays
the sample send receipt. The fixture delivers no mail.

To use this workflow yourself, connect a real model and mailbox, configure
approvals, and follow [the client follow-up recipe](USE_CASES.md#3-follow-up-without-losing-control-of-your-voice).

## Recurring brief

[![Play the routines walkthrough](media/routines.png)](https://github.com/ychampion/openduet/releases/download/v0.2.1/openduet-routines.mp4)

**[Play / download the routines walkthrough, 13 seconds](https://github.com/ychampion/openduet/releases/download/v0.2.1/openduet-routines.mp4)**

The owner opens **Automations**, sees the morning brief and Friday research
schedules, and selects **Test run**. A sample brief appears in the run history.
The owner opens **New routine** to inspect its instruction and schedule fields.
The recording does not demonstrate a real wall-clock wake or live data fetch;
the release checks cover background execution separately.

Use [the daily brief recipe](USE_CASES.md#2-begin-the-day-with-a-useful-brief)
and test it against your own connected sources before relying on it.

## More of the application

| Inspect memory | Connect your tools |
| --- | --- |
| ![Memory settings](media/memory-1440-light.png) | ![Connection settings](media/connections-1440-light.png) |

| Plan the next step | Select your model |
| --- | --- |
| ![Plans and milestones](media/plans-1440-light.png) | ![Model settings](media/models-1440-light.png) |

| Dark appearance | Phone layout |
| --- | --- |
| ![Home in dark appearance](media/home-1440-dark.png) | <img src="media/home-390-light.png" alt="Phone home layout" width="260" /> |

Phone access uses the responsive web app / PWA. Screens show configured sample
features; an actual installation requires its own model, accounts and workers.
See [asset provenance and reproduction](media/README.md).
