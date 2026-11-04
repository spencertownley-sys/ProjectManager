# 01. Market and Workflow Research

Version 1.0, 03 Nov 2026. Owner: Product.

## 1. Purpose

This document records what the leading project and task management products do, which workflows real teams run, and what that implies for TaskParty. The product requirements in document 02 cite this research by section number.

## 2. The competitive landscape

The market has split into two camps. Focused tools (Linear, Jira, Basecamp) are opinionated and fast but serve one kind of team. All-in-one tools (ClickUp, Notion, Monday.com, Asana) serve everyone but carry setup cost, interface density, and per-seat pricing that climbs quickly. Many organizations run two tools at once: one for engineering and one for everyone else. That split is the opening TaskParty targets.

### 2.1 Tool by tool

| Tool | Philosophy | Views offered | Strengths | Weaknesses | Pricing (per user per month unless noted) |
|---|---|---|---|---|---|
| Asana | Structured cross-functional work management with dependencies, portfolios, and goals | List, Board, Timeline, Calendar, Workload, Dashboard, Portfolio | Best-in-class Timeline with dependency handling; Workload capacity view; Portfolios and Goals for leadership | Steep learning curve from overlapping features; expensive at scale; too loose for engineering, too heavy for small teams | Free to 15 users; Starter about $10.99; Advanced about $24.99 |
| Monday.com | Visual, spreadsheet-like boards where status is visible at a glance | Board (table), Kanban, Timeline, Gantt, Calendar, Chart, Dashboard, Workload | Color-coded status columns; no-code automation builder; multi-board dashboards | Slows on large boards; cross-board dependencies are awkward; automations interact unpredictably; weak engineering features | Free to 2 users; Basic $9; Standard $12; Pro $19; 3-seat minimum |
| ClickUp | Everything in one tool at a low price, customizable at every hierarchy level | List, Board, Timeline, Gantt, Calendar, Table, Mind Map, Whiteboard, Workload, Doc | Docs, goals, time tracking, sprints, forms, dashboards all included; strong importers | Dense interface and decision fatigue; inconsistent performance; each feature shallower than a specialist tool | Free; Unlimited $7; Business $12 |
| Linear | Fast, keyboard-first issue tracker built around triage, backlog, and cycles | List, Board, Roadmap (initiatives and projects) | Instant interactions through local-first sync; command palette; deep GitHub integration; clean API | Rigid for non-engineering work; limited reporting; no timeline, calendar, or workload views | $8; no free tier |
| Jira | Mature Agile engine, highly configurable | Scrum board, Kanban board, Backlog, Roadmap, Timeline (Premium), Dashboard | Sprint planning, velocity, scaled frameworks; Atlassian ecosystem | Complex and sluggish; needs a dedicated admin; heavy customization becomes unusable; lock-in | Free to 10 users; Standard about $7.75; Premium about $13.50 |
| Notion | Everything is a block; projects, docs, wiki, and databases in one workspace | Table, Board, Timeline, Calendar, Gallery, List | Linked databases; flexible; strong docs | Disorganized without an owner; no sprints, time tracking, or resource allocation; slows on large databases | Free personal; Plus $8; Business $15; AI add-on $10 |
| Smartsheet | Spreadsheet-native work management for operations and PMOs | Grid, Gantt, Card, Calendar, Dashboard, Report | Familiar grid; resource management; enterprise governance and forms | Dated interface; formula-driven setup; collaboration feels bolted on | Pro about $9; Business about $19 |
| Wrike | Enterprise work management with request intake and proofing | List, Board, Table, Gantt, Calendar, Workload, Dashboard, Analytics | Request forms, proofing, cross-project reporting | Expensive; heavy; long implementation | Team about $10; Business about $25 |
| Basecamp | Deliberately simple and async-first; Shape Up cycles | To-dos, Message Board, Schedule, Hill Charts | Calm, opinionated, flat pricing; Hill Charts show real progress | No dependencies, custom fields, time tracking, or workload; minimal reporting | Flat $299 per month unlimited |
| Trello | Simple Kanban, cards and columns | Board; Calendar, Timeline, Table, Dashboard on paid tiers | Zero learning curve; generous free tier | Unwieldy beyond 100 cards; shallow reporting; teams outgrow it within 12 to 18 months | Free; Standard $5; Premium $10 |

