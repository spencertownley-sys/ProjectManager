import { addDays as addDaysFns, differenceInCalendarDays, format, parseISO, startOfMonth, endOfMonth, startOfWeek, startOfQuarter, endOfQuarter, startOfYear, endOfYear, getDay } from "date-fns";
import type { DependencyRow } from "@/lib/query-engine/types";

/**
 * Pure date to pixel math for the timeline engine (docs/05 decision 7, docs/11 section 5).
 * Dates are ISO day strings (YYYY-MM-DD). Bars span whole days and the end date is inclusive.
 */

export type Zoom = "day" | "week" | "month" | "quarter";
export const zoomOrder: Zoom[] = ["day", "week", "month", "quarter"];
export const zoomLabels: Record<Zoom, string> = { day: "Day", week: "Week", month: "Month", quarter: "Quarter" };
export const pxPerDayByZoom: Record<Zoom, number> = { day: 48, week: 20, month: 7, quarter: 2.5 };

/** Days a drag snaps to per zoom level. Shift disables snapping, which then moves by single days. */
export const snapDaysByZoom: Record<Zoom, number> = { day: 1, week: 1, month: 1, quarter: 7 };

export type Scale = { start: string; end: string; zoom: Zoom; pxPerDay: number; days: number; width: number };
export type DateRange = { start: string; end: string };

export function toDate(iso: string): Date {
  return parseISO(iso);
}
export function toIso(d: Date): string {
  return format(d, "yyyy-MM-dd");
}
export function addDays(iso: string, days: number): string {
  return toIso(addDaysFns(parseISO(iso), days));
}
export function daysBetween(a: string, b: string): number {
  return differenceInCalendarDays(parseISO(b), parseISO(a));
}

export function createScale(start: string, end: string, zoom: Zoom, pxPerDay = pxPerDayByZoom[zoom]): Scale {
  const days = Math.max(1, daysBetween(start, end) + 1);
  return { start, end, zoom, pxPerDay, days, width: days * pxPerDay };
}

/** Pixel x of the start of a day. */
export function dateToX(scale: Scale, iso: string): number {
  return daysBetween(scale.start, iso) * scale.pxPerDay;
}

/** The day under a pixel x. */
export function xToDate(scale: Scale, x: number): string {
  return addDays(scale.start, Math.floor(x / scale.pxPerDay));
}

/** Whole days for a pixel delta, snapped to `snap` days when given. */
export function pxToDays(scale: Scale, px: number, snap = 1): number {
  const days = px / scale.pxPerDay;
  const unit = Math.max(1, snap);
  return Math.round(days / unit) * unit;
}

export type BarSpan = { start: string; end: string; kind: "task" | "milestone" };

/** The days a task occupies. A task with only one date is a single day. Unscheduled tasks return null. */
export function taskSpan(task: { startDate: string | null; dueDate: string | null; isMilestone: boolean }): BarSpan | null {
  if (task.isMilestone) {
    const day = task.dueDate ?? task.startDate;
    return day ? { start: day, end: day, kind: "milestone" } : null;
  }
  if (task.startDate && task.dueDate) return { start: task.startDate <= task.dueDate ? task.startDate : task.dueDate, end: task.dueDate >= task.startDate ? task.dueDate : task.startDate, kind: "task" };
  const day = task.startDate ?? task.dueDate;
  return day ? { start: day, end: day, kind: "task" } : null;
}

/** Pixel rectangle of a span; the end day is inclusive. */
export function spanRect(scale: Scale, span: DateRange): { x: number; width: number } {
  const x = dateToX(scale, span.start);
  const width = (daysBetween(span.start, span.end) + 1) * scale.pxPerDay;
  return { x, width };
}

/** Range that covers every span plus padding, or a window around today when nothing is scheduled. */
export function fitRange(spans: DateRange[], today: string, padDays = 7): DateRange {
  if (spans.length === 0) return defaultRange(today, "week");
  let start = spans[0].start;
  let end = spans[0].end;
  for (const s of spans) {
    if (s.start < start) start = s.start;
    if (s.end > end) end = s.end;
  }
  if (today < start) start = today;
  if (today > end) end = today;
  return { start: addDays(start, -padDays), end: addDays(end, padDays) };
}

/** A sensible window around today for a zoom level. */
export function defaultRange(today: string, zoom: Zoom): DateRange {
  const before = { day: 14, week: 42, month: 120, quarter: 365 }[zoom];
  const after = { day: 45, week: 120, month: 365, quarter: 730 }[zoom];
  return { start: addDays(today, -before), end: addDays(today, after) };
}

