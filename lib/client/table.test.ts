import { describe, it, expect } from "vitest";
import { tableColumns, visibleTableColumns, cellValue, cellText, aggregate, formatAggregate, groupRollup, rowsToCsv, parseClipboard, coerceCellInput, fillPatch, compareCells, nextVisibleFields, readAggregates, defaultAggregate } from "./table";
import { defaultViewSpec } from "@/lib/validation/view-spec";
import type { TaskRow, StatusRef } from "@/lib/query-engine/types";

const todo: StatusRef = { id: "s1", name: "To do", category: "not_started", color: "gray", position: 0 };
const done: StatusRef = { id: "s3", name: "Done", category: "done", color: "green", position: 2 };
const amy = { id: "u1", displayName: "Amy Lee", avatarUrl: null, email: "amy@example.com" };
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
  createdBy: "u1",
  completedAt: null,
  createdAt: "2026-11-01T10:00:00Z",
  updatedAt: "2026-11-02T10:00:00Z",
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
  sections: [{ id: "a", name: "Planning", position: 1, isCollapsed: false }],
  statuses: [todo, done],
  members: [amy, bob],
  fields: [
    { id: "f1", name: "Team", type: "single_select" as const, config: { options: [{ id: "o1", name: "Web" }, { id: "o2", name: "Email" }] } },
    { id: "f2", name: "Budget", type: "currency" as const, config: {} },
    { id: "f3", name: "Approved", type: "checkbox" as const, config: {} },
  ],
  today: "2026-11-04",
};
const all = tableColumns(ctx.fields, "Sprint");
const col = (id: string) => all.find((c) => c.id === id)!;

describe("table columns", () => {
  it("lists standard columns then custom fields and keeps the title frozen first", () => {
    expect(all[0].id).toBe("title");
    expect(col("cycle").label).toBe("Sprint");
    expect(col("custom:f1").kind).toBe("select");
    expect(col("custom:f2").numberFormat).toBe("currency");
    const visible = visibleTableColumns(all, ["due_date", "title", "custom:f3", "bogus" as never]);
    expect(visible.map((c) => c.id)).toEqual(["title", "due_date", "custom:f3"]);
  });
  it("reads values and text per kind", () => {
    const row = base({ assignee: amy, estimate: 5, dueDate: "2026-11-10", tags: [{ id: "g", name: "Web", color: "purple" }], customFields: { f1: "o2", f2: 1234.5, f3: true }, sectionId: "a" });
    expect(cellValue(row, col("assignee"))).toBe("u1");
    expect(cellText(row, col("assignee"), ctx)).toBe("Amy Lee");
    expect(cellText(row, col("status"), ctx)).toBe("To do");
    expect(cellText(row, col("priority"), ctx)).toBe("No priority");
    expect(cellText(row, col("tags"), ctx)).toBe("Web");
    expect(cellText(row, col("section"), ctx)).toBe("Planning");
    expect(cellText(row, col("custom:f1"), ctx)).toBe("Email");
    expect(cellText(row, col("custom:f2"), ctx)).toBe("1,234.50");
    expect(cellText(row, col("custom:f3"), ctx)).toBe("Yes");
    expect(cellText(row, col("created_at"), ctx)).toBe("2026-11-01");
    expect(cellText(row, col("created_by"), ctx)).toBe("Amy Lee");
  });
});

