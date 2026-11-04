import { format, parseISO, differenceInCalendarDays, isValid } from "date-fns";

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function toDate(iso: string): Date {
  return parseISO(iso);
}

export function toIso(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function addDays(iso: string, days: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + days);
  return toIso(d);
}

export function daysBetween(a: string, b: string): number {
  return differenceInCalendarDays(parseISO(b), parseISO(a));
}

/** Relative within 7 days, absolute beyond (docs/09 section 8). */
export function formatDue(iso: string | null | undefined, today = todayIso()): string {
  if (!iso) return "";
  const d = parseISO(iso);
  if (!isValid(d)) return iso;
  const diff = differenceInCalendarDays(d, parseISO(today));
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7) return format(d, "EEEE");
  if (diff < -1 && diff > -7) return `${Math.abs(diff)} days ago`;
  return d.getFullYear() === parseISO(today).getFullYear() ? format(d, "d MMM") : format(d, "d MMM yyyy");
}

export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "";
  return format(parseISO(iso), "d MMM");
}

export function formatDateLong(iso: string | null | undefined): string {
  if (!iso) return "";
  return format(parseISO(iso), "d MMM yyyy");
}

export function formatRelativeTime(isoDateTime: string, now = new Date()): string {
  const d = new Date(isoDateTime);
  const seconds = Math.round((now.getTime() - d.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return format(d, "d MMM");
}

export function dueState(iso: string | null | undefined, completed: boolean, today = todayIso()): "none" | "overdue" | "soon" | "later" {
  if (!iso || completed) return "none";
  const diff = differenceInCalendarDays(parseISO(iso), parseISO(today));
  if (diff < 0) return "overdue";
  if (diff <= 2) return "soon";
  return "later";
}