/** Extends a range so it always covers the spans and today, keeping the current start when possible. */
export function ensureRange(range: DateRange, spans: DateRange[], today: string, padDays = 7): DateRange {
  let { start, end } = range;
  for (const s of spans) {
    if (addDays(s.start, -padDays) < start) start = addDays(s.start, -padDays);
    if (addDays(s.end, padDays) > end) end = addDays(s.end, padDays);
  }
  if (addDays(today, -padDays) < start) start = addDays(today, -padDays);
  if (addDays(today, padDays) > end) end = addDays(today, padDays);
  return { start, end };
}

export type Tick = { key: string; x: number; width: number; label: string; sub?: string; today?: boolean; weekend?: boolean };

const clampTick = (scale: Scale, startIso: string, endIso: string): { x: number; width: number } | null => {
  const s = startIso < scale.start ? scale.start : startIso;
  const e = endIso > scale.end ? scale.end : endIso;
  if (s > e) return null;
  return spanRect(scale, { start: s, end: e });
};

/** Two header rows for the zoom level: months over days, months over weeks, quarters over months, years over quarters. */
export function headerTicks(scale: Scale, today: string, weekStartsOn = 1): { top: Tick[]; bottom: Tick[] } {
  const top: Tick[] = [];
  const bottom: Tick[] = [];
  const startDate = toDate(scale.start);
  const endDate = toDate(scale.end);
  const wso = weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6;

  const pushRange = (list: Tick[], key: string, s: string, e: string, label: string, extra?: Partial<Tick>) => {
    const rect = clampTick(scale, s, e);
    if (rect) list.push({ key, label, ...rect, ...extra });
  };

  if (scale.zoom === "day" || scale.zoom === "week") {
    let m = startOfMonth(startDate);
    while (m <= endDate) {
      const s = toIso(m);
      const e = toIso(endOfMonth(m));
      pushRange(top, `m-${s}`, s, e, format(m, scale.zoom === "day" ? "MMMM yyyy" : "MMM yyyy"));
      m = addDaysFns(endOfMonth(m), 1);
    }
  } else if (scale.zoom === "month") {
    let q = startOfQuarter(startDate);
    while (q <= endDate) {
      pushRange(top, `q-${toIso(q)}`, toIso(q), toIso(endOfQuarter(q)), format(q, "QQQ yyyy"));
      q = addDaysFns(endOfQuarter(q), 1);
    }
  } else {
    let y = startOfYear(startDate);
    while (y <= endDate) {
      pushRange(top, `y-${toIso(y)}`, toIso(y), toIso(endOfYear(y)), format(y, "yyyy"));
      y = addDaysFns(endOfYear(y), 1);
    }
  }

  if (scale.zoom === "day") {
    for (let i = 0; i < scale.days; i += 1) {
      const d = addDaysFns(startDate, i);
      const iso = toIso(d);
      const dow = getDay(d);
      bottom.push({ key: iso, x: i * scale.pxPerDay, width: scale.pxPerDay, label: format(d, "d"), sub: format(d, "EEEEE"), today: iso === today, weekend: dow === 0 || dow === 6 });
    }
  } else if (scale.zoom === "week") {
    let w = startOfWeek(startDate, { weekStartsOn: wso });
    while (w <= endDate) {
      const s = toIso(w);
      const e = toIso(addDaysFns(w, 6));
      pushRange(bottom, `w-${s}`, s, e, format(w, "d MMM"), { today: today >= s && today <= e });
      w = addDaysFns(w, 7);
    }
  } else if (scale.zoom === "month") {
    let m = startOfMonth(startDate);
    while (m <= endDate) {
      const s = toIso(m);
      const e = toIso(endOfMonth(m));
      pushRange(bottom, `m-${s}`, s, e, format(m, "MMM"), { today: today >= s && today <= e });
      m = addDaysFns(endOfMonth(m), 1);
    }
  } else {
    let q = startOfQuarter(startDate);
    while (q <= endDate) {
      const s = toIso(q);
      const e = toIso(endOfQuarter(q));
      pushRange(bottom, `q-${s}`, s, e, format(q, "QQQ"), { today: today >= s && today <= e });
      q = addDaysFns(endOfQuarter(q), 1);
    }
  }
  return { top, bottom };
}

