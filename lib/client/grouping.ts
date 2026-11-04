import type { TaskRow, SectionRef, StatusRef, PersonRef } from "@/lib/query-engine/types";
import type { FieldRef } from "@/lib/validation/view-spec";
import type { FieldDefinition } from "@/lib/db/schema";
import { formatDue } from "./dates";

export type Group = { key: string; label: string; color?: string; rows: TaskRow[]; meta?: Record<string, unknown> };

export type GroupingContext = {
  sections: SectionRef[];
  statuses: StatusRef[];
  members: PersonRef[];
  fields: Pick<FieldDefinition, "id" | "name" | "type" | "config">[];
  today: string;
};

const priorityOrder = ["urgent", "high", "medium", "low", "none"] as const;
const priorityLabels: Record<string, string> = { urgent: "Urgent", high: "High", medium: "Medium", low: "Low", none: "No priority" };

export function groupRows(rows: TaskRow[], groupBy: FieldRef | undefined, ctx: GroupingContext): Group[] {
  if (!groupBy) return [{ key: "all", label: "All tasks", rows }];
  const map = new Map<string, Group>();
  const ensure = (key: string, label: string, color?: string, meta?: Record<string, unknown>) => {
    let g = map.get(key);
    if (!g) {
      g = { key, label, color, rows: [], meta };
      map.set(key, g);
    }
    return g;
  };

  // Pre-seed groups whose natural order is known so empty groups still render in order.
  if (groupBy === "section") {
    for (const s of ctx.sections) ensure(s.id, s.name, undefined, { sectionId: s.id });
  } else if (groupBy === "status") {
    for (const s of ctx.statuses) ensure(s.id, s.name, s.color, { statusId: s.id, category: s.category });
  } else if (groupBy === "priority") {
    for (const p of priorityOrder) ensure(p, priorityLabels[p]);
  }

  for (const row of rows) {
    switch (groupBy) {
      case "section":
        ensure(row.sectionId ?? "none", row.sectionId ? (ctx.sections.find((s) => s.id === row.sectionId)?.name ?? "Section") : "No section", undefined, { sectionId: row.sectionId }).rows.push(row);
        break;
      case "status":
        ensure(row.status.id, row.status.name, row.status.color, { statusId: row.status.id, category: row.status.category }).rows.push(row);
        break;
      case "status_category":
        ensure(row.status.category, categoryLabel(row.status.category)).rows.push(row);
        break;
      case "assignee":
        ensure(row.assignee?.id ?? "unassigned", row.assignee?.displayName ?? "Unassigned", undefined, { assigneeId: row.assignee?.id ?? null, person: row.assignee }).rows.push(row);
        break;
      case "priority":
        ensure(row.priority, priorityLabels[row.priority]).rows.push(row);
        break;
      case "due_date":
        ensure(dueBucket(row.dueDate, ctx.today), dueBucketLabel(dueBucket(row.dueDate, ctx.today), row.dueDate, ctx.today)).rows.push(row);
        break;
      case "cycle":
        ensure(row.cycleId ?? "none", row.cycleId ?? "No cycle").rows.push(row);
        break;
      case "is_milestone":
        ensure(row.isMilestone ? "yes" : "no", row.isMilestone ? "Milestones" : "Tasks").rows.push(row);
        break;
      case "tags":
        if (row.tags.length === 0) ensure("none", "No tags").rows.push(row);
        for (const t of row.tags) ensure(t.id, t.name, t.color).rows.push(row);
        break;
      default: {
        if (groupBy.startsWith("custom:")) {
          const fieldId = groupBy.slice(7);
          const def = ctx.fields.find((f) => f.id === fieldId);
          const value = row.customFields[fieldId];
          const options = ((def?.config as { options?: Array<{ id: string; name: string; color?: string }> } | undefined)?.options) ?? [];
          if (Array.isArray(value) && value.length) {
            for (const v of value) {
              const opt = options.find((o) => o.id === v);
              const person = ctx.members.find((m) => m.id === v);
              ensure(String(v), opt?.name ?? person?.displayName ?? String(v), opt?.color).rows.push(row);
            }
          } else if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
            ensure("none", `No ${def?.name ?? "value"}`).rows.push(row);
          } else {
            ensure(String(value), String(value)).rows.push(row);
          }
        } else {
          ensure("all", "All tasks").rows.push(row);
        }
      }
    }
  }

  const groups = Array.from(map.values());
  if (groupBy === "due_date") groups.sort((a, b) => dueBucketRank(a.key) - dueBucketRank(b.key));
  if (groupBy === "assignee") groups.sort((a, b) => (a.key === "unassigned" ? 1 : b.key === "unassigned" ? -1 : a.label.localeCompare(b.label)));
  return groups;
}

export function categoryLabel(category: string): string {
  return { backlog: "Backlog", not_started: "Not started", in_progress: "In progress", done: "Done" }[category] ?? category;
}

export function dueBucket(iso: string | null, today: string): string {
  if (!iso) return "none";
  if (iso < today) return "overdue";
  if (iso === today) return "today";
  const diffDays = Math.round((Date.parse(iso) - Date.parse(today)) / 86_400_000);
  if (diffDays === 1) return "tomorrow";
  if (diffDays <= 7) return "week";
  return "later";
}

export function dueBucketLabel(bucket: string, iso: string | null, today: string): string {
  switch (bucket) {
    case "overdue":
      return "Overdue";
    case "today":
      return "Today";
    case "tomorrow":
      return "Tomorrow";
    case "week":
      return "This week";
    case "later":
      return "Later";
    default:
      return iso ? formatDue(iso, today) : "No date";
  }
}

function dueBucketRank(bucket: string): number {
  return ["overdue", "today", "tomorrow", "week", "later", "none"].indexOf(bucket);
}

/** Builds the nested tree used by List when subtasks are shown nested. */
export function buildTree(rows: TaskRow[]): Array<{ row: TaskRow; depth: number; hasChildren: boolean }> {
  const byParent = new Map<string | null, TaskRow[]>();
  const ids = new Set(rows.map((r) => r.id));
  for (const r of rows) {
    const parent = r.parentId && ids.has(r.parentId) ? r.parentId : null;
    const list = byParent.get(parent) ?? [];
    list.push(r);
    byParent.set(parent, list);
  }
  const out: Array<{ row: TaskRow; depth: number; hasChildren: boolean }> = [];
  const walk = (parent: string | null, depth: number) => {
    for (const r of byParent.get(parent) ?? []) {
      const children = byParent.get(r.id) ?? [];
      out.push({ row: r, depth, hasChildren: children.length > 0 });
      if (depth < 20) walk(r.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}
