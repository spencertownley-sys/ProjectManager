# 02. Product Requirements Document

Product: Meridian (working name)
Version 1.0, 03 Nov 2026
Owner: Spencer Townley (Product)
Status: Approved for build planning

## 1. Overview

### 1.1 Vision

One calm, fast workspace where every team in an organization plans and tracks work in the view that fits them, without a second tool and without an administrator.

### 1.2 Problem statement

Organizations run two or three work management tools because no single product serves engineering, marketing, operations, and leadership equally well. Each tool carries setup cost, its views disagree with each other, and the products that try to do everything feel busy and slow. Teams working inside the Microsoft 365 ecosystem also face a visual mismatch: the tools look like consumer apps dropped into a corporate environment.

### 1.3 Product name

Meridian is the working name. Alternatives under consideration: Cadence, Waypoint, Northline, Keel. The final name must have an available .com domain, no trademark conflict in software (USPTO class 9 and 42), and a short, pronounceable form. A decision is required before the marketing site build (document 13).

### 1.4 Positioning

For teams of 5 to 500 who want the scheduling depth of Asana and the speed of Linear in a product that looks like it belongs next to Outlook, Teams, and Planner. Unlike all-in-one tools, Meridian ships one coherent set of views over one data model, with Gantt, Workload, and Dashboards included in the core plan.

### 1.5 Goals

| Goal | Measure | Target at 12 months post launch |
|---|---|---|
| Teams adopt without an admin | Median time from signup to first project with 10 tasks and 2 members | Under 15 minutes |
| Views feel instant | P95 interaction latency for drag, edit, and view switch on a 2,000-task project | Under 100 ms perceived (optimistic), under 400 ms confirmed |
| Organizations consolidate | Share of paid workspaces that report retiring another tool within 90 days | 30 percent |
| Retention | Workspace retention at week 8 (at least one task edited in the prior 7 days) | 60 percent of activated workspaces |
| Revenue | Monthly recurring revenue | Defined in business plan; not in this document |

### 1.6 Non-goals for v1

- Native mobile applications (the web app MUST be responsive; native apps are a later phase).
- Time tracking with billing and invoicing.
- Built-in chat or video.
- Document editor beyond rich text descriptions and comments.
- On-premises deployment.
- Multi-region data residency.

## 2. Users

### 2.1 Personas

**Priya, Program Manager (primary buyer and power user)**
Runs 6 to 10 concurrent cross-functional initiatives. Lives in Gantt and Portfolio. Needs dependencies, critical path, status reports she can paste into a leadership deck, and to see who is over-allocated next month. Currently on Asana Advanced; frustrated by cost and by engineering refusing to use it.

**Marcus, Engineering Lead**
Runs two-week sprints for a 9-person team. Lives in Board and Backlog. Needs cycle time and velocity, GitHub links on tasks, keyboard shortcuts, and nothing that slows the board down. Currently on Linear; frustrated that product and marketing cannot see his roadmap without a separate tool.

**Dana, Marketing Operations**
Manages campaign calendars and request intake from five internal clients. Lives in Calendar, Forms, and Table. Needs intake forms, approval gates, and a content calendar view. Currently on Monday; frustrated by automation side effects and board slowdowns.

**Alex, Individual Contributor**
Belongs to three projects led by other people. Lives in My Work. Needs one list of what is due, notifications that are not noise, and the ability to update status in two clicks from email or Slack.

**Jordan, Executive Sponsor**
Reads only. Opens a Portfolio dashboard once a week. Needs status, health, and risk at a glance, with the ability to click into any red item.

### 2.2 Jobs to be done

1. Plan a body of work with dates and dependencies so that the team knows what happens when.
2. See status across all work without asking anyone.
3. Know what I should do today.
4. Balance load across people so nobody is silently over capacity.
5. Capture requests from outside the team and route them.
6. Report progress upward without rebuilding slides by hand.
7. Keep engineering and everyone else in one place.

## 3. Scope

### 3.1 In scope (v1)

Workspaces, teams, projects, sections, tasks, subtasks, custom fields, dependencies, milestones, comments, attachments, activity history, nine views (List, Board, Table, Gantt, Timeline, Calendar, Workload, Dashboard, My Work), Portfolios, Goals (OKRs), saved views, search, notifications (in-app and email), forms, rule-based automations, templates, import from CSV and from Asana, Trello, and Jira exports, public REST API, outbound webhooks, Slack and Microsoft Teams notification connectors, GitHub link integration, Clerk authentication with organizations and roles.

