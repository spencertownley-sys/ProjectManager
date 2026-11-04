import { addDays as addDaysFns, startOfMonth, endOfMonth, startOfWeek, endOfWeek, format, parseISO, getDay } from "date-fns";
import type { TaskRow } from "@/lib/query-engine/types";
import type { ViewSpec } from "@/lib/validation/view-spec";
import { taskSpan, toIso, addDays, daysBetween, type DateRange } from "./timeline/scale";

/** Pure layout math for the Calendar view (docs/11 section 7). */

export type CalendarMode = "month" | "week" | "day" | "schedule";
export type CalendarOptions = { mode: CalendarMode; weekends: boolean };

export function readCalendarOptions(spec: ViewSpec): CalendarOptions {
  const o = spec.options as Record<string, unknown>;
  const mode = ["month", "week", "day", "schedule"].includes(o.calendarMode as string) ? (o.calendarMode as CalendarMode) : "month";
  return { mode, weekends: o.calendarWeekends !== false };
}

export type CalendarDay = { iso: string; inMonth: boolean; weekend: boolean; today: boolean; label: string };
export type CalendarItem = {
  task: TaskRow;
  span: DateRange;
  kind: "task" | "milestone";
  /** Column of the first day shown in this week (0 based) and the number of columns covered. */
  col: number;
  cols: number;
  lane: number;
  continuesLeft: boolean;
  continuesRight: boolean;
};
export type CalendarWeek = { key: string; days: CalendarDay[]; items: CalendarItem[]; lanes: number };

/** Days of the week in display order given the workspace start day and the weekend toggle. */
export function weekDays(weekStartsOn: number, weekends: boolean): number[] {
  const out: number[] = [];
  for (let i = 0; i < 7; i += 1) {
    const dow = (weekStartsOn + i) % 7;
    if (weekends || (dow !== 0 && dow !== 6)) out.push(dow);
  }
  return out;
}

/** The first and last day of the month grid, padded to whole weeks. */
export function monthGridRange(anchor: string, weekStartsOn: number): DateRange {
  const wso = weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  const d = parseISO(anchor);
  return { start: toIso(startOfWeek(startOfMonth(d), { weekStartsOn: wso })), end: toIso(endOfWeek(endOfMonth(d), { weekStartsOn: wso })) };
}

export function weekRange(anchor: string, weekStartsOn: number): DateRange {
  const wso = weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  const d = parseISO(anchor);
  return { start: toIso(startOfWeek(d, { weekStartsOn: wso })), end: toIso(endOfWeek(d, { weekStartsOn: wso })) };
}

/** Packs the items of one week into lanes, first by start then by length, so multi day chips never overlap. */
export function packLanes<T extends { col: number; cols: number }>(items: T[]): Array<T & { lane: number }> {
  const sorted = [...items].sort((a, b) => a.col - b.col || b.cols - a.cols);
  const laneEnds: number[] = [];
  return sorted.map((item) => {
    let lane = laneEnds.findIndex((end) => end <= item.col);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = item.col + item.cols;
    return { ...item, lane };
  });
}

/**
 * Lays out tasks on a month (or any whole week) grid. Weeks run from `range.start`; days hidden by the weekend toggle
 * are dropped and chips that only fall on hidden days are omitted.
 */
