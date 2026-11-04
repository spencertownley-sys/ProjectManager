# 05. Technical Architecture

Version 1.0, 03 Nov 2026. Owner: Engineering.

## 1. Summary

TaskParty is a single Next.js application (App Router, TypeScript) deployed on Vercel from the GitHub repository `spencertownley-sys/ProjectManager`. Authentication, organizations, and sessions are handled by Clerk. Data lives in Supabase Postgres, accessed through Drizzle ORM from server code only. Supabase Realtime broadcasts row changes to connected clients. Background work (automations, notifications, webhook delivery, imports) runs on Inngest. Email is sent through Resend. Files are stored in Supabase Storage.

```
+---------------------------------------------------------------+
|  Browser (React 19, TanStack Query, Zustand, dnd-kit)         |
|  Views: List, Board, Table, Gantt, Timeline, Calendar, ...    |
+---------------------+-------------------------+---------------+
                      |                         |
             HTTPS (server actions,     WebSocket (Supabase Realtime)
             route handlers, REST API)          |
                      |                         |
+---------------------v-------------------------v---------------+
|  Vercel: Next.js App Router                                   |
|  - proxy.ts / middleware.ts: clerkMiddleware                  |
|  - Server Components and Server Actions                       |
|  - Route handlers: /api/v1/* (public REST), /api/webhooks/*   |
|  - Authorization layer (document 08)                          |
|  - Query engine (filter / sort / group -> SQL)                |
|  - Event emitter (every mutation -> events table + Inngest)   |
+---------+-----------------+----------------+------------------+
          |                 |                |
+---------v------+  +-------v-------+  +-----v------------------+
| Supabase       |  | Inngest       |  | Clerk                  |
| Postgres + RLS |  | automations,  |  | users, orgs, sessions, |
| Realtime       |  | notifications,|  | webhooks -> member sync|
| Storage        |  | webhooks,     |  +------------------------+
+----------------+  | imports, cron |
                    +-------+-------+
                            |
                   +--------v--------+   +------------------+
                   | Resend (email)  |   | Slack, Teams,    |
                   +-----------------+   | GitHub, Zapier   |
                                         +------------------+
```

## 2. Stack and versions

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript 5 strict | Middleware file is `proxy.ts` on Next.js 16 (Clerk docs). Cache Components on by default; wrap auth-dependent UI in Suspense. |
| Styling | Tailwind CSS 4 with CSS variables for tokens; shadcn/ui primitives (Radix) restyled to the TaskParty design system | No component library theme is used as-is. |
| State | TanStack Query for server state with optimistic updates; Zustand for view state (selection, pane, drag) | |
| Drag and drop | dnd-kit | Used in List, Board, Gantt, Calendar, Workload. |
| Tables and virtualization | TanStack Table, TanStack Virtual | Table and List; Gantt uses its own virtualized renderer. |
| Timeline engine | In-house: a date-to-pixel scale, virtualized row and column rendering, SVG for bars and dependency connectors | Shared by Gantt, Timeline, Calendar week view, Workload. SVAR React Gantt (MIT) evaluated as an accelerator; see decision 7. |
| Charts | Recharts for Dashboard widgets, burndown, velocity | |
| Rich text | Tiptap (ProseMirror) for descriptions and comments | Mentions, attachments, code blocks. |
| Forms and validation | React Hook Form, Zod (schemas shared between client, server actions, and API) | |
| Auth | Clerk (`@clerk/nextjs`) with Organizations | |
| Database | Supabase Postgres 16, Drizzle ORM, `pg` driver via Supabase connection pooler | |
| Realtime | Supabase Realtime (Postgres Changes on `tasks`, `comments`, `task_events`; Presence per task) | |
| Storage | Supabase Storage, private buckets, signed URLs | |
| Background jobs | Inngest (event-driven functions, steps, retries, cron) | |
| Email | Resend with React Email templates | |
| Payments | Stripe (phase 2) | |
| Search | Postgres full-text search (`tsvector`) for v1; Typesense evaluated for phase 3 | |
| Analytics | PostHog (product analytics, feature flags, session replay with masking) | |
| Errors and tracing | Sentry | |
| Logging | Vercel logs plus structured JSON via Pino; shipped to Axiom | |
| Testing | Vitest, Testing Library, Playwright | |
| Package manager | pnpm | |

