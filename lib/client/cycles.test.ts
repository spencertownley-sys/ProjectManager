import { describe, it, expect } from "vitest";
import { computeBurndown, computeVelocity, cycleProgress, cycleStatus, daysRemaining, defaultCycle, nextCycle, type CycleRef, type CycleTask, type CycleEvent } from "./cycles";

const cycle: CycleRef = { id: "c1", name: "Cycle 1", goal: null, startDate: "2026-11-02", endDate: "2026-11-06", capacity: 10, closedAt: null };
const task = (over: Partial<CycleTask> & { id: string }): CycleTask => ({ estimate: null, cycleId: "c1", completedAt: null, createdAt: "2026-10-20T10:00:00Z", ...over });

describe("cycle progress", () => {
  it("sums committed and completed weight, falling back to task counts", () => {
    const tasks = [task({ id: "a", estimate: 3 }), task({ id: "b", estimate: 5, completedAt: "2026-11-03T10:00:00Z" }), task({ id: "c", estimate: 2, cycleId: null })];
    expect(cycleProgress(tasks, "c1")).toEqual({ committed: 8, completed: 5, count: 2, doneCount: 1, unit: "estimate" });
    expect(cycleProgress([task({ id: "a" }), task({ id: "b", completedAt: "x" })], "c1")).toEqual({ committed: 2, completed: 1, count: 2, doneCount: 1, unit: "tasks" });
  });
  it("reports status and days remaining", () => {
    expect(cycleStatus(cycle, "2026-11-04")).toBe("active");
    expect(cycleStatus(cycle, "2026-11-01")).toBe("upcoming");
    expect(cycleStatus(cycle, "2026-11-09")).toBe("overdue");
    expect(cycleStatus({ ...cycle, closedAt: "2026-11-07T00:00:00Z" }, "2026-11-09")).toBe("closed");
    expect(daysRemaining(cycle, "2026-11-04")).toBe(2);
    expect(daysRemaining(cycle, "2026-11-09")).toBe(0);
  });
  it("picks the default and next cycle", () => {
    const c0: CycleRef = { ...cycle, id: "c0", name: "Cycle 0", startDate: "2026-10-19", endDate: "2026-10-30", closedAt: "2026-10-31T00:00:00Z" };
    const c2: CycleRef = { ...cycle, id: "c2", name: "Cycle 2", startDate: "2026-11-09", endDate: "2026-11-13" };
    expect(defaultCycle([c0, cycle, c2], "2026-11-04")?.id).toBe("c1");
    expect(defaultCycle([c0, c2], "2026-11-04")?.id).toBe("c2");
    expect(defaultCycle([c0], "2026-11-04")?.id).toBe("c0");
    expect(defaultCycle([], "2026-11-04")).toBeNull();
    expect(nextCycle([c0, cycle, c2], cycle)?.id).toBe("c2");
    expect(nextCycle([c0, cycle], cycle)).toBeNull();
  });
});

describe("burndown", () => {
  it("reconstructs scope and remaining per day from events", () => {
    const tasks = [
      task({ id: "a", estimate: 3, completedAt: "2026-11-03T15:00:00Z" }),
      task({ id: "b", estimate: 5 }),
      task({ id: "c", estimate: 2, createdAt: "2026-11-04T09:00:00Z" }), // added mid cycle
      task({ id: "d", estimate: 4, cycleId: null }), // removed on day 3
    ];
    const events: CycleEvent[] = [
      { taskId: "a", type: "task.completed", field: null, before: null, after: null, createdAt: "2026-11-03T15:00:00Z" },
      { taskId: "c", type: "task.created", field: null, before: null, after: null, createdAt: "2026-11-04T09:00:00Z" },
      { taskId: "c", type: "task.updated", field: "cycle", before: null, after: "c1", createdAt: "2026-11-04T09:00:00Z" },
      { taskId: "d", type: "task.updated", field: "cycle", before: "c1", after: null, createdAt: "2026-11-04T12:00:00Z" },
      { taskId: "b", type: "task.updated", field: "estimate", before: 8, after: 5, createdAt: "2026-11-03T09:00:00Z" },
    ];
    const b = computeBurndown(cycle, tasks, events, "2026-11-04");
    expect(b.unit).toBe("estimate");
    expect(b.points.map((p) => [p.date, p.scope, p.remaining, p.future])).toEqual([
      ["2026-11-02", 15, 15, false], // a3 + b8 + d4
      ["2026-11-03", 12, 9, false], // b re-estimated to 5, a done
      ["2026-11-04", 10, 7, false], // c added (2), d removed (4)
      ["2026-11-05", 10, 7, true],
      ["2026-11-06", 10, 7, true],
    ]);
    expect(b.points.map((p) => p.ideal)).toEqual([15, 11.25, 7.5, 3.75, 0]);
  });
  it("counts tasks when nothing is estimated and ignores other cycles", () => {
    const tasks = [task({ id: "a" }), task({ id: "b", completedAt: "2026-11-02T20:00:00Z" }), task({ id: "z", cycleId: "other" })];
    const events: CycleEvent[] = [{ taskId: "b", type: "task.completed", field: null, before: null, after: null, createdAt: "2026-11-02T20:00:00Z" }];
    const b = computeBurndown(cycle, tasks, events, "2026-11-06");
    expect(b.unit).toBe("tasks");
    expect(b.points[0]).toMatchObject({ scope: 2, remaining: 1 });
    expect(b.points[4]).toMatchObject({ scope: 2, remaining: 1, future: false });
  });
});

describe("velocity", () => {
  it("reports completed and committed weight per closed cycle in order", () => {
    const c0: CycleRef = { ...cycle, id: "c0", name: "Cycle 0", startDate: "2026-10-19", endDate: "2026-10-30", closedAt: "2026-10-31T00:00:00Z" };
    const c1: CycleRef = { ...cycle, closedAt: "2026-11-07T00:00:00Z" };
    const tasks = [task({ id: "a", estimate: 3, cycleId: "c0", completedAt: "x" }), task({ id: "b", estimate: 5, cycleId: "c1", completedAt: "x" }), task({ id: "c", estimate: 2, cycleId: "c1", completedAt: "x" }), task({ id: "d", estimate: 4, cycleId: null })];
    const events: CycleEvent[] = [{ taskId: "d", type: "task.updated", field: "cycle", before: "c1", after: null, createdAt: "2026-11-07T00:00:00Z" }];
    const v = computeVelocity([c1, c0, { ...cycle, id: "open" }], tasks, events);
    expect(v.unit).toBe("estimate");
    expect(v.points.map((p) => [p.name, p.committed, p.completed])).toEqual([
      ["Cycle 0", 3, 3],
      ["Cycle 1", 11, 7],
    ]);
  });
});
