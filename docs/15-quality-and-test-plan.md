# 15. Quality and Test Plan

Version 1.0, 03 Nov 2026. Owner: Engineering.

## 1. Strategy

Test the layers that carry the most risk at the level where failures are cheapest to find:

| Layer | Tool | What is covered | Target |
|---|---|---|---|
| Unit | Vitest | Query engine (ViewSpec to SQL), permission matrix, dependency and scheduling math, formula evaluation, date and recurrence logic, Zod schemas | 90 percent line coverage on `/lib` |
| Component | Vitest plus Testing Library | Field editors, task pane sections, command bar, filter builder, each view with fixture data, keyboard interactions | Every component in document 09, section 6 has a test for each state |
| Integration | Vitest against a Supabase test database | Services end to end: create task writes events, RLS policies, triggers (task numbering, cycle guard), realtime publication | All service functions |
| End to end | Playwright | User journeys in section 3 against preview deployments | All P0 journeys green before merge |
| Visual regression | Playwright screenshots with Chromatic or Argos | Each view at 1440 and 768, light and dark | No unreviewed diffs |
| Accessibility | axe-core in Playwright, manual screen reader pass per phase | WCAG 2.2 AA | Zero serious or critical axe violations |
| Performance | Playwright traces and k6 | Budgets in section 6 against the reference dataset | Within budget |
| Security | pnpm audit, Semgrep, dependency review, periodic penetration test (phase 2) | OWASP ASVS L2 | No high findings open |

## 2. Test data

- Fixtures: `tests/fixtures/*.ts` build workspaces, projects, and tasks with a builder API.
- Reference dataset: `scripts/seed.ts` (document 06, section 8).
- Playwright uses a dedicated Clerk development instance with test users created through Clerk's testing tokens, bypassing email codes.

## 3. End-to-end journeys (P0)

1. Sign up with email, complete onboarding, land on a starter project, add three tasks, invite a teammate.
2. Create a task in List, set assignee, dates, priority, custom field; verify it in Table, Board, Gantt, Calendar, and My Work without changing filters.
3. Apply a filter in List, switch to Board, confirm the same tasks appear; save as a shared view; open the saved view from a second user.
4. Drag a card between Board columns; the second user sees the change within 2 seconds.
5. Create two tasks in Gantt, draw a finish-to-start dependency, enable auto-schedule, move the predecessor, verify the successor moved and the activity log shows both changes with the actor.
6. Attempt a circular dependency and verify the error message.
7. Open the task pane, add a comment with an @mention, verify the mentioned user receives an in-app notification and an email.
8. Create a cycle, drag backlog tasks into it, complete some, verify burndown values.
9. Post a status update and verify it appears on the workspace home and portfolio.
10. Import a CSV with mapping and verify rows, including dates and select fields.
11. Create an API key, create a task through the REST API, verify it appears in the UI and emits a webhook delivery to a test receiver with a valid signature.
12. Change a member to guest and verify project visibility narrows accordingly.
13. Keyboard-only: create a task, assign, set status, move a Board card with Space and arrows, open and close the pane.
14. Mobile viewport: complete journey 2 on a 390 px viewport (Gantt read-only).

## 4. Acceptance gates per story

Each story in document 03 is done when:

- Acceptance criteria are encoded as tests (unit, component, or e2e as appropriate) and pass in CI.
- The screen matches the spec in documents 10 and 11 at 1440 and 768 widths, light and dark.
- No new axe violations.
- Copy reviewed against document 09, section 8 (sentence case, no dashes, no exclamation marks).
- Analytics events from document 02, section 7 fire where applicable.

## 5. Definition of done per phase

See document 04, section 4.

## 6. Performance budgets

Measured on the reference dataset, mid-range laptop profile (4x CPU throttling), fast 3G for FCP and LCP checks, cable for interaction checks.

| Metric | Budget |
|---|---|
| FCP, List view, cold | 1.5 s |
| LCP, List view, cold | 2.5 s |
| Time to interactive, List view | 3.0 s |
| View switch (List to Board, 10,000 tasks, warm) | 300 ms until first paint of the new view |
| Scroll frame rate, any view, 10,000 tasks | 60 fps, no frame over 50 ms |
| Drag start to visual lift | 16 ms |
| Optimistic update to paint | 16 ms |
| Server action P95 (update task) | 400 ms |
| Gantt initial render, 5,000 tasks, 2,000 dependencies | 800 ms |
| Critical path computation, 5,000 tasks | 200 ms (web worker) |
| Workload computation, 50 people, 8 weeks | 300 ms |
| Search query P95 | 300 ms |
| Realtime propagation (change by user A visible to user B) | 2 s P95 |
| Initial JavaScript for the application shell | 250 KB gzipped; each view lazy-loaded under 150 KB |
| API endpoint P95 (list tasks, 200 rows) | 500 ms |

Budgets are asserted in CI with Playwright performance traces and Lighthouse CI; a regression over 10 percent fails the build.

## 7. Load testing

k6 scenarios run against staging before each release: 500 concurrent users across 50 workspaces performing a mix of list reads (60 percent), task updates (30 percent), and comments (10 percent) for 15 minutes; API clients at 50 requests per second. Pass criteria: P95 within budgets, error rate under 0.1 percent, database CPU under 70 percent.

## 8. Defect severity

| Severity | Definition | Response |
|---|---|---|
| S1 | Data loss, security exposure, application down for many users | Hotfix within 4 hours, incident review |
| S2 | Core journey blocked, no workaround | Fix within 2 business days |
| S3 | Degraded feature with workaround | Next release |
| S4 | Cosmetic | Backlog |

## 9. Release checklist

1. All CI checks green on the release candidate.
2. P0 journeys pass on staging.
3. Load test within budgets.
4. Migration reviewed for backward compatibility with the previous deployment (expand and contract pattern).
5. Feature flags set for the release.
6. Changelog entry written.
7. Rollback plan confirmed.
8. Tag and promote.
9. Post-release smoke test on production (journeys 1, 2, 4, 11).
