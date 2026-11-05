import { z, type ZodType } from "zod";
import { createProjectInput, updateProjectInput, createSectionInput, updateSectionInput, createCycleInput, updateWorkflowInput } from "@/lib/validation/project";
import { createTaskInput, updateTaskInput, moveTaskInput, addDependencyInput, addCommentInput } from "@/lib/validation/task";
import { createFieldInput, updateFieldInput, tagInput } from "@/lib/validation/settings";
import { savedViewInput } from "@/lib/validation/view-spec";
import { searchInput } from "@/lib/validation/search";
import { toSnake } from "./shape";

/*
  OpenAPI 3.1 for /api/v1 (docs/07 section 8), generated from the Zod schemas at request time. Request bodies are
  documented in snake_case, matching the wire format the handler converts.
*/

type Op = { summary: string; body?: ZodType; omit?: string[]; params?: string[]; query?: Record<string, string>; status?: number };
type PathItem = Partial<Record<"get" | "post" | "patch" | "put" | "delete", Op>>;

const idParam = (name: string) => ({ name, in: "path", required: true, schema: { type: "string" } });
const pageQuery = { limit: "Page size, 1 to 200 (default 50)", cursor: "Opaque cursor from next_cursor" };
const taskListQuery = { ...pageQuery, filter: "URL encoded JSON filter group (ViewSpec)", sort: "field:asc or field:desc, up to three", assignee: "me, unassigned, or user ids", status_category: "backlog, not_started, in_progress, done", status_id: "Status ids", section_id: "Section ids", due_before: "YYYY-MM-DD", due_after: "YYYY-MM-DD", cycle: "current or a cycle id", tag_id: "Tag ids", q: "Title contains", completed: "none, recent, or all (default all)", subtasks: "flat or hidden", fields: "Top level fields to keep" };

export const paths: Record<string, PathItem> = {
  "/workspace": { get: { summary: "Current workspace" } },
  "/members": { get: { summary: "List members with roles", query: pageQuery } },
  "/users/{id}": { get: { summary: "User profile", params: ["id"] } },
  "/projects": { get: { summary: "List projects", query: { ...pageQuery, archived: "true to include archived", team_id: "Team id", privacy: "workspace, team, or private" } }, post: { summary: "Create a project", body: createProjectInput } },
  "/projects/{id}": { get: { summary: "Get a project", params: ["id"], query: { expand: "sections, statuses, fields, members, cycles, views" } }, patch: { summary: "Update a project", params: ["id"], body: updateProjectInput, omit: ["id"] }, delete: { summary: "Soft delete a project", params: ["id"], status: 204 } },
  "/projects/{id}/archive": { post: { summary: "Archive", params: ["id"], status: 200 } },
  "/projects/{id}/unarchive": { post: { summary: "Unarchive", params: ["id"], status: 200 } },
  "/projects/{id}/sections": { get: { summary: "List sections", params: ["id"] }, post: { summary: "Create a section", params: ["id"], body: createSectionInput, omit: ["projectId"] } },
  "/sections/{id}": { patch: { summary: "Update a section", params: ["id"], body: updateSectionInput, omit: ["id"] }, delete: { summary: "Delete a section", params: ["id"], status: 204 } },
  "/projects/{id}/cycles": { get: { summary: "List cycles", params: ["id"] }, post: { summary: "Create a cycle", params: ["id"], body: createCycleInput, omit: ["projectId"] } },
  "/cycles/{id}": { patch: { summary: "Update a cycle; send closed: true with move_incomplete_to (backlog or next) to close it", params: ["id"] } },
  "/projects/{id}/status-updates": { get: { summary: "List status updates", params: ["id"] }, post: { summary: "Post a status update", params: ["id"] } },
  "/projects/{id}/views": { get: { summary: "List saved views", params: ["id"] }, post: { summary: "Create a saved view", params: ["id"], body: savedViewInput, omit: ["projectId"] } },
  "/views/{id}": { patch: { summary: "Update a saved view", params: ["id"] }, delete: { summary: "Delete a saved view", params: ["id"], status: 204 } },
  "/projects/{id}/members": { get: { summary: "List project members", params: ["id"] } },
  "/projects/{id}/workflow": { get: { summary: "List the project's statuses", params: ["id"] }, patch: { summary: "Replace the statuses atomically", params: ["id"], body: updateWorkflowInput, omit: ["projectId"] } },
  "/projects/{id}/fields": { get: { summary: "Attached fields and the library", params: ["id"] }, post: { summary: "Adopt a library field (field_id) or create a project field", params: ["id"], body: createFieldInput, omit: ["projectId"] } },
  "/projects/{id}/tasks": { get: { summary: "List tasks in a project", params: ["id"], query: { ...taskListQuery, view_id: "Apply a saved view's spec" } }, post: { summary: "Create a task", params: ["id"], body: createTaskInput, omit: ["projectId"] } },
  "/tasks": { get: { summary: "List tasks across the workspace", query: taskListQuery } },
  "/tasks/bulk": { post: { summary: "Up to 500 operations: [{ id, patch }]", status: 200 } },
  "/tasks/{idOrKey}": { get: { summary: "Get a task", params: ["idOrKey"], query: { expand: "subtasks, comments, attachments, events" } }, patch: { summary: "Update a task; If-Match: <version> is honored", params: ["idOrKey"], body: updateTaskInput, omit: ["id"] }, delete: { summary: "Soft delete a task", params: ["idOrKey"], status: 204 } },
  "/tasks/{id}/restore": { post: { summary: "Restore a deleted task", params: ["id"], status: 200 } },
  "/tasks/{id}/move": { post: { summary: "Move to a section or between neighbors", params: ["id"], body: moveTaskInput, omit: ["id"], status: 200 } },
  "/tasks/{id}/subtasks": { get: { summary: "List subtasks", params: ["id"] }, post: { summary: "Create a subtask", params: ["id"], body: createTaskInput, omit: ["projectId", "parentId"] } },
  "/tasks/{id}/comments": { get: { summary: "List comments", params: ["id"] }, post: { summary: "Add a comment", params: ["id"], body: addCommentInput, omit: ["taskId"] } },
  "/comments/{id}": { patch: { summary: "Edit a comment", params: ["id"] }, delete: { summary: "Delete a comment", params: ["id"], status: 204 } },
  "/tasks/{id}/dependencies": { get: { summary: "List dependencies", params: ["id"] }, post: { summary: "Add a predecessor", params: ["id"], body: addDependencyInput, omit: ["successorId"] }, delete: { summary: "Remove a dependency (dependency_id)", params: ["id"], status: 204 } },
  "/tasks/{id}/tags/{tagId}": { put: { summary: "Add a tag", params: ["id", "tagId"], status: 200 }, delete: { summary: "Remove a tag", params: ["id", "tagId"], status: 200 } },
  "/tasks/{id}/events": { get: { summary: "Activity history", params: ["id"] } },
  "/fields": { get: { summary: "Workspace field library" }, post: { summary: "Create a library field", body: createFieldInput, omit: ["projectId"] } },
  "/fields/{id}": { patch: { summary: "Update a field", params: ["id"], body: updateFieldInput, omit: ["id"] }, delete: { summary: "Delete a field", params: ["id"], status: 204 } },
  "/tags": { get: { summary: "List tags" }, post: { summary: "Create a tag", body: tagInput } },
  "/events": { get: { summary: "Workspace wide event stream", query: { since: "Last event id seen", limit: "Up to 500", type: "Event types, comma separated", project_id: "Project id" } } },
  "/search": { get: { summary: "Full text search", query: { q: "Query", project_id: "Project id", assignee_id: "me, unassigned, or a user id", status_category: "backlog, not_started, in_progress, done", from: "YYYY-MM-DD", to: "YYYY-MM-DD", has_attachment: "true" }, body: searchInput } },
  "/webhooks": { get: { summary: "List webhooks" }, post: { summary: "Register a webhook" } },
  "/webhooks/{id}": { patch: { summary: "Update a webhook", params: ["id"] }, delete: { summary: "Delete a webhook", params: ["id"], status: 204 } },
  "/webhooks/{id}/deliveries": { get: { summary: "Delivery log", params: ["id"], query: pageQuery } },
  "/webhooks/{id}/deliveries/{deliveryId}/replay": { post: { summary: "Replay a delivery", params: ["id", "deliveryId"], status: 202 } },
};