Sources: Gupta (2026) "Top 9 Project Management Tools of 2026"; ONES.com 2026 selection guides; vendor pricing pages as of Nov 2026. Prices change; treat them as directional.

### 2.2 What every serious tool now ships

The baseline for a credible product in 2026, below which teams will not evaluate a new tool:

1. Multiple views over the same data (List, Board, Timeline or Gantt, Calendar at minimum).
2. Custom fields with typed values (text, number, date, select, multi-select, person, URL, formula).
3. Dependencies with at least finish-to-start, visible in a timeline.
4. Subtasks to at least one level, ideally unlimited.
5. Saved views with filters, sorts, and grouping that persist per user and can be shared.
6. Comments with @mentions, attachments, and activity history on every item.
7. Rule-based automations (when X, if Y, do Z).
8. Forms that create items.
9. Dashboards with charts over any field.
10. Integrations with Slack, Microsoft Teams, Google Workspace, Microsoft 365, GitHub, and a public API with webhooks.
11. Keyboard shortcuts and a command palette.
12. Search across the workspace.
13. Mobile apps or a responsive web app.
14. AI assistance for drafting, summarizing, and suggesting (treated by buyers as a convenience, not a deciding factor).

### 2.3 Where buyers are frustrated

Synthesized from review sites, community threads, and the comparison articles above:

- **Setup tax.** Jira and Asana are estimated to need half to one full-time administrator at 100 users. Teams want structure without a consultant.
- **View inconsistency.** In several tools the Board, Gantt, and Table are separate features with separate settings, so a filter set in one does not carry to another.
- **Performance cliffs.** Monday boards, Notion databases, and Trello boards degrade past a few thousand items. Linear's speed is cited as a reason to switch.
- **Two-tool organizations.** Engineering on Linear or Jira, everyone else on Asana or Monday, with brittle sync between them.
- **Pricing surprises.** Seat minimums, feature gating of Gantt and Workload, and AI add-ons.
- **Visual noise.** ClickUp and Monday are described as busy; Basecamp and Linear as calm. Buyers notice.

## 3. Workflows teams actually run

TaskParty must support these without forcing one on the team. Each maps to a project template and a set of default views (document 02, section 6).

| Workflow | What it is | Who uses it | What the tool must provide |
|---|---|---|---|
| Kanban | Continuous flow through columns, limit work in progress, measure cycle time | Support, operations, marketing, small product teams | Board with WIP limits, swimlanes, cycle and lead time charts |
| Scrum | Fixed sprints (1 to 4 weeks), backlog refinement, velocity | Engineering | Backlog, sprint planning, burndown, velocity, story points |
| Scrumban | Kanban flow with periodic planning cadences | Engineering and product teams who outgrew pure Scrum | Board plus cycles without story point ceremony |
| Shape Up | 6-week cycles, 2-week cooldowns, pitches, hill charts | Product-led software teams | Cycle containers, pitch documents, hill chart progress |
| Waterfall and critical path | Sequential phases with dependencies and a baseline | Construction, events, hardware, compliance, launches | Gantt with dependencies, critical path, baselines, milestones |
| Phase-gate | Work passes through approval gates | Regulated industries, agencies, marketing campaigns | Status-based approvals, gate checklists, audit history |
| OKR cadence | Objectives and measurable key results reviewed quarterly | Leadership, cross-functional | Goals linked to projects and tasks, progress roll-up |
| Request intake | Work arrives through forms and is triaged | Creative, IT, PMOs | Forms, triage queue, routing automations, SLA fields |
| Personal GTD | Capture, clarify, organize, review | Individuals inside any team | My Work view, inbox, due dates, recurring tasks |

Design implication: workflows are a configuration layer over one data model, not separate products. A task is a task whether it sits in a sprint, a Gantt bar, or a Kanban column.

## 4. View types and what each must do