describe("aggregates and roll-ups", () => {
  const rows = [base({ id: "1", estimate: 3, dueDate: "2026-11-10", status: done }), base({ id: "2", estimate: 5, dueDate: "2026-11-02" }), base({ id: "3", estimate: null })];
  it("computes number, date, count, and percent complete aggregates", () => {
    expect(aggregate(rows, col("estimate"), "sum")).toBe(8);
    expect(aggregate(rows, col("estimate"), "average")).toBe(4);
    expect(aggregate(rows, col("estimate"), "min")).toBe(3);
    expect(aggregate(rows, col("estimate"), "max")).toBe(5);
    expect(aggregate(rows, col("estimate"), "count")).toBe(3);
    expect(aggregate(rows, col("due_date"), "min")).toBe("2026-11-02");
    expect(aggregate(rows, col("due_date"), "max")).toBe("2026-11-10");
    expect(aggregate(rows, col("status"), "percent_complete")).toBe(33);
    expect(aggregate([], col("status"), "percent_complete")).toBe(0);
    expect(aggregate(rows, col("title"), "sum")).toBeNull();
  });
  it("formats aggregates for the footer", () => {
    expect(formatAggregate(8, col("estimate"), "sum")).toBe("Sum 8");
    expect(formatAggregate(1, col("title"), "count")).toBe("1 task");
    expect(formatAggregate(33, col("status"), "percent_complete")).toBe("33% complete");
    expect(formatAggregate("2026-11-02", col("due_date"), "min")).toBe("Min 2 Nov");
    expect(formatAggregate(null, col("due_date"), "min")).toBe("");
  });
  it("builds group roll-ups", () => {
    expect(groupRollup(rows, col("estimate"))).toBe("Sum 8, avg 4");
    expect(groupRollup(rows, col("due_date"))).toBe("2 Nov to 10 Nov");
    expect(groupRollup(rows, col("status"))).toBe("33% done");
    expect(groupRollup(rows, col("assignee"))).toBe("");
  });
  it("reads aggregate settings with defaults", () => {
    expect(readAggregates(defaultViewSpec())).toEqual({});
    expect(readAggregates({ ...defaultViewSpec(), options: { tableAggregates: { estimate: "max", due_date: "bogus" } } })).toEqual({ estimate: "max" });
    expect(defaultAggregate(col("estimate"))).toBe("sum");
    expect(defaultAggregate(col("status"))).toBe("percent_complete");
    expect(defaultAggregate(col("title"))).toBe("count");
    expect(defaultAggregate(col("assignee"))).toBe("none");
  });
});

describe("csv and clipboard", () => {
  it("exports CSV with escaping", () => {
    const rows = [base({ id: "1", title: 'Say "hi", please', assignee: amy, estimate: 2 })];
    const csv = rowsToCsv(rows, visibleTableColumns(all, ["assignee", "estimate"]), ctx);
    expect(csv).toBe('Title,Assignee,Estimate\r\n"Say ""hi"", please",Amy Lee,2\r\n');
  });
  it("parses tab separated clipboard text", () => {
    expect(parseClipboard("a\tb\r\nc\t\"d\"\"e\"\n")).toEqual([["a", "b"], ["c", 'd"e']]);
    expect(parseClipboard("single")).toEqual([["single"]]);
  });
});

