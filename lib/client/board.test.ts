import { describe, it, expect } from "vitest";
import { buildColumns, columnKeyOf, fieldPatch, dropNeighbors, positionBetween, readBoardOptions, atWipCapacity, boardRows, composeOptimistic } from "./board";
import { defaultViewSpec } from "@/lib/validation/view-spec";
import type { TaskRow, StatusRef } from "@/lib/query-engine/types";

const todo: StatusRef = { id: "s1", name: "To do", category: "not_started", color: "gray", position: 0 };
const doing: StatusRef = { id: "s2", name: "Doing", category: "in_progress", color: "blue", position: 1 };
const done: StatusRef = { id: "s3", name: "Done", category: "done", color: "green", position: 2 };
const amy = { id: "u1", displayName: "Amy Lee", avatarUrl: null };
const bob = { id: "u2", displayName: "Bob Ray", avatarUrl: null };

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

const ctx = {
  sections: [{ id: "a", name: "A", position: 1, isCollapsed: false }],
  statuses: [todo, doing, done],
  members: [amy, bob],
  fields: [{ id: "f1", name: "Team", type: "single_select" as const, config: { options: [{ id: "o1", name: "Web" }, { id: "o2", name: "Email" }] } }],
  today: "2026-11-04",
};
const statuses = [
  { id: "s1", wipLimit: null },
  { id: "s2", wipLimit: 2 },
  { id: "s3", wipLimit: null },
];

describe("board columns", () => {
  it("builds status columns in workflow order with WIP limits, including empty ones", () => {
    const cols = buildColumns([base({ id: "1", status: doing })], "status", ctx, statuses, ctx.members);
    expect(cols.map((c) => c.label)).toEqual(["To do", "Doing", "Done"]);
    expect(cols[1].wipLimit).toBe(2);
    expect(cols[1].rows.map((r) => r.id)).toEqual(["1"]);
    expect(cols[0].rows).toEqual([]);
  });
  it("includes every member as an assignee column and puts Unassigned last", () => {
    const cols = buildColumns([base({ id: "1", assignee: bob })], "assignee", ctx, statuses, ctx.members);
    expect(cols.map((c) => c.label)).toEqual(["Amy Lee", "Bob Ray", "Unassigned"]);
    expect(cols.every((c) => c.wipLimit === null)).toBe(true);
  });
  it("orders custom select columns by option order and adds missing options", () => {
    const cols = buildColumns([base({ id: "1", customFields: { f1: "o2" } }), base({ id: "2" })], "custom:f1", ctx, statuses, ctx.members);
    expect(cols.map((c) => c.label)).toEqual(["Web", "Email", "No Team"]);
  });
  it("matches column keys to grouping keys", () => {
    expect(columnKeyOf(base({ status: doing }), "status")).toBe("s2");
    expect(columnKeyOf(base({}), "assignee")).toBe("unassigned");
    expect(columnKeyOf(base({ assignee: amy }), "assignee")).toBe("u1");
    expect(columnKeyOf(base({ sectionId: "a" }), "section")).toBe("a");
    expect(columnKeyOf(base({}), "section")).toBe("none");
    expect(columnKeyOf(base({ customFields: { f1: ["o1"] } }), "custom:f1")).toBe("o1");
    expect(columnKeyOf(base({}), "custom:f1")).toBe("none");
  });
});

