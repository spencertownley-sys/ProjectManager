# CLAUDE.md

Conventions for Claude Code sessions working in this repository. Read this before any change. The full specification is in `/docs`; `docs/16-build-guide.md` is the implementation sequence.

## What this is

TaskParty: a project management and team task management suite. Next.js App Router, TypeScript, Tailwind, Clerk for auth and organizations, Supabase Postgres through Drizzle, Supabase Realtime, Inngest for background jobs, deployed on Vercel from this GitHub repository.

## Non-negotiable rules

1. **No dash characters in text.** Never emit an em dash or an en dash in documentation, UI copy, comments, commit messages, or string literals. Use commas, colons, parentheses, or separate sentences. CI fails on these characters in `/docs`, and the `no-dash-characters` lint rule covers source.
2. **Fonts.** Only the font stack in `docs/09-design-system.md` section 2: Segoe UI system stack with Aptos, Calibri, Selawik, Arial fallbacks; Cascadia Code for monospace. Never add Inter, Roboto, Geist, or any Google Font.
3. **Colors.** Only tokens from `app/globals.css`. No raw hex, rgb, or Tailwind palette colors in components. The `no-raw-color` lint rule enforces this.
4. **Look.** Follow `docs/09-design-system.md` section 1 anti-goals: no gradients, glass effects, glows, emoji in chrome, oversized radii, nested cards, or centered app layouts. 14 px body text, semibold headings, 4 px grid, 1 px borders.
5. **Copy.** Sentence case everywhere. No exclamation marks. Verbs on buttons.
6. **Authorization.** Every service function calls `authorize()` from `lib/auth/permissions.ts` before reading or writing. Server Actions and route handlers never query the database directly; they call services.
7. **Events.** Every mutation writes to the event log in the same transaction (`lib/events`). Notifications, automations, and webhooks derive from events; never call them directly from a mutation.
8. **Schema.** `supabase/migrations/*.sql` is the source of truth. Never edit a merged migration; add a new one. Regenerate `lib/db/schema.ts` with `drizzle-kit introspect` after migrating.
9. **Validation.** Zod schemas in `lib/validation` are shared by client forms, server actions, and API routes. Validate at every boundary.
10. **Tests.** New logic in `lib/` gets unit tests. New views get a Playwright test for the primary interaction. Run `pnpm lint && pnpm typecheck && pnpm test` before declaring a step done.
11. **Dependencies.** Add nothing beyond the list in `docs/05-technical-architecture.md` section 2 without recording why in `docs/notes/decisions.md`.
12. **Secrets.** Never commit secrets. Add new variable names to `.env.example` with a comment.

## Commands

```
pnpm dev            # Next.js dev server
pnpm inngest:dev    # Inngest dev server
pnpm lint
pnpm typecheck
pnpm test           # Vitest
pnpm test:e2e       # Playwright
pnpm build
supabase start | supabase db reset | supabase db push
```

## Where things live

See `docs/05-technical-architecture.md` section 4 for the directory layout. Views live in `components/views/<view>`, the shared timeline engine in `components/views/engine`, services in `lib/services`, the query engine in `lib/query-engine`.

## Working style

- Plan first with a task list, keep diffs focused, one step from the build guide per pull request where practical.
- Conventional commits: `feat(scope): summary`, `fix(scope): summary`, `docs: summary`.
- When implementation must deviate from a document, update that document in the same pull request and say why in the pull request description.
- Prefer server components for shells and client components only where interaction requires it.
- Optimistic updates for every task mutation with rollback on failure.
