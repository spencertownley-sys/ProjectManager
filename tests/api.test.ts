import { describe, it, expect, beforeAll, vi } from "vitest";
import { createTestDb } from "./helpers/pglite";
import type { Database } from "@/lib/db/client";
import type { Actor } from "@/lib/auth/permissions";
import { upsertUser, upsertWorkspace, upsertMembership, resolveActor } from "@/lib/services/workspaces";
import { createProject } from "@/lib/services/projects";
import { createApiKey, listApiKeys, revokeApiKey, resolveApiKey, generateApiKey } from "@/lib/services/api-keys";
import { apiDeps } from "@/lib/api/handler";
import { GET as getWorkspace } from "@/app/api/v1/workspace/route";
import { GET as listProjectsRoute, POST as createProjectRoute } from "@/app/api/v1/projects/route";
import { GET as getProjectRoute } from "@/app/api/v1/projects/[id]/route";
import { GET as listTasksRoute, POST as createTaskRoute } from "@/app/api/v1/projects/[id]/tasks/route";
import { GET as getTaskRoute, PATCH as patchTaskRoute, DELETE as deleteTaskRoute } from "@/app/api/v1/tasks/[id]/route";
import { POST as bulkRoute } from "@/app/api/v1/tasks/bulk/route";
import { POST as addDependencyRoute, GET as listDependenciesRoute } from "@/app/api/v1/tasks/[id]/dependencies/route";
import { POST as addCommentRoute } from "@/app/api/v1/tasks/[id]/comments/route";
import { GET as eventsRoute } from "@/app/api/v1/events/route";
import { GET as searchRoute } from "@/app/api/v1/search/route";
import { GET as openapiRoute } from "@/app/api/v1/openapi.json/route";
import { POST as createTagRoute } from "@/app/api/v1/tags/route";
import { PUT as addTagRoute } from "@/app/api/v1/tasks/[id]/tags/[tagId]/route";

vi.mock("@/lib/events/dispatch", () => ({ dispatchAfterCommit: vi.fn(async () => undefined), dispatchImport: vi.fn(async () => undefined) }));

/*
  The public API end to end on PGlite: bearer auth, scopes, snake_case bodies, pagination, If-Match, bulk, and errors.
  Routes are called as functions with Request objects, exactly as Next invokes them.
*/

const BASE = "http://localhost:3000/api/v1";

