# 10. Application Screens

Version 1.0, 03 Nov 2026. Owner: Design.

This document specifies every authenticated screen: route, layout, content, states, and interactions. Views inside a project are specified separately in document 11. Public marketing pages are in document 13. All screens use the shell and tokens from document 09.

## 1. Application shell

Route prefix: `/w/[workspaceSlug]`.

### 1.1 Navigation rail (left)

Sections, top to bottom:

1. Workspace switcher: logo, name, chevron. Menu lists workspaces with avatars, "Create workspace", "Workspace settings".
2. Create button (accent, "+ New"): menu with Task, Project, Portfolio, Goal, Form, Automation.
3. Primary items: Home, My work, Inbox (with unread count), Search.
4. "Projects" group: starred projects first, then recent projects, then "All projects". Each project shows its color dot, name, and a drag handle for reordering starred items.
5. "Portfolios", "Goals", "Teams" items.
6. Bottom: Templates, Settings, Help (opens the shortcut sheet and docs), collapse toggle.

Collapsed state shows icons only with tooltips. Width persists per user. Keyboard: `[` toggles collapse; `G` then `H`, `M`, `I` jumps to Home, My work, Inbox.

### 1.2 Top bar

Breadcrumb (Workspace / Team / Project), global search field (placeholder "Search or jump to… Ctrl+K"), Inbox bell, help, user avatar with menu (Profile, Notification settings, Theme, Keyboard shortcuts, Sign out).

### 1.3 Details pane (right)

Opens for a task, a project settings section, or a cycle. Resizable between 360 and 640 px, default 480. Width persists. Keyboard: Escape closes, `]` toggles. On tablet and below it becomes a full-height sheet.

## 2. Onboarding

Routes: `/onboarding/workspace`, `/onboarding/workflow`, `/onboarding/invite`.

Three centered steps on a plain canvas (the one place centered layout is allowed), with a progress indicator "Step 1 of 3".

1. Workspace: name, URL slug (auto-generated, editable), logo upload (optional).
2. Workflow: six cards (Simple, Kanban, Scrum, Shape Up, Gantt plan, Request intake) each with a one-sentence description and a 160 by 100 px line illustration of the default view. Selecting one names the starter project ("Marketing launch" placeholder, editable).
3. Invite: three email fields plus "Add more", role selector per row, "Copy invite link". "Skip for now" always available.

On completion the user lands on the starter project's default view with a dismissible onboarding checklist card in the project header area: Add three tasks, Set a due date, Switch to Board, Invite a teammate.

States: validation inline; slug collision shows "This URL is taken. Try acme-team."

## 3. Workspace Home

Route: `/home`.

Left column (two-thirds width):
- Greeting with first name and date (title-2).
- "Due today" and "Due this week" compact task lists (max 8 each, "View all in My work").
- "Projects" grid of cards: color bar, name, owner avatar, progress bar, health chip, last status update date; filter chips All, Starred, Mine, Team.

Right column (one-third):
- "Recent status updates" feed.
- "Upcoming milestones" across projects (next 30 days).
- "Pinned saved views".

Empty state for a brand-new workspace: single card "Create your first project" with template gallery link.

## 4. My Work

Route: `/my-work`. Specified in document 11, section 10. Tabs: Assigned to me, Created by me, Following, Completed.

## 5. Inbox

Route: `/inbox`.

Two-column layout: notification list (left, 400 px) and the referenced task pane (right, fills). Filters: All, Mentions, Assigned, Due soon, Updates. Each row shows actor avatar, text ("Dana assigned you MKT-142"), project chip, time, unread dot. Row actions on hover: Archive, Snooze (1 hour, Tomorrow 9 am, Next week), Mark read. Bulk: "Mark all read", "Archive all read".

Keyboard: `J` and `K` move, `E` archives, `S` snoozes, Enter opens.

Empty: "You are all caught up." with a small line illustration.

## 6. Project

Route: `/projects/[projectKey]` redirects to the default view. Views are `/list`, `/board`, `/table`, `/gantt`, `/timeline`, `/calendar`, `/workload`, `/dashboard`, and `/views/[viewId]`.

### 6.1 Project header (56 px)

Icon and color (click to change), project name (inline rename), privacy icon, member avatar group with "+ Invite", health chip from the latest status update, star toggle, "Share" button, "..." menu (Edit details, Set default view, Save as template, Export, Archive, Delete).

### 6.2 View tabs (40 px)

Standard views in fixed order, then shared saved views, then personal saved views in a lighter color, then "+" to add a view. Right-click a tab: Rename, Duplicate, Set as default, Share or make personal, Delete.

### 6.3 Command bar (40 px)

Left: "+ Add task" (accent). Middle: Filter (chip shows count when active), Sort, Group, Fields (show or hide), view-specific options (Gantt: Zoom, Critical path, Baseline; Board: Swimlanes, WIP limits; Calendar: Month, Week, Day). Right: search within project, "Customize" (saved view settings), overflow.

Active filters render as removable chips below the bar in a 32 px strip that appears only when non-empty.

