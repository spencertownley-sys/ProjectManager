# 11. Views Specification

Version 1.0, 03 Nov 2026. Owner: Design and Engineering.

## 1. Shared behavior

Every project view:

- Reads the same `ViewSpec` (filters, sorts, group, visible fields, subtask mode, view options). Changing any of these in one view changes it for all views of that project for that user until saved or cleared.
- Supports quick add (type a title, Enter creates, Shift+Enter creates and keeps the composer open, Escape cancels).
- Opens the task pane on single click of a title or card; double click on other cells edits inline.
- Supports multi-select with Ctrl or Shift click and a bulk action bar that slides up from the bottom (Assign, Status, Dates, Priority, Section, Tags, Move, Delete).
- Supports right-click context menus mirroring the bulk actions.
- Renders at 60 fps with 10,000 tasks through virtualization.
- Shows an empty state with one action when no rows match.
- Supports Ctrl+Z undo for the last 20 mutations in the session.

Keyboard, all views: `N` new task, `J` and `K` move focus, Enter opens pane, `E` edit title, `A` assign, `S` set status, `D` set due date, `P` set priority, `C` comment, `X` select, `Shift+X` select range, `Delete` deletes with confirmation, `1` through `8` switch views in tab order, `?` shortcut sheet.

## 2. List

Purpose: the default, fastest way to read and edit a project.

Layout: rows grouped by section (default) or by any field. Columns: checkbox (complete), title with subtask expander and key, then visible fields as narrow columns (Assignee avatar, Due date, Priority icon, Status badge, custom fields). Column widths are per saved view.

Interactions:
- Drag rows to reorder within a group and between groups (changing section or the grouped field).
- Inline edit any cell with a single click on the cell (title requires `E` or double click to avoid accidental edits).
- Collapse groups; counts show in the header.
- Subtasks render indented with a tree line; `Right` and `Left` expand and collapse.
- Section header has "+ Add task" and a menu (Rename, Add section above or below, Collapse all, Delete).
- Completed tasks hide by default with a "Show completed" toggle in Filter (recent 7 days, all).

Density: 36 px rows. Hovering a row reveals a drag handle and a "..." menu.

## 3. Board (cards)

Purpose: status and flow.

Layout: columns by Status (default) or any single-select, person, or priority field. Optional swimlanes by a second field (Assignee, Priority, Section, Cycle). Column header shows name, count, and WIP limit (red count when exceeded). Column width 280 px; columns scroll horizontally with the first column sticky when swimlanes are on.

Card content (configurable per saved view): title, key, assignee avatar, due date (red when overdue, orange within 48 hours), priority icon, tags, subtask progress, attachment and comment counts, up to three custom fields, cover image from the first image attachment (optional). Three densities: compact (title only), standard, detailed.

Interactions:
- Drag cards between columns and swimlanes; drop updates status and the swimlane field. A column with a WIP limit at capacity accepts the drop but flashes the count.
- Drag within a column to reorder (position).
- "+ Add task" at the top and bottom of each column.
- Collapse a column to a vertical label.
- Column menu: Set WIP limit, Rename status, Add status left or right, Sort cards (manual, due date, priority), Collapse.
- Keyboard: focus a card, Space picks it up, arrows move it, Space drops, Escape cancels; announcements through a live region.

## 4. Table

Purpose: spreadsheet-like editing across many fields.

Layout: a grid with a frozen title column and a column per visible field. Column header shows field icon, name, sort arrow; drag to reorder; drag edge to resize; right-click for Sort, Filter by this field, Group by, Hide, Edit field, Add column left or right, Delete field (owner).

Interactions:
- Click a cell to select, type to edit, Tab and Enter navigate like a spreadsheet, Escape reverts.
- Fill handle: drag the corner of a selected cell to copy down.
- Paste tab-separated text creates or updates rows with a preview dialog when more than 20 cells.
- Row grouping with group roll-ups in the group header (count, sum, average for number fields; earliest and latest for dates).
- Footer row with per-column aggregates (configurable: sum, average, min, max, count, percent complete).
- Column types render typed editors (date picker, person picker, select, checkbox, URL with link icon).
- Export the current table to CSV from the overflow menu.

Density 36 px; compact 28 px.

## 5. Gantt

Purpose: schedule with dependencies.

Layout: left grid (name, start, due, duration, assignee; resizable, collapsible to name only) and right timeline. Timeline header has two rows (months over days, quarters over weeks, years over months depending on zoom). Today line in accent. Weekends and non-working days shaded. Rows mirror the List grouping with collapsible groups rendered as summary bars.

Bars:
- Task bar: tinted project color with a darker left edge; a progress fill from subtask completion or percent-done field; label inside when wide enough, otherwise to the right.
- Milestone: diamond at due date.
- Summary bar: thin dark bracket spanning child tasks.
- Overdue: due date before today and not done shows a red right edge.
- Critical path: toggled from the command bar; critical bars take the accent color, others dim to 40 percent.
- Baseline: toggled; a thin gray bar beneath each task shows the baseline dates with a delta label (+3d).

Dependencies: drawn as orthogonal connectors with arrowheads from predecessor edge to successor edge according to type. Hover highlights the chain. Click selects; Delete removes with confirmation.

Interactions:
- Drag bar body to move (both dates); drag either edge to resize; snapping to the zoom unit; Shift disables snapping.
- Drag from the connector handle on a bar to another bar to create a dependency; the drop edge decides the type (end to start by default).
- Double click empty timeline area at a row to create a task with that date.
- Zoom: Day, Week, Month, Quarter via command bar or Ctrl+scroll. "Fit" zooms to project span.
- Auto-schedule (project setting): moving a predecessor shifts successors respecting lag; a change summary toast shows "3 tasks moved. Undo."
- Scroll to today; scroll to selected.
- Export PNG or PDF of the visible or full range.

