import { z } from "zod";
import { viewTypeValue } from "./common";

export const standardFields = [
  "title",
  "key",
  "status",
  "status_category",
  "assignee",
  "start_date",
  "due_date",
  "priority",
  "estimate",
  "section",
  "cycle",
  "tags",
  "is_milestone",
  "parent",
  "created_by",
  "created_at",
  "updated_at",
  "completed_at",
] as const;
export type StandardField = (typeof standardFields)[number];

export const fieldRef = z.union([z.enum(standardFields), z.string().regex(/^custom:[0-9a-f-]{36}$/)]);
export type FieldRef = z.infer<typeof fieldRef>;

export const filterOperator = z.enum([
  "is",
  "is_not",
  "contains",
  "not_contains",
  "is_empty",
  "is_not_empty",
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "between",
  "before",
  "after",
  "is_today",
  "is_this_week",
  "next_7_days",
  "is_overdue",
  "is_any_of",
  "is_none_of",
  "is_me",
  "is_checked",
  "is_not_checked",
  "includes_any",
  "includes_all",
  "includes_none",
  "is_current_cycle",
]);
export type FilterOperator = z.infer<typeof filterOperator>;

export const filterValue = z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]);

export const filter = z.object({
  kind: z.literal("filter").default("filter"),
  field: fieldRef,
  op: filterOperator,
  value: filterValue.optional(),
});
export type Filter = z.infer<typeof filter>;

export type FilterGroup = {
  kind: "group";
  op: "and" | "or";
  items: Array<Filter | FilterGroup>;
};
export const filterGroup: z.ZodType<FilterGroup> = z.lazy(() =>
  z.object({
    kind: z.literal("group"),
    op: z.enum(["and", "or"]),
    items: z.array(z.union([filter, filterGroup])).max(50),
  }),
);

export const sort = z.object({ field: z.union([fieldRef, z.literal("manual")]), direction: z.enum(["asc", "desc"]) });
export type Sort = z.infer<typeof sort>;

export const viewSpec = z.object({
  filters: filterGroup.default({ kind: "group", op: "and", items: [] }),
  sorts: z.array(sort).max(3).default([{ field: "manual", direction: "asc" }]),
  groupBy: fieldRef.optional(),
  subtasks: z.enum(["nested", "flat", "hidden"]).default("nested"),
  showCompleted: z.enum(["none", "recent", "all"]).default("recent"),
  visibleFields: z.array(fieldRef).default(["assignee", "due_date", "priority", "status"]),
  columnWidths: z.record(z.string(), z.number()).default({}),
  options: z.record(z.string(), z.unknown()).default({}),
});
export type ViewSpec = z.infer<typeof viewSpec>;
export type ViewSpecInput = z.input<typeof viewSpec>;

export const defaultViewSpec = (): ViewSpec => viewSpec.parse({});

export const savedViewInput = z.object({
  projectId: z.string().uuid().nullable(),
  name: z.string().trim().min(1).max(80),
  type: viewTypeValue,
  spec: viewSpec,
  isShared: z.boolean().default(false),
});
export type SavedViewInput = z.infer<typeof savedViewInput>;

/** Serializes a spec into a URL query parameter and back, so views can be linked. */
export function encodeViewSpec(spec: ViewSpec): string {
  return encodeURIComponent(JSON.stringify(spec));
}
export function decodeViewSpec(raw: string | null | undefined): ViewSpec {
  if (!raw) return defaultViewSpec();
  try {
    return viewSpec.parse(JSON.parse(decodeURIComponent(raw)));
  } catch {
    return defaultViewSpec();
  }
}
