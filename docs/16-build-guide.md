# 16. Build Guide

Version 1.0, 03 Nov 2026. Owner: Engineering.

This is the implementation sequence for building Meridian with Claude Code in this repository. Each step names the documents it depends on, what to produce, and how to verify it. Steps are small enough to finish in one working session and leave the application runnable.

Read `CLAUDE.md` at the repository root first; it holds the conventions every session must follow.

## Phase 0: Foundation

### Step 0.1: Scaffold

- `pnpm create next-app@latest . --typescript --tailwind --eslint --app --src-dir=false --import-alias "@/*"`; remove sample content.
- Add dependencies: `@clerk/nextjs`, `drizzle-orm`, `drizzle-kit`, `pg`, `@supabase/supabase-js`, `@tanstack/react-query`, `@tanstack/react-table`, `@tanstack/react-virtual`, `zustand`, `@dnd-kit/core`, `@dnd-kit/sortable`, `zod`, `react-hook-form`, `@hookform/resolvers`, `date-fns`, `inngest`, `resend`, `@react-email/components`, `@tiptap/react` and extensions, `recharts`, `posthog-js`, `@sentry/nextjs`, `pino`, shadcn/ui CLI, `@fluentui/react-icons`.
- Add dev dependencies: `vitest`, `@testing-library/react`, `@playwright/test`, `eslint` plugins, `prettier`.
- Create `.env.example` (already in the repository) and `.env.local`.
- Verify: `pnpm dev` serves a blank page; `pnpm lint`, `pnpm typecheck`, `pnpm test` pass with no tests.

### Step 0.2: Design tokens and primitives (document 09)

- `app/globals.css`: CSS custom properties for every token in document 09 sections 2 to 4 in light and dark; Tailwind `@theme` mapping; self-host Selawik and Cascadia Code in `/public/fonts` with `@font-face`.
- Install shadcn/ui components listed in document 09 section 6 and restyle each to the tokens: 32 px controls, 4 px radius, 1 px borders, semibold headings.
- ESLint rule `no-raw-color` (custom rule or `eslint-plugin-regexp`) and `no-dash-characters` for string literals and JSX text.
- Build a `/dev/components` page (excluded from production) rendering every component in every state.
- Verify: visual check of `/dev/components` in light and dark; lint passes.

### Step 0.3: Clerk authentication (document 08)

- `ClerkProvider` in `app/layout.tsx`; `proxy.ts` with `clerkMiddleware` and the public route matcher from document 08 section 2.2.
- `/sign-in` and `/sign-up` pages using `<SignIn />` and `<SignUp />` with appearance mapped to tokens.
- `/api/webhooks/clerk` route handler verifying Svix signatures and upserting `users`, `workspaces`, `workspace_members`.
- Verify: sign up locally, see the user row in the database; switch active organization and see the membership row.

### Step 0.4: Database (document 06)

- Apply `supabase/migrations/0001_initial_schema.sql` locally with `supabase db reset`.
- `drizzle-kit introspect` to generate `/lib/db/schema.ts`; create `/lib/db/client.ts` with a pooled `pg` client.
- `scripts/seed.ts` producing the reference dataset.
- Configure Clerk third-party auth in the local Supabase config and verify a browser Realtime subscription with a Clerk token receives only permitted rows.
- Verify: integration test that inserting a task assigns a sequential number and that a circular dependency insert fails.

### Step 0.5: Application shell (document 10 section 1)

- Route group `(app)` with `/w/[workspaceSlug]` layout: navigation rail, top bar, details pane container, workspace resolution from the Clerk active organization, redirect logic.
- Command palette scaffold (Ctrl+K) with navigation to projects.
- Verify: signed-in user sees the shell with their workspace name; rail collapse persists across reloads.

### Step 0.6: Event log and services

- `/lib/events`: event types, `emit()` writing `task_events` inside the caller's transaction and sending to Inngest.
- `/lib/services/tasks.ts` with `create`, `update`, `move`, `delete`, `restore`, each calling `authorize()`.
- `/lib/auth/permissions.ts` with the matrix from document 08 section 4 and unit tests per row.
- Inngest client and `/api/inngest` route; a first function that logs events.
- Verify: creating a task through a server action writes a task and an event; the Inngest dev server shows the event.

### Step 0.7: Query engine (document 05 section 6)

- Zod `ViewSpec`; `/lib/query-engine/build.ts` translating filters, sorts, grouping, and custom field joins into Drizzle queries with cursor pagination and group counts.
- Unit tests for every operator per field type.
- Verify: tests pass; a plain List page renders tasks for a seeded project using the engine.

