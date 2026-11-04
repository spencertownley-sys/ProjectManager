import type { ViewType } from "@/lib/db/schema";

export const viewOrder: ViewType[] = ["list", "board", "table", "gantt", "timeline", "calendar", "workload", "dashboard"];

export const viewMeta: Record<ViewType, { label: string; shortcut: string; phase: 1 | 2 }> = {
  list: { label: "List", shortcut: "1", phase: 1 },
  board: { label: "Board", shortcut: "2", phase: 1 },
  table: { label: "Table", shortcut: "3", phase: 1 },
  gantt: { label: "Gantt", shortcut: "4", phase: 1 },
  timeline: { label: "Timeline", shortcut: "5", phase: 1 },
  calendar: { label: "Calendar", shortcut: "6", phase: 1 },
  workload: { label: "Workload", shortcut: "7", phase: 2 },
  dashboard: { label: "Dashboard", shortcut: "8", phase: 2 },
};
