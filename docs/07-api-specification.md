# 07. API Specification

Version 1.0, 03 Nov 2026. Owner: Engineering.

## 1. Two surfaces, one service layer

TaskParty exposes the same domain services through two surfaces:

1. **Server Actions** used by the first-party web client. Typed end to end, no versioning, change freely.
2. **Public REST API** at `/api/v1` for integrations, scripts, and the marketplace. Versioned, documented with OpenAPI, stable.

Both call functions in `/lib/services`. Authorization (document 08) and validation (Zod) happen in the service layer, so neither surface can bypass them.

## 2. Public REST API conventions

- Base URL: `https://app.<domain>/api/v1`
- Authentication: `Authorization: Bearer tp_live_...` (API key) or an OAuth 2.0 access token (phase 3 marketplace).
- Workspace scoping: API keys belong to one workspace; all resources are implicitly scoped to it.
- Content type: `application/json; charset=utf-8`.
- IDs: UUIDs. Tasks also accept their human key (`MKT-142`) in path parameters.
- Timestamps: ISO 8601 UTC. Dates: `YYYY-MM-DD`.
- Pagination: cursor based. Requests take `limit` (default 50, max 200) and `cursor`; responses include `next_cursor` or null. In v1 the cursor is an opaque offset into the sorted result, which stays stable for a given sort.
- Filtering on list endpoints: a `filter` query parameter containing a URL-encoded ViewSpec filter group, plus common shortcuts (`assignee=me`, `status_category=in_progress`, `due_before=2026-12-01`).
- Field selection: `fields=title,status,assignee` to trim payloads; `expand=assignee,status,custom_fields` to inline related objects.
- Rate limits: 600 requests per minute per key, burst 100. Headers `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`. Exceeding returns 429 with `Retry-After`. The v1 limiter is a token bucket per server instance; a shared store (Upstash) replaces it when traffic justifies the dependency.
- Idempotency: `Idempotency-Key` header honored on POST for 24 hours (per server instance in v1, same note as rate limits).
- Concurrency: PATCH accepts `If-Match: <version>`; a stale version returns 409 with the current object.

### Error contract

```json
{
  "error": {
    "code": "validation_failed",
    "message": "due_date must be on or after start_date",
    "details": [{ "path": "due_date", "message": "must be on or after start_date" }],
    "request_id": "req_01J..."
  }
}
```

Codes: `unauthorized` (401), `forbidden` (403), `not_found` (404), `validation_failed` (422), `conflict` (409), `rate_limited` (429), `dependency_cycle` (422), `internal` (500).

## 3. Resources and endpoints

### Workspace

| Method | Path | Description |
|---|---|---|
| GET | /workspace | Current workspace |
| GET | /members | List members with roles |
| GET | /teams | List teams |
| GET | /users/{id} | User profile (name, avatar, timezone) |

### Projects

| Method | Path | Description |
|---|---|---|
| GET | /projects | List projects (filters: team, archived, privacy) |
| POST | /projects | Create (name, key, team_id, workflow_id or template_id, privacy, owner_id, dates) |
| GET | /projects/{id} | Get with expand options (sections, statuses, fields, members) |
| PATCH | /projects/{id} | Update |
| DELETE | /projects/{id} | Soft delete |
| POST | /projects/{id}/archive, /unarchive | |
| GET, POST | /projects/{id}/sections | |
| PATCH, DELETE | /sections/{id} | |
| GET, POST | /projects/{id}/cycles | |
| PATCH | /cycles/{id} | Includes close |
| GET, POST | /projects/{id}/status-updates | |
| GET, POST | /projects/{id}/baselines | |
| GET, POST | /projects/{id}/views | Saved views |
| PATCH, DELETE | /views/{id} | |
| GET | /projects/{id}/members | |
| PUT, DELETE | /projects/{id}/members/{userId} | Set or remove project role |

### Tasks

| Method | Path | Description |
|---|---|---|
| GET | /tasks | List across workspace with filter, sort, cursor |
| GET | /projects/{id}/tasks | List within project; accepts `view_id` to apply a saved view's spec |
| POST | /projects/{id}/tasks | Create (title, section_id, parent_id, status_id, assignee_id, dates, priority, estimate, custom_fields, tags) |
| GET | /tasks/{idOrKey} | Get with expand (subtasks, comments, attachments, dependencies, custom_fields, events) |
| PATCH | /tasks/{idOrKey} | Update any field; `If-Match` supported |
| DELETE | /tasks/{idOrKey} | Soft delete |
| POST | /tasks/{id}/restore | |
| POST | /tasks/{id}/move | section_id, position, or project_id |
| POST | /tasks/{id}/duplicate | include_subtasks |
| POST | /tasks/bulk | Up to 500 operations: `[{ "id": "...", "patch": { ... } }]` |
| GET, POST | /tasks/{id}/subtasks | |
| GET, POST | /tasks/{id}/comments | |
| PATCH, DELETE | /comments/{id} | |
| POST, DELETE | /comments/{id}/reactions | |
| GET, POST | /tasks/{id}/attachments | POST returns a signed upload URL; a second call confirms |
| DELETE | /attachments/{id} | |
| GET, POST, DELETE | /tasks/{id}/dependencies | Body: predecessor_id, type, lag_days |
| PUT, DELETE | /tasks/{id}/tags/{tagId} | |
| PUT, DELETE | /tasks/{id}/followers/{userId} | |
| GET | /tasks/{id}/events | Activity history |
| POST | /tasks/{id}/projects | Multi-home into another project |

### Fields, tags, workflows

