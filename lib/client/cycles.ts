import { addDays, daysBetween } from "./timeline/scale";

/** Pure math for cycles (docs/10 section 16, docs/11 section 9): progress, burndown from events, and velocity. */

export type CycleRef = { id: string; name: string; goal: string | null; startDate: string; endDate: string; capacity: number | null; closedAt: string | null };
export type CycleTask = { id: string; estimate: number | null; cycleId: string | null; completedAt: string | null; createdAt: string };
export type CycleEvent = { taskId: string; type: string; field: string | null; before: unknown; after: unknown; createdAt: string };

export type BurndownPoint = { date: string; scope: number; remaining: number; ideal: number; future: boolean };
export type Burndown = { unit: "estimate" | "tasks"; points: BurndownPoint[] };

/** Estimate used for scope: the estimate, or one task when the cycle has no estimates at all. */
function weightOf(estimate: number | null, unit: Burndown["unit"]): number {
  return unit === "tasks" ? 1 : (estimate ?? 0);
}

/** Days remaining in the cycle from today, never negative. */
export function daysRemaining(cycle: Pick<CycleRef, "endDate">, today: string): number {
  return Math.max(0, daysBetween(today, cycle.endDate));
}

export function cycleStatus(cycle: CycleRef, today: string): "closed" | "active" | "upcoming" | "overdue" {
  if (cycle.closedAt) return "closed";
  if (today < cycle.startDate) return "upcoming";
  if (today > cycle.endDate) return "overdue";
  return "active";
}

/** Committed and completed totals for the tasks currently in a cycle. */
export function cycleProgress(tasks: CycleTask[], cycleId: string): { committed: number; completed: number; count: number; doneCount: number; unit: Burndown["unit"] } {
  const mine = tasks.filter((t) => t.cycleId === cycleId);
  const unit: Burndown["unit"] = mine.some((t) => (t.estimate ?? 0) > 0) ? "estimate" : "tasks";
  const committed = mine.reduce((n, t) => n + weightOf(t.estimate, unit), 0);
  const completed = mine.filter((t) => t.completedAt).reduce((n, t) => n + weightOf(t.estimate, unit), 0);
  return { committed, completed, count: mine.length, doneCount: mine.filter((t) => t.completedAt).length, unit };
}

type TaskState = { estimate: number | null; cycleId: string | null; done: boolean };

/**
 * Burndown of a cycle, one point per day, reconstructed by walking task events backwards from the current state.
 * Scope is the weight of the tasks in the cycle on that day; remaining excludes completed ones; ideal is a straight line
 * from the first day's scope to zero. Days after today are marked future and carry the latest values.
 */