describe("cell input coercion", () => {
  it("maps names to ids and validates", () => {
    expect(coerceCellInput(col("status"), "done", ctx)).toMatchObject({ ok: true, patch: { statusId: "s3" } });
    expect(coerceCellInput(col("status"), "Nope", ctx)).toMatchObject({ ok: false });
    expect(coerceCellInput(col("assignee"), "bob", ctx)).toMatchObject({ ok: true, patch: { assigneeId: "u2" } });
    expect(coerceCellInput(col("assignee"), "amy@example.com", ctx)).toMatchObject({ ok: true, patch: { assigneeId: "u1" } });
    expect(coerceCellInput(col("assignee"), "", ctx)).toMatchObject({ ok: true, patch: { assigneeId: null } });
    expect(coerceCellInput(col("priority"), "High", ctx)).toMatchObject({ ok: true, patch: { priority: "high" } });
    expect(coerceCellInput(col("due_date"), "2026-12-01", ctx)).toMatchObject({ ok: true, patch: { dueDate: "2026-12-01" } });
    expect(coerceCellInput(col("due_date"), "12/25/2026", ctx)).toMatchObject({ ok: true, patch: { dueDate: "2026-12-25" } });
    expect(coerceCellInput(col("due_date"), "25/12/2026", ctx)).toMatchObject({ ok: true, patch: { dueDate: "2026-12-25" } });
    expect(coerceCellInput(col("due_date"), "", ctx)).toMatchObject({ ok: true, patch: { dueDate: null } });
    expect(coerceCellInput(col("due_date"), "soonish", ctx)).toMatchObject({ ok: false });
    expect(coerceCellInput(col("estimate"), "1,200", ctx)).toMatchObject({ ok: true, patch: { estimate: 1200 } });
    expect(coerceCellInput(col("estimate"), "abc", ctx)).toMatchObject({ ok: false });
    expect(coerceCellInput(col("section"), "plan", ctx)).toMatchObject({ ok: true, patch: { sectionId: "a" } });
    expect(coerceCellInput(col("is_milestone"), "yes", ctx)).toMatchObject({ ok: true, patch: { isMilestone: true } });
    expect(coerceCellInput(col("custom:f1"), "web", ctx)).toMatchObject({ ok: true, patch: { customFields: { f1: "o1" } } });
    expect(coerceCellInput(col("custom:f2"), "$1,500", ctx)).toMatchObject({ ok: true, patch: { customFields: { f2: 1500 } } });
    expect(coerceCellInput(col("custom:f3"), "no", ctx)).toMatchObject({ ok: true, patch: { customFields: { f3: false } } });
    expect(coerceCellInput(col("key"), "P-9", ctx)).toMatchObject({ ok: false });
    expect(coerceCellInput(col("title"), "  ", ctx)).toMatchObject({ ok: false });
  });
  it("applies optimistic updates", () => {
    const r = coerceCellInput(col("status"), "Done", ctx, "2026-11-04T00:00:00Z");
    expect(r.ok && r.optimistic(base({})).completedAt).toBe("2026-11-04T00:00:00Z");
  });
  it("builds fill patches from a source row", () => {
    const source = base({ status: done, assignee: amy, priority: "urgent", customFields: { f1: "o2", f3: true }, estimate: 4, sectionId: "a" });
    expect(fillPatch(col("status"), source, ctx)).toMatchObject({ ok: true, patch: { statusId: "s3" } });
    expect(fillPatch(col("assignee"), source, ctx)).toMatchObject({ ok: true, patch: { assigneeId: "u1" } });
    expect(fillPatch(col("priority"), source, ctx)).toMatchObject({ ok: true, patch: { priority: "urgent" } });
    expect(fillPatch(col("custom:f1"), source, ctx)).toMatchObject({ ok: true, patch: { customFields: { f1: "o2" } } });
    expect(fillPatch(col("custom:f3"), source, ctx)).toMatchObject({ ok: true, patch: { customFields: { f3: true } } });
    expect(fillPatch(col("estimate"), source, ctx)).toMatchObject({ ok: true, patch: { estimate: 4 } });
    expect(fillPatch(col("section"), source, ctx)).toMatchObject({ ok: true, patch: { sectionId: "a" } });
    expect(fillPatch(col("title"), source, ctx)).toMatchObject({ ok: false });
  });
});

describe("sorting and ordering", () => {
  it("compares by kind with empties last", () => {
    expect(compareCells(3, 10, col("estimate"), ctx)).toBeLessThan(0);
    expect(compareCells(null, 1, col("estimate"), ctx)).toBeGreaterThan(0);
    expect(compareCells("urgent", "low", col("priority"), ctx)).toBeGreaterThan(0);
    expect(compareCells("s3", "s1", col("status"), ctx)).toBeGreaterThan(0);
    expect(compareCells("b", "a", col("title"), ctx)).toBeGreaterThan(0);
  });
  it("reorders visible fields by dragging one column over another", () => {
    expect(nextVisibleFields(["a", "b", "c", "d"] as never, "a" as never, "c" as never)).toEqual(["b", "c", "a", "d"]);
    expect(nextVisibleFields(["a", "b", "c", "d"] as never, "d" as never, "b" as never)).toEqual(["a", "d", "b", "c"]);
    expect(nextVisibleFields(["a", "b"] as never, "a" as never, "a" as never)).toEqual(["a", "b"]);
  });
});