function call(handler: (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>, method: string, path: string, options: { key?: string; body?: unknown; params?: Record<string, string>; headers?: Record<string, string> } = {}) {
  const req = new Request(`${BASE}${path}`, {
    method,
    headers: { ...(options.key ? { authorization: `Bearer ${options.key}` } : {}), ...(options.body !== undefined ? { "content-type": "application/json" } : {}), ...(options.headers ?? {}) },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  return handler(req, { params: Promise.resolve(options.params ?? {}) });
}

async function json(res: Response) {
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

describe("public API on PGlite", () => {
  let db: Database;
  let owner: Actor;
  let key: string;
  let readKey: string;
  let projectId: string;
  let taskId = "";
  let taskKey = "";
  let secondId = "";

  beforeAll(async () => {
    ({ db } = await createTestDb());
    apiDeps.getDb = () => db;
    apiDeps.now = () => new Date("2026-11-05T12:00:00Z");
    await upsertUser(db, { clerkUserId: "user_api_owner", email: "owner@example.com", displayName: "Owner", avatarUrl: null });
    await upsertWorkspace(db, { clerkOrgId: "org_api", slug: "acme", name: "Acme", logoUrl: null });
    await upsertMembership(db, "org_api", "user_api_owner", "org:owner");
    owner = (await resolveActor(db, "user_api_owner", "acme"))!.actor;
    const full = await createApiKey({ db, actor: owner }, { name: "CI", scopes: ["read", "write"] });
    key = full.key;
    readKey = (await createApiKey({ db, actor: owner }, { name: "Dashboard", scopes: ["read"] })).key;
    const project = await createProject({ db, actor: owner }, { name: "API project", key: "API", color: "blue", privacy: "workspace", workflowTemplate: "simple" }, "2026-11-05");
    projectId = project.id;
  });

  it("issues, resolves, lists, and revokes keys", async () => {
    expect(key).toMatch(/^tp_live_[A-Za-z0-9]{32}$/);
    const resolved = await resolveApiKey(db, key);
    expect(resolved?.actor).toMatchObject({ workspaceRole: "admin", scopes: ["read", "write"] });
    expect(await resolveApiKey(db, generateApiKey())).toBeNull();
    const keys = await listApiKeys({ db, actor: owner });
    expect(keys.map((k) => k.name).sort()).toEqual(["CI", "Dashboard"]);
    expect(keys[0].keyPrefix).toHaveLength(12);
    const temp = await createApiKey({ db, actor: owner }, { name: "Temp", scopes: ["read"] });
    await revokeApiKey({ db, actor: owner }, temp.record.id);
    expect(await resolveApiKey(db, temp.key)).toBeNull();
    await expect(createApiKey({ db, actor: { ...owner, workspaceRole: "member" } }, { name: "Nope", scopes: ["read"] })).rejects.toThrow();
  });

  it("rejects missing or bad keys with the error contract", async () => {
    const none = await call(getWorkspace, "GET", "/workspace");
    expect(none.status).toBe(401);
    const body = await json(none);
    expect(body.error.code).toBe("unauthorized");
    expect(body.error.request_id).toMatch(/^req_/);
    const bad = await call(getWorkspace, "GET", "/workspace", { key: "tp_live_nope" });
    expect(bad.status).toBe(401);
  });

  it("reads the workspace and projects with rate limit headers and snake_case", async () => {
    const res = await call(getWorkspace, "GET", "/workspace", { key });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-ratelimit-limit")).toBe("600");
    const ws = await json(res);
    expect(ws).toMatchObject({ slug: "acme", estimate_unit: "points", cycle_label: "Cycle" });
    const list = await json(await call(listProjectsRoute, "GET", "/projects?limit=10", { key }));
    expect(list.data[0]).toMatchObject({ key: "API", task_count: 0, url: expect.stringContaining("/w/acme/projects/API") });
    expect(list.next_cursor).toBeNull();
    const detail = await json(await call(getProjectRoute, "GET", `/projects/${projectId}?expand=sections,statuses`, { key, params: { id: projectId } }));
    expect(detail.sections).toHaveLength(3);
    expect(detail.statuses.map((s: { category: string }) => s.category)).toEqual(["not_started", "in_progress", "done"]);
  });

  it("creates, reads, updates, and lists tasks", async () => {
    const detail = await json(await call(getProjectRoute, "GET", `/projects/${projectId}?expand=sections`, { key, params: { id: projectId } }));
    const created = await call(createTaskRoute, "POST", `/projects/${projectId}/tasks`, { key, params: { id: projectId }, body: { title: "Ship the API", section_id: detail.sections[0].id, due_date: "2026-11-20", priority: "high", estimate: 3 } });
    expect(created.status).toBe(201);
    const task = await json(created);
    taskId = task.id;
    taskKey = task.key;
    expect(task).toMatchObject({ key: "API-1", due_date: "2026-11-20", priority: "high", estimate: 3, version: 1, status: { category: "not_started" }, url: expect.stringContaining("/tasks/API-1") });
    const second = await json(await call(createTaskRoute, "POST", `/projects/${projectId}/tasks`, { key, params: { id: projectId }, body: { title: "Write docs" } }));
    secondId = second.id;

    const byKey = await json(await call(getTaskRoute, "GET", `/tasks/${taskKey}`, { key, params: { id: taskKey } }));
    expect(byKey.id).toBe(taskId);
    expect(byKey.dependencies).toEqual({ predecessors: [], successors: [] });

    const patched = await call(patchTaskRoute, "PATCH", `/tasks/${taskId}`, { key, params: { id: taskId }, body: { title: "Ship the API v1", estimate: 5 }, headers: { "if-match": "1" } });
    expect(patched.status).toBe(200);
    expect(await json(patched)).toMatchObject({ title: "Ship the API v1", estimate: 5, version: 2 });
    const stale = await call(patchTaskRoute, "PATCH", `/tasks/${taskId}`, { key, params: { id: taskId }, body: { title: "Stale" }, headers: { "if-match": "1" } });
    expect(stale.status).toBe(409);
    const staleBody = await json(stale);
    expect(staleBody.error.code).toBe("conflict");
    expect(staleBody.error.current.version).toBe(2);

    const page1 = await json(await call(listTasksRoute, "GET", `/projects/${projectId}/tasks?limit=1&sort=title:asc`, { key, params: { id: projectId } }));
    expect(page1.data).toHaveLength(1);
    expect(page1.next_cursor).not.toBeNull();
    const page2 = await json(await call(listTasksRoute, "GET", `/projects/${projectId}/tasks?limit=1&sort=title:asc&cursor=${page1.next_cursor}`, { key, params: { id: projectId } }));
    expect(page2.data[0].id).not.toBe(page1.data[0].id);
    const filtered = await json(await call(listTasksRoute, "GET", `/projects/${projectId}/tasks?due_before=2026-11-21&fields=title,due_date`, { key, params: { id: projectId } }));
    expect(filtered.data).toEqual([{ id: taskId, title: "Ship the API v1", due_date: "2026-11-20" }]);
    const bad = await call(listTasksRoute, "GET", `/projects/${projectId}/tasks?sort=nope:up`, { key, params: { id: projectId } });
    expect(bad.status).toBe(422);
  });

  it("enforces scopes and validation", async () => {
    const denied = await call(createTaskRoute, "POST", `/projects/${projectId}/tasks`, { key: readKey, params: { id: projectId }, body: { title: "Not allowed" } });
    expect(denied.status).toBe(403);
    const invalid = await call(createTaskRoute, "POST", `/projects/${projectId}/tasks`, { key, params: { id: projectId }, body: { title: "" } });
    expect(invalid.status).toBe(422);
    const body = await json(invalid);
    expect(body.error.code).toBe("validation_failed");
    expect(body.error.details[0].path).toBe("title");
    const notJson = await call(createProjectRoute, "POST", "/projects", { key, headers: { "content-type": "application/json" } });
    const raw = new Request(`${BASE}/projects`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: "{not json" });
    expect((await createProjectRoute(raw, { params: Promise.resolve({}) })).status).toBe(422);
    expect(notJson.status).toBe(422);
  });

  it("replays POSTs with the same Idempotency-Key", async () => {
    const headers = { "idempotency-key": "abc-123" };
    const first = await call(createTaskRoute, "POST", `/projects/${projectId}/tasks`, { key, params: { id: projectId }, body: { title: "Once" }, headers });
    const again = await call(createTaskRoute, "POST", `/projects/${projectId}/tasks`, { key, params: { id: projectId }, body: { title: "Once" }, headers });
    expect(again.headers.get("idempotent-replayed")).toBe("true");
    expect((await json(again)).id).toBe((await json(first)).id);
  });

  it("handles dependencies, comments, tags, bulk updates, and deletes", async () => {
    const dep = await call(addDependencyRoute, "POST", `/tasks/${secondId}/dependencies`, { key, params: { id: secondId }, body: { predecessor_id: taskId, type: "fs", lag_days: 1 } });
    expect(dep.status).toBe(201);
    const loop = await call(addDependencyRoute, "POST", `/tasks/${taskId}/dependencies`, { key, params: { id: taskId }, body: { predecessor_id: secondId } });
    expect(loop.status).toBe(422);
    expect((await json(loop)).error.code).toBe("dependency_cycle");
    const deps = await json(await call(listDependenciesRoute, "GET", `/tasks/${secondId}/dependencies`, { key, params: { id: secondId } }));
    expect(deps.predecessors[0]).toMatchObject({ task_id: taskId, type: "fs", lag_days: 1 });

    const comment = await call(addCommentRoute, "POST", `/tasks/${taskId}/comments`, { key, params: { id: taskId }, body: { text: "Looks good from the API" } });
    expect(comment.status).toBe(201);
    expect((await json(comment)).body_text).toBe("Looks good from the API");

    const tag = await json(await call(createTagRoute, "POST", "/tags", { key, body: { name: "api", color: "teal" } }));
    const tagged = await json(await call(addTagRoute, "PUT", `/tasks/${taskId}/tags/${tag.id}`, { key, params: { id: taskId, tagId: tag.id } }));
    expect(tagged.tags.map((t: { name: string }) => t.name)).toEqual(["api"]);

    const bulk = await json(await call(bulkRoute, "POST", "/tasks/bulk", { key, body: { operations: [{ id: taskId, patch: { priority: "urgent" } }, { id: "00000000-0000-0000-0000-000000000000", patch: { priority: "low" } }] } }));
    expect(bulk).toMatchObject({ succeeded: 1, failed: 1 });
    expect(bulk.results[1].error.code).toBe("not_found");

    const events = await json(await call(eventsRoute, "GET", "/events?since=0&limit=100", { key }));
    expect(events.data.map((e: { type: string }) => e.type)).toContain("task.created");
    expect(events.data.map((e: { type: string }) => e.type)).toContain("dependency.added");
    const after = await json(await call(eventsRoute, "GET", `/events?since=${events.next_since}`, { key }));
    expect(after.data).toHaveLength(0);

    const found = await json(await call(searchRoute, "GET", "/search?q=docs", { key }));
    expect(found.tasks.map((t: { id: string }) => t.id)).toContain(secondId);

    const removed = await call(deleteTaskRoute, "DELETE", `/tasks/${secondId}`, { key, params: { id: secondId } });
    expect(removed.status).toBe(204);
    expect((await call(getTaskRoute, "GET", `/tasks/${secondId}`, { key, params: { id: secondId } })).status).toBe(404);
  });

  it("serves an OpenAPI document without a key", async () => {
    const res = await call(openapiRoute, "GET", "/openapi.json");
    expect(res.status).toBe(200);
    const doc = await json(res);
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.paths["/projects/{id}/tasks"].post.requestBody.content["application/json"].schema.properties.due_date).toBeDefined();
    expect(doc.paths["/projects/{id}/tasks"].post.requestBody.content["application/json"].schema.properties.project_id).toBeUndefined();
  });
});
