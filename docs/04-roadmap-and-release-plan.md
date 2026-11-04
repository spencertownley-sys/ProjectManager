# 04. Roadmap and Release Plan

Version 1.0, 03 Nov 2026. Owner: Product.

## 1. Principles

- Ship a usable product at the end of every phase. Nothing is "finished later."
- Each phase has an exit gate (section 4). The gate is a checklist, not a date.
- Build the shared engines first (query engine, timeline engine, event log) so each view and feature after them is thin.
- Durations below assume one full-time builder working with Claude Code plus part-time design review. Calendar estimates are planning aids, not commitments.

## 2. Phases

### Phase 0: Foundation (2 to 3 weeks)

Scope:
- Repository scaffold, CI, environments (document 14).
- Clerk authentication, organizations, membership sync (document 08).
- Database schema and migrations (document 06).
- Design system tokens, base components, application shell: navigation rail, top bar, command bar, details pane (documents 09 and 10).
- Event log and activity history plumbing.
- Query engine: filter, sort, group specification and server execution.

Exit gate: a signed-in user can create a workspace, a project, and tasks in a plain List, and every change appears in the activity log and in a second browser tab within 2 seconds.

### Phase 1: MVP (6 to 8 weeks)

Scope: every story marked M in document 03.
- Views: List, Board, Table, Gantt, Timeline, Calendar, My Work, Inbox.
- Task pane with all standard fields, subtasks, dependencies, milestones, comments, attachments, activity.
- Custom fields (all types except formula, roll-up, relation).
- Status workflows and templates (Simple, Kanban, Scrum, Shape Up, Phase-gate).
- Cycles with backlog planning.
- Project status updates.
- Saved views, command palette, search, shortcuts.
- CSV import, template gallery (12 templates).
- Notifications in-app and email.
- API keys, REST API read and write for core objects, outbound webhooks.
- Responsive layout.

Exit gate: an internal team of at least 5 people runs a real project in Meridian for two weeks without reverting to another tool; P95 latencies meet NFR-PERF-02; WCAG 2.2 AA audit passes on List, Board, task pane, and settings.

### Phase 2: Team scale (5 to 6 weeks)

Scope: stories marked S.
- Workload and Dashboard views.
- Automations with run log and starter library.
- Forms with public links.
- Portfolios and Goals.
- Baselines in Gantt, auto-scheduling.
- Burndown and velocity.
- Slack and Microsoft Teams connectors, GitHub integration, inbound webhooks.
- Asana, Trello, Jira importers; exports.
- Guests, workspace-level field library, billing (Stripe).
- Reply-by-email.

Exit gate: 10 external pilot workspaces active for 30 days; automation failure rate under 1 percent of runs; at least 3 workspaces using a connector weekly.

### Phase 3: Depth (5 to 6 weeks)

Scope: stories marked C plus platform maturity.
- Formula, roll-up, and relation fields.
- Calendar sync (Google, Outlook).
- Time tracking (basic timers and reports).
- Approvals and proofing on attachments.
- AI assistant: draft task descriptions, summarize threads, suggest due dates and assignees, natural-language filter.
- Public API v1 freeze with OpenAPI document and SDKs (TypeScript, Python).
- App marketplace framework (document 12, section 7).

Exit gate: API v1 published; marketplace accepts a first third-party app; AI features have an opt-out per workspace.

### Phase 4: Enterprise (ongoing)

- SSO via SAML and OIDC, SCIM provisioning (through Clerk Enterprise Connections).
- Audit log export, data retention policies, legal hold.
- Advanced permissions (field-level, section-level).
- Data residency options.
- Native mobile apps.
- Custom branding, white-label marketing site themes.

## 3. Release cadence after launch

- Production deploys on every merge to `main` behind feature flags.
- Features announced in a monthly changelog on the marketing site.
- Breaking API changes only in a new API version with 12 months of overlap.

## 4. Gate checklist template

Every phase exit requires:

1. All stories in scope marked done with acceptance tests passing in CI.
2. No open severity 1 or 2 defects.
3. Performance budgets in document 15 met on the reference dataset.
4. Accessibility audit on the screens touched.
5. Documentation updated: this doc set, in-app help, API reference.
6. Rollback plan recorded in the release notes.

## 5. Dependencies and sequencing

```
Phase 0: Shell + Auth + Schema + Query engine + Event log
   |
Phase 1: List -> Table -> Board -> Task pane -> Timeline engine -> Gantt -> Timeline -> Calendar -> My Work -> Cycles -> API + Webhooks
   |
Phase 2: Workload (reuses timeline engine) -> Dashboard -> Automations (reuses event log) -> Forms -> Connectors (reuse webhooks)
   |
Phase 3: Advanced fields -> AI -> Marketplace
   |
Phase 4: Enterprise
```

The order inside Phase 1 is deliberate: List proves the query engine; Table proves inline editing and column infrastructure that Board and the task pane reuse; the timeline engine is built once for Gantt and then reused by Timeline, Calendar's week view, and later Workload.
