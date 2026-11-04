import type { TaskRow, PersonRef } from "@/lib/query-engine/types";
import type { FieldRef, ViewSpec } from "@/lib/validation/view-spec";
import type { Priority } from "@/lib/db/schema";
import type { GroupingContext } from "./grouping";
import { formatDateShort } from "./dates";

/** Pure helpers for the Table view (docs/11 section 4). Kept free of React so they can be unit tested. */

export type TableKind = "title" | "text" | "key" | "status" | "status_category" | "person" | "date" | "datetime" | "priority" | "number" | "select" | "multi_select" | "checkbox" | "section" | "cycle" | "tags" | "parent";
export type AggregateKind = "none" | "sum" | "average" | "min" | "max" | "count" | "percent_complete";

export type TableColumn = {
  id: FieldRef;
  label: string;
  kind: TableKind;
  /** Default width in px when the saved view has none. */
  width: number;
  /** Whether a cell of this column can be edited inline. */
  editable: boolean;
  /** Aggregates that make sense for the column. */
  aggregates: AggregateKind[];
  /** Custom field id when the column is a custom field. */
  fieldId?: string;
  /** Select options for select kinds. */
  options?: Array<{ id: string; name: string; color?: string }>;
  /** Number formatting for custom number fields. */
  numberFormat?: "number" | "currency" | "percent";
};

export const priorityLabels: Record<Priority, string> = { urgent: "Urgent", high: "High", medium: "Medium", low: "Low", none: "No priority" };
const priorityRank: Record<Priority, number> = { none: 0, low: 1, medium: 2, high: 3, urgent: 4 };

const numberAggregates: AggregateKind[] = ["none", "sum", "average", "min", "max", "count"];
const dateAggregates: AggregateKind[] = ["none", "min", "max", "count"];
const countOnly: AggregateKind[] = ["none", "count"];

/** Every column the table can show, standard fields first, then custom fields in their defined order. */
export function tableColumns(fields: GroupingContext["fields"], cycleLabel = "Cycle"): TableColumn[] {
  const std: TableColumn[] = [
    { id: "title", label: "Title", kind: "title", width: 320, editable: true, aggregates: ["none", "count"] },
    { id: "key", label: "Key", kind: "key", width: 96, editable: false, aggregates: countOnly },
    { id: "status", label: "Status", kind: "status", width: 140, editable: true, aggregates: ["none", "percent_complete", "count"] },
    { id: "status_category", label: "Category", kind: "status_category", width: 120, editable: false, aggregates: countOnly },
    { id: "assignee", label: "Assignee", kind: "person", width: 160, editable: true, aggregates: countOnly },
    { id: "start_date", label: "Start date", kind: "date", width: 120, editable: true, aggregates: dateAggregates },
    { id: "due_date", label: "Due date", kind: "date", width: 120, editable: true, aggregates: dateAggregates },
    { id: "priority", label: "Priority", kind: "priority", width: 120, editable: true, aggregates: countOnly },
    { id: "estimate", label: "Estimate", kind: "number", width: 96, editable: true, aggregates: numberAggregates },
    { id: "section", label: "Section", kind: "section", width: 140, editable: true, aggregates: countOnly },
    { id: "cycle", label: cycleLabel, kind: "cycle", width: 140, editable: true, aggregates: countOnly },
    { id: "tags", label: "Tags", kind: "tags", width: 180, editable: false, aggregates: countOnly },
    { id: "is_milestone", label: "Milestone", kind: "checkbox", width: 100, editable: true, aggregates: countOnly },
    { id: "parent", label: "Parent", kind: "parent", width: 120, editable: false, aggregates: countOnly },
    { id: "created_by", label: "Created by", kind: "person", width: 160, editable: false, aggregates: countOnly },
    { id: "created_at", label: "Created", kind: "datetime", width: 120, editable: false, aggregates: dateAggregates },
    { id: "updated_at", label: "Updated", kind: "datetime", width: 120, editable: false, aggregates: dateAggregates },
    { id: "completed_at", label: "Completed", kind: "datetime", width: 120, editable: false, aggregates: dateAggregates },
  ];
  const custom: TableColumn[] = fields.map((f) => {
    const options = ((f.config as { options?: Array<{ id: string; name: string; color?: string }> } | null)?.options) ?? [];
    const id = `custom:${f.id}` as FieldRef;
    switch (f.type) {
      case "number":
      case "currency":
      case "percent":
        return { id, label: f.name, kind: "number", width: 110, editable: true, aggregates: numberAggregates, fieldId: f.id, numberFormat: f.type };
      case "date":
        return { id, label: f.name, kind: "date", width: 120, editable: true, aggregates: dateAggregates, fieldId: f.id };
      case "checkbox":
        return { id, label: f.name, kind: "checkbox", width: 100, editable: true, aggregates: countOnly, fieldId: f.id };
      case "single_select":
        return { id, label: f.name, kind: "select", width: 140, editable: true, aggregates: countOnly, fieldId: f.id, options };
      case "multi_select":
        return { id, label: f.name, kind: "multi_select", width: 180, editable: false, aggregates: countOnly, fieldId: f.id, options };
      case "person":
        return { id, label: f.name, kind: "person", width: 160, editable: true, aggregates: countOnly, fieldId: f.id };
      default:
        return { id, label: f.name, kind: "text", width: 180, editable: !["formula", "rollup", "relation"].includes(f.type), aggregates: countOnly, fieldId: f.id };
    }
  });
  return [...std, ...custom];
}

