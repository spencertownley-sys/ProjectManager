# 12. Integrations and Webhooks

Version 1.0, 03 Nov 2026. Owner: Engineering and Product.

## 1. Integration model

Four integration layers, built in this order so each reuses the one below it:

1. **Event stream.** Every change emits a typed event (document 06, section 3). Everything below consumes it.
2. **Outbound webhooks.** Signed HTTP delivery of events to any URL, with retries and a log. Zapier, Make, n8n, and custom scripts attach here.
3. **Inbound webhooks and the REST API.** External systems create and update Meridian objects.
4. **Connectors.** First-party apps that hold OAuth credentials for a provider and use layers 2 and 3 in both directions with provider-specific UI (Slack unfurls, GitHub PR links).

## 2. Outbound webhooks

### 2.1 Registration

Admins register a webhook at workspace or project scope with a URL, a list of event types, and an auto-generated secret. Up to 50 webhooks per workspace.

### 2.2 Event types

```
task.created          task.updated           task.status_changed
task.assigned         task.dates_changed     task.completed
task.reopened         task.moved             task.deleted
task.restored         comment.created        comment.edited
attachment.added      dependency.added       dependency.removed
subtask.added         tag.added              tag.removed
field.changed         project.created        project.updated
project.archived      section.created        section.updated
cycle.started         cycle.closed           status_update.posted
form.submitted        member.added           member.removed
automation.failed
```

### 2.3 Payload

```json
{
  "id": "evt_01J9...",
  "type": "task.status_changed",
  "created_at": "2026-11-03T07:12:44Z",
  "workspace_id": "01J9...",
  "project_id": "01J9...",
  "actor": { "type": "user", "id": "01J9...", "display_name": "Marcus Lee" },
  "data": {
    "task": { "...": "full task object as in document 07, section 4" },
    "changes": { "status": { "before": { "id": "...", "name": "In progress" }, "after": { "id": "...", "name": "Done" } } }
  }
}
```

Headers: `X-Meridian-Event`, `X-Meridian-Delivery` (delivery id), `X-Meridian-Timestamp`, `X-Meridian-Signature: v1=<hex HMAC SHA-256 of "<timestamp>.<raw body>" with the secret>`. Receivers must reject timestamps older than 5 minutes to prevent replay.

### 2.4 Delivery

Inngest function `webhooks/deliver`: POST with a 10-second timeout; success is any 2xx. Retries at 1 min, 5 min, 30 min, 2 h, 8 h, 24 h (6 attempts). After 20 consecutive failed deliveries the webhook is disabled and the admin notified. The deliveries log keeps 30 days with request, response code, and body excerpt; any delivery can be replayed.

Batching: events for the same webhook within 500 ms are delivered as separate requests in order; no batching in v1.

## 3. Inbound webhooks

A project owner creates an inbound webhook and receives a URL `https://app.<domain>/api/webhooks/inbound/<token>` plus an optional shared secret (sent as `X-Meridian-Secret`). The mapping editor maps JSON paths in the incoming body to task fields (`$.issue.title -> title`, `$.issue.body -> description`, `$.priority -> custom:fld_priority`) with an optional match key (`$.issue.id -> custom:fld_external_id`) so repeated calls update rather than duplicate. Rate limit 120 requests per minute per token. Payload limit 1 MB.

## 4. REST API

Document 07. API keys per workspace; OAuth 2.0 with PKCE for marketplace apps in phase 3 with scopes `tasks:read`, `tasks:write`, `projects:read`, `projects:write`, `webhooks:manage`, `members:read`.

## 5. Automations (internal integration layer)

Automations run on Inngest from the event stream:

- Trigger matches event type and scope.
- Conditions evaluate against the task object with the same filter engine as views.
- Actions execute in order; each action is an Inngest step with its own retry.
- Loop guard: an automation will not run more than 10 times on the same task within one minute, and an action that would trigger the same automation is skipped with a logged `skipped` run.
- Actions that call external systems (Slack message, webhook call) use the connector or webhook layer, so delivery logs are unified.

## 6. Connectors

### 6.1 Phase 2 connectors (decided 03 Nov 2026)

Order of build inside phase 2 follows this table. Microsoft Teams leads because the product positioning is inside the Microsoft 365 ecosystem.

