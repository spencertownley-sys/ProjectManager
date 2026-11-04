import { describe, it, expect } from "vitest";
import { buildTimelineRows, coveringRange, scheduledTasks } from "./rows";
import { buildTimelineSvg } from "./export";
import type { TaskRow, StatusRef } from "@/lib/query-engine/types";
import type { Group } from "@/lib/client/grouping";

const todo: StatusRef = { id: "s1", name: "To do", category: "not_started", color: "gray", position: 0 };
const base = (over: Partial<TaskRow>): TaskRow => ({
  id: over.id ?? "t1",
  key: "P-1",
  number: 1,
  workspaceId: "w",
  projectId: "p",
  projectKey: "P",
  projectColor: "blue",
  sectionId: null,
  parentId: null,
  cycleId: null,
  title: "Task",
  status: todo,
  priority: "none",
  assignee: null,
  startDate: null,
  dueDate: null,
  dueTime: null,
  estimate: null,
  isMilestone: false,
  position: 1024,
  version: 1,
  createdBy: "u",
  completedAt: null,
  createdAt: "",
  updatedAt: "",
  subtaskCount: 0,
  subtaskDoneCount: 0,
  commentCount: 0,
  attachmentCount: 0,
  blockedByCount: 0,
  tags: [],
  customFields: {},
  ...over,
});

const parent = base({ id: "p", title: "Parent", startDate: "2026-11-02", dueDate: "2026-11-06" });
const child = base({ id: "c", title: "Child", parentId: "p", startDate: "2026-11-03", dueDate: "2026-11-04" });
const loose = base({ id: "l", title: "Loose", dueDate: "2026-11-10" });
const unscheduled = base({ id: "u", title: "Unscheduled" });
const groups: Group[] = [
  { key: "a", label: "Planning", rows: [parent, child, unscheduled] },
  { key: "b", label: "Launch", rows: [loose] },
];

describe("timeline rows", () => {
  it("computes covering ranges", () => {
    expect(coveringRange([parent, child, unscheduled])).toEqual({ start: "2026-11-02", end: "2026-11-06" });
    expect(coveringRange([unscheduled])).toBeNull();
    expect(scheduledTasks([parent, unscheduled])).toEqual([{ id: "p", start: "2026-11-02", end: "2026-11-06" }]);
  });
  it("builds group rows with summaries and nested task rows", () => {
    const rows = buildTimelineRows(groups, { collapsedGroups: [], collapsedParents: [], subtasks: "nested", showGroups: true });
    expect(rows.map((r) => r.key)).toEqual(["group:a", "p", "c", "u", "group:b", "l"]);
    expect(rows[0]).toMatchObject({ kind: "group", summary: { start: "2026-11-02", end: "2026-11-06" }, count: 3 });
    expect(rows[1]).toMatchObject({ kind: "task", depth: 0, hasChildren: true, expanded: true });
    expect(rows[2]).toMatchObject({ kind: "task", depth: 1 });
  });
  it("hides collapsed groups and parents, and honors subtask modes", () => {
    expect(buildTimelineRows(groups, { collapsedGroups: ["a"], collapsedParents: [], subtasks: "nested", showGroups: true }).map((r) => r.key)).toEqual(["group:a", "group:b", "l"]);
    expect(buildTimelineRows(groups, { collapsedGroups: [], collapsedParents: ["p"], subtasks: "nested", showGroups: true }).map((r) => r.key)).toEqual(["group:a", "p", "u", "group:b", "l"]);
    expect(buildTimelineRows(groups, { collapsedGroups: [], collapsedParents: [], subtasks: "hidden", showGroups: false }).map((r) => r.key)).toEqual(["p", "u", "l"]);
    expect(buildTimelineRows(groups, { collapsedGroups: [], collapsedParents: [], subtasks: "flat", showGroups: false }).map((r) => r.key)).toEqual(["p", "c", "u", "l"]);
  });
});

describe("timeline export", () => {
  it("builds a self contained SVG with bars, labels, connectors, and the today line", () => {
    const rows = buildTimelineRows(groups, { collapsedGroups: [], collapsedParents: [], subtasks: "nested", showGroups: true });
    const palette = { surface: "white", subtle: "whitesmoke", border: "silver", fg: "black", fgSecondary: "dimgray", fgTertiary: "gray", brand: "blue", danger: "red", bar: "lightblue", barEdge: "steelblue", fontFamily: "sans-serif" };
    const { svg, width, height } = buildTimelineSvg({ title: "Spring <campaign>", rows, range: { start: "2026-11-01", end: "2026-11-14" }, zoom: "day", today: "2026-11-04", weekStartsOn: 1, dependencies: [{ id: "d", predecessorId: "p", successorId: "l", type: "fs", lagDays: 0 }], leftWidth: 200, rowHeight: 32, barHeight: 20, palette });
    expect(svg.startsWith("<svg xmlns")).toBe(true);
    expect(width).toBe(200 + 14 * 48);
    expect(height).toBe(32 + 48 + rows.length * 32);
    expect(svg).toContain("Spring &lt;campaign&gt;");
    expect(svg).toContain(">Parent<");
    expect(svg).toContain('marker-end="url(#arrow)"');
    expect((svg.match(/<rect[^>]*rx="3"/g) ?? []).length).toBe(3);
    expect(svg).toContain('stroke="blue" stroke-width="2"');
  });
});