/** Columns in the order the view shows them: the frozen title column, then spec.visibleFields in order. */
export function visibleTableColumns(all: TableColumn[], visibleFields: FieldRef[]): TableColumn[] {
  const byId = new Map(all.map((c) => [c.id, c]));
  const title = byId.get("title")!;
  const rest = visibleFields.filter((f) => f !== "title").map((f) => byId.get(f)).filter((c): c is TableColumn => Boolean(c));
  return [title, ...rest];
}

/** The raw value behind a cell, used for sorting, export, aggregates, and the fill handle. */
export function cellValue(row: TaskRow, column: TableColumn): unknown {
  switch (column.id) {
    case "title":
      return row.title;
    case "key":
      return row.key;
    case "status":
      return row.status.id;
    case "status_category":
      return row.status.category;
    case "assignee":
      return row.assignee?.id ?? null;
    case "start_date":
      return row.startDate;
    case "due_date":
      return row.dueDate;
    case "priority":
      return row.priority;
    case "estimate":
      return row.estimate;
    case "section":
      return row.sectionId;
    case "cycle":
      return row.cycleId;
    case "tags":
      return row.tags.map((t) => t.id);
    case "is_milestone":
      return row.isMilestone;
    case "parent":
      return row.parentId;
    case "created_by":
      return row.createdBy;
    case "created_at":
      return row.createdAt;
    case "updated_at":
      return row.updatedAt;
    case "completed_at":
      return row.completedAt;
    default:
      return column.fieldId ? (row.customFields[column.fieldId] ?? null) : null;
  }
}

/** Human readable text for a cell, used by CSV export and read only cells. */
export function cellText(row: TaskRow, column: TableColumn, ctx: GroupingContext, rowsById?: Map<string, TaskRow>): string {
  const v = cellValue(row, column);
  if (v === null || v === undefined || v === "") return "";
  switch (column.kind) {
    case "status":
      return row.status.name;
    case "status_category":
      return ({ backlog: "Backlog", not_started: "Not started", in_progress: "In progress", done: "Done" } as Record<string, string>)[String(v)] ?? String(v);
    case "person": {
      if (column.id === "assignee") return row.assignee?.displayName ?? "";
      const person = ctx.members.find((m) => m.id === v);
      return person?.displayName ?? String(v);
    }
    case "priority":
      return priorityLabels[v as Priority] ?? String(v);
    case "section":
      return ctx.sections.find((s) => s.id === v)?.name ?? "";
    case "tags":
      return row.tags.map((t) => t.name).join(", ");
    case "checkbox":
      return v ? "Yes" : "No";
    case "parent":
      return rowsById?.get(String(v))?.key ?? String(v);
    case "datetime":
      return String(v).slice(0, 10);
    case "select":
      return column.options?.find((o) => o.id === v)?.name ?? String(v);
    case "multi_select":
      return (Array.isArray(v) ? v : [v]).map((id) => column.options?.find((o) => o.id === id)?.name ?? String(id)).join(", ");
    case "number":
      return formatNumber(Number(v), column.numberFormat);
    default:
      return Array.isArray(v) ? v.join(", ") : String(v);
  }
}