export function computeBurndown(cycle: CycleRef, tasks: CycleTask[], events: CycleEvent[], today: string): Burndown {
  const touched = new Set<string>();
  for (const t of tasks) if (t.cycleId === cycle.id) touched.add(t.id);
  for (const e of events) if (e.type === "task.updated" && e.field === "cycle" && (e.before === cycle.id || e.after === cycle.id)) touched.add(e.taskId);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const unit: Burndown["unit"] = [...touched].some((id) => (byId.get(id)?.estimate ?? 0) > 0) ? "estimate" : "tasks";
  // Current state per task.
  const state = new Map<string, TaskState>();
  for (const id of touched) {
    const t = byId.get(id);
    if (t) state.set(id, { estimate: t.estimate, cycleId: t.cycleId, done: Boolean(t.completedAt) });
  }
  const relevant = events.filter((e) => touched.has(e.taskId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const lastDay = cycle.endDate;
  const points: BurndownPoint[] = [];
  const snapshot = (): { scope: number; remaining: number } => {
    let scope = 0;
    let remaining = 0;
    for (const s of state.values()) {
      if (s.cycleId !== cycle.id) continue;
      const w = weightOf(s.estimate, unit);
      scope += w;
      if (!s.done) remaining += w;
    }
    return { scope, remaining };
  };
  // Walk days from the end to the start, undoing the events that happened after each day's end.
  let cursor = 0;
  const reversed: Array<{ date: string; scope: number; remaining: number }> = [];
  for (let day = lastDay; day >= cycle.startDate; day = addDays(day, -1)) {
    const dayEnd = `${day}T23:59:59.999Z`;
    while (cursor < relevant.length && relevant[cursor].createdAt > dayEnd) {
      const e = relevant[cursor];
      const s = state.get(e.taskId);
      if (s) {
        if (e.type === "task.completed") s.done = false;
        else if (e.type === "task.reopened") s.done = true;
        else if (e.type === "task.updated" && e.field === "cycle") s.cycleId = (e.before as string | null) ?? null;
        else if (e.type === "task.updated" && e.field === "estimate") s.estimate = typeof e.before === "number" ? e.before : null;
        else if (e.type === "task.created") s.cycleId = null;
      }
      cursor += 1;
    }
    // A task created after this day did not exist yet.
    for (const id of touched) {
      const t = byId.get(id);
      const s = state.get(id);
      if (t && s && t.createdAt > dayEnd) s.cycleId = null;
    }
    const snap = day > today ? null : snapshot();
    reversed.push({ date: day, ...(snap ?? { scope: 0, remaining: 0 }) });
  }
  reversed.reverse();
  const first = reversed.find((p) => p.date <= today) ?? reversed[0];
  const initialScope = first?.scope ?? 0;
  const total = Math.max(1, daysBetween(cycle.startDate, cycle.endDate));
  const latest = [...reversed].reverse().find((p) => p.date <= today);
  for (const p of reversed) {
    const future = p.date > today;
    const i = daysBetween(cycle.startDate, p.date);
    points.push({ date: p.date, scope: future ? (latest?.scope ?? 0) : p.scope, remaining: future ? (latest?.remaining ?? 0) : p.remaining, ideal: Math.max(0, Math.round((initialScope * (1 - i / total)) * 100) / 100), future });
  }
  return { unit, points };
}

export type VelocityPoint = { cycleId: string; name: string; committed: number; completed: number; endDate: string };

/**
 * Completed weight per closed cycle. Committed adds tasks that were moved out of the cycle when it closed, which the
 * close event records as a cycle change with the cycle as `before`.
 */
export function computeVelocity(cycles: CycleRef[], tasks: CycleTask[], events: CycleEvent[]): { unit: Burndown["unit"]; points: VelocityPoint[] } {
  const closed = cycles.filter((c) => c.closedAt).sort((a, b) => a.endDate.localeCompare(b.endDate));
  const unit: Burndown["unit"] = tasks.some((t) => (t.estimate ?? 0) > 0) ? "estimate" : "tasks";
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const points = closed.map((c) => {
    const inCycle = tasks.filter((t) => t.cycleId === c.id);
    const completed = inCycle.filter((t) => t.completedAt).reduce((n, t) => n + weightOf(t.estimate, unit), 0);
    const movedOut = new Set(events.filter((e) => e.type === "task.updated" && e.field === "cycle" && e.before === c.id && e.after !== c.id).map((e) => e.taskId));
    const carried = [...movedOut].filter((id) => !inCycle.some((t) => t.id === id)).reduce((n, id) => n + weightOf(byId.get(id)?.estimate ?? null, unit), 0);
    return { cycleId: c.id, name: c.name, committed: inCycle.reduce((n, t) => n + weightOf(t.estimate, unit), 0) + carried, completed, endDate: c.endDate };
  });
  return { unit, points };
}

/** The cycle to show by default: the active one, else the next upcoming, else the latest closed. */
export function defaultCycle(cycles: CycleRef[], today: string): CycleRef | null {
  const open = cycles.filter((c) => !c.closedAt).sort((a, b) => a.startDate.localeCompare(b.startDate));
  return open.find((c) => c.startDate <= today && c.endDate >= today) ?? open.find((c) => c.startDate > today) ?? open[open.length - 1] ?? [...cycles].sort((a, b) => b.endDate.localeCompare(a.endDate))[0] ?? null;
}

/** The cycle that follows `cycle`, if one is open. */
export function nextCycle(cycles: CycleRef[], cycle: CycleRef): CycleRef | null {
  return cycles.filter((c) => !c.closedAt && c.startDate > cycle.endDate).sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null;
}