function bodySchema(schema: ZodType, omit: string[] = []) {
  const json = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  delete json.$schema;
  const converted = toSnake(json) as Record<string, unknown>;
  // Keys inside "properties" were converted too, which is what the wire format needs; drop omitted ones.
  const props = (converted.properties as Record<string, unknown> | undefined) ?? {};
  for (const key of omit) delete props[toSnakeKey(key)];
  if (Array.isArray(converted.required)) converted.required = (converted.required as string[]).filter((r) => !omit.map(toSnakeKey).includes(r));
  return converted;
}

function toSnakeKey(k: string) {
  return k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

export function buildOpenApi(serverUrl: string) {
  const errorSchema = { type: "object", properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" }, details: { type: "array", items: { type: "object", properties: { path: { type: "string" }, message: { type: "string" } } } }, request_id: { type: "string" } }, required: ["code", "message", "request_id"] } } };
  const out: Record<string, unknown> = {};
  for (const [path, item] of Object.entries(paths)) {
    const entry: Record<string, unknown> = {};
    for (const [method, op] of Object.entries(item)) {
      if (!op) continue;
      const parameters = [...(op.params ?? []).map(idParam), ...Object.entries(op.query ?? {}).map(([name, description]) => ({ name, in: "query", required: false, description, schema: { type: "string" } }))];
      const status = op.status ?? (method === "post" ? 201 : 200);
      entry[method] = {
        summary: op.summary,
        parameters,
        ...(op.body && method !== "get" ? { requestBody: { required: true, content: { "application/json": { schema: bodySchema(op.body, op.omit) } } } } : {}),
        responses: { [String(status)]: { description: status === 204 ? "No content" : "OK", ...(status !== 204 ? { content: { "application/json": { schema: { type: "object" } } } } : {}) }, "4XX": { description: "Error", content: { "application/json": { schema: errorSchema } } } },
        security: [{ apiKey: [] }],
      };
    }
    out[path] = entry;
  }
  return {
    openapi: "3.1.0",
    info: { title: "TaskParty API", version: "1", description: "Public REST API. Authenticate with an API key as a bearer token. Lists are cursor paginated with limit and cursor." },
    servers: [{ url: serverUrl }],
    components: { securitySchemes: { apiKey: { type: "http", scheme: "bearer", bearerFormat: "tp_live_..." } } },
    paths: out,
  };
}