| Method | Path | Description |
|---|---|---|
| GET, POST | /fields | Workspace field library |
| GET, POST | /projects/{id}/fields | Project fields; POST adopts a library field or creates a project field |
| PATCH, DELETE | /fields/{id} | |
| GET, POST | /tags | |
| GET | /projects/{id}/workflow | The project's statuses (workflows are per project in the data model, so there is no workspace level list) |
| PATCH | /projects/{id}/workflow | Replace statuses atomically |

### Portfolios and goals

| Method | Path | Description |
|---|---|---|
| GET, POST | /portfolios | |
| PATCH, DELETE | /portfolios/{id} | |
| PUT, DELETE | /portfolios/{id}/projects/{projectId} | |
| GET, POST | /goals | |
| PATCH, DELETE | /goals/{id} | |
| POST, DELETE | /goals/{id}/links | project_id or task_id |

### Forms and automations (phase 2)

| Method | Path | Description |
|---|---|---|
| GET, POST | /projects/{id}/forms | |
| PATCH, DELETE | /forms/{id} | |
| GET | /forms/{id}/submissions | |
| GET, POST | /automations | |
| PATCH, DELETE | /automations/{id} | |
| GET | /automations/{id}/runs | |
| POST | /automations/{id}/test | Dry run against a task id |

### Integrations

| Method | Path | Description |
|---|---|---|
| GET, POST | /webhooks | |
| PATCH, DELETE | /webhooks/{id} | |
| GET | /webhooks/{id}/deliveries | |
| POST | /webhooks/{id}/deliveries/{deliveryId}/replay | |
| GET, POST | /inbound-webhooks | |
| GET | /events | Workspace-wide event stream with `since` cursor, for polling integrations |
| GET | /search?q= | Full-text search |

### Public form submission (no auth)

`POST /api/public/forms/{token}` accepts form data and attachments, protected by Turnstile and per-IP rate limits.

### Implementation status (v1 build)

Implemented in `app/api/v1`: workspace, members, users, projects (list, create, get, update, delete, archive, unarchive, sections, cycles, status updates, views, members list, workflow, fields, tasks), tasks (list across the workspace, get by id or key, update with `If-Match`, delete, restore, move, bulk, subtasks, comments, dependencies, tags, events), fields, tags, events, search, webhooks, and `openapi.json`. Not yet implemented: project member role changes, duplicate, attachments, reactions, followers, multi-home, portfolios, goals, forms, automations, and inbound webhooks. Keys with the `read` scope cannot write; `admin` is needed for fields, tags, and webhooks.

## 4. Object shapes (abridged)

```json
{
  "id": "01J9...",
  "key": "MKT-142",
  "project_id": "01J9...",
  "section_id": "01J9...",
  "parent_id": null,
  "title": "Draft launch email",
  "description": { "type": "doc", "content": [] },
  "status": { "id": "01J9...", "name": "In progress", "category": "in_progress", "color": "#0F6CBD" },
  "priority": "high",
  "assignee": { "id": "01J9...", "display_name": "Dana Ortiz", "avatar_url": "..." },
  "start_date": "2026-11-10",
  "due_date": "2026-11-14",
  "due_time": null,
  "estimate": 3,
  "is_milestone": false,
  "cycle_id": null,
  "tags": [{ "id": "...", "name": "Email", "color": "#107C10" }],
  "custom_fields": { "fld_channel": { "type": "single_select", "value": "opt_email" } },
  "dependencies": { "predecessors": [{ "task_id": "...", "type": "fs", "lag_days": 0 }], "successors": [] },
  "subtask_count": 4,
  "subtask_done_count": 1,
  "comment_count": 6,
  "version": 17,
  "created_by": "01J9...",
  "created_at": "2026-11-01T18:22:10Z",
  "updated_at": "2026-11-03T06:48:31Z",
  "completed_at": null,
  "url": "https://app.<domain>/w/acme/projects/MKT/tasks/MKT-142"
}
```

## 5. Server Actions (first-party client)

Located in `/app/(app)/.../actions.ts` and `/lib/actions/*.ts`. All take a Zod-validated input and return `{ ok: true, data } | { ok: false, error }`. Representative list:

- `createTask`, `updateTask`, `moveTask`, `deleteTask`, `restoreTask`, `bulkUpdateTasks`, `duplicateTask`
- `addDependency`, `removeDependency`
- `addComment`, `editComment`, `deleteComment`, `toggleReaction`
- `requestUploadUrl`, `confirmAttachment`, `removeAttachment`
- `createProject`, `updateProject`, `archiveProject`, `createSection`, `reorderSections`
- `saveView`, `updateView`, `deleteView`, `setDefaultView`
- `createCycle`, `closeCycle`, `planCycle`
- `postStatusUpdate`, `saveBaseline`
- `setNotificationPreference`, `markNotificationsRead`, `snoozeNotification`
- `inviteMembers`, `setMemberRole`, `removeMember`
- `createApiKey`, `revokeApiKey`, `createWebhook`, `replayDelivery`

## 6. Realtime channels (client subscriptions)

| Channel | Payload | Purpose |
|---|---|---|
| `project:{id}` | Postgres Changes on tasks, sections, comments, task_events filtered by project_id | Keep open views current |
| `task:{id}` | Presence (who is viewing), broadcast `typing` | Task pane collaboration |
| `user:{id}` | Postgres Changes on notifications filtered by user_id | Inbox badge |

## 7. Webhook event catalog

See document 12, section 2 for payloads. Event types mirror `task_events.type` plus `project.*`, `cycle.*`, `status_update.posted`, `form.submitted`, `member.*`.

## 8. OpenAPI

The OpenAPI 3.1 document is generated from the Zod schemas with `zod-openapi` and served at `/api/v1/openapi.json`, with reference documentation rendered at `/developers` on the marketing site (document 13). Phase 3 publishes TypeScript and Python SDKs generated from it.
