import { describe, it, expect } from "vitest";
import { weekDays, monthGridRange, weekRange, packLanes, layoutCalendar, moveSpanByDrop, scheduleDays, stepAnchor, timeFraction, readCalendarOptions, weekLabel } from "./calendar";
import { defaultViewSpec } from "@/lib/validation/view-spec";
import type { TaskRow, StatusRef } from "@/lib/query-engine/types";

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

describe("calendar grid", () => {
  it("orders week days from the workspace start and drops weekends when hidden", () => {
    expect(weekDays(1, true)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(weekDays(0, false)).toEqual([1, 2, 3, 4, 5]);
  });
  it("pads the month to whole weeks and finds the week of a day", () => {
    expect(monthGridRange("2026-11-15", 1)).toEqual({ start: "2026-10-26", end: "2026-12-06" });
    expect(monthGridRange("2026-11-15", 0)).toEqual({ start: "2026-11-01", end: "2026-12-05" });
    expect(weekRange("2026-11-04", 1)).toEqual({ start: "2026-11-02", end: "2026-11-08" });
  });
  it("packs overlapping chips into lanes", () => {
    const packed = packLanes([
      { id: "a", col: 0, cols: 3 },
      { id: "b", col: 1, cols: 1 },
      { id: "c", col: 3, cols: 2 },
      { id: "d", col: 0, cols: 1 },
    ]);
    expect(packed.map((p) => `${p.id}:${p.lane}`)).toEqual(["a:0", "d:1", "b:1", "c:0"]);
  });
  it("lays out multi day spans across weeks with continuation flags", () => {
    const rows = [base({ id: "long", startDate: "2026-11-05", dueDate: "2026-11-10" }), base({ id: "ms", dueDate: "2026-11-06", isMilestone: true }), base({ id: "none" })];
    const weeks = layoutCalendar(rows, { start: "2026-11-02", end: "2026-11-15" }, { weekStartsOn: 1, weekends: true, today: "2026-11-04", monthOf: "2026-11-01" });
    expect(weeks).toHaveLength(2);
    expect(weeks[0].days.map((d) => d.label)).toEqual(["2", "3", "4", "5", "6", "7", "8"]);
    expect(weeks[0].days[2].today).toBe(true);
    const long1 = weeks[0].items.find((i) => i.task.id === "long")!;
    expect(long1).toMatchObject({ col: 3, cols: 4, continuesLeft: false, continuesRight: true, lane: 0 });
    const ms = weeks[0].items.find((i) => i.task.id === "ms")!;
    expect(ms).toMatchObject({ col: 4, cols: 1, kind: "milestone", lane: 1 });
    const long2 = weeks[1].items.find((i) => i.task.id === "long")!;
    expect(long2).toMatchObject({ col: 0, cols: 2, continuesLeft: true, continuesRight: false });
    expect(weeks[0].lanes).toBe(2);
  });
  it("hides weekend only chips and clamps spans to visible days", () => {
    const rows = [base({ id: "sat", dueDate: "2026-11-07" }), base({ id: "fri-mon", startDate: "2026-11-06", dueDate: "2026-11-09" })];
    const weeks = layoutCalendar(rows, { start: "2026-11-02", end: "2026-11-15" }, { weekStartsOn: 1, weekends: false, today: "2026-11-04" });
    expect(weeks[0].days).toHaveLength(5);
    expect(weeks[0].items.map((i) => i.task.id)).toEqual(["fri-mon"]);
    expect(weeks[0].items[0]).toMatchObject({ col: 4, cols: 1, continuesRight: true });
    expect(weeks[1].items[0]).toMatchObject({ col: 0, cols: 1, continuesLeft: true });
  });
});

describe("calendar interactions", () => {
  it("moves a span by the grabbed day and keeps the duration", () => {
    expect(moveSpanByDrop({ start: "2026-11-05", end: "2026-11-07" }, "2026-11-06", "2026-11-13")).toEqual({ start: "2026-11-12", end: "2026-11-14" });
  });
  it("builds the schedule by due day with timed tasks first", () => {
    const rows = [base({ id: "b", dueDate: "2026-11-05", title: "B" }), base({ id: "a", dueDate: "2026-11-05", dueTime: "09:00", title: "A" }), base({ id: "old", dueDate: "2026-10-01" }), base({ id: "c", dueDate: "2026-11-09" })];
    const days = scheduleDays(rows, "2026-11-04");
    expect(days.map((d) => d.iso)).toEqual(["2026-11-05", "2026-11-09"]);
    expect(days[0].tasks.map((t) => t.id)).toEqual(["a", "b"]);
  });
  it("steps anchors and reads options", () => {
    expect(stepAnchor("2026-11-15", "month", 1)).toBe("2026-12-01");
    expect(stepAnchor("2026-01-15", "month", -1)).toBe("2025-12-01");
    expect(stepAnchor("2026-11-04", "week", 1)).toBe("2026-11-11");
    expect(stepAnchor("2026-11-04", "day", -1)).toBe("2026-11-03");
    expect(timeFraction("06:00")).toBe(0.25);
    expect(timeFraction(null)).toBeNull();
    expect(readCalendarOptions(defaultViewSpec())).toEqual({ mode: "month", weekends: true });
    expect(readCalendarOptions({ ...defaultViewSpec(), options: { calendarMode: "week", calendarWeekends: false } })).toEqual({ mode: "week", weekends: false });
    expect(weekLabel({ start: "2026-11-02", end: "2026-11-08" })).toBe("2 to 8 November 2026");
    expect(weekLabel({ start: "2026-11-30", end: "2026-12-06" })).toBe("30 Nov to 6 Dec 2026");
  });
});