/** Shaded ranges for weekends (and explicit non working days) at zoom levels where a day is wide enough to see. */
export function nonWorkingRanges(scale: Scale, weekendDays: number[] = [0, 6], nonWorkingDates: string[] = []): Array<{ x: number; width: number; key: string }> {
  if (scale.zoom === "month" || scale.zoom === "quarter") return [];
  const out: Array<{ x: number; width: number; key: string }> = [];
  const extra = new Set(nonWorkingDates);
  const startDate = toDate(scale.start);
  let runStart = -1;
  for (let i = 0; i <= scale.days; i += 1) {
    const d = addDaysFns(startDate, i);
    const off = i < scale.days && (weekendDays.includes(getDay(d)) || extra.has(toIso(d)));
    if (off && runStart < 0) runStart = i;
    if (!off && runStart >= 0) {
      out.push({ key: `nw-${runStart}`, x: runStart * scale.pxPerDay, width: (i - runStart) * scale.pxPerDay });
      runStart = -1;
    }
  }
  return out;
}

/** Moves a span by whole days, keeping its duration. */
export function shiftSpan(span: DateRange, days: number): DateRange {
  return { start: addDays(span.start, days), end: addDays(span.end, days) };
}

/** Resizes one edge; the span never inverts below one day. */
export function resizeSpan(span: DateRange, edge: "start" | "end", days: number): DateRange {
  if (edge === "start") {
    const start = addDays(span.start, days);
    return { start: start > span.end ? span.end : start, end: span.end };
  }
  const end = addDays(span.end, days);
  return { start: span.start, end: end < span.start ? span.start : end };
}

export type ScheduledTask = { id: string; start: string; end: string };

/**
 * Critical path by the classic forward and backward pass over dependency durations and lags.
 * Tasks without dates are ignored. A task is critical when it has zero float.
 */
export function computeCriticalPath(tasks: ScheduledTask[], deps: DependencyRow[]): Set<string> {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const duration = (t: ScheduledTask) => daysBetween(t.start, t.end) + 1;
  const usable = deps.filter((d) => byId.has(d.predecessorId) && byId.has(d.successorId));
  const preds = new Map<string, DependencyRow[]>();
  const succs = new Map<string, DependencyRow[]>();
  for (const d of usable) {
    preds.set(d.successorId, [...(preds.get(d.successorId) ?? []), d]);
    succs.set(d.predecessorId, [...(succs.get(d.predecessorId) ?? []), d]);
  }
  // Topological order (Kahn). Cycles are dropped from the critical path.
  const indegree = new Map(tasks.map((t) => [t.id, preds.get(t.id)?.length ?? 0]));
  const queue = tasks.filter((t) => (indegree.get(t.id) ?? 0) === 0).map((t) => t.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const d of succs.get(id) ?? []) {
      const n = (indegree.get(d.successorId) ?? 0) - 1;
      indegree.set(d.successorId, n);
      if (n === 0) queue.push(d.successorId);
    }
  }
  if (order.length === 0) return new Set();
  const origin = tasks.reduce((min, t) => (t.start < min ? t.start : min), tasks[0].start);
  const day = (iso: string) => daysBetween(origin, iso);
  const es = new Map<string, number>();
  const ef = new Map<string, number>();
  for (const id of order) {
    const t = byId.get(id)!;
    const dur = duration(t);
    let start = (preds.get(id)?.length ?? 0) === 0 ? day(t.start) : Number.NEGATIVE_INFINITY;
    for (const d of preds.get(id) ?? []) {
      const pEs = es.get(d.predecessorId) ?? 0;
      const pEf = ef.get(d.predecessorId) ?? 0;
      const candidate = d.type === "fs" ? pEf + d.lagDays : d.type === "ss" ? pEs + d.lagDays : d.type === "ff" ? pEf + d.lagDays - dur : pEs + d.lagDays - dur;
      if (candidate > start) start = candidate;
    }
    if (!Number.isFinite(start)) start = day(t.start);
    es.set(id, start);
    ef.set(id, start + dur);
  }
  const projectEnd = Math.max(...order.map((id) => ef.get(id)!));
  const lf = new Map<string, number>();
  const ls = new Map<string, number>();
  for (const id of [...order].reverse()) {
    const t = byId.get(id)!;
    const dur = duration(t);
    let finish = projectEnd;
    for (const d of succs.get(id) ?? []) {
      const sLs = ls.get(d.successorId) ?? projectEnd;
      const sLf = lf.get(d.successorId) ?? projectEnd;
      const candidate = d.type === "fs" ? sLs - d.lagDays : d.type === "ss" ? sLs - d.lagDays + dur : d.type === "ff" ? sLf - d.lagDays : sLf - d.lagDays + dur;
      if (candidate < finish) finish = candidate;
    }
    lf.set(id, finish);
    ls.set(id, finish - dur);
  }
  const critical = new Set<string>();
  for (const id of order) if ((ls.get(id) ?? 0) - (es.get(id) ?? 0) <= 0) critical.add(id);
  // Keep only tasks that lie on a zero float chain ending at the project end.
  const onChain = new Set<string>();
  const visit = (id: string) => {
    if (onChain.has(id)) return;
    onChain.add(id);
    for (const d of preds.get(id) ?? []) if (critical.has(d.predecessorId)) visit(d.predecessorId);
  };
  for (const id of order) if (critical.has(id) && (ef.get(id) ?? 0) === projectEnd) visit(id);
  return onChain;
}