### 3.2 Later phases (document 04)

Time tracking, proofing and approvals workflow, native mobile apps, AI assistant, additional connectors, SSO and SCIM for enterprise, audit log export, data residency.

## 4. Functional requirements

Each requirement has an identifier for traceability into user stories (document 03) and tests (document 15).

### 4.1 Workspace and organization structure

- FR-ORG-01 A workspace MUST map one-to-one to a Clerk Organization. Users MAY belong to multiple workspaces and MUST switch between them from the account menu.
- FR-ORG-02 A workspace MUST contain teams. A team MUST contain projects. A project MAY belong to exactly one team or to the workspace directly.
- FR-ORG-03 A project MUST contain sections (ordered groupings) and tasks. A task MUST belong to exactly one project and MAY be multi-homed into additional projects (appearing in each with its own section placement, sharing all other fields).
- FR-ORG-04 Tasks MUST support subtasks to unlimited depth. Views MUST be able to show subtasks nested or flattened.
- FR-ORG-05 Portfolios MUST group projects for reporting. A project MAY belong to many portfolios.
- FR-ORG-06 Goals MUST support a hierarchy (objective, key result) and MUST link to projects and tasks that contribute to them, with progress rolled up automatically or set manually.

### 4.2 Tasks

- FR-TASK-01 Every task MUST have: title, description (rich text), status, assignee (single, with option to enable multiple per workspace), start date, due date (with optional time), priority, created by, created at, updated at, completed at, and a human-readable key (for example MKT-142).
- FR-TASK-02 Tasks MUST support custom fields defined at workspace or project level. Supported types: text, long text, number, currency, percent, date, single select, multi select, person, checkbox, URL, email, phone, formula (basic arithmetic and date math), roll-up (from subtasks), and relation (to tasks in any project).
- FR-TASK-03 Tasks MUST support dependencies of four types: finish-to-start, start-to-start, finish-to-finish, start-to-finish, with optional lag in days. Circular dependencies MUST be rejected.
- FR-TASK-04 Tasks MUST support tags (workspace-level), attachments (file upload up to 100 MB each, plus links), comments with @mentions and reactions, and followers.
- FR-TASK-05 Tasks MUST support recurrence (daily, weekly, monthly, custom) that creates the next instance on completion or on a schedule.
- FR-TASK-06 Milestones are tasks with a milestone flag; they MUST render as diamonds in Gantt and Timeline and MUST NOT have a duration.
- FR-TASK-07 Estimates MUST support story points or hours per workspace configuration.
- FR-TASK-08 Every mutation to a task MUST be recorded in an activity log showing who, what, before, after, and when.
- FR-TASK-09 Tasks MUST support bulk edit of any field from List and Table views on up to 500 selected items.

### 4.3 Status workflows

- FR-WF-01 Each project MUST have a status workflow: an ordered set of statuses, each belonging to one of four categories (backlog, not started, in progress, done).
- FR-WF-02 Workspaces MUST provide workflow templates (Simple, Kanban, Scrum, Shape Up, Phase-gate) and MUST allow custom workflows.
- FR-WF-03 Status transitions MAY be restricted by role and MAY require fields to be filled (for example, a Done transition requiring a completion note).

### 4.4 Views

Detailed in document 11. Summary requirements:

- FR-VIEW-01 A project MUST offer List, Board, Table, Gantt, Timeline, Calendar, Workload, and Dashboard views. A workspace MUST offer My Work, Inbox, Portfolio, and Goals views.
- FR-VIEW-02 All views MUST share one filter, sort, and group specification. Changing it in one view MUST apply to all views of that project for that user until cleared.
- FR-VIEW-03 Users MUST be able to save a view configuration (view type plus filter, sort, group, visible fields, column widths) as a named saved view, mark it personal or shared, and set a project default.
- FR-VIEW-04 Every view MUST support quick add of a task without leaving the view.
- FR-VIEW-05 Every view MUST open a task details pane on the right (not a modal) on click, keeping the view visible.
- FR-VIEW-06 Views MUST virtualize rendering so that projects with 10,000 tasks remain usable.