Phase 0 exit: document 04 section 2.

## Phase 1: MVP

### Step 1.1: List view (document 11 section 2)

Virtualized grouped rows, inline cell editing, quick add, drag reorder and move between sections with dnd-kit, keyboard shortcuts, completed toggle, bulk action bar. Realtime subscription for the project channel with merge by version.

### Step 1.2: Task pane (document 10 section 7)

All sections except dependencies and attachments first; Tiptap description and comments with mentions; activity history from events; presence through Realtime.

### Step 1.3: Custom fields

Field definitions UI in project settings and in the Table header; typed editors; query engine coverage; Zod validation per type.

### Step 1.4: Table view (document 11 section 4)

TanStack Table with virtualization, resizable and reorderable columns, spreadsheet keyboard navigation, fill handle, paste preview, group roll-ups, footer aggregates, CSV export.

### Step 1.5: Board view (document 11 section 3)

Columns by status or any field, swimlanes, WIP limits, card densities, keyboard drag with live region announcements.

### Step 1.6: Status workflows and templates

Workflow editor; workflow templates; project templates (12) as JSON fixtures in `/lib/templates`; template gallery; create project dialog.

### Step 1.7: Dependencies and attachments

Dependency editor in the pane; Supabase Storage signed uploads; previews; attachment grid.

### Step 1.8: Timeline engine (document 05 decision 7)

`/components/views/engine`: date scale, zoom levels, virtualized rows and columns, bar layer in SVG, drag and resize primitives, today line, non-working day shading. Build it view-agnostic with a `TimelineRow` and `TimelineItem` contract. Unit test the scale math and snapping.

### Step 1.9: Gantt view (document 11 section 5)

Left grid, bars, milestones, summary bars, dependency connectors with orthogonal routing, link creation by drag, critical path in a web worker, zoom, export. Decide at the end of this step whether to keep the in-house connectors or adopt SVAR for Gantt only (document 05 decision 7).

### Step 1.10: Timeline view (document 11 section 6)

Reuse the engine; grouping by assignee, section, project; unscheduled tray.

### Step 1.11: Calendar view (document 11 section 7)

Month grid with multi-day spans and overflow; week mode on the engine; day and agenda modes; drag to reschedule.

### Step 1.12: My Work and Inbox (document 10 sections 4 and 5, document 11 section 10)

Cross-project queries; buckets; notifications generation in Inngest from events with preference checks; Resend email templates; Inbox UI.

### Step 1.13: Saved views, filters, sorts, grouping (document 11 sections 11 and 12)

Filter builder, sort and group menus, Fields menu, save and share, tab management, URL encoding of filters.

### Step 1.14: Cycles (document 10 section 16)

Cycles CRUD, backlog planning, Board filtered to cycle, burndown and velocity from events.

### Step 1.15: Status updates and project overview pane

Posting with auto-filled metrics; home page feed.

### Step 1.16: Search and command palette (document 10 sections 1 and 11)

Full-text search service; results page; palette actions.

### Step 1.17: CSV import

Upload, column mapping, preview, commit as an Inngest job with progress.

### Step 1.18: Public API and outbound webhooks (documents 07 and 12)

API key issuance and hashing; route handlers for projects, sections, tasks, comments, dependencies, fields, tags, views, cycles, status updates; OpenAPI generation; webhook registration, Inngest delivery function with retries, deliveries log and replay.

### Step 1.19: Settings (document 10 section 13)

Workspace, members, teams, fields library, workflows library, tags, templates, trash; account settings including Clerk `<UserProfile>` and notification matrix.

### Step 1.20: Responsive pass, accessibility audit, performance pass

Document 15 sections 3, 6; fix to budget.

Phase 1 exit: document 04 section 2.

## Phase 2 and later

Follow document 04. Each feature in Phase 2 begins with a short design note in `/docs/notes/<feature>.md` if the specification in documents 10 to 12 needs elaboration, then follows the same build and verify pattern.

## Working agreements for Claude Code sessions

1. Start every session by reading `CLAUDE.md` and the documents named in the step.
2. Make a plan with a task list before editing; keep steps small; run lint, typecheck, and tests before finishing.
3. Never introduce a dependency not listed in document 05 without recording a decision in `/docs/notes/decisions.md`.
4. Never use raw colors, fonts outside the stack, or dash characters in copy.
5. Every new service function gets an authorization check and a unit test.
6. Every view gets a Playwright test for its P0 interaction.
7. Update the relevant document when the implementation deviates from it, in the same pull request.
