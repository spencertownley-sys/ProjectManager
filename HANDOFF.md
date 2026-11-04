# Handoff for Claude Code

Last updated 04 Nov 2026. This file tells a Claude Code session exactly where the build stands and what to do next. Read `CLAUDE.md` first, then this file, then the documents named in each step.

## Decisions already made (do not re-ask)

- Product name: TaskParty. Repo: `spencertownley-sys/ProjectManager`, branch `main`.
- Pricing: free during the beta; early adopters get a reduced price later. Draft tiers stay unpublished (docs/13).
- Beta roster for the first workspace: Spencer (owner), Jenny, Mary, Amelia, Pete, Anthony, Lisa, Logan, Anisa, Karla. Single assignee per task in v1.
- Connectors: only the phase 2 list in docs/12 section 6.1 (Microsoft Teams first, GitHub, Planner and Project import, Excel and Power BI export, MCP server, Slack, Zapier and Make, calendar feeds). Nothing else.
- Stack: Next.js 16 App Router, React 19, Tailwind 4, Clerk, Supabase Postgres via Drizzle, Supabase Realtime, Inngest 4, Resend, Vercel. All already installed in `package.json`.

## What is built and verified

Everything below passes `pnpm typecheck`, `pnpm lint`, and `pnpm vitest run` (43 tests on an in-memory PGlite Postgres).

