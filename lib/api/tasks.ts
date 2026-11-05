import { and, eq, isNull } from "drizzle-orm";
import { schema } from "@/lib/db/client";
import type { ServiceContext } from "@/lib/services/context";
import { NotFoundError } from "@/lib/services/context";
import { getTaskDetail } from "@/lib/services/tasks";
import { viewSpec, filterGroup, sort as sortSchema, defaultViewSpec, type ViewSpec, type FilterGroup, type Filter } from "@/lib/validation/view-spec";
import { ApiError } from "./errors";
import { taskObject, type Links } from "./serialize";

/** Shared helpers for the task endpoints: id or key resolution and list query parsing (docs/07 section 2). */

export async function resolveTaskId(ctx: ServiceContext, idOrKey: string): Promise<string> {
  const keyMatch = /^([A-Z][A-Z0-9]{1,5})-(\d+)$/i.exec(idOrKey);
  if (!keyMatch) {
    if (!/^[0-9a-f-]{36}$/i.test(idOrKey)) throw new ApiError("validation_failed", "Task ids are uuids or keys like MKT-12.");
    return idOrKey;
  }
  const [row] = await ctx.db
    .select({ id: schema.tasks.id })
    .from(schema.tasks)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.tasks.projectId))
    .where(and(eq(schema.projects.workspaceId, ctx.actor.workspaceId), eq(schema.projects.key, keyMatch[1].toUpperCase()), eq(schema.tasks.number, Number(keyMatch[2])), isNull(schema.tasks.deletedAt)));
  if (!row) throw new NotFoundError("Task");
  return row.id;
}

/** Loads the full API object for a task after a mutation. */
export async function taskResponse(ctx: ServiceContext, id: string, today: string, links: Links) {
  const detail = await getTaskDetail(ctx, id, today);
  return taskObject(detail.task, links, { description: detail.description, dependencies: { predecessors: detail.predecessors, successors: detail.successors } });
}

/**
 * Builds a ViewSpec from list query params: `filter` (a JSON filter group), `sort` (field:direction, up to 3),
 * shortcuts (assignee, status_category, due_before, due_after, section_id, cycle, completed), and `view_id` spec merge.
 */
export function specFromQuery(query: URLSearchParams, base: ViewSpec = defaultViewSpec()): ViewSpec {
  const items: Array<Filter | FilterGroup> = [...base.filters.items];
  const raw = query.get("filter");
  if (raw) {
    try {
      items.push(filterGroup.parse(JSON.parse(raw)));
    } catch {
      throw new ApiError("validation_failed", "filter must be a URL encoded JSON filter group.", [{ path: "filter", message: "invalid filter group" }]);
    }
  }
  const assignee = query.get("assignee");
  if (assignee === "me") items.push({ kind: "filter", field: "assignee", op: "is_me" });
  else if (assignee === "unassigned") items.push({ kind: "filter", field: "assignee", op: "is_empty" });
  else if (assignee) items.push({ kind: "filter", field: "assignee", op: "is_any_of", value: assignee.split(",") });
  const category = query.get("status_category");
  if (category) items.push({ kind: "filter", field: "status_category", op: "is_any_of", value: category.split(",") });
  const status = query.get("status_id");
  if (status) items.push({ kind: "filter", field: "status", op: "is_any_of", value: status.split(",") });
  const section = query.get("section_id");
  if (section) items.push({ kind: "filter", field: "section", op: "is_any_of", value: section.split(",") });
  const dueBefore = query.get("due_before");
  if (dueBefore) items.push({ kind: "filter", field: "due_date", op: "before", value: dueBefore });
  const dueAfter = query.get("due_after");
  if (dueAfter) items.push({ kind: "filter", field: "due_date", op: "after", value: dueAfter });
  if (query.get("cycle") === "current") items.push({ kind: "filter", field: "cycle", op: "is_current_cycle" });
  else if (query.get("cycle")) items.push({ kind: "filter", field: "cycle", op: "is_any_of", value: [query.get("cycle")!] });
  const tag = query.get("tag_id");
  if (tag) items.push({ kind: "filter", field: "tags", op: "includes_any", value: tag.split(",") });
  const q = query.get("q");
  if (q) items.push({ kind: "filter", field: "title", op: "contains", value: q });

  const sorts = (query.get("sort") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((s) => {
      const [field, direction = "asc"] = s.split(":");
      const parsed = sortSchema.safeParse({ field, direction });
      if (!parsed.success) throw new ApiError("validation_failed", `Unknown sort "${s}".`, [{ path: "sort", message: "use field:asc or field:desc" }]);
      return parsed.data;
    });
  const completed = query.get("completed");
  return viewSpec.parse({
    ...base,
    filters: { kind: "group", op: "and", items },
    sorts: sorts.length ? sorts : base.sorts,
    subtasks: query.get("subtasks") === "hidden" ? "hidden" : "flat",
    showCompleted: completed === "none" ? "none" : completed === "recent" ? "recent" : "all",
  });
}