### 6.4 Project overview pane

Opened from the "i" icon in the header. Sections: Description (rich text), Owner and dates, Status updates (list with "Post update"), Milestones, Members and roles, Linked goals, Project fields.

## 7. Task pane

Opens from any view. Sections in order:

1. Header: project chip and task key (monospace), breadcrumb of parent tasks, actions (Mark complete toggle, Copy link, Watch, "..." with Duplicate, Move, Convert to subtask, Add to another project, Delete).
2. Title (title-3 inline edit).
3. Primary fields in a two-column grid: Status, Assignee, Start date, Due date, Priority, Estimate, Cycle, Tags, Milestone toggle.
4. Custom fields (project fields in configured order; "+ Add field" for project owners).
5. Description (Tiptap editor with toolbar on selection).
6. Subtasks list with inline add, progress "1 of 4", drag reorder, each row opens that subtask in place with a back link.
7. Dependencies: "Blocked by" and "Blocking" lists with type and lag; "+ Add dependency" opens a task picker.
8. Attachments grid with previews.
9. Activity and comments: toggle "Comments only" or "All activity"; comment composer pinned at the bottom with @mention, attach, emoji; Ctrl+Enter posts.

Presence avatars of other viewers appear in the header. Unsaved inline edits save on blur; a brief "Saved" caption appears under the field.

## 8. Portfolios

Routes: `/portfolios`, `/portfolios/[id]`.

List page: table of portfolios with name, owner, project count, overall health. Detail page: Table of projects (name, owner, health, status update date, start, end, progress bar, open tasks, overdue count) and a secondary Timeline tab showing projects as bars with milestones. Header shows roll-up: projects on track, at risk, off track.

## 9. Goals

Route: `/goals`.

Tree table: objectives expand into key results; columns Name, Owner, Period, Progress (bar), Health, Linked work count. Detail pane shows description, linked projects and tasks with their completion, progress history sparkline, and "Update progress" for manual mode. Filter by period (This quarter, Next quarter, Custom) and owner.

## 10. Teams

Routes: `/teams`, `/teams/[id]`.

Team page: members with roles, projects, and a team Workload summary for the current week.

## 11. Search

Route: `/search?q=`.

Results grouped by Tasks, Projects, Comments, People, with a left filter column (project, assignee, status category, date range, has attachment). Each task result shows key, title, project, status, assignee, and a highlighted snippet.

## 12. Templates

Route: `/templates`.

Gallery grid with category filter (Engineering, Marketing, Operations, Planning, Personal, My templates). Each card previews the default view in a line illustration. "Use template" opens the create project dialog pre-filled. Project owners see "Save current project as template" in the project menu.

## 13. Settings

Route prefix: `/settings`. Left settings navigation (200 px) with groups.

Workspace: General (name, slug, logo, estimate unit, multiple assignees, cycle label, week start), Members (table with role dropdown, invite, remove, guests tab), Teams, Fields library, Workflows library, Tags, Templates, Trash (deleted projects and tasks, restore).

Integrations: Connected apps (Slack, Microsoft Teams, GitHub, Google Calendar, Outlook Calendar, Zapier, Make), API keys (create, name, scopes, last used, revoke), Webhooks (list, create, deliveries log with replay), Inbound webhooks.

Billing (owner only): plan, seats, payment method, invoices (Stripe customer portal embed).

Account: Profile (Clerk `<UserProfile>`), Notifications (matrix of type by channel with toggles), Appearance (theme, density, start of week, date format), Keyboard shortcuts.

## 14. Forms (phase 2)

Routes: `/projects/[key]/forms`, `/projects/[key]/forms/[id]/edit`, public `/f/[token]`.

Builder: two-pane; left is the form canvas with drag-reorderable fields, right is the properties panel (label, help text, required, map to task field, conditional visibility). Public page: single column, project color accent, Meridian attribution in caption-1 unless the workspace plan removes it.

## 15. Automations (phase 2)

Routes: `/projects/[key]/automations`, `/settings/automations` (workspace-wide).

List: name, trigger summary, enabled toggle, runs in last 7 days, failures. Builder: vertical flow of blocks (When, If, Then) each opening a configuration drawer; "Test with task" picker; run log tab with per-run detail.

## 16. Cycles (Scrum and Shape Up)

Route: `/projects/[key]/cycles`.

Header: active cycle with dates, goal, capacity vs committed, days remaining. Tabs: Backlog (list with drag into the planning column), Active (Board filtered to the cycle), Burndown (chart), History (velocity bar chart, past cycles table). "Close cycle" dialog offers to move incomplete tasks to the next cycle or back to backlog.

## 17. Error and loading states

- Loading: skeletons matching the view's shape; never a full-page spinner.
- Not found: "This project does not exist or you do not have access." with "Go to home".
- Offline: banner "You are offline. Changes will sync when you reconnect." Mutations queue for 10 minutes then fail with a toast.
- Save failure: toast "Could not save status. Retry" with undo of the optimistic change.