### 4.5 Planning features

- FR-PLAN-01 Sprints (called Cycles in the UI, configurable name) MUST have a start, end, goal, and capacity, and MUST show burndown and velocity.
- FR-PLAN-02 Backlog view MUST allow drag ordering and drag into a cycle.
- FR-PLAN-03 Gantt MUST compute critical path and MUST support saving and comparing a baseline.
- FR-PLAN-04 Workload MUST compute allocation per person per day from estimates spread across task duration, with configurable capacity per person and per day, and MUST highlight over-allocation.
- FR-PLAN-05 Project status updates MUST be posted by an owner with a health indicator (on track, at risk, off track, on hold, complete), a summary, and auto-filled metrics (tasks completed this period, overdue, upcoming milestones).

### 4.6 Collaboration

- FR-COL-01 Comments MUST support rich text, @mentions of users and tasks, attachments, reactions, and editing with history.
- FR-COL-02 Notifications MUST be generated for assignment, mention, comment on a followed task, due date within 24 hours, dependency unblocked, status update posted, and automation failures. Users MUST control each type per channel (in-app, email, Slack or Teams).
- FR-COL-03 An Inbox MUST aggregate notifications with archive, snooze, and mark-all-read.
- FR-COL-04 Email notifications MUST support reply-to-comment.
- FR-COL-05 Realtime: changes by other users MUST appear within 2 seconds without refresh, with presence indicators on the task details pane.

### 4.7 Intake and automation

- FR-FORM-01 Forms MUST map form fields to task fields, support required fields, conditional sections, file uploads, and anonymous submission via a public link. Submissions MUST create tasks in a chosen project and section.
- FR-AUTO-01 Automations MUST follow trigger, condition, action. Triggers: task created, status changed, field changed, assignee changed, due date approaches, comment added, form submitted, schedule, inbound webhook. Conditions: any field comparison. Actions: set field, move to section or project, assign, add comment, create subtask, create task from template, send notification, send Slack or Teams message, call outbound webhook, start or stop timer on dependency.
- FR-AUTO-02 Automations MUST have a run log with success and failure and MUST stop after a configurable loop guard (default 10 chained runs per task per minute).
- FR-AUTO-03 Workspaces MUST ship with a library of starter automations.

### 4.8 Templates, import, export

- FR-TPL-01 Projects MUST be saveable as templates including sections, tasks with relative dates, custom fields, workflow, automations, and saved views.
- FR-TPL-02 A template gallery MUST ship with at least 12 templates covering the workflows in document 01, section 3.
- FR-IMP-01 Import MUST support CSV with column mapping, and exports from Asana, Trello, and Jira.
- FR-EXP-01 Export MUST support CSV and JSON per project, and PDF or PNG of Gantt and Dashboard views.

### 4.9 Search and navigation

- FR-NAV-01 A command palette (Ctrl+K or Cmd+K) MUST navigate to any project, task, person, or view and MUST run actions (create task, change status, assign).
- FR-NAV-02 Global search MUST cover task titles, descriptions, comments, and attachments names, with filters by project, assignee, and status.
- FR-NAV-03 Keyboard shortcuts MUST cover task creation, navigation between items, status change, assign to me, and view switching, with a discoverable cheat sheet.

### 4.10 Integrations and API

Detailed in document 12. Summary:

- FR-INT-01 A public REST API with API keys and OAuth 2.0 MUST cover every object the UI can create or edit.
- FR-INT-02 Outbound webhooks MUST deliver signed JSON payloads for every event type with retry and a delivery log.
- FR-INT-03 Inbound webhooks MUST create or update tasks from external systems.
- FR-INT-04 v1 connectors: Slack, Microsoft Teams, GitHub, Google Calendar, Outlook Calendar, Zapier, Make.

### 4.11 Administration

- FR-ADM-01 Workspace admins MUST manage members, roles, teams, custom field library, workflow library, tags, templates, API keys, webhooks, and billing.
- FR-ADM-02 Guests MUST be supported: external users with access to specific projects only.
- FR-ADM-03 Data export of the whole workspace MUST be available to owners.