/**
 * Auto schedule: after `movedId` takes `moved`, successors that would start before their constraint allows are pushed later,
 * keeping their duration and lag. Successors are never pulled earlier. Returns the tasks that change.
 */
export function shiftSuccessors(tasks: ScheduledTask[], deps: DependencyRow[], movedId: string, moved: DateRange): Map<string, DateRange> {
  const current = new Map<string, DateRange>(tasks.map((t) => [t.id, { start: t.start, end: t.end }]));
  if (!current.has(movedId)) return new Map();
  current.set(movedId, moved);
  const changes = new Map<string, DateRange>();
  const succs = new Map<string, DependencyRow[]>();
  for (const d of deps) succs.set(d.predecessorId, [...(succs.get(d.predecessorId) ?? []), d]);
  const queue = [movedId];
  const guard = new Map<string, number>();
  while (queue.length) {
    const id = queue.shift()!;
    const pred = current.get(id)!;
    for (const d of succs.get(id) ?? []) {
      const succ = current.get(d.successorId);
      if (!succ) continue;
      const dur = daysBetween(succ.start, succ.end);
      let requiredStart = succ.start;
      if (d.type === "fs") requiredStart = addDays(pred.end, 1 + d.lagDays);
      else if (d.type === "ss") requiredStart = addDays(pred.start, d.lagDays);
      else if (d.type === "ff") requiredStart = addDays(addDays(pred.end, d.lagDays), -dur);
      else requiredStart = addDays(addDays(pred.start, d.lagDays), -dur);
      if (requiredStart > succ.start) {
        const next = { start: requiredStart, end: addDays(requiredStart, dur) };
        current.set(d.successorId, next);
        changes.set(d.successorId, next);
        const n = (guard.get(d.successorId) ?? 0) + 1;
        guard.set(d.successorId, n);
        if (n < 50) queue.push(d.successorId);
      }
    }
  }
  return changes;
}

export type BarBox = { x: number; width: number; y: number; height: number };

/**
 * Orthogonal connector from a predecessor box to a successor box. The edges follow the dependency type:
 * fs runs from the end of the predecessor to the start of the successor, and so on. Returns an SVG path.
 */
export function connectorPath(from: BarBox, to: BarBox, type: DependencyRow["type"], gap = 8): string {
  const fromEnd = type === "fs" || type === "ff";
  const toStart = type === "fs" || type === "ss";
  const x1 = fromEnd ? from.x + from.width : from.x;
  const y1 = from.y + from.height / 2;
  const x2 = toStart ? to.x : to.x + to.width;
  const y2 = to.y + to.height / 2;
  const dir1 = fromEnd ? 1 : -1;
  const dir2 = toStart ? -1 : 1;
  const midY = y1 < y2 ? to.y - 4 : to.y + to.height + 4;
  const stubFrom = x1 + dir1 * gap;
  const stubTo = x2 + dir2 * gap;
  // When the leaving stub already passes the entering stub, draw a single elbow; otherwise route around through the row gap.
  if ((dir1 > 0 && dir2 < 0 && stubFrom <= stubTo) || (dir1 < 0 && dir2 > 0 && stubFrom >= stubTo)) {
    const elbowX = (stubFrom + stubTo) / 2;
    return `M ${x1} ${y1} H ${elbowX} V ${y2} H ${x2}`;
  }
  return `M ${x1} ${y1} H ${stubFrom} V ${midY} H ${stubTo} V ${y2} H ${x2}`;
}

/** Zoom one step in or out, clamped to the available levels. */
export function stepZoom(zoom: Zoom, delta: 1 | -1): Zoom {
  const idx = zoomOrder.indexOf(zoom);
  return zoomOrder[Math.max(0, Math.min(zoomOrder.length - 1, idx - delta))];
}