## 3. Key decisions

Each decision records the alternatives and the reason, in the style of a short architecture decision record.

### Decision 1: Next.js on Vercel over a separate API service

Alternatives: NestJS or Fastify API with a React SPA; Remix.
Reason: one deployable, one language, one type system from database to UI. Server Actions give typed mutations without an API layer for the first-party client; route handlers expose the same service functions as the public REST API. Vercel preview deployments per pull request fit the GitHub workflow the user asked for.

### Decision 2: Clerk for identity and organizations

Alternatives: Supabase Auth, Auth.js, WorkOS.
Reason: required by the product owner; Clerk Organizations map cleanly to workspaces, provide invitations, roles, and enterprise SSO later without rework. Clerk remains the source of truth for identity and membership; TaskParty stores a mirror of users and memberships (via Clerk webhooks) so joins and RLS work in Postgres.

### Decision 3: Postgres on Supabase with Drizzle, accessed from the server only

Alternatives: Prisma; Supabase client from the browser; PlanetScale; Neon.
Reason: Supabase bundles Postgres, Realtime, Storage, and row-level security in one account the product owner already uses. Drizzle produces SQL that is easy to inspect and performs well for the query engine. The browser never holds a database credential; all reads and writes pass through server code where authorization is enforced. Row-level security is enabled as a second layer using Clerk's third-party auth integration (document 08, section 6) so that the Realtime subscription from the browser only receives rows the user can read.

### Decision 4: Event log as the spine

Every mutation writes a row to `task_events` (or `project_events`, `workspace_events`) in the same transaction as the change. Activity history, notifications, automations, webhooks, and analytics all read from the event stream through Inngest. This avoids five separate code paths that drift apart and makes replay and audit possible.

### Decision 5: One query specification for every view

A `ViewSpec` object (filters, sorts, grouping, visible fields, view-specific options) is stored per saved view and in the user's session. The server translates it to SQL once. Each view component receives rows plus grouping metadata and renders them. Switching views never refetches unless the view needs extra data (Gantt needs dependencies; Workload needs capacity).

### Decision 6: Optimistic UI everywhere, realtime for others' changes

Mutations update the TanStack Query cache immediately, send the server action, and roll back on failure with a toast. Other users' changes arrive through Supabase Realtime and are merged by `updated_at` and a per-row version counter; a conflict (local pending change on a row that just changed remotely) is resolved last-writer-wins at field level with the remote change surfaced in the activity history. This approximates Linear's feel without a full local-first sync engine.

### Decision 7: Build the timeline engine in-house, evaluate SVAR as an accelerator

Alternatives: SVAR React Gantt (MIT core, PRO paid), DHTMLX, Bryntum, Syncfusion.
Reason: commercial Gantt libraries carry licensing cost and a visual style that fights the TaskParty design system. The engine is also needed for Timeline, Calendar week view, and Workload, which libraries do not cover. Plan: build the scale, virtualization, and bar rendering in-house in Phase 1. If dependency drawing and auto-scheduling prove slower to build than two weeks, adopt SVAR's MIT core for Gantt only, wrapped so its DOM is styled with TaskParty tokens, and keep the in-house engine for the other views.

### Decision 8: Inngest for background work

Alternatives: Vercel Cron plus queues; BullMQ on a worker; Trigger.dev.
Reason: Inngest runs inside the Next.js deployment, supports event-driven functions with durable steps and retries, has cron, and needs no separate worker infrastructure. Automations, notification fan-out, webhook delivery with retry, imports, and scheduled reminders all map to Inngest functions.

### Decision 9: Postgres full-text search for v1

Reason: adequate up to hundreds of thousands of tasks per workspace with `tsvector` columns and GIN indexes; avoids a second data store. Revisit in phase 3 if relevance or latency complaints appear.

## 4. Application structure