Performance: rows virtualized; columns (time units) virtualized; bars and connectors rendered in one SVG per visible viewport; dependency routing computed in a web worker for projects above 2,000 dependencies (phase 1 computes on the main thread; the worker is added when a project crosses the threshold).

Keyboard: arrows move the focused bar one unit; Shift with arrows resizes; `L` starts linking mode, then arrows and Enter pick the target; `+` and `-` zoom.

Mobile (below 768 px): read-only, pinch zoom, tap opens the task sheet.

## 6. Timeline

Purpose: a plan at a glance for a stakeholder, lighter than Gantt.

Differences from Gantt: no left grid (bars carry labels), grouped by Assignee, Section, or Project by default, no dependencies or critical path unless toggled on, larger bars (32 px), milestones with labels, unscheduled tasks in a collapsible tray at the bottom that can be dragged onto the timeline. Shares the timeline engine and interactions for move, resize, zoom.

Typical use: roadmap view, portfolio timeline (projects as bars), content calendar overview.

## 7. Calendar

Purpose: what is due when.

Modes: Month (default), Week (uses the timeline engine with hours when due time is set), Day, plus a "Schedule" agenda list.

Month: 7 columns, rows sized to content with "+3 more" overflow that expands in place. Items render as chips with project color, title, and assignee avatar; multi-day items span cells. Weekends toggle. Week starts on the workspace setting.

Interactions:
- Drag a chip to another day to change due date (and start date if the task has a duration, preserving it).
- Drag the ends of a multi-day chip to change start or due.
- Click an empty cell to quick add with that due date.
- Filter by assignee is the most used filter here, so "Me" and "Unassigned" chips sit in the command bar.
- Sync to Google or Outlook Calendar (phase 3) via per-user ICS feed and two-way connector.

## 8. Workload

Purpose: capacity per person over time.

Layout: rows per person (members of the project, or of the team for team-level Workload), columns per day or week (zoom), cells show allocated effort versus capacity as a horizontal fill. Effort comes from estimates spread evenly across each task's working days between start and due; tasks without dates or estimates count in an "Unscheduled" column per person. Capacity defaults from the member's weekly capacity hours and the workspace estimate unit (points use a per-workspace points-per-day setting).

Visuals: fill color neutral under 80 percent, orange 80 to 100, red over 100 with the overage number. A row expander lists that person's tasks as bars (timeline engine) so the manager can see what causes a spike.

Interactions:
- Drag a task bar to another person's row to reassign.
- Drag a bar along time to reschedule.
- Set capacity per person inline (overrides workspace default for this project) and add time off (non-working days) from the row menu.
- Totals row at the bottom: team allocation versus capacity.

## 9. Dashboard

Purpose: project or portfolio health at a glance.

Layout: a 12-column grid of widgets, drag to move and resize, edit mode toggle. Default dashboard per project template. Widgets:

| Widget | Configuration |
|---|---|
| Number | Count or sum of tasks matching a filter (Overdue, Completed this week, Total estimate remaining) with comparison to the previous period |
| Bar, Column, Line | Group by any field, measure count or sum, optional stack and date bucketing |
| Pie, Donut | Group by any single-select or person field |
| Table | A saved view embedded |
| Burndown | Scope versus remaining for a cycle or project date range |
| Velocity | Completed estimate per cycle |
| Cycle time | Distribution of in-progress to done durations |
| Workload summary | Allocation versus capacity for the period |
| Milestones | Upcoming milestones with dates and status |
| Status updates | Latest update text and health |
| Text | Markdown note |

Dashboards can be shared read-only by link (phase 2), scheduled as a weekly email digest (phase 2), and exported to PDF or PNG.

## 10. My Work

Purpose: what should I do.

Layout: cross-project List grouped by due date buckets (Overdue, Today, Tomorrow, This week, Later, No date) with project chips on each row. Tabs: Assigned to me, Created by me, Following, Completed. Optional Board mode (columns per bucket) and Calendar mode (my tasks only). Section "Pinned" at the top holds tasks the user pins manually for the day.

Interactions mirror List. Completing a task animates it out after 1.5 seconds with undo. Quick add defaults the assignee to the user and asks for a project in the composer (last used project remembered).

## 11. Saved views

Any view type plus its spec can be saved. A saved view has a name, type, personal or shared flag, position among tabs, and optionally a lock (owner only) so collaborators cannot change its filters without duplicating it. The project default view is a saved view or a standard view.

Standard views are never deleted; they reset to the project default spec with "Clear" in the command bar.

## 12. Filters, sorts, grouping

Filter builder: rows of Field, Operator, Value with And or Or at the group level and nested groups to two levels. Operators by type:

- Text: contains, does not contain, is, is not, is empty, is not empty
- Number: equals, not equals, greater than, less than, between, is empty
- Date: is, is before, is after, is between, is today, is this week, is next 7 days, is overdue, is empty
- Select, Status, Priority: is any of, is none of, is empty
- Person: is any of, is none of, is me, is empty
- Checkbox: is checked, is not checked
- Tags: includes any, includes all, includes none

Sort: up to three levels, with "Manual" (position) available as a first level in List and Board. Group: one field; groups ordered by the field's natural order (status order, select option order, alphabetical for people, chronological for dates).

Every filter has a URL representation so views can be linked and bookmarked.