## 5. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-PERF-01 | First contentful paint under 1.5 s and Largest Contentful Paint under 2.5 s on a mid-range laptop over a 10 Mbps connection for the project List view. |
| NFR-PERF-02 | Optimistic UI for all task mutations; server confirmation P95 under 400 ms. |
| NFR-PERF-03 | Views remain at 60 fps while scrolling 10,000 rows. |
| NFR-AVAIL-01 | 99.9 percent monthly availability for the application and API. |
| NFR-SEC-01 | Authentication exclusively through Clerk. No passwords stored by Meridian. |
| NFR-SEC-02 | All data encrypted in transit (TLS 1.2 or higher) and at rest. |
| NFR-SEC-03 | Authorization enforced server-side on every read and write; row-level security in the database as a second layer. |
| NFR-SEC-04 | Webhook payloads signed with HMAC SHA-256; API keys hashed at rest. |
| NFR-SEC-05 | OWASP ASVS Level 2 controls; dependency scanning in CI. |
| NFR-PRIV-01 | GDPR and CCPA compliant: data export, deletion within 30 days of request, data processing agreement available. |
| NFR-A11Y-01 | WCAG 2.2 AA for all screens, including keyboard operation of Board and Gantt. |
| NFR-I18N-01 | UI strings externalized; US English at launch; date, number, and first day of week respect user locale. |
| NFR-BROW-01 | Current and previous major versions of Chrome, Edge, Safari, and Firefox. |
| NFR-RESP-01 | Fully usable at 360 px width; Gantt and Workload MAY fall back to a read-only summary below 768 px. |
| NFR-OBS-01 | Structured logging, error tracking, performance tracing, and product analytics from day one. |

## 6. Templates and default views by workflow

| Template | Default view | Workflow | Included automations |
|---|---|---|---|
| Simple project | List | Simple (To do, In progress, Done) | None |
| Kanban board | Board | Kanban with WIP limits | Move to Done sets completed date |
| Scrum sprint | Board plus Backlog | Scrum | Sprint close moves incomplete to next sprint |
| Shape Up cycle | Board plus Timeline | Shape Up | Cooldown reminder |
| Product roadmap | Timeline | Phase-gate | Status update reminder every two weeks |
| Marketing campaign | Calendar | Phase-gate with approvals | Approval gate notifications |
| Content calendar | Calendar plus Table | Simple with review status | Due in 48 hours reminder to assignee |
| Event plan | Gantt | Waterfall | Milestone reached notification to owner |
| Construction or hardware build | Gantt | Waterfall with critical path | Dependency unblocked notification |
| Request intake | Table plus Form | Triage (New, Accepted, In progress, Done, Declined) | Route by request type field |
| OKR tracker | Goals | Quarterly | Monthly progress check-in reminder |
| Personal to-do | My Work | Simple | None |

## 7. Success metrics and instrumentation

Events captured (document 05, section 9): workspace created, project created, task created, view switched (with view type), saved view created, automation created, automation run, form submitted, webhook delivered, import completed, invite sent, invite accepted, status update posted.

North star metric: weekly active workspaces where at least three members each completed a task.

## 8. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Gantt and Workload are expensive to build well | Schedule | Build Gantt rendering in-house on a shared timeline engine used by Timeline and Workload; evaluate SVAR React Gantt (MIT) as an accelerator for v1 (document 05, decision 7) |
| Feature breadth tempts scope creep | Quality | Phase gates in document 04; every feature must map to a persona job |
| Clerk Organizations model may not match guest and multi-workspace needs | Design | Model guests as workspace members with project-scoped roles stored in Meridian, with Clerk holding membership only (document 08) |
| Segoe UI is not licensed for web embedding | Visual fidelity | System font stack on Windows, Selawik (MIT, metric-compatible) self-hosted elsewhere (document 09) |
| Realtime at scale | Cost | Supabase Realtime per project channel; fall back to polling for inactive tabs |

## 9. Open questions

1. Final product name and domain.
2. Which additional connectors, webhooks, and apps to include in v1 beyond the baseline in section 4.10 (see the question list at the end of document 12).
3. Pricing tiers and whether a free tier exists at launch.
4. Whether to offer single assignee only in v1 (simpler Workload math) or multi-assignee from the start.

## 10. Approval

| Role | Name | Date |
|---|---|---|
| Product owner | Spencer Townley | 03 Nov 2026 |
| Engineering lead | TBD | |
| Design lead | TBD | |
