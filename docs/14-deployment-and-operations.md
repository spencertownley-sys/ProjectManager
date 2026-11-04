# 14. Deployment and Operations

Version 1.0, 03 Nov 2026. Owner: Engineering.

## 1. Repository

`https://github.com/spencertownley-sys/ProjectManager` (default branch `main`).

Branch model: trunk-based. Short-lived branches `feat/<area>-<summary>`, `fix/<summary>`, `docs/<summary>`; pull requests into `main`; squash merge; conventional commit messages (`feat(gantt): add baseline toggle`).

Protection on `main`: pull request required, CI status checks required, linear history, no force push. Dependabot for npm with weekly grouped updates.

## 2. Environments

| Environment | Source | URL | Database | Clerk instance | Purpose |
|---|---|---|---|---|---|
| Local | developer machine | http://localhost:3000 | Supabase local (CLI) or a dev project | Development | Build and test |
| Preview | every pull request | `<branch>-projectmanager.vercel.app` | Supabase branch per PR (Supabase Branching) | Development | Review |
| Staging | `main` | staging.<domain> | Supabase staging project | Development | Pre-release checks, pilot workspaces |
| Production | tag `v*` promoted from staging | app.<domain> | Supabase production project | Production | Customers |

Promotion: merging to `main` deploys staging automatically. A release is cut by tagging (`v1.4.0`), which triggers the production deployment through the GitHub Actions workflow and Vercel's promote step. Rollback is "promote the previous production deployment" in Vercel plus, if a migration must be reverted, a forward-fix migration (migrations are never edited after merge).

## 3. Vercel configuration

- Project linked to the GitHub repository; framework preset Next.js; install command `pnpm install --frozen-lockfile`; build command `pnpm build`.
- Node.js 22 runtime for data routes; Edge runtime for middleware and marketing pages.
- Environment variables set per environment (see `.env.example`). Secrets never committed.
- Vercel Cron is not used; schedules run in Inngest.
- Speed Insights and Web Analytics enabled; Vercel Firewall rate rules on `/api/public/*` and `/sign-in`.
- Custom domains: `app.<domain>` for the application, `<domain>` and `www.<domain>` for marketing, `mail.<domain>` MX to Resend for inbound email.

## 4. Supabase configuration

- Production project in `us-west-1` (closest to the Seattle area team) with Point-in-Time Recovery enabled and daily backups retained 30 days.
- Connection: pooled connection string (Supavisor, transaction mode) for the application; direct connection only for migrations in CI.
- Row-level security enabled as in the schema; the anon key is used in the browser only with Clerk third-party auth for Realtime.
- Storage buckets: `attachments` (private), `avatars` (public read), `exports` (private, 7-day lifecycle).
- Realtime: enabled on the publication tables in the schema; max concurrent clients monitored.
- Third-party auth: Clerk provider configured in each project (development instance for staging and previews, production instance for production).

Migrations: `supabase/migrations/*.sql` applied with `supabase db push` in CI against staging on merge and against production on release. Drizzle schema in `/lib/db/schema.ts` is generated from the database with `drizzle-kit introspect` after each migration so the SQL remains the source of truth.

## 5. Clerk configuration

Two instances: Development (used by local, preview, staging) and Production. Webhook endpoints registered per environment. Production instance uses the custom domain `clerk.<domain>` for the Frontend API. Settings as in document 08, section 2.

## 6. Other services

| Service | Use | Environment separation |
|---|---|---|
| Inngest | Background functions | Inngest environments mirror Vercel environments through the Vercel integration |
| Resend | Email | Separate API keys; staging sends only to allowlisted domains |
| Stripe | Billing (phase 2) | Test mode for non-production |
| Sentry | Errors and tracing | One project, environment tag |
| PostHog | Analytics, feature flags | Separate projects for staging and production |
| Axiom | Log retention | Vercel log drain |
| Upstash Redis | Rate limiting, short-lived caches | Separate databases |
| Cloudflare Turnstile | Bot protection on public forms | |

## 7. Continuous integration

`.github/workflows/ci.yml` runs on every pull request and on `main`:

1. Install with pnpm cache.
2. `pnpm lint` (ESLint including the no-raw-color and no-dash-characters rules).
3. `pnpm typecheck`.
4. `pnpm test` (Vitest with coverage; threshold 80 percent on `/lib`).
5. `pnpm build`.
6. `pnpm test:e2e` (Playwright against the preview deployment URL once Vercel reports ready).
7. `pnpm audit --audit-level=high`.
8. Docs check: fail if any Markdown under `/docs` contains an em dash or en dash character.

`release.yml` runs on tags: applies migrations to production, promotes the deployment, creates a GitHub Release with the changelog section.

## 8. Secrets and configuration

All secrets live in Vercel environment variables and in GitHub Actions secrets for CI. `.env.example` documents each name. Local development uses `.env.local` (git-ignored). The `connections.credentials` column is encrypted with `CONNECTIONS_ENCRYPTION_KEY` (32 bytes, base64) using AES-256-GCM; rotation is a documented runbook in phase 2.

## 9. Monitoring and alerts

| Signal | Tool | Alert threshold |
|---|---|---|
| Error rate | Sentry | More than 1 percent of requests over 5 minutes |
| P95 server action latency | Sentry tracing | Above 800 ms for 10 minutes |
| Web Vitals | Vercel Speed Insights | LCP P75 above 2.5 s |
| Inngest function failures | Inngest | Any function with failure rate above 5 percent in an hour |
| Webhook delivery failures | Inngest and application metric | Above 5 percent in an hour |
| Database CPU and connections | Supabase | CPU above 70 percent for 15 minutes; connections above 80 percent of pool |
| Realtime connections | Supabase | Above 80 percent of plan limit |
| Uptime | External probe (Better Stack) | Two consecutive failed checks on `/api/health` |

Alerts route to a Slack or Teams channel and to email. `/api/health` checks database connectivity and Clerk reachability.

## 10. Backups and disaster recovery

- Supabase PITR with 7-day window plus daily snapshots retained 30 days; restore drill quarterly.
- Storage buckets replicated by Supabase; attachments additionally exported weekly to a cold bucket (phase 2).
- Recovery time objective 4 hours; recovery point objective 15 minutes.
- Workspace export (document 02, FR-ADM-03) doubles as customer-side backup.

## 11. Runbooks (to be written during Phase 0 and 1)

Deploy a release; roll back a release; apply a hotfix migration; rotate Clerk webhook secret; rotate connections encryption key; disable a misbehaving webhook; restore a deleted workspace; respond to a Realtime outage (switch clients to polling via feature flag); handle a Clerk outage (read-only mode banner).

## 12. Local development

```
pnpm install
cp .env.example .env.local        # fill in Clerk development keys and Supabase local values
supabase start                     # local Postgres, Realtime, Storage
supabase db reset                  # applies migrations and seed
pnpm dev                           # http://localhost:3000
pnpm inngest:dev                   # Inngest dev server at http://localhost:8288
```

Seed data (`scripts/seed.ts`) creates the reference dataset from document 06, section 8 with a demo workspace the developer joins through a Clerk development user.
