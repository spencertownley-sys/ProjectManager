# 03. User Stories and Backlog

Version 1.0, 03 Nov 2026. Owner: Product.

Priority uses MoSCoW: M (must, MVP), S (should, v1.0), C (could, v1.x), W (won't, later phase). Each story cites the requirement it satisfies from document 02. Acceptance criteria are written so they can be turned into tests directly (document 15).

## Epic 1: Onboarding and workspace setup

| ID | Story | Priority | Requirement |
|---|---|---|---|
| US-001 | As a new user, I can sign up with email, Google, or Microsoft and land in a new workspace within 60 seconds. | M | FR-ORG-01 |
| US-002 | As a workspace creator, I am asked for a workspace name, my team's primary workflow, and three teammates' emails, and the product creates a starter project from the matching template. | M | FR-TPL-02 |
| US-003 | As a member of several workspaces, I can switch between them from the account menu without signing in again. | M | FR-ORG-01 |
| US-004 | As an admin, I can invite members by email or shareable link and set their role on invite. | M | FR-ADM-01 |
| US-005 | As an admin, I can invite a guest and restrict them to specific projects. | S | FR-ADM-02 |

Acceptance criteria for US-002:
- Given a signed-in user with no workspace, when they complete the three-step setup, then a workspace, a team, a project from the chosen template, and pending invitations exist, and the user lands on that project's default view.
- Invalid emails are flagged inline without blocking valid ones.
- The user can skip teammates and templates; skipping creates an empty Simple project.

## Epic 2: Projects and structure

| ID | Story | Priority | Requirement |
|---|---|---|---|
| US-010 | As a member, I can create a project with a name, team, color, icon, privacy (team, workspace, private), and starting template. | M | FR-ORG-02 |
| US-011 | As a project owner, I can add, rename, reorder, collapse, and delete sections. | M | FR-ORG-03 |
| US-012 | As a project owner, I can define the status workflow for the project from a template or custom statuses, each with a category. | M | FR-WF-01 |
| US-013 | As a project owner, I can set project start and end dates, an owner, and a description. | M | FR-ORG-02 |
| US-014 | As a project owner, I can archive and restore a project. | M | FR-ORG-02 |
| US-015 | As a portfolio owner, I can create a portfolio, add projects, and see their status, owner, dates, and progress in one table. | S | FR-ORG-05 |
| US-016 | As a leader, I can create objectives and key results, link projects or tasks to them, and see progress roll up. | S | FR-ORG-06 |

## Epic 3: Tasks

| ID | Story | Priority | Requirement |
|---|---|---|---|
| US-020 | As a member, I can create a task from any view by typing a title and pressing Enter, with the new task placed in the current section or group. | M | FR-VIEW-04 |
| US-021 | As a member, I can open a task in a right-side pane and edit every field inline. | M | FR-VIEW-05 |
| US-022 | As a member, I can add subtasks and nest subtasks within subtasks. | M | FR-ORG-04 |
| US-023 | As a member, I can set start and due dates with an optional time, and see the task's duration computed. | M | FR-TASK-01 |
| US-024 | As a member, I can add a dependency by choosing a task and a type, and the system blocks circular dependencies with an explanation. | M | FR-TASK-03 |
| US-025 | As a member, I can mark a task as a milestone. | M | FR-TASK-06 |
| US-026 | As a member, I can attach files by drag and drop, upload, or link; images preview inline. | M | FR-TASK-04 |
| US-027 | As a member, I can comment with rich text, @mention people and tasks, and react. | M | FR-COL-01 |
| US-028 | As a member, I can see a full activity history of the task. | M | FR-TASK-08 |
| US-029 | As a member, I can duplicate a task with or without subtasks. | S | FR-TASK-01 |
| US-030 | As a member, I can make a task repeat on a schedule. | S | FR-TASK-05 |
| US-031 | As a member, I can add a task to a second project while keeping one set of fields. | S | FR-ORG-03 |
| US-032 | As a member, I can select many tasks and change assignee, status, dates, section, or custom fields at once. | S | FR-TASK-09 |
| US-033 | As a member, I can convert a task to a subtask or a subtask to a task, and move tasks between projects. | S | FR-ORG-03 |

Acceptance criteria for US-024:
- Given tasks A and B where B depends on A, when I try to make A depend on B, then the save is rejected with the message "This would create a loop: A depends on B depends on A."
- Dependency types available: finish-to-start (default), start-to-start, finish-to-finish, start-to-finish. Lag accepts positive or negative whole days.
- When A's due date moves later and B is finish-to-start, B's dates shift by the same amount if auto-scheduling is on for the project; otherwise B shows a conflict badge.

## Epic 4: Custom fields

| ID | Story | Priority | Requirement |
|---|---|---|---|
| US-040 | As a project owner, I can add a custom field of any supported type to the project and it appears as a column in Table and an editable field in the task pane. | M | FR-TASK-02 |
| US-041 | As an admin, I can create workspace-level fields that any project can add from a library so values are comparable across projects. | S | FR-TASK-02 |
| US-042 | As a member, I can create a formula field using other fields, arithmetic, and date functions. | C | FR-TASK-02 |
| US-043 | As a member, I can create a roll-up field summarizing subtasks (count, sum, average, min, max, percent complete). | C | FR-TASK-02 |
| US-044 | As a member, I can create a relation field linking to tasks in another project and see the linked task's status. | C | FR-TASK-02 |

## Epic 5: Views

| ID | Story | Priority | Requirement |
|---|---|---|---|
| US-050 | As a member, I can switch a project between List, Board, Table, Gantt, Timeline, Calendar, Workload, and Dashboard with the filter, sort, and group settings preserved. | M | FR-VIEW-01, FR-VIEW-02 |
| US-051 | As a member, I can filter by any field with and/or groups, sort by up to three fields, and group by one field. | M | FR-VIEW-02 |
| US-052 | As a member, I can save the current view configuration under a name, choose personal or shared, and pin it as a tab on the project. | M | FR-VIEW-03 |
| US-053 | As a member, I can show or hide fields on cards and columns and reorder columns. | M | FR-VIEW-03 |
| US-054 | As a member, I can drag tasks in List to reorder and between sections. | M | FR-VIEW-01 |
| US-055 | As a member, I can drag cards in Board between status columns or swimlanes and see WIP limits enforced visually. | M | FR-VIEW-01 |
| US-056 | As a member, I can edit cells directly in Table like a spreadsheet, including paste of multiple rows. | M | FR-VIEW-01 |
| US-057 | As a planner, I can drag Gantt bars to move or resize, draw dependencies between bars, zoom from day to quarter, and toggle critical path. | M | FR-PLAN-03 |
| US-058 | As a planner, I can save a baseline and view the current plan against it in Gantt. | S | FR-PLAN-03 |
| US-059 | As a member, I can see tasks on a Timeline grouped by assignee or section with milestones marked. | M | FR-VIEW-01 |
| US-060 | As a member, I can see tasks on a month, week, or day Calendar and drag them to change dates. | M | FR-VIEW-01 |
| US-061 | As a manager, I can see Workload per person per week with over-allocation highlighted and drag tasks between people. | S | FR-PLAN-04 |
| US-062 | As a project owner, I can build a Dashboard from widgets over any field and share it. | S | FR-VIEW-01 |
| US-063 | As a member, I can see My Work across all projects grouped by today, this week, later, and no date. | M | FR-VIEW-01 |
| US-064 | As a member, I can open any view on a 10,000-task project and scroll smoothly. | M | FR-VIEW-06 |

Acceptance criteria for US-057:
- Dragging a bar's body moves start and due together, snapping to the current zoom unit; dragging an edge changes one date; the change is written on drop and reverted on Escape.
- Hovering a bar shows a connector handle; dragging it to another bar creates a finish-to-start dependency; dropping on the start edge creates start-to-start.
- The critical path toggle highlights the longest dependent chain in the accent color and dims other bars.
- Zoom levels: day, week, month, quarter. Today is marked with a vertical line. Weekends are shaded.
- Keyboard: arrow keys move the focused bar by one unit; Shift with arrows resizes; Enter opens the task pane.

## Epic 6: Planning

| ID | Story | Priority | Requirement |
|---|---|---|---|
| US-070 | As an engineering lead, I can create cycles with start, end, goal, and capacity, and plan a cycle from the backlog by drag. | M | FR-PLAN-01, FR-PLAN-02 |
| US-071 | As an engineering lead, I can see a burndown for the active cycle and velocity across cycles. | S | FR-PLAN-01 |
| US-072 | As a project owner, I can post a status update with a health color and the product pre-fills metrics for the period. | M | FR-PLAN-05 |
| US-073 | As a project owner, I can turn on auto-scheduling so dependent tasks shift when predecessors move. | S | FR-TASK-03 |

## Epic 7: Collaboration and notifications

| ID | Story | Priority | Requirement |
|---|---|---|---|
| US-080 | As a member, I receive in-app notifications for assignments, mentions, comments on followed tasks, due-soon tasks, and unblocked dependencies. | M | FR-COL-02 |
| US-081 | As a member, I can choose per notification type whether it goes to in-app, email, or a chat app. | M | FR-COL-02 |
| US-082 | As a member, I can archive, snooze, and mark all read in the Inbox. | M | FR-COL-03 |
| US-083 | As a member, I can reply to a comment notification email and my reply posts as a comment. | S | FR-COL-04 |
| US-084 | As a member, I see other users' changes appear live and see who is viewing the same task. | M | FR-COL-05 |

## Epic 8: Intake and automation

| ID | Story | Priority | Requirement |
|---|---|---|---|
| US-090 | As a project owner, I can build a form with fields mapped to task fields, required flags, and conditional sections, and share it by public link. | S | FR-FORM-01 |
| US-091 | As a project owner, I can create an automation from a trigger, optional conditions, and actions, test it, and see its run log. | S | FR-AUTO-01, FR-AUTO-02 |
| US-092 | As a project owner, I can enable starter automations from a library with one click. | S | FR-AUTO-03 |

## Epic 9: Templates, import, export

| ID | Story | Priority | Requirement |
|---|---|---|---|
| US-100 | As a member, I can create a project from the template gallery. | M | FR-TPL-02 |
| US-101 | As a project owner, I can save a project as a template with relative dates. | S | FR-TPL-01 |
| US-102 | As an admin, I can import a CSV with column mapping and a preview before commit. | M | FR-IMP-01 |
| US-103 | As an admin, I can import an Asana, Trello, or Jira export. | S | FR-IMP-01 |
| US-104 | As a member, I can export a project to CSV or JSON, and a Gantt or Dashboard to PDF or PNG. | S | FR-EXP-01 |

## Epic 10: Search and keyboard

| ID | Story | Priority | Requirement |
|---|---|---|---|
| US-110 | As a member, I can press Ctrl+K to open a command palette that finds projects, tasks, people, and views and runs actions. | M | FR-NAV-01 |
| US-111 | As a member, I can search across titles, descriptions, comments, and attachment names with filters. | M | FR-NAV-02 |
| US-112 | As a member, I can learn and use keyboard shortcuts from a cheat sheet opened with the ? key. | M | FR-NAV-03 |

## Epic 11: Integrations and API

| ID | Story | Priority | Requirement |
|---|---|---|---|
| US-120 | As an admin, I can create and revoke API keys scoped to the workspace. | M | FR-INT-01 |
| US-121 | As a developer, I can read and write every object through a documented REST API with pagination and rate limits. | M | FR-INT-01 |
| US-122 | As an admin, I can register an outbound webhook for selected events, see deliveries, and replay failures. | M | FR-INT-02 |
| US-123 | As a project owner, I can create an inbound webhook URL that creates or updates tasks from JSON. | S | FR-INT-03 |
| US-124 | As a member, I can connect Slack or Microsoft Teams and receive notifications and post comments from the chat app. | S | FR-INT-04 |
| US-125 | As an engineer, I can link GitHub pull requests to tasks and have merges move the task to Done. | S | FR-INT-04 |
| US-126 | As a member, I can see my tasks with due dates on my Google or Outlook calendar. | C | FR-INT-04 |

## Epic 12: Administration and billing

| ID | Story | Priority | Requirement |
|---|---|---|---|
| US-130 | As an admin, I can manage members, roles, teams, and guests from a settings area. | M | FR-ADM-01 |
| US-131 | As an admin, I can manage the custom field library, workflow library, tags, and templates. | S | FR-ADM-01 |
| US-132 | As an owner, I can manage the subscription, seats, and invoices. | S | FR-ADM-01 |
| US-133 | As an owner, I can export all workspace data. | S | FR-ADM-03 |

## MVP cut line

The MVP (document 04, phase 1) includes every story marked M. The MVP ships with List, Board, Table, Gantt, Timeline, Calendar, and My Work; Workload and Dashboard follow in phase 2 along with automations and forms. This ordering lets the shared timeline engine (document 05) stabilize on Gantt and Timeline before Workload reuses it.