| Order | Connector | Direction | Capabilities |
|---|---|---|---|
| 1 | Microsoft Teams | Both | Teams app with a bot and message extension; notifications to chats and channels per project; adaptive cards for status updates and assignments; "Create task from message"; comment replies from Teams threads; tab app that embeds a project view inside a channel |
| 2 | GitHub | Both | Link PRs and issues by key in branch name, PR title, or body (`MKT-142`); PR status chip on the task; automation action "when PR merged, set status"; create a branch name from a task |
| 3 | Planner and Project import | Inbound | Import Planner plans (buckets to sections, labels to tags, checklist to subtasks) through Microsoft Graph; import Project .mpp and .xml with tasks, dependencies, and baselines; export a Gantt project to .mpp and .xml |
| 4 | Excel and Power BI export | Outbound | Live OData feed per workspace and per saved view for Excel "Get Data" and Power BI; scheduled .xlsx export to OneDrive or SharePoint |
| 5 | MCP server (agent access) | Both | Hosted MCP server exposing tools to list and search tasks, create and update tasks, post comments, read project status, and run saved views, with OAuth scopes and per-workspace enablement; works with Microsoft Copilot, Claude, and other MCP clients |
| 6 | Slack | Both | Notifications to DM or channel per project; link unfurls; `/meridian` slash command; "Create task from message"; deeper features (threads, home tab) after Teams reaches parity |
| 7 | Zapier and Make | Both | Official apps using webhooks for triggers and the REST API for actions |
| 8 | Google Calendar and Outlook Calendar | Outbound | ICS feed per user; two-way sync remains a phase 3 candidate |

### 6.2 Candidate connectors for later phases

Grouped so the product owner can pick (see the questions in section 9):

Communication: Discord, Gmail (create task from email), Outlook mail (create task from email), Loom.
Code and delivery: GitLab, Bitbucket, Azure DevOps, Linear (import and two-way for engineering teams who keep Linear), Jira (two-way sync), Sentry (create task from issue), PagerDuty.
Documents and files: Google Drive, OneDrive, SharePoint, Dropbox, Box, Figma (file previews and comment sync), Notion (page links), Confluence.
Microsoft 365: Planner (import), Project (import and export MPP), Excel (live export), Power BI (dataset), Power Automate (connector), Copilot (plugin).
Time and finance: Harvest, Toggl, Clockify, QuickBooks (phase 3 time tracking export), Stripe (billing only).
CRM and support: HubSpot, Salesforce, Zendesk, Intercom (create task from ticket).
Design and marketing: Canva, Adobe Express, Mailchimp.
AI: Anthropic Claude (assistant features), OpenAI, custom MCP server so agents can read and write Meridian.

## 7. App marketplace (phase 3)

Third parties register an app with OAuth client credentials, scopes, a webhook endpoint, and optional UI extension points: task pane section, command bar button, dashboard widget, automation action. UI extensions are iframes with a postMessage bridge and a size budget. Apps are reviewed before listing. Workspace admins install apps and grant scopes.

## 8. Email integration

- Outbound: Resend with per-workspace sending domain option (DKIM, SPF guidance in settings).
- Inbound (phase 2): reply-to-comment via a unique reply address per notification (`reply+<token>@mail.<domain>`) parsed by Resend inbound webhooks; create task by email to a project address (`<projectKey>@mail.<domain>`) with sender verification.

## 9. Questions for the product owner

Answers are recorded in document 02, section 9.

### 9.1 Answered (03 Nov 2026)

1. **Chat first:** Microsoft Teams first with the deep feature set; Slack follows.
2. **Microsoft 365 depth:** Planner and Project import, Excel and Power BI export, and an MCP server for Copilot and other agents all move into phase 2.
3. **Engineering source control:** GitHub only in v1.
4. **Two-way sync with incumbents:** Not in v1; Jira and Linear sync stay as later candidates.
11. **AI:** Confirmed. A Claude-powered assistant (summaries, drafting, natural-language filters) with a per-workspace off switch, plus the MCP server above.

### 9.2 Still open

5. **Calendar:** One-way ICS feed first (cheap), or two-way Google and Outlook sync in phase 2?
6. **Email capture:** Create tasks from forwarded Gmail or Outlook mail in v1?
7. **File storage:** Which drives should attachments link to natively: OneDrive and SharePoint (fits the Microsoft positioning), Google Drive, Dropbox, Box?
8. **Design tools:** Figma and Canva previews on tasks for the creative and marketing personas?
9. **Support and CRM:** Zendesk, Intercom, HubSpot, Salesforce task creation for request intake?
10. **Time tracking:** Build native timers in phase 3, or integrate Harvest, Toggl, or Clockify instead?
12. **Automation platforms:** Zapier and Make are planned; add n8n and Power Automate?
13. **Monitoring and incidents:** Sentry and PagerDuty task creation for engineering teams?
14. **Webhooks:** Any specific systems that must receive webhooks on day one (an internal data warehouse, a BI tool)?
15. **Marketplace:** Is a third-party app marketplace a phase 3 goal or later?
