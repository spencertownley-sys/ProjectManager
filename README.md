# TaskParty

Free for all workspaces during the beta. Early adopters receive a reduced price when paid tiers launch.

TaskParty is a project management and team task management suite for cross-functional teams. It combines the scheduling depth of Asana and Smartsheet, the speed of Linear, and the visual flexibility of Monday.com in one product that looks and behaves like it belongs alongside the Microsoft 365 applications teams already use.

This repository holds the product, design, and engineering documentation for TaskParty, followed by the application itself.

## Status

| Phase | State |
|---|---|
| Documentation set | Complete (v1.0, November 2026) |
| Application scaffold | Complete (Phase 0) |
| MVP build | In progress: shell, task pane, List view, Home, My work done; Board, Table, Gantt, Timeline, Calendar next. See HANDOFF.md |

## Document index

Read the documents in order the first time. Each one assumes the ones before it.

| # | Document | Purpose |
|---|---|---|
| 01 | [Market and workflow research](docs/01-market-research.md) | What the leading tools do well, what they do badly, and which workflows teams actually run |
| 02 | [Product requirements document](docs/02-prd.md) | Vision, personas, scope, functional and non-functional requirements, success metrics |
| 03 | [User stories and backlog](docs/03-user-stories-and-backlog.md) | Epics, stories, acceptance criteria, priority |
| 04 | [Roadmap and release plan](docs/04-roadmap-and-release-plan.md) | Phased delivery from MVP through enterprise |
| 05 | [Technical architecture](docs/05-technical-architecture.md) | Stack, system diagram, key decisions and their reasons |
| 06 | [Data model](docs/06-data-model.md) | Entities, relationships, SQL schema, indexing |
| 07 | [API specification](docs/07-api-specification.md) | REST endpoints, server actions, realtime channels, error contract |
| 08 | [Authentication and permissions](docs/08-auth-and-permissions.md) | Clerk setup, organizations, roles, permission matrix |
| 09 | [Design system](docs/09-design-system.md) | Typography, color, spacing, components, motion, accessibility |
| 10 | [Application screens](docs/10-application-screens.md) | Every authenticated screen, its layout, states, and interactions |
| 11 | [Views specification](docs/11-views-specification.md) | List, Board, Table, Gantt, Timeline, Calendar, Workload, Dashboard, My Work |
| 12 | [Integrations and webhooks](docs/12-integrations-and-webhooks.md) | Inbound and outbound webhooks, connectors, app marketplace model |
| 13 | [Marketing site](docs/13-marketing-site.md) | Public website pages, copy direction, pricing page |
| 14 | [Deployment and operations](docs/14-deployment-and-operations.md) | GitHub, Vercel, Supabase, environments, CI, monitoring |
| 15 | [Quality and test plan](docs/15-quality-and-test-plan.md) | Test strategy, acceptance gates, performance budgets |
| 16 | [Build guide](docs/16-build-guide.md) | Step-by-step implementation sequence for Claude Code |

Supporting files:

- `HANDOFF.md` is the current build state and the next steps for a Claude Code session.
- `supabase/migrations/0001_initial_schema.sql` is the executable form of the data model.
- `.env.example` lists every environment variable the application needs.
- `.github/workflows/ci.yml` runs lint, type checks, and tests on every pull request.
- `CLAUDE.md` gives Claude Code the conventions it must follow when building in this repository.

## Writing conventions used in these documents

- No em dashes or en dashes anywhere in documentation, UI copy, or code comments. Use commas, colons, parentheses, or separate sentences.
- Font families are limited to those shipped with Microsoft 365: Segoe UI (primary), Aptos, Calibri, Arial, and Cascadia Code for monospace.
- Spelling is US English. Dates are written as 03 Nov 2026 in prose and ISO 8601 in data.
- Requirements use MUST, SHOULD, and MAY in the RFC 2119 sense.

## Stack at a glance

- Next.js (App Router) with TypeScript
- Tailwind CSS with a Fluent-aligned token set, shadcn/ui primitives restyled to match
- Clerk for authentication, organizations, and role management
- Supabase Postgres (accessed through Drizzle ORM) with Supabase Realtime for live updates
- Vercel for hosting, connected to this GitHub repository
- Resend for transactional email, Inngest for background jobs and scheduled automations

See docs/05-technical-architecture.md for the reasoning behind each choice.
