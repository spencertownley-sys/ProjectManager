# 06. Data Model

Version 1.0, 03 Nov 2026. Owner: Engineering.

The executable schema is `supabase/migrations/0001_initial_schema.sql`. This document explains it. When the two disagree, the SQL wins and this document must be corrected.

## 1. Entity overview

```
Clerk User ---mirror---> users
Clerk Org  ---mirror---> workspaces
                            |
            +---------------+----------------+-------------------+
            |               |                |                   |
        teams          projects          portfolios           goals
            |               |                                    |
       team_members    +----+-------+---------+             goal_links
                       |    |       |         |
                  sections cycles saved_views forms, automations, webhooks
                       |
                     tasks <----- task_projects (multi-home)
                       |
      +----------+-----+------+-----------+------------+
      |          |            |           |            |
  subtasks   comments    attachments  dependencies  field_values
  (parent_id)    |                                      |
            reactions                          field_definitions
                       |
                  task_events  ---> notifications, automation_runs, webhook_deliveries
```

## 2. Core entities

### users
Mirror of Clerk users, populated by the `user.created` and `user.updated` Clerk webhooks. `clerk_user_id` is the join key for RLS. Meridian never stores credentials.

### workspaces
One per Clerk Organization. `slug` appears in URLs (`/w/acme`). Workspace-level configuration lives here: estimate unit (points or hours), whether tasks may have multiple assignees, the label used for cycles (Cycle, Sprint, Iteration), first day of week, plan.

### workspace_members
Membership mirror with the Meridian role (owner, admin, member, guest) and weekly capacity hours for Workload. Clerk roles map to these on sync (document 08, section 3).

### teams and team_members
Optional grouping inside a workspace. Projects with `privacy = team` are visible to team members.

### workflows and statuses
A workflow is an ordered list of statuses. Each status has a category (backlog, not started, in progress, done) so that views, burndowns, and "percent complete" calculations work regardless of custom names. `wip_limit` supports Kanban columns. Workflows marked `is_template` appear in the library.

### projects
The container for sections, tasks, cycles, views, forms, and automations. `key` is the short prefix used in task keys (MKT-142). `next_task_number` is incremented by a trigger so keys are stable and sequential per project. `auto_schedule` turns on dependency-driven rescheduling. `default_view_id` points to a saved view.

### project_members
Explicit project access with a project role (owner, editor, commenter, viewer). Required for private projects and for guests; optional for workspace and team projects where membership is implied.

### sections
Ordered groups inside a project. `position` is a float so that reorders write one row.

### cycles
Sprints, iterations, or Shape Up cycles. Capacity is in the workspace's estimate unit. Burndown and velocity are computed from `task_events` filtered by cycle.

### tasks
The central table. Notes on specific columns:

- `project_id` is the home project. Additional projects come from `task_projects`.
- `parent_id` gives unlimited subtask depth. Queries use a recursive CTE with a depth limit of 20 for rendering.
- `number` plus the project key form the human key.
- `description` is Tiptap JSON; `description_text` is the plain-text projection used by `search_vector`.
- `assignee_id` is the single assignee. If the workspace allows multiple, `task_assignees` holds the set and `assignee_id` holds the first for sorting.
- `start_date`, `due_date`, `due_time`: dates are calendar dates in the project's timezone; `due_time` is optional.
- `estimate` in the workspace unit.
- `is_milestone` forces a zero-duration bar.
- `recurrence` is an RRULE-like JSON object; the next instance is created by an Inngest function on completion or on schedule.
- `position` orders within a section.
- `version` increments on every update and is used for optimistic concurrency and realtime merge.
- `completed_at` is set when status moves to a done category and cleared when it leaves.
- `search_vector` is a generated column with a GIN index.

### task_dependencies
Four types (fs, ss, ff, sf) with lag in days. A trigger rejects cycles with a recursive CTE.

### comments, comment_reactions, attachments
Comments are threaded one level (`parent_id`). Attachments belong to a task or a comment and are either stored files (`storage_path`) or links (`url`).