| Area | Files | Status |
|---|---|---|
| Design tokens, fonts | `app/globals.css`, `public/fonts/` (Selawik compiled from Microsoft's OFL source, Cascadia Code) | Done |
| UI primitives | `components/ui/*` (button, input, badge, avatar, tooltip, menu, popover, dialog and sheet, checkbox, tabs, toast, misc) | Done |
| Schema | `supabase/migrations/0001_initial_schema.sql` (45 tables, triggers, RLS), `lib/db/schema.ts` (Drizzle mirror) | Done, tested |
| Auth | `proxy.ts` (clerkMiddleware), `app/(auth)/*`, `app/(app)/layout.tsx` (ClerkProvider), `app/api/webhooks/clerk/route.ts`, `lib/auth/current.ts` (session to actor, self-heals missing mirror rows) | Done, needs real Clerk keys to run |
| Permissions | `lib/auth/permissions.ts` plus tests (30 cases from docs/08 section 4) | Done |
| Validation | `lib/validation/*` (Zod: tasks, projects, ViewSpec) | Done |
| Query engine | `lib/query-engine/build.ts`, `run.ts` (ViewSpec to SQL, every operator per type) | Done, tested |
| Services | `lib/services/{tasks,projects,views,workspaces,notifications,context}.ts` | Done, tested |
| Events, jobs | `lib/events/*`, `inngest/client.ts`, `inngest/functions.ts` (notifications from events) | Done |
| Server actions | `lib/actions/*` | Done |
| App shell | `components/shell/*` (rail, top bar, command palette), `components/providers.tsx`, `app/(app)/w/[workspaceSlug]/layout.tsx` | Done, screenshot verified |
| Task pane | `components/task/*` (fields, rich text, comments, subtasks, dependencies, activity, new task) | Done |
| Project workspace | `components/project/*` (header, view tabs, command bar with filter builder, save view, overview pane, new project dialog, projects table) | Done |
| List view | `components/views/list/list-view.tsx` (virtualized, grouped, drag, inline edit, keyboard, bulk bar) | Done, screenshot verified |
| Board view | `components/views/board/board-view.tsx`, `board-options.tsx` (columns by status, assignee, priority, section, or custom select; swimlanes from Group; WIP limits with flash; compact, standard, detailed cards; pointer and keyboard drag with live region; quick add top and bottom; collapse; status column menu), pure helpers in `lib/client/board.ts` with tests, journeys in `tests/e2e/board.spec.ts` | Done, screenshot verified |
| Pages | `/app`, `/onboarding`, `/w/[slug]/home`, `/my-work`, `/projects`, `/projects/[key]/[view]`, `/projects/[key]/views/[id]`, `/api/health`, `/api/inngest` | Done |
| Dev preview | `app/dev/preview/page.tsx` with `lib/dev/fixtures.ts`; `scripts/screenshot.mjs` | Done. `http://localhost:3000/dev/preview?view=list` renders without Clerk or a database |

## What is next, in order (docs/16 build guide)

Each view must implement the `ViewProps` contract in `components/views/types.ts` and follow `components/views/list/list-view.tsx` as the reference for selection, keyboard, quick add, optimistic mutations (`useTaskMutations` in `lib/client/queries.ts`), and drag and drop. Specs are in `docs/11-views-specification.md`. Replace the placeholder files that currently export an EmptyState.

1. **Board view**: done (see the table above). Board options live in `spec.options` as `boardColumns`, `boardDensity`, and `boardCollapsed`; swimlanes reuse `spec.groupBy`.
2. **Table view** `components/views/table/table-view.tsx` (docs/11 section 4): TanStack Table plus Virtual, frozen title column, resize and reorder columns into `spec.columnWidths` and `spec.visibleFields`, spreadsheet keyboard editing, group roll-ups, footer aggregates, CSV export.
3. **Timeline engine** `components/views/engine/` plus pure math in `lib/client/timeline/scale.ts` with tests (docs/05 decision 7, docs/11 section 5): date scale with Day, Week, Month, Quarter zoom, virtualized rows and columns, bar drag and resize, dependency connectors in SVG, `computeCriticalPath`, `shiftSuccessors` for auto-schedule.
4. **Gantt view** `components/views/gantt/gantt-view.tsx` on the engine: left grid, summary bars, milestones, link by drag (`addDependencyAction`), critical path and baseline toggles in `spec.options`.
5. **Timeline view** `components/views/timeline/timeline-view.tsx` on the engine: no grid, grouped bars with labels, unscheduled tray.
6. **Calendar view** `components/views/calendar/calendar-view.tsx` (docs/11 section 7): month with multi-day lanes, week and day on the engine, schedule list, drag to reschedule, "Me" and "Unassigned" chips.
7. **Inbox** `app/(app)/w/[slug]/inbox/page.tsx` (docs/10 section 5): `listNotificationsAction` and `markNotificationsAction` already exist.
8. **Settings** (docs/10 section 13): members and roles (Clerk Backend API for invites), workflow editor (`updateWorkflowAction`), fields library, tags, Clerk `<UserProfile>`, notification matrix.
9. **Cycles** page (docs/10 section 16): `createCycleAction`, `closeCycleAction` exist; burndown from `task_events`.
10. **Search, templates gallery, help page** (docs/10 sections 11, 12; keyboard sheet from docs/11 section 1).
11. **CSV import** as an Inngest job, then **public REST API and outbound webhooks** (docs/07, docs/12).
12. **Seed scripts** `scripts/seed.ts` (reference dataset, docs/06 section 8) and `scripts/seed-beta.ts` (the beta roster above).
13. Playwright journeys from docs/15 section 3 once Clerk test keys exist.

Workload and Dashboard are phase 2 and are shown disabled in the view tabs on purpose.

## How to verify visually without accounts

```
pnpm dev
node scripts/screenshot.mjs "http://localhost:3000/dev/preview?view=board" /tmp/board.png 1440 900 light
```

Open the PNG and compare with the List view. The preview mounts the real `ProjectWorkspace` with fixture data (`lib/dev/fixtures.ts`: 20 tasks, 4 sections, 5 statuses, 10 people, 10 dependencies, fixture today 2026-11-04). `?view=` accepts list, board, table, gantt, timeline, calendar. An optional `&spec=<url encoded ViewSpec JSON>` becomes the initial spec, so grouping, densities, and view options can be screenshotted without a backend. The route is excluded from Clerk middleware and returns 404 in production unless `TP_ENABLE_PREVIEW=1`.

If Playwright cannot download its own browser, set `PW_CHROMIUM_PATH` to a Chromium binary (for example `/opt/pw-browsers/chromium`); `scripts/screenshot.mjs` and `playwright.config.ts` both honor it. The Board journeys run with `pnpm test:e2e tests/e2e/board.spec.ts` against `pnpm dev`.

## Running the real app locally

1. Clerk: create an application, enable Organizations, add `org:guest` as a custom role, turn on "Connect with Supabase" (adds the `role: authenticated` claim). Copy the keys into `.env.local` (see `.env.example`). Point a webhook at `/api/webhooks/clerk` (use `ngrok` locally) and copy the signing secret.
2. Supabase: `supabase start`, then `supabase db reset` applies `supabase/migrations`. Set `DATABASE_URL` to the local pooled URL and the `NEXT_PUBLIC_SUPABASE_*` values. Add Clerk as a third-party auth provider in `supabase/config.toml` (`[auth.third_party.clerk] enabled = true domain = "<your-clerk-domain>"`).
3. `pnpm dev` and `pnpm inngest:dev`.
4. Sign up at `/sign-up`, create an organization at `/onboarding`, and you land on `/w/<slug>/home`.

## Deployment (docs/14)

Vercel project linked to this repo, framework Next.js, `pnpm install --frozen-lockfile`, environment variables from `.env.example`. Supabase production project with the migration pushed (`supabase db push`). Clerk production instance with the webhook pointed at `https://<app-domain>/api/webhooks/clerk`.

## Conventions that trip people up

- No em dashes or en dashes anywhere; CI and ESLint both fail on them.
- No raw colors in `components/` or `app/`; use tokens (`bg-surface`, `text-fg-secondary`, `border-border`, `data-color="blue"` with `bg-item` or `bg-item-tint`).
- React compiler lint rules are on: never call setState inside an effect; use lazy initializers or the "adjust state during render" pattern (see `lib/client/spec-store.ts`).
- Inngest 4 API: `eventType()` schemas and `createFunction({ id, triggers: [event] }, handler)`.
- Next.js 16: middleware lives in `proxy.ts`; route `params` and `searchParams` are Promises.
- `Button asChild` renders a Slot and must receive exactly one child element.
