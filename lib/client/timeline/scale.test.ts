import { describe, it, expect } from "vitest";
import { createScale, dateToX, xToDate, pxToDays, taskSpan, spanRect, fitRange, ensureRange, headerTicks, nonWorkingRanges, shiftSpan, resizeSpan, computeCriticalPath, shiftSuccessors, connectorPath, stepZoom } from "./scale";
import type { DependencyRow } from "@/lib/query-engine/types";

const today = "2026-11-04";

describe("scale", () => {
  it("maps dates to pixels and back", () => {
    const scale = createScale("2026-11-01", "2026-11-30", "day");
    expect(scale.days).toBe(30);
    expect(scale.width).toBe(30 * 48);
    expect(dateToX(scale, "2026-11-01")).toBe(0);
    expect(dateToX(scale, "2026-11-04")).toBe(3 * 48);
    expect(xToDate(scale, 3 * 48 + 10)).toBe("2026-11-04");
    expect(xToDate(scale, 0)).toBe("2026-11-01");
    expect(pxToDays(scale, 100)).toBe(2);
    expect(pxToDays(scale, 100, 7)).toBe(0);
    expect(pxToDays(scale, 200, 7)).toBe(7);
  });
  it("spans tasks, milestones, and single dates with inclusive ends", () => {
    const scale = createScale("2026-11-01", "2026-11-30", "day");
    expect(taskSpan({ startDate: "2026-11-02", dueDate: "2026-11-04", isMilestone: false })).toEqual({ start: "2026-11-02", end: "2026-11-04", kind: "task" });
    expect(taskSpan({ startDate: "2026-11-05", dueDate: "2026-11-04", isMilestone: false })).toEqual({ start: "2026-11-04", end: "2026-11-05", kind: "task" });
    expect(taskSpan({ startDate: null, dueDate: "2026-11-04", isMilestone: false })).toEqual({ start: "2026-11-04", end: "2026-11-04", kind: "task" });
    expect(taskSpan({ startDate: "2026-11-01", dueDate: "2026-11-04", isMilestone: true })).toEqual({ start: "2026-11-04", end: "2026-11-04", kind: "milestone" });
    expect(taskSpan({ startDate: null, dueDate: null, isMilestone: false })).toBeNull();
    expect(spanRect(scale, { start: "2026-11-02", end: "2026-11-04" })).toEqual({ x: 48, width: 144 });
  });
  it("fits and extends ranges around spans and today", () => {
    expect(fitRange([{ start: "2026-11-10", end: "2026-11-12" }], today, 2)).toEqual({ start: "2026-11-02", end: "2026-11-14" });
    expect(fitRange([], today).start < today).toBe(true);
    expect(ensureRange({ start: "2026-11-01", end: "2026-11-30" }, [{ start: "2026-12-10", end: "2026-12-12" }], today, 1)).toEqual({ start: "2026-11-01", end: "2026-12-13" });
  });
  it("builds header ticks per zoom", () => {
    const day = headerTicks(createScale("2026-10-30", "2026-11-03", "day"), "2026-11-01");
    expect(day.top.map((t) => t.label)).toEqual(["October 2026", "November 2026"]);
    expect(day.bottom).toHaveLength(5);
    expect(day.bottom[2]).toMatchObject({ label: "1", today: true, weekend: true, x: 96, width: 48 });
    const week = headerTicks(createScale("2026-11-02", "2026-11-22", "week"), today, 1);
    expect(week.bottom.map((t) => t.label)).toEqual(["2 Nov", "9 Nov", "16 Nov"]);
    expect(week.bottom[0].today).toBe(true);
    const month = headerTicks(createScale("2026-10-15", "2027-01-15", "month"), today);
    expect(month.top.map((t) => t.label)).toEqual(["Q4 2026", "Q1 2027"]);
    expect(month.bottom.map((t) => t.label)).toEqual(["Oct", "Nov", "Dec", "Jan"]);
    const quarter = headerTicks(createScale("2026-06-01", "2027-02-01", "quarter"), today);
    expect(quarter.top.map((t) => t.label)).toEqual(["2026", "2027"]);
    expect(quarter.bottom.map((t) => t.label)).toEqual(["Q2", "Q3", "Q4", "Q1"]);
  });
  it("shades weekends at day and week zoom only", () => {
    const scale = createScale("2026-11-02", "2026-11-15", "day");
    const ranges = nonWorkingRanges(scale);
    expect(ranges).toEqual([
      { key: "nw-5", x: 5 * 48, width: 96 },
      { key: "nw-12", x: 12 * 48, width: 96 },
    ]);
    expect(nonWorkingRanges(createScale("2026-11-02", "2026-11-15", "month"))).toEqual([]);
    expect(nonWorkingRanges(createScale("2026-11-02", "2026-11-04", "day"), [0, 6], ["2026-11-03"])).toEqual([{ key: "nw-1", x: 48, width: 48 }]);
  });
  it("shifts and resizes spans without inverting them", () => {
    expect(shiftSpan({ start: "2026-11-02", end: "2026-11-04" }, 3)).toEqual({ start: "2026-11-05", end: "2026-11-07" });
    expect(resizeSpan({ start: "2026-11-02", end: "2026-11-04" }, "end", -5)).toEqual({ start: "2026-11-02", end: "2026-11-02" });
    expect(resizeSpan({ start: "2026-11-02", end: "2026-11-04" }, "start", 1)).toEqual({ start: "2026-11-03", end: "2026-11-04" });
  });
  it("steps zoom within bounds", () => {
    expect(stepZoom("day", 1)).toBe("day");
    expect(stepZoom("day", -1)).toBe("week");
    expect(stepZoom("quarter", -1)).toBe("quarter");
    expect(stepZoom("month", 1)).toBe("week");
  });
});

