import type { TaskRow, DependencyRow } from "@/lib/query-engine/types";
import type { DateRange, Zoom } from "@/lib/client/timeline/scale";

/** A row in the timeline engine: a task bar row or a collapsible group with an optional summary bar. */
export type EngineRow =
  | { kind: "task"; key: string; task: TaskRow; depth: number; groupKey?: string; hasChildren?: boolean; expanded?: boolean }
  | { kind: "group"; key: string; label: string; depth: number; collapsed: boolean; count: number; color?: string; summary: DateRange | null; meta?: Record<string, unknown> };

export type EngineLink = { predecessorId: string; successorId: string; type: DependencyRow["type"] };

export type EngineHandle = {
  scrollToDate: (iso: string, align?: "start" | "center", instant?: boolean) => void;
  scrollToTask: (taskId: string) => void;
  scrollToToday: (instant?: boolean) => void;
  /** The dates currently on screen. */
  visibleDates: () => DateRange;
  /** The scroll container, for exports. */
  element: () => HTMLDivElement | null;
};

export type EngineProps = {
  rows: EngineRow[];
  range: DateRange;
  zoom: Zoom;
  today: string;
  weekStartsOn: number;
  rowHeight: number;
  barHeight: number;
  dependencies: DependencyRow[];
  showDependencies: boolean;
  canEdit: boolean;
  /** Optional frozen grid to the left of the chart (Gantt). */
  leftPane?: { width: number; header: React.ReactNode; renderRow: (row: EngineRow, index: number) => React.ReactNode };
  /** Highlight these tasks as critical and dim the rest (Gantt critical path). */
  criticalIds?: Set<string> | null;
  /** Baseline dates per task, drawn as a thin bar beneath the task bar with a delta label. */
  baseline?: Map<string, DateRange> | null;
  /** Labels always sit inside or beside bars; Timeline forces a larger, labelled style. */
  barLabels: "auto" | "always";
  selectedTaskIds: string[];
  openTaskId: string | null;
  selectedDependencyId: string | null;
  onMoveTask: (task: TaskRow, next: DateRange) => void;
  onResizeTask: (task: TaskRow, next: DateRange) => void;
  onLink: (link: EngineLink) => void;
  onSelectDependency: (dependencyId: string | null) => void;
  onDeleteDependency: (dependencyId: string) => void;
  onOpenTask: (taskId: string) => void;
  onSelectTask: (taskId: string, additive: boolean) => void;
  onToggleGroup: (key: string) => void;
  onZoomChange: (zoom: Zoom) => void;
  /** Double click on empty chart area at a row. */
  onCreateAt?: (row: EngineRow, iso: string) => void;
  /** A task dropped from outside the chart (the Timeline unscheduled tray) onto a row at a date. */
  onDropExternal?: (taskId: string, row: EngineRow | null, iso: string) => void;
  /** Rendered once per task row beneath the bar, for example a label to the right in Timeline. */
  className?: string;
};