### field_definitions, project_fields, task_field_values
A field definition belongs to the workspace library (`project_id` null) or to one project. Projects adopt library fields through `project_fields`. Values are stored in a typed EAV row: one of `value_text`, `value_number`, `value_date`, `value_bool`, `value_json` is populated according to the field type. The query engine joins only the fields a view references and uses the typed column for sorting and filtering so indexes apply. Formula and roll-up fields are computed at read time in v1 (phase 3 may materialize them).

`config` examples:

```json
{ "options": [{ "id": "opt_1", "name": "Design", "color": "#8764B8" }] }
{ "currency": "USD", "precision": 2 }
{ "formula": "{Estimate} * 1.2" }
{ "rollup": { "source": "subtasks", "field": "estimate", "fn": "sum" } }
{ "relation": { "projectId": "...", "multiple": true } }
```

### saved_views
A view type plus a `spec` (ViewSpec, document 05 section 6). Personal views have `is_shared = false`. Workspace-level views (My Work, Inbox filters) have `project_id` null.

### portfolios, goals, goal_links, status_updates, baselines
Portfolios group projects. Goals form a two-level hierarchy and link to projects or tasks; progress is computed from linked done percentages when `progress_mode = auto`. Status updates snapshot metrics at posting time. Baselines snapshot task dates for Gantt comparison.

## 3. Event and notification entities

### task_events
Append-only. Written in the same transaction as the task change. `type` values: `task.created`, `task.updated`, `task.status_changed`, `task.assigned`, `task.dates_changed`, `task.completed`, `task.reopened`, `task.moved`, `task.deleted`, `task.restored`, `comment.created`, `comment.edited`, `attachment.added`, `dependency.added`, `dependency.removed`, `subtask.added`, `tag.added`, `tag.removed`, `field.changed`. `before` and `after` hold the changed value only. `actor_id` null with `automation_id` set means an automation made the change.

Project and workspace level events (`project.created`, `member.added`, `status_update.posted`) live in `task_events` with `task_id` null in a later migration; v1 keeps them in application logs and Inngest events only.

### notifications and notification_preferences
Notifications are materialized per recipient. Preferences are per type and channel; absence of a row means the default (in-app on, email on for assignment and mention, chat off).

## 4. Intake and automation entities

`forms` hold a JSON schema of fields and a mapping to task fields; `public_token` enables anonymous submission. `automations` store trigger, conditions, and actions as JSON validated by Zod schemas in `/lib/validation/automation.ts`. `automation_runs` is the run log with a loop guard enforced by Inngest (document 12, section 5).

## 5. Integration entities

`api_keys` store a SHA-256 hash; the plain key is shown once. `webhooks` and `webhook_deliveries` implement outbound delivery with retry (document 12, section 3). `inbound_webhooks` map external JSON to task fields. `connections` store provider credentials (encrypted with a key in Vercel env, AES-256-GCM) for Slack, Teams, GitHub, calendars, and Zapier. `task_links` cache linked external objects such as pull requests.

## 6. Row-level security

The application layer is the primary gate (document 08). RLS is enabled on the tables that Realtime broadcasts (`tasks`, `comments`, `sections`, `task_events`, `notifications`) so that a browser holding a Clerk-issued token receives only rows it may read. Policies use helper functions that read `auth.jwt() ->> 'sub'` (Clerk user id) and resolve project visibility through membership, privacy, and workspace role. All writes go through the server with the service role, which bypasses RLS.

## 7. Soft delete and retention

User-facing entities carry `deleted_at`. Deleted tasks are restorable for 30 days from a Trash screen, then purged by a nightly Inngest cron. Workspaces are purged 30 days after owner-initiated deletion. `task_events` are retained for the life of the task.

## 8. Reference dataset for performance testing

A seed script (`scripts/seed.ts`, built in Phase 0) generates: 3 workspaces, 20 projects, 10,000 tasks in the largest project with 2,000 dependencies, 30 custom fields, 50 users, 100,000 events. Performance budgets in document 15 are measured against this dataset.
