import type { TaskRow, PersonRef } from "@/lib/query-engine/types";
import type { FieldRef, ViewSpec } from "@/lib/validation/view-spec";
import type { Priority } from "@/lib/db/schema";
import { groupRows, type Group, type GroupingContext } from "./grouping";

/** Pure helpers for the Board view (docs/11 section 3). Kept free of React so they can be unit tested. */

export type BoardDensity = "compact" | "standard" | "detailed";
export type BoardColumn = Group & { wipLimit: number | null };
export type BoardOptions = { columnField: FieldRef; density: BoardDensity; collapsed: string[] };

export const boardDensities: Array<{ value: BoardDensity; label: string }> = [
  { value: "compact", label: "Compact" },
  { value: "standard", label: "Standard" },
  { value: "detailed", label: "Detailed" },
];

/** Fields that can drive the columns: status (default), people, priority, section, and custom select or person fields. */
export function columnFieldOptions(fields: GroupingContext["fields"]): Array<{ value: FieldRef; label: string }> {
  const custom = fields
    .filter((f) => f.type === "single_select" || f.type === "person")
    .map((f) => ({ value: `custom:${f.id}` as FieldRef, label: f.name }));
  return [
    { value: "status", label: "Status" },
    { value: "assignee", label: "Assignee" },
    { value: "priority", label: "Priority" },
    { value: "section", label: "Section" },
    ...custom,
  ];
}

/** Fields that can split the board into swimlanes. */
export const swimlaneFieldOptions: Array<{ value: FieldRef; label: string }> = [
  { value: "assignee", label: "Assignee" },
  { value: "priority", label: "Priority" },
  { value: "section", label: "Section" },
  { value: "cycle", label: "Cycle" },
];

export function readBoardOptions(spec: ViewSpec): BoardOptions {
  const o = spec.options as Record<string, unknown>;
  const columnField = typeof o.boardColumns === "string" && o.boardColumns ? (o.boardColumns as FieldRef) : "status";
  const density = o.boardDensity === "compact" || o.boardDensity === "detailed" ? (o.boardDensity as BoardDensity) : "standard";
  const collapsed = Array.isArray(o.boardCollapsed) ? (o.boardCollapsed as unknown[]).filter((k): k is string => typeof k === "string") : [];
  return { columnField, density, collapsed };
}

/** The key of the column (or swimlane) a row belongs to for a field. Mirrors the keys produced by groupRows. */
export function columnKeyOf(row: TaskRow, field: FieldRef): string {
  switch (field) {
    case "status":
      return row.status.id;
    case "status_category":
      return row.status.category;
    case "assignee":
      return row.assignee?.id ?? "unassigned";
    case "priority":
      return row.priority;
    case "section":
      return row.sectionId ?? "none";
    case "cycle":
      return row.cycleId ?? "none";
    case "is_milestone":
      return row.isMilestone ? "yes" : "no";
    default: {
      if (field.startsWith("custom:")) {
        const value = row.customFields[field.slice(7)];
        if (value === null || value === undefined || value === "") return "none";
        if (Array.isArray(value)) return value.length ? String(value[0]) : "none";
        return String(value);
      }
      return "all";
    }
  }
}

/**
 * Builds the ordered column list for the board. Status, section, and priority columns follow their natural order and
 * include empty columns; assignee columns include every project member so a card can be dropped on anyone.
 */
export function buildColumns(rows: TaskRow[], field: FieldRef, ctx: GroupingContext, statuses: Array<{ id: string; wipLimit: number | null }>, members: PersonRef[]): BoardColumn[] {
  const groups = groupRows(rows, field, ctx);
  if (field === "assignee") {
    const present = new Set(groups.map((g) => g.key));
    for (const m of members) {
      if (!present.has(m.id)) groups.push({ key: m.id, label: m.displayName, rows: [], meta: { assigneeId: m.id, person: m } });
    }
    if (!present.has("unassigned")) groups.push({ key: "unassigned", label: "Unassigned", rows: [], meta: { assigneeId: null, person: null } });
    groups.sort((a, b) => (a.key === "unassigned" ? 1 : b.key === "unassigned" ? -1 : a.label.localeCompare(b.label)));
  }
  if (field.startsWith("custom:")) {
    const def = ctx.fields.find((f) => f.id === field.slice(7));
    const options = ((def?.config as { options?: Array<{ id: string; name: string; color?: string }> } | undefined)?.options) ?? [];
    const present = new Set(groups.map((g) => g.key));
    for (const o of options) if (!present.has(o.id)) groups.push({ key: o.id, label: o.name, color: o.color, rows: [] });
    const order = new Map(options.map((o, i) => [o.id, i]));
    groups.sort((a, b) => (a.key === "none" ? 1 : b.key === "none" ? -1 : (order.get(a.key) ?? 999) - (order.get(b.key) ?? 999)));
  }
  return groups.map((g) => ({ ...g, wipLimit: field === "status" ? (statuses.find((s) => s.id === g.key)?.wipLimit ?? null) : null }));
}