describe("board drops", () => {
  it("patches status and marks the task complete when dropped on a done column", () => {
    const p = fieldPatch("status", "s3", ctx, "2026-11-04T10:00:00Z")!;
    expect(p.patch).toEqual({ statusId: "s3" });
    const row = p.optimistic(base({}));
    expect(row.status.id).toBe("s3");
    expect(row.completedAt).toBe("2026-11-04T10:00:00Z");
    expect(fieldPatch("status", "s2", ctx)!.optimistic(row).completedAt).toBeNull();
  });
  it("patches assignee, priority, section, cycle, and custom fields", () => {
    expect(fieldPatch("assignee", "u1", ctx)!.patch).toEqual({ assigneeId: "u1" });
    expect(fieldPatch("assignee", "unassigned", ctx)!.patch).toEqual({ assigneeId: null });
    expect(fieldPatch("assignee", "ghost", ctx)).toBeNull();
    expect(fieldPatch("priority", "high", ctx)!.patch).toEqual({ priority: "high" });
    expect(fieldPatch("priority", "bogus", ctx)).toBeNull();
    expect(fieldPatch("section", "a", ctx)!.patch).toEqual({ sectionId: "a" });
    expect(fieldPatch("section", "none", ctx)!.patch).toEqual({ sectionId: null });
    expect(fieldPatch("cycle", "c1", ctx)!.patch).toEqual({ cycleId: "c1" });
    expect(fieldPatch("custom:f1", "o1", ctx)!.patch).toEqual({ customFields: { f1: "o1" } });
    expect(fieldPatch("custom:f1", "none", ctx)!.optimistic(base({ customFields: { f1: "o2" } })).customFields).toEqual({ f1: null });
    expect(fieldPatch("due_date", "today", ctx)).toBeNull();
  });
  it("composes optimistic updaters", () => {
    const fn = composeOptimistic(fieldPatch("status", "s2", ctx)!.optimistic, null, fieldPatch("assignee", "u2", ctx)!.optimistic);
    const row = fn(base({}));
    expect(row.status.id).toBe("s2");
    expect(row.assignee?.id).toBe("u2");
  });
  it("computes neighbors and positions for a drop", () => {
    const cards = [base({ id: "a", position: 1000 }), base({ id: "b", position: 2000 }), base({ id: "c", position: 3000 })];
    expect(dropNeighbors(cards, "b", "before")).toEqual({ before: cards[0], after: cards[1] });
    expect(dropNeighbors(cards, "b", "after")).toEqual({ before: cards[1], after: cards[2] });
    expect(dropNeighbors(cards, "a", "before")).toEqual({ before: null, after: cards[0] });
    expect(dropNeighbors(cards, null, "after")).toEqual({ before: cards[2], after: null });
    expect(dropNeighbors([], null, "after")).toEqual({ before: null, after: null });
    expect(positionBetween(cards[0], cards[1], 0)).toBe(1500);
    expect(positionBetween(cards[2], null, 0)).toBe(4024);
    expect(positionBetween(null, cards[0], 0)).toBe(-24);
    expect(positionBetween(null, null, 7)).toBe(7);
  });
  it("detects WIP capacity", () => {
    const col = { key: "s2", label: "Doing", rows: [], wipLimit: 2 };
    expect(atWipCapacity(col, 1)).toBe(false);
    expect(atWipCapacity(col, 2)).toBe(true);
    expect(atWipCapacity({ ...col, wipLimit: null }, 50)).toBe(false);
  });
});

describe("board options", () => {
  it("reads defaults and tolerates junk", () => {
    expect(readBoardOptions(defaultViewSpec())).toEqual({ columnField: "status", density: "standard", collapsed: [] });
    const spec = { ...defaultViewSpec(), options: { boardColumns: "assignee", boardDensity: "compact", boardCollapsed: ["s1", 3, null] } };
    expect(readBoardOptions(spec)).toEqual({ columnField: "assignee", density: "compact", collapsed: ["s1"] });
    expect(readBoardOptions({ ...defaultViewSpec(), options: { boardDensity: "huge" } }).density).toBe("standard");
  });
  it("hides nested subtasks unless the flat mode is on", () => {
    const rows = [base({ id: "p" }), base({ id: "c", parentId: "p" }), base({ id: "orphan", parentId: "missing" })];
    expect(boardRows(rows, "nested").map((r) => r.id)).toEqual(["p", "orphan"]);
    expect(boardRows(rows, "hidden").map((r) => r.id)).toEqual(["p", "orphan"]);
    expect(boardRows(rows, "flat").map((r) => r.id)).toEqual(["p", "c", "orphan"]);
  });
});
