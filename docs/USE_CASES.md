# Ten workflows to make your own

Start with a real model, then add only the connections a workflow needs.
These are editable recipes, not claims that every model completes every task.
For initial use, choose **Settings → Approvals → Ask me for everything**.
Inspect the proposed destination and action before allowing a change.

The [walkthroughs](SHOWCASE.md) use scripted sample data. Live outcomes depend
on model quality, account permissions, tool availability and your instructions.

| Start with | Needs | Deliverable |
| --- | --- | --- |
| Client update from notes | Model | Draft update |
| Daily brief | Mail + calendar + routine | Priorities and source links |
| Client follow-up | Mail | Reviewable draft and send receipt |
| Supplier comparison | Web tools; browser if required | Comparison with gaps and citations |
| Weekly CSV report | Uploaded files + computer tools | Report and calculations |
| Meeting preparation | Notes/agenda; calendar optional for fresh details | Agenda and decisions to make |
| Change watch | Web tools + routine | Dated changes with sources |
| Project checklist | Plans + tasks | Milestones and next actions |
| Reusable writing context | Memory | Inspectable preferences |
| Internal tool workflow | Your MCP server | Domain-specific result and action trail |

## 1. Turn scattered notes into a client update

**Setup:** a real model. No external connection required.

```text
Turn these notes into a client update: copy approved; mobile screenshots due
Friday; launch Monday. Use three sections: done, next, risks. Ask me about
ambiguous dates. Keep it under 180 words. Do not send it.
```

**Done when:** facts match the notes, ownership and dates are clear, and the
update is ready to copy or review. Add your own notes rather than inventing
progress. This is a good first task after installation.

## 2. Begin the day with a useful brief

**Setup:** connected mail and calendar, confirmed time zone, an enabled routine.

```text
Each weekday at 08:00, brief me on today's meetings, urgent unanswered mail
and my three most useful next actions. Link the original items. Explain
why something is urgent. Keep the brief under 300 words. Do not send messages
or change meetings. Ask if the priority is unclear.
```

Use the dedicated daily brief option to keep one personal schedule; inspect it in **Work → Recurring**. Test it
once and compare it with the source inbox and calendar.

**Done when:** the brief arrives in the intended time zone, links resolve, and
urgent items are justified. Missing access should be reported, not guessed.

## 3. Follow up without losing control of your voice