```
/app
  /(marketing)            public site: /, /features, /pricing, /changelog, /legal
  /(auth)                 /sign-in, /sign-up (Clerk components)
  /(app)
    /w/[workspaceSlug]
      /home               workspace home
      /my-work
      /inbox
      /projects/[projectKey]
        /list /board /table /gantt /timeline /calendar /workload /dashboard
        /views/[viewId]   saved view
      /portfolios/[id]
      /goals
      /settings/...
  /api
    /v1/...               public REST API (route handlers)
    /webhooks/clerk       Clerk user and org sync
    /webhooks/inbound/[token]
    /inngest              Inngest serve endpoint
/components
  /ui                     restyled primitives (button, input, menu, dialog, ...)
  /shell                  navigation rail, top bar, command bar, details pane
  /views                  one folder per view, plus /engine for the timeline engine
  /task                   task pane and field editors
/lib
  /auth                   Clerk helpers, authorization checks (document 08)
  /db                     Drizzle schema, migrations, query builders
  /query-engine           ViewSpec -> SQL
  /events                 event emitter and types
  /services               domain services used by both server actions and API
  /validation             Zod schemas
/inngest                  background functions
/emails                   React Email templates
/supabase/migrations      SQL migrations (source of truth for schema)
/docs                     this document set
```

## 5. Request lifecycle for a mutation

1. User drags a card to a new column. The Board updates the cache and renders immediately.
2. A server action `updateTask({ id, status })` runs. `proxy.ts` has already validated the Clerk session.
3. The action loads the caller's membership and project permission (document 08), validates input with Zod, and calls `taskService.update`.
4. The service runs one transaction: update `tasks`, increment `version`, insert `task_events`, update `tasks.search_vector`.
5. The transaction commits. Postgres Changes broadcasts the row to subscribers of the project channel; other clients merge it.
6. The service emits `task.updated` to Inngest. Inngest functions evaluate automations, generate notifications, deliver webhooks, and update analytics.
7. The action returns the updated task; the client reconciles its optimistic state.

## 6. Query engine

`ViewSpec` (Zod schema in `/lib/validation/view-spec.ts`):

```ts
{
  filters: FilterGroup            // { op: "and" | "or", items: (Filter | FilterGroup)[] }
  sorts: { field: FieldRef, direction: "asc" | "desc" }[]   // up to 3
  groupBy?: FieldRef
  subtasks: "nested" | "flat" | "hidden"
  visibleFields: FieldRef[]
  columnWidths?: Record<string, number>
  options: Record<string, unknown>  // per view type, for example gantt.zoom
}
```

`FieldRef` is either a standard field name or `custom:<fieldId>`. Filters support operators per type (is, is not, contains, is empty, before, after, between, is any of, is none of, is me, is current cycle). The engine produces a parameterized SQL query with joins to `task_field_values` only for referenced custom fields, applies pagination by cursor, and returns group counts in the same round trip.

## 7. Realtime design

- One Realtime channel per open project: `project:{projectId}`; one per task pane: `task:{taskId}` for presence and typing indicators.
- Postgres Changes filtered by `project_id` on `tasks`, `comments`, `task_events`, `sections`.
- Row-level security on these tables ensures a browser subscribed with a Clerk-issued token receives only rows it may read.
- Inactive tabs (Page Visibility API hidden for more than 5 minutes) unsubscribe and refetch on return.

## 8. Performance budgets

See document 15, section 6. Architectural measures: server components for shells, client components only for interactive views; cursor pagination with 200-row pages and prefetch; virtualization; memoized row renderers; `React.useTransition` for view switches; Edge runtime for the marketing site and middleware; Node runtime for data routes.

## 9. Observability

- Sentry on client and server with release tagging from the Git SHA.
- PostHog events listed in document 02, section 7; feature flags for phase-gated features.
- Structured logs with request id, workspace id, user id (hashed), and duration for every server action and route handler.
- Vercel Speed Insights for Web Vitals.
- Inngest dashboard for job success and retries; alerts on webhook delivery failure rate above 5 percent.

## 10. Security overview

Document 08 covers authorization in depth. Platform-level controls:

- All secrets in Vercel environment variables; none committed. `.env.example` lists names only.
- Clerk session verification in middleware for every non-public route.
- Zod validation at every boundary (server actions, route handlers, webhooks).
- Database access only from server code using the pooled connection string; the Supabase anon key is used in the browser solely for Realtime with a Clerk token and RLS.
- Signed URLs for file access, 15-minute expiry.
- HMAC signatures on outbound webhooks; shared secret on inbound webhooks; Clerk webhook signatures verified with Svix.
- Rate limiting on the public API (per key) and on auth-adjacent routes (Upstash Ratelimit).
- Dependency audit in CI (`pnpm audit`, Dependabot).
- Content Security Policy with nonces; `SameSite=Lax` cookies; HSTS.