describe("critical path and auto schedule", () => {
  const dep = (p: string, s: string, type: DependencyRow["type"] = "fs", lagDays = 0): DependencyRow => ({ id: `${p}-${s}`, predecessorId: p, successorId: s, type, lagDays });
  const tasks = [
    { id: "a", start: "2026-11-01", end: "2026-11-05" },
    { id: "b", start: "2026-11-06", end: "2026-11-10" },
    { id: "c", start: "2026-11-06", end: "2026-11-07" },
    { id: "d", start: "2026-11-11", end: "2026-11-12" },
  ];
  it("finds the longest chain as critical", () => {
    const critical = computeCriticalPath(tasks, [dep("a", "b"), dep("a", "c"), dep("b", "d"), dep("c", "d")]);
    expect([...critical].sort()).toEqual(["a", "b", "d"]);
  });
  it("ignores cycles and unscheduled tasks", () => {
    expect(computeCriticalPath([], [])).toEqual(new Set());
    const critical = computeCriticalPath(tasks.slice(0, 2), [dep("a", "b"), dep("b", "a")]);
    expect(critical.size).toBe(0);
  });
  it("pushes successors later but never earlier, respecting lag", () => {
    const deps = [dep("a", "b", "fs", 1), dep("b", "d")];
    const moved = shiftSuccessors(tasks, deps, "a", { start: "2026-11-03", end: "2026-11-07" });
    expect(moved.get("b")).toEqual({ start: "2026-11-09", end: "2026-11-13" });
    expect(moved.get("d")).toEqual({ start: "2026-11-14", end: "2026-11-15" });
    expect(moved.has("c")).toBe(false);
    expect(shiftSuccessors(tasks, deps, "a", { start: "2026-10-01", end: "2026-10-05" }).size).toBe(0);
    expect(shiftSuccessors(tasks, [dep("a", "b", "ss")], "a", { start: "2026-11-08", end: "2026-11-12" }).get("b")).toEqual({ start: "2026-11-08", end: "2026-11-12" });
  });
});

describe("connectors", () => {
  it("routes finish to start with an elbow when the successor is to the right", () => {
    const path = connectorPath({ x: 0, width: 100, y: 0, height: 20 }, { x: 140, width: 50, y: 36, height: 20 }, "fs");
    expect(path).toBe("M 100 10 H 120 V 46 H 140");
  });
  it("routes around when the successor starts before the predecessor ends", () => {
    const path = connectorPath({ x: 0, width: 100, y: 0, height: 20 }, { x: 60, width: 50, y: 36, height: 20 }, "fs");
    expect(path).toBe("M 100 10 H 108 V 32 H 52 V 46 H 60");
  });
  it("uses the matching edges for other types", () => {
    expect(connectorPath({ x: 0, width: 100, y: 0, height: 20 }, { x: 40, width: 50, y: 36, height: 20 }, "ss").startsWith("M 0 10")).toBe(true);
    expect(connectorPath({ x: 0, width: 100, y: 0, height: 20 }, { x: 40, width: 50, y: 36, height: 20 }, "ff").endsWith("H 90")).toBe(true);
  });
});