**Setup:** a readable mailbox with send capability, a verifiable thread and
approvals configured. [Watch the sample walkthrough](SHOWCASE.md#client-follow-up).

```text
Read the Northstar proposal thread. Draft a short follow-up asking whether
the revised scope works and what the next step should be. Use the thread's
recipient and facts. Do not promise a discount or a deadline. Let me review
the complete draft before sending it.
```

**Done when:** the recipient, subject and body are correct, the draft says
what you intend, and an authorised send has a receipt. An unresolved or
unknown send outcome needs investigation before retrying.

For the complete teach-and-delegate flow: reply to the result with a correction,
choose **Remember this preference** or **Save these steps**, then independently
confirm **Work → Recurring → Watch a customer thread**. Select a native Gmail or
Microsoft mailbox, inspect the source thread and confirm customer, deadline and
time zone. If no reply arrives, one preparation waits for review. A confirmed
send receipt completes this one-shot watch. Pausing or disconnecting blocks new
checks; a fresh reply makes an old preparation obsolete. IMAP and generic MCP
mailboxes are not currently offered for this dedicated watch.

## 4. Research a supplier decision

**Setup:** web tools; enable the browser worker if the pages require it.

```text
Compare these suppliers: [URLs]. Build a table of capabilities, published
minimum orders, delivery regions and documented lead times. Cite each
material claim. Separate facts from assumptions and list missing information.
Recommend a next step. Do not contact suppliers or place an order.
```

**Done when:** each decisive claim has a source, dates and missing prices are
explicit, and the recommendation follows from the evidence. Treat marketing
claims as claims; request quotes before making a buying decision.

## 5. Turn CSVs into a weekly operating report

**Setup:** relevant uploaded CSVs and a configured sandbox/computer with tools
for analysis. Check the file schema and date range first.

```text
Use these sales and support CSVs to produce a weekly report. Validate the
columns, date ranges, duplicates and missing values before calculating.
Show revenue, order count and support volume with formulas and a short
explanation of changes. Save the report and reproducible analysis files.
Flag uncertainty; do not fill missing data with invented values.
```

**Done when:** totals reconcile with the source files, calculations are
inspectable, and the report distinguishes observations from explanations.
File formats depend on the tools installed in the computer environment.

## 6. Prepare for a meeting from the actual context

**Setup:** calendar and the relevant mail/documents, with the correct access.

```text
Prepare me for tomorrow's [meeting]. Read the invite and these documents.
Summarise the goal, unresolved decisions, risks and questions I should ask.
Link the source for each important point. Give me a five-minute reading brief
and a proposed agenda. Do not change the invitation or contact attendees.
```

**Done when:** the right meeting and time zone are used, stale documents are
identified, and decisions are separated from background information.

## 7. Watch for changes worth knowing

**Setup:** a routine, accessible source pages and a place to retain the prior
snapshot. Verify the first run establishes a baseline.

```text
Every Friday at 09:00, check these product documentation pages: [URLs].
Compare with the last successful run. Report meaningful pricing, API or
deprecation changes with dated source links. Label the first run as a baseline.
If a page fails, say so; do not treat the failure as a product change.
Do not change our configuration or contact anyone.
```

**Done when:** a baseline exists, subsequent reports identify concrete changes,
and source failures are visible. Review results after a missed run or a model
change. Do not assume silence proves nothing changed.

## 8. Make a project’s next action obvious

**Setup:** Plans and tasks; connected tools only if the project requires them.

```text
Help me launch the studio website. Create a plan for copy, screenshots,
accessibility review and publication. Ask about the launch date and owners.
Keep agent work separate from decisions I must make. Start with a checklist;
do not publish anything without my approval.
```

**Done when:** the plan has concrete milestones, owners and a next action.
Check completion evidence rather than marking an agent task done because a
plausible plan exists.

## 9. Keep writing preferences editable

**Setup:** Memory. Start with preferences you actually want reused.

```text
Remember my client-update style: start with the next action, use short
paragraphs, and make dates explicit. Avoid promising deadlines I have not
confirmed. Tell me what you saved so I can check it.
```

Open **Memory**, inspect the saved value and correct or forget it as needed.

**Done when:** the preference is visible and accurate, and a later draft
reflects it. Memory is context, not a guarantee against mistakes. Do not use
ordinary memory as a store for API credentials.

## 10. Put your internal tools to work

**Setup:** an operator-configured MCP connection with correctly declared
effects and narrowly scoped credentials. See [CONNECTORS.md](CONNECTORS.md)
and the [capability matrix](CAPABILITIES.md).

```text
Use our connected support tool to find unresolved tickets assigned to me.
Group them by customer impact and age. Link each ticket, identify missing
information and draft the next response. Do not post replies, change status
or edit assignments until I review the exact proposed changes.
```

**Done when:** results correspond to the actual tool data, access boundaries
hold, and approved changes have receipts. MCP compatibility depends on the
server’s protocol, authentication and tool declarations; test your connection.

## Adapt a workflow

Specify the input, desired artifact, deadline/time zone, source of truth and
actions that need you. Try a small example, inspect the trail, then schedule
it. A useful prompt says what completion looks like and what should happen
when an account, source or required fact is missing.

Voice needs ElevenLabs configuration. Phone/SMS, Companies and shared rooms
are off in the default installation. Native mobile apps, wallet integrations
and equivalent task quality to Claude Duet are not part of this release.