export type FieldPatch = { patch: Record<string, unknown>; optimistic: (row: TaskRow) => TaskRow };

/**
 * The task patch that moves a row into the column `key` of `field`, plus the optimistic version of the row.
 * Returns null when the field cannot be written by a drop (for example due date buckets).
 */
export function fieldPatch(field: FieldRef, key: string, ctx: GroupingContext, now = new Date().toISOString()): FieldPatch | null {
  switch (field) {
    case "status": {
      const status = ctx.statuses.find((s) => s.id === key);
      if (!status) return null;
      return { patch: { statusId: status.id }, optimistic: (r) => ({ ...r, status, completedAt: status.category === "done" ? (r.completedAt ?? now) : null }) };
    }
    case "assignee": {
      const assignee = key === "unassigned" ? null : (ctx.members.find((m) => m.id === key) ?? null);
      if (key !== "unassigned" && !assignee) return null;
      return { patch: { assigneeId: assignee?.id ?? null }, optimistic: (r) => ({ ...r, assignee }) };
    }
    case "priority": {
      if (!["urgent", "high", "medium", "low", "none"].includes(key)) return null;
      const priority = key as Priority;
      return { patch: { priority }, optimistic: (r) => ({ ...r, priority }) };
    }
    case "section": {
      const sectionId = key === "none" ? null : key;
      if (sectionId && !ctx.sections.some((s) => s.id === sectionId)) return null;
      return { patch: { sectionId }, optimistic: (r) => ({ ...r, sectionId }) };
    }
    case "cycle": {
      const cycleId = key === "none" ? null : key;
      return { patch: { cycleId }, optimistic: (r) => ({ ...r, cycleId }) };
    }
    default: {
      if (!field.startsWith("custom:")) return null;
      const fieldId = field.slice(7);
      const def = ctx.fields.find((f) => f.id === fieldId);
      if (!def) return null;
      const value = key === "none" ? null : key;
      return { patch: { customFields: { [fieldId]: value } }, optimistic: (r) => ({ ...r, customFields: { ...r.customFields, [fieldId]: value } }) };
    }
  }
}

/** Composes several optimistic updaters into one. */
export function composeOptimistic(...fns: Array<((row: TaskRow) => TaskRow) | null | undefined>): (row: TaskRow) => TaskRow {
  return (row) => fns.reduce((acc, fn) => (fn ? fn(acc) : acc), row);
}

/**
 * Neighbors for a drop inside a column. `cards` is the column's current card order without the dragged card.
 * A null `overId` appends at the end.
 */
export function dropNeighbors(cards: TaskRow[], overId: string | null, position: "before" | "after"): { before: TaskRow | null; after: TaskRow | null } {
  if (!overId) return { before: cards[cards.length - 1] ?? null, after: null };
  const idx = cards.findIndex((c) => c.id === overId);
  if (idx < 0) return { before: cards[cards.length - 1] ?? null, after: null };
  if (position === "before") return { before: cards[idx - 1] ?? null, after: cards[idx] };
  return { before: cards[idx], after: cards[idx + 1] ?? null };
}

/** Fractional position between two neighbors, matching the server's positionBetween. */
export function positionBetween(before: TaskRow | null, after: TaskRow | null, fallback: number): number {
  if (before && after) return (before.position + after.position) / 2;
  if (before) return before.position + 1024;
  if (after) return after.position - 1024;
  return fallback;
}

/** True when a column with a WIP limit is already at or above capacity. */
export function atWipCapacity(column: BoardColumn, countExcludingActive: number): boolean {
  return column.wipLimit != null && countExcludingActive >= column.wipLimit;
}

/** Cards visible on the board: subtasks are shown only in the flat subtask mode. */
export function boardRows(rows: TaskRow[], subtasks: ViewSpec["subtasks"]): TaskRow[] {
  if (subtasks === "flat") return rows;
  const ids = new Set(rows.map((r) => r.id));
  return rows.filter((r) => !(r.parentId && ids.has(r.parentId)));
}