| View | Primary question it answers | Must have | Reference implementations |
|---|---|---|---|
| List | What are the tasks and in what order | Inline editing, grouping, collapsible sections, quick add | Asana List, Linear List |
| Board (cards) | What is the status of each item | Drag between columns, swimlanes, WIP limits, card field display options | Monday Kanban, Trello, Linear Board |
| Table | How do items compare across fields | Spreadsheet feel, column resize and reorder, column types, roll-ups, bulk edit | Monday Board, Smartsheet Grid, Notion Table |
| Gantt | When does each item happen and what depends on what | Bars, dependencies, critical path, baselines, milestones, zoom day to quarter, drag to reschedule | Smartsheet, ClickUp Gantt, MS Project |
| Timeline | What is the plan at a glance | Lighter than Gantt: bars by assignee or section, milestones, no critical path | Asana Timeline, Notion Timeline |
| Calendar | What is due on which day | Month, week, day; drag to change date; multi-day items | Asana Calendar, Google Calendar conventions |
| Workload | Who has capacity | Per-person rows, hours or points per day or week, over-allocation highlighting | Asana Workload, Monday Workload |
| Dashboard | How is the project or portfolio doing | Widgets: number, bar, line, pie, table, burndown, cycle time | Monday Dashboards, ClickUp Dashboards |
| Portfolio | How are all projects doing | Projects as rows with status, health, dates, owner, progress | Asana Portfolios |
| My Work | What should I do today | Cross-project tasks assigned to me, grouped by due date | Asana My Tasks, Linear My Issues |

Every view reads the same filter, sort, and group settings. Switching views keeps the user's context.

## 5. Design language research

Buyers in the Microsoft 365 ecosystem evaluate software against Outlook, Teams, Planner, Project, and SharePoint. They expect:

- Segoe UI at 14px body, 12px caption, semibold headings (Fluent 2 type ramp).
- A quiet neutral palette, one brand accent, semantic status colors.
- Left navigation rail, command bar above content, details pane on the right.
- 4px spacing grid, 4px and 8px corner radii, subtle 1px borders over heavy shadows.
- Dense but readable tables; row height 36px to 44px.
- Icons from a single consistent set (Fluent UI System Icons, MIT licensed).

Document 09 defines the TaskParty design system on this basis.

## 6. Technical patterns worth copying

- **Local-first sync (Linear).** Interactions feel instant because the client holds a cache and reconciles in the background. TaskParty uses optimistic updates and realtime subscriptions to approximate this without a full sync engine in v1.
- **One query engine for all views (Notion, Airtable).** Views are presentation over a shared filter and sort specification.
- **Typed custom fields with per-project definitions and workspace-level field libraries (Asana, Monday).**
- **Event-sourced activity log (Linear, Jira).** Every mutation emits an event that drives history, notifications, automations, and webhooks from one place.
- **Automations as triggers, conditions, actions (Monday, Asana, ClickUp).**

## 7. Implications for TaskParty

1. Compete on calm, speed, and view consistency, not feature count.
2. Serve engineering and non-engineering work in one workspace so organizations can retire their second tool.
3. Ship Gantt, Workload, and Dashboards in the core plan instead of gating them.
4. Look native next to Microsoft 365 so adoption inside corporate environments meets less resistance.
5. Make automations, forms, webhooks, and a public API first-class from the MVP so connectors can be added without re-architecture.

## 8. Sources

- Gupta, D. "Top 9 Project Management Tools of 2026: Linear vs Notion vs Jira vs the Rest." https://guptadeepak.com/tools/top-10-project-management-tools-2026/
- ONES.com. "Project Management Tools Comparison: A 2026 Selection Guide." https://ones.com/blog/tool-guide/project-management-tools-comparison-a/
- Microsoft. "Fluent 2 Design System: Typography." https://fluent2.microsoft.design/typography
- SVAR. "Top 5 React Gantt Chart Libraries To Use in 2026." https://svar.dev/blog/top-react-gantt-charts/
- Clerk. "Next.js Quickstart (App Router)." https://clerk.com/docs/nextjs
- Supabase. "Third-Party Auth: Clerk." https://supabase.com/docs/guides/auth/third-party/clerk
- Marmelab. "Shape Up: Should You Change Your Agile Methodology?" https://marmelab.com/blog/2024/09/26/shape-up
- Vendor pricing pages for Asana, Monday.com, ClickUp, Linear, Jira, Notion, Smartsheet, Wrike, Basecamp, Trello (Nov 2026).
