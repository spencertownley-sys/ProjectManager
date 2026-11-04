import type { TaskRow } from "@/lib/query-engine/types";
import type { Group } from "@/lib/client/grouping";
import { buildTree } from "@/lib/client/grouping";
import type { EngineRow } from "@/components/views/engine/types";
import { taskSpan, type DateRange } from "./scale";

/** Smallest range covering the scheduled tasks in a list, or null when none has dates. */
export function coveringRange(tasks: TaskRow[]): DateRange | null {
  let out: DateRange | null = null;
  for (const t of tasks) {
    const span = taskSpan(t);
    if (!span) continue;
    if (!out) out = { start: span.start, end: span.end };
    else {
      if (span.start < out.start) out.start = span.start;
      if (span.end > out.end) out.end = span.end;
    }
  }
  return out;
}

export type BuildRowsOptions = {
  /** Group keys whose tasks are hidden. */
  collapsedGroups: Iterable<string>;
  /** Parent task ids whose subtasks are hidden. Subtasks show by default on timelines. */
  collapsedParents: Iterable<string>;
  subtasks: "nested" | "flat" | "hidden";
  /** Render group rows even when there is a single group. */
  showGroups: boolean;
};

/** Turns the shared grouping into engine rows: group rows with summary spans, then task rows (nested subtasks indented). */
export function buildTimelineRows(groups: Group[], options: BuildRowsOptions): EngineRow[] {
  const collapsedGroups = new Set(options.collapsedGroups);
  const collapsedParents = new Set(options.collapsedParents);
  const out: EngineRow[] = [];
  for (const g of groups) {
    const collapsed = collapsedGroups.has(g.key);
    if (options.showGroups) out.push({ kind: "group", key: `group:${g.key}`, label: g.label, depth: 0, collapsed, count: g.rows.length, color: g.color, summary: coveringRange(g.rows), meta: g.meta });
    if (collapsed && options.showGroups) continue;
    if (options.subtasks === "nested") {
      const tree = buildTree(g.rows);
      const hidden = new Set<string>();
      for (const node of tree) {
        if (node.row.parentId && (hidden.has(node.row.parentId) || collapsedParents.has(node.row.parentId))) {
          hidden.add(node.row.id);
          continue;
        }
        out.push({ kind: "task", key: node.row.id, task: node.row, depth: node.depth, groupKey: g.key, hasChildren: node.hasChildren, expanded: !collapsedParents.has(node.row.id) });
      }
    } else {
      const ids = new Set(g.rows.map((r) => r.id));
      for (const r of g.rows) {
        if (options.subtasks === "hidden" && r.parentId && ids.has(r.parentId)) continue;
        out.push({ kind: "task", key: r.id, task: r, depth: 0, groupKey: g.key, hasChildren: false, expanded: true });
      }
    }
  }
  return out;
}

/** Scheduled tasks as the critical path and auto schedule helpers expect them. */
export function scheduledTasks(rows: TaskRow[]): Array<{ id: string; start: string; end: string }> {
  const out: Array<{ id: string; start: string; end: string }> = [];
  for (const r of rows) {
    const span = taskSpan(r);
    if (span) out.push({ id: r.id, start: span.start, end: span.end });
  }
  return out;
}