export function formatNumber(n: number, format?: "number" | "currency" | "percent"): string {
  if (!Number.isFinite(n)) return "";
  const rounded = Math.round(n * 100) / 100;
  if (format === "percent") return `${rounded}%`;
  if (format === "currency") return rounded.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return String(rounded);
}

/** Aggregates for the footer and group roll-ups. */
export function aggregate(rows: TaskRow[], column: TableColumn, kind: AggregateKind): number | string | null {
  if (kind === "none") return null;
  if (kind === "count") return rows.length;
  if (kind === "percent_complete") {
    if (rows.length === 0) return 0;
    return Math.round((rows.filter((r) => r.status.category === "done").length / rows.length) * 100);
  }
  const values = rows.map((r) => cellValue(r, column)).filter((v) => v !== null && v !== undefined && v !== "");
  if (column.kind === "number") {
    const nums = values.map(Number).filter((n) => Number.isFinite(n));
    if (nums.length === 0) return null;
    switch (kind) {
      case "sum":
        return nums.reduce((a, b) => a + b, 0);
      case "average":
        return nums.reduce((a, b) => a + b, 0) / nums.length;
      case "min":
        return Math.min(...nums);
      case "max":
        return Math.max(...nums);
      default:
        return null;
    }
  }
  if (column.kind === "date" || column.kind === "datetime") {
    const dates = values.map((v) => String(v).slice(0, 10)).sort();
    if (dates.length === 0) return null;
    if (kind === "min") return dates[0];
    if (kind === "max") return dates[dates.length - 1];
  }
  return null;
}

export function formatAggregate(value: number | string | null, column: TableColumn, kind: AggregateKind): string {
  if (value === null || value === undefined) return "";
  if (kind === "count") return `${value} ${value === 1 ? "task" : "tasks"}`;
  if (kind === "percent_complete") return `${value}% complete`;
  if (typeof value === "number") return `${aggregateLabel(kind)} ${formatNumber(value, column.numberFormat)}`;
  return `${aggregateLabel(kind)} ${formatDateShort(String(value))}`;
}

export function aggregateLabel(kind: AggregateKind): string {
  return { none: "None", sum: "Sum", average: "Average", min: "Min", max: "Max", count: "Count", percent_complete: "Percent complete" }[kind];
}

/** Short group header roll-up: count plus sum for numbers, earliest and latest for dates (docs/11 section 4). */
export function groupRollup(rows: TaskRow[], column: TableColumn): string {
  if (column.kind === "number") {
    const sum = aggregate(rows, column, "sum");
    const avg = aggregate(rows, column, "average");
    if (sum === null || avg === null) return "";
    return `Sum ${formatNumber(Number(sum), column.numberFormat)}, avg ${formatNumber(Number(avg), column.numberFormat)}`;
  }
  if (column.kind === "date" || column.kind === "datetime") {
    const min = aggregate(rows, column, "min");
    const max = aggregate(rows, column, "max");
    if (!min || !max) return "";
    return min === max ? formatDateShort(String(min)) : `${formatDateShort(String(min))} to ${formatDateShort(String(max))}`;
  }
  if (column.kind === "status") {
    return `${aggregate(rows, column, "percent_complete")}% done`;
  }
  return "";
}

/** The footer aggregate chosen per column, with sensible defaults. */
export function readAggregates(spec: ViewSpec): Record<string, AggregateKind> {
  const raw = (spec.options as Record<string, unknown>).tableAggregates;
  const out: Record<string, AggregateKind> = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (typeof v === "string" && ["none", "sum", "average", "min", "max", "count", "percent_complete"].includes(v)) out[k] = v as AggregateKind;
  }
  return out;
}

export function defaultAggregate(column: TableColumn): AggregateKind {
  if (column.id === "title") return "count";
  if (column.id === "estimate" || column.kind === "number") return "sum";
  if (column.id === "status") return "percent_complete";
  return "none";
}

/** Escapes a CSV field per RFC 4180. */
export function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Builds a CSV document of the given rows and columns in display order. */
export function rowsToCsv(rows: TaskRow[], columns: TableColumn[], ctx: GroupingContext): string {
  const rowsById = new Map(rows.map((r) => [r.id, r]));
  const header = columns.map((c) => csvEscape(c.label)).join(",");
  const lines = rows.map((r) => columns.map((c) => csvEscape(cellText(r, c, ctx, rowsById))).join(","));
  return [header, ...lines].join("\r\n") + "\r\n";
}