export function layoutCalendar(rows: TaskRow[], range: DateRange, options: { weekStartsOn: number; weekends: boolean; today: string; monthOf?: string }): CalendarWeek[] {
  const visibleDows = new Set(weekDays(options.weekStartsOn, options.weekends));
  const spans = rows.map((task) => ({ task, span: taskSpan(task) })).filter((x): x is { task: TaskRow; span: NonNullable<ReturnType<typeof taskSpan>> } => x.span !== null);
  const month = options.monthOf ? options.monthOf.slice(0, 7) : null;
  const weeks: CalendarWeek[] = [];
  let weekStart = range.start;
  while (weekStart <= range.end) {
    const weekEnd = addDays(weekStart, 6);
    const days: CalendarDay[] = [];
    const colOfIso = new Map<string, number>();
    for (let i = 0; i < 7; i += 1) {
      const iso = addDays(weekStart, i);
      const dow = getDay(parseISO(iso));
      if (!visibleDows.has(dow)) continue;
      colOfIso.set(iso, days.length);
      days.push({ iso, inMonth: month ? iso.slice(0, 7) === month : true, weekend: dow === 0 || dow === 6, today: iso === options.today, label: format(parseISO(iso), "d") });
    }
    const items: Array<Omit<CalendarItem, "lane">> = [];
    for (const { task, span } of spans) {
      if (span.end < weekStart || span.start > weekEnd) continue;
      const first = span.start < weekStart ? weekStart : span.start;
      const last = span.end > weekEnd ? weekEnd : span.end;
      // Clamp to visible days.
      let col = -1;
      let endCol = -1;
      for (let iso = first; iso <= last; iso = addDays(iso, 1)) {
        const c = colOfIso.get(iso);
        if (c === undefined) continue;
        if (col < 0) col = c;
        endCol = c;
      }
      if (col < 0) continue;
      items.push({ task, span, kind: span.kind, col, cols: endCol - col + 1, continuesLeft: span.start < weekStart, continuesRight: span.end > weekEnd });
    }
    const packed = packLanes(items);
    weeks.push({ key: weekStart, days, items: packed, lanes: packed.reduce((n, i) => Math.max(n, i.lane + 1), 0) });
    weekStart = addDays(weekStart, 7);
  }
  return weeks;
}

/** Moves a task so the day grabbed at `grabbedIso` lands on `dropIso`, keeping the duration. */
export function moveSpanByDrop(span: DateRange, grabbedIso: string, dropIso: string): DateRange {
  const delta = daysBetween(grabbedIso, dropIso);
  return { start: addDays(span.start, delta), end: addDays(span.end, delta) };
}

/** Tasks due on or after `from`, grouped by day in order, for the schedule list. */
export function scheduleDays(rows: TaskRow[], from: string, limitDays = 60): Array<{ iso: string; tasks: TaskRow[] }> {
  const byDay = new Map<string, TaskRow[]>();
  const to = addDays(from, limitDays);
  for (const r of rows) {
    const span = taskSpan(r);
    if (!span) continue;
    const day = span.end;
    if (day < from || day > to) continue;
    byDay.set(day, [...(byDay.get(day) ?? []), r]);
  }
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([iso, tasks]) => ({ iso, tasks: tasks.sort((a, b) => (a.dueTime ?? "99").localeCompare(b.dueTime ?? "99") || a.title.localeCompare(b.title)) }));
}

export function monthLabel(iso: string): string {
  return format(parseISO(iso), "MMMM yyyy");
}
export function dayLabel(iso: string): string {
  return format(parseISO(iso), "EEEE d MMMM yyyy");
}
export function weekLabel(range: DateRange): string {
  const s = parseISO(range.start);
  const e = parseISO(range.end);
  return s.getMonth() === e.getMonth() ? `${format(s, "d")} to ${format(e, "d MMMM yyyy")}` : `${format(s, "d MMM")} to ${format(e, "d MMM yyyy")}`;
}

/** Steps the anchor date by one period for the mode. */
export function stepAnchor(anchor: string, mode: CalendarMode, direction: 1 | -1): string {
  const d = parseISO(anchor);
  if (mode === "month") {
    const m = new Date(d.getFullYear(), d.getMonth() + direction, 1);
    return toIso(m);
  }
  if (mode === "week") return toIso(addDaysFns(d, 7 * direction));
  return toIso(addDaysFns(d, direction));
}

/** Fraction of the day a due time falls at, for the hour offset in week and day modes. */
export function timeFraction(time: string | null): number | null {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  if (!Number.isFinite(h)) return null;
  return Math.min(1, Math.max(0, (h + (Number.isFinite(m) ? m : 0) / 60) / 24));
}