/** Parses tab separated clipboard text (as copied from Excel or Sheets) into a grid of strings. */
export function parseClipboard(text: string): string[][] {
  const normalized = text.replace(/\r\n?/g, "\n");
  const lines = normalized.endsWith("\n") ? normalized.slice(0, -1).split("\n") : normalized.split("\n");
  return lines.map((line) => line.split("\t").map((cell) => (cell.startsWith('"') && cell.endsWith('"') && cell.length >= 2 ? cell.slice(1, -1).replace(/""/g, '"') : cell)));
}

export type CoerceResult = { ok: true; patch: Record<string, unknown>; optimistic: (row: TaskRow) => TaskRow } | { ok: false; reason: string };

function findByName<T extends { name: string }>(list: T[], text: string): T | undefined {
  const needle = text.trim().toLowerCase();
  return list.find((x) => x.name.toLowerCase() === needle) ?? list.find((x) => x.name.toLowerCase().startsWith(needle));
}
function findPerson(list: PersonRef[], text: string): PersonRef | undefined {
  const needle = text.trim().toLowerCase();
  return list.find((p) => p.displayName.toLowerCase() === needle || p.email?.toLowerCase() === needle) ?? list.find((p) => p.displayName.toLowerCase().startsWith(needle));
}
function parseDate(text: string): string | null | undefined {
  const t = text.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) {
    const [, a, b, y] = m;
    // Day first when the first number cannot be a month, otherwise month first (US spreadsheets).
    const day = Number(a) > 12 ? a : b;
    const month = Number(a) > 12 ? b : a;
    return `${y}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return undefined;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Turns typed or pasted text into a task patch for a column. Returns a reason when the text cannot be applied,
 * for example an unknown status name.
 */
export function coerceCellInput(column: TableColumn, text: string, ctx: GroupingContext, now = new Date().toISOString()): CoerceResult {
  const t = text.trim();
  const custom = (value: unknown): CoerceResult => ({ ok: true, patch: { customFields: { [column.fieldId!]: value } }, optimistic: (r) => ({ ...r, customFields: { ...r.customFields, [column.fieldId!]: value } }) });
  switch (column.kind) {
    case "title": {
      if (!t) return { ok: false, reason: "A title is required" };
      return { ok: true, patch: { title: t }, optimistic: (r) => ({ ...r, title: t }) };
    }
    case "status": {
      const status = findByName(ctx.statuses, t);
      if (!status) return { ok: false, reason: `No status named ${t}` };
      return { ok: true, patch: { statusId: status.id }, optimistic: (r) => ({ ...r, status, completedAt: status.category === "done" ? (r.completedAt ?? now) : null }) };
    }
    case "person": {
      if (column.id !== "assignee" && !column.fieldId) return { ok: false, reason: "This column is read only" };
      if (!t || t.toLowerCase() === "unassigned") {
        return column.fieldId ? custom(null) : { ok: true, patch: { assigneeId: null }, optimistic: (r) => ({ ...r, assignee: null }) };
      }
      const person = findPerson(ctx.members, t);
      if (!person) return { ok: false, reason: `No one named ${t}` };
      return column.fieldId ? custom(person.id) : { ok: true, patch: { assigneeId: person.id }, optimistic: (r) => ({ ...r, assignee: person }) };
    }
    case "date": {
      const iso = parseDate(t);
      if (iso === undefined) return { ok: false, reason: `${t} is not a date` };
      if (column.fieldId) return custom(iso);
      const key = column.id === "start_date" ? "startDate" : "dueDate";
      return { ok: true, patch: { [key]: iso }, optimistic: (r) => ({ ...r, [key]: iso }) };
    }
    case "priority": {
      const entry = (Object.entries(priorityLabels) as Array<[Priority, string]>).find(([k, label]) => k === t.toLowerCase() || label.toLowerCase() === t.toLowerCase() || (t === "" && k === "none"));
      if (!entry) return { ok: false, reason: `${t} is not a priority` };
      const priority = entry[0];
      return { ok: true, patch: { priority }, optimistic: (r) => ({ ...r, priority }) };
    }
    case "number": {
      const cleaned = t.replace(/[,%$\s]/g, "");
      const n = cleaned === "" ? null : Number(cleaned);
      if (n !== null && !Number.isFinite(n)) return { ok: false, reason: `${t} is not a number` };
      if (column.fieldId) return custom(n);
      return { ok: true, patch: { estimate: n }, optimistic: (r) => ({ ...r, estimate: n }) };
    }
    case "section": {
      if (!t) return { ok: true, patch: { sectionId: null }, optimistic: (r) => ({ ...r, sectionId: null }) };
      const section = findByName(ctx.sections, t);
      if (!section) return { ok: false, reason: `No section named ${t}` };
      return { ok: true, patch: { sectionId: section.id }, optimistic: (r) => ({ ...r, sectionId: section.id }) };
    }
    case "cycle": {
      const cycleId = t || null;
      return { ok: true, patch: { cycleId }, optimistic: (r) => ({ ...r, cycleId }) };
    }
    case "checkbox": {
      const value = ["yes", "true", "1", "x", "y", "checked"].includes(t.toLowerCase());
      if (column.fieldId) return custom(value);
      return { ok: true, patch: { isMilestone: value }, optimistic: (r) => ({ ...r, isMilestone: value }) };
    }
    case "select": {
      if (!t) return custom(null);
      const opt = findByName(column.options ?? [], t);
      if (!opt) return { ok: false, reason: `No option named ${t}` };
      return custom(opt.id);
    }
    case "text": {
      if (!column.fieldId) return { ok: false, reason: "This column is read only" };
      return custom(t === "" ? null : t);
    }
    default:
      return { ok: false, reason: "This column is read only" };
  }
}

/** The patch that copies the value of `source` into other rows (fill handle). */
export function fillPatch(column: TableColumn, source: TaskRow, ctx: GroupingContext): CoerceResult {
  const v = cellValue(source, column);
  switch (column.kind) {
    case "status":
      return coerceCellInput(column, source.status.name, ctx);
    case "person":
      if (column.id === "assignee") return coerceCellInput(column, source.assignee?.displayName ?? "", ctx);
      return v ? coerceCellInput(column, ctx.members.find((m) => m.id === v)?.displayName ?? "", ctx) : coerceCellInput(column, "", ctx);
    case "select":
      return coerceCellInput(column, column.options?.find((o) => o.id === v)?.name ?? "", ctx);
    case "section":
      return coerceCellInput(column, ctx.sections.find((s) => s.id === v)?.name ?? "", ctx);
    case "checkbox":
      return coerceCellInput(column, v ? "yes" : "no", ctx);
    case "priority":
      return coerceCellInput(column, String(v), ctx);
    case "title":
      return { ok: false, reason: "Titles cannot be filled" };
    default:
      return coerceCellInput(column, v === null || v === undefined ? "" : String(v), ctx);
  }
}

/** Compares two cell values for client side sorting of the same column. */
export function compareCells(a: unknown, b: unknown, column: TableColumn, ctx: GroupingContext): number {
  const empty = (v: unknown) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
  if (empty(a) && empty(b)) return 0;
  if (empty(a)) return 1;
  if (empty(b)) return -1;
  switch (column.kind) {
    case "number":
      return Number(a) - Number(b);
    case "priority":
      return priorityRank[a as Priority] - priorityRank[b as Priority];
    case "status":
      return (ctx.statuses.find((s) => s.id === a)?.position ?? 0) - (ctx.statuses.find((s) => s.id === b)?.position ?? 0);
    case "checkbox":
      return Number(Boolean(a)) - Number(Boolean(b));
    default:
      return String(a).localeCompare(String(b));
  }
}

/** Column ids as TanStack column order, with the fixed columns first. */
export function nextVisibleFields(visibleFields: FieldRef[], activeId: FieldRef, overId: FieldRef): FieldRef[] {
  if (activeId === overId) return visibleFields;
  const without = visibleFields.filter((f) => f !== activeId);
  const idx = without.indexOf(overId);
  if (idx < 0) return visibleFields;
  const from = visibleFields.indexOf(activeId);
  const to = visibleFields.indexOf(overId);
  without.splice(from < to ? idx + 1 : idx, 0, activeId);
  return without;
}
