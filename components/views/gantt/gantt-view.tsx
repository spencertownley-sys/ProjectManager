"use client";

import * as React from "react";
import { ChevronRight16Regular, ChevronDoubleLeft16Regular, ChevronDoubleRight16Regular, Diamond16Regular, Add20Regular } from "@fluentui/react-icons";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { BulkActionBar } from "@/components/views/shared/bulk-action-bar";
import { TimelineEngine } from "@/components/views/engine/timeline-engine";
import type { EngineRow, EngineHandle } from "@/components/views/engine/types";
import type { ViewProps } from "@/components/views/types";
import type { TaskRow } from "@/lib/query-engine/types";
import type { GroupingContext } from "@/lib/client/grouping";
import { groupRows } from "@/lib/client/grouping";
import { defaultRange, ensureRange, fitRange, computeCriticalPath, shiftSuccessors, daysBetween, pxPerDayByZoom, zoomOrder, taskSpan, type DateRange } from "@/lib/client/timeline/scale";
import { buildTimelineRows, scheduledTasks, coveringRange } from "@/lib/client/timeline/rows";
import { buildTimelineSvg, svgToPngBlob, downloadBlob, printSvg, type ExportPalette } from "@/lib/client/timeline/export";
import { useTaskMutations, useBaseline } from "@/lib/client/queries";
import { useViewState, useShellState } from "@/lib/client/view-state";
import { useWorkspace } from "@/lib/client/workspace-context";
import { useGanttStore, type GanttCommand } from "@/lib/client/gantt-store";
import { addDependencyAction, removeDependencyAction } from "@/lib/actions/tasks";
import { formatDateShort } from "@/lib/client/dates";
import { readGanttOptions } from "./gantt-options";
import { cn } from "@/lib/utils";

const rowHeights = { compact: 28, default: 36, comfortable: 44 } as const;
const NAME_ONLY_WIDTH = 240;

function useMediaQuery(query: string) {
  const [matches, setMatches] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [query]);
  return matches;
}

/** Reads the design tokens so exports carry the same colors as the screen. */
function readPalette(): ExportPalette {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    surface: v("--color-surface"),
    subtle: v("--color-subtle"),
    border: v("--color-border"),
    fg: v("--color-fg"),
    fgSecondary: v("--color-fg-secondary"),
    fgTertiary: v("--color-fg-tertiary"),
    brand: v("--color-brand"),
    danger: v("--color-danger"),
    bar: v("--color-palette-blue-tint"),
    barEdge: v("--color-palette-blue"),
    fontFamily: v("--font-sans") || "sans-serif",
  };
}

export function GanttView(props: ViewProps & { quickAddSignal?: number }) {
  const { project, rows, dependencies, groups, spec, setSpec, canEdit, quickAddSignal } = props;
  const { members, today, workspace, slug } = useWorkspace();
  const { update, create, invalidate } = useTaskMutations();
  const { toast } = useToast();
  const { density } = useShellState();
  // Below 768 px the Gantt is read only (docs/11 section 5); below 1024 px the grid collapses to names unless the view says otherwise.
  const narrow = useMediaQuery("(max-width: 767px)");
  const compact = useMediaQuery("(max-width: 1023px)");
  const selectedIds = useViewState((s) => s.selectedIds);
  const select = useViewState((s) => s.select);
  const toggle = useViewState((s) => s.toggle);
  const openTask = useViewState((s) => s.openTask);
  const openTaskId = useViewState((s) => s.openTaskId);
  const engineRef = React.useRef<EngineHandle>(null);
  const options = React.useMemo(() => readGanttOptions(spec), [spec]);
  const { zoom, criticalPath, baselineId, leftWidth, collapsedGroups, collapsedParents } = options;
  const leftCollapsed = typeof spec.options.ganttLeftCollapsed === "boolean" ? options.leftCollapsed : compact;
  const editable = canEdit && !narrow;
  const rowHeight = rowHeights[density];
  const [selectedDependencyId, setSelectedDependencyId] = React.useState<string | null>(null);

  const groupingCtx = React.useMemo<GroupingContext>(
    () => ({ sections: project.sections, statuses: project.statuses, members, fields: project.fields.map((f) => ({ id: f.id, name: f.name, type: f.type as never, config: f.config })), today }),
    [project.sections, project.statuses, project.fields, members, today],
  );
  // Rows mirror the List grouping; the default is by section.
  const effectiveGroups = React.useMemo(() => (spec.groupBy ? groups : groupRows(rows, "section", groupingCtx)), [spec.groupBy, groups, rows, groupingCtx]);
  const engineRows = React.useMemo(() => buildTimelineRows(effectiveGroups, { collapsedGroups, collapsedParents, subtasks: spec.subtasks, showGroups: true }), [effectiveGroups, collapsedGroups, collapsedParents, spec.subtasks]);
  const scheduled = React.useMemo(() => scheduledTasks(rows), [rows]);
  const spans = React.useMemo(() => scheduled.map((t) => ({ start: t.start, end: t.end })), [scheduled]);

  // The visible date range grows to cover the plan and today; Fit recomputes it.
  const [range, setRange] = React.useState<DateRange>(() => ensureRange(defaultRange(today, zoom), spans, today));
  const needed = ensureRange(range, spans, today);
  if (needed.start !== range.start || needed.end !== range.end) setRange(needed);

  const criticalIds = React.useMemo(() => (criticalPath ? computeCriticalPath(scheduled, dependencies) : null), [criticalPath, scheduled, dependencies]);
  const baselineEntry = React.useMemo(() => project.baselines.find((b) => b.id === baselineId) ?? null, [project.baselines, baselineId]);
  const baselineQuery = useBaseline(baselineEntry);
  const baseline = React.useMemo(() => {
    if (!baselineEntry || !baselineQuery.data) return null;
    const map = new Map<string, DateRange>();
    for (const [id, dates] of Object.entries(baselineQuery.data)) {
      const span = taskSpan({ startDate: dates.startDate, dueDate: dates.dueDate, isMilestone: false });
      if (span) map.set(id, { start: span.start, end: span.end });
    }
    return map;
  }, [baselineEntry, baselineQuery.data]);

  const setOption = React.useCallback((key: string, value: unknown) => setSpec((prev) => ({ ...prev, options: { ...prev.options, [key]: value } })), [setSpec]);
  const toggleGroup = (key: string) => {
    const bare = key.replace(/^group:/, "");
    setOption("ganttCollapsed", collapsedGroups.includes(bare) ? collapsedGroups.filter((k) => k !== bare) : [...collapsedGroups, bare]);
  };
  const toggleParent = (id: string) => setOption("ganttCollapsedParents", collapsedParents.includes(id) ? collapsedParents.filter((k) => k !== id) : [...collapsedParents, id]);

  // Date mutations with optional auto schedule (docs/11 section 5).
  const applyDates = React.useCallback(
    (task: TaskRow, next: DateRange, label: string) => {
      const patch = task.isMilestone ? { startDate: next.end, dueDate: next.end } : { startDate: next.start, dueDate: next.end };
      const previous = new Map<string, { startDate: string | null; dueDate: string | null }>([[task.id, { startDate: task.startDate, dueDate: task.dueDate }]]);
      update.mutate({ id: task.id, ...patch, optimistic: (r: TaskRow) => ({ ...r, ...patch }) } as never);
      if (!project.autoSchedule) return;
      const moved = shiftSuccessors(scheduled, dependencies, task.id, next);
      for (const [id, dates] of moved) {
        const row = rows.find((r) => r.id === id);
        if (!row) continue;
        previous.set(id, { startDate: row.startDate, dueDate: row.dueDate });
        const p = row.isMilestone ? { startDate: dates.end, dueDate: dates.end } : { startDate: dates.start, dueDate: dates.end };
        update.mutate({ id, ...p, optimistic: (r: TaskRow) => ({ ...r, ...p }) } as never);
      }
      if (moved.size > 0) {
        toast({
          title: `${moved.size + 1} tasks moved`,
          description: `${label} shifted ${moved.size} dependent ${moved.size === 1 ? "task" : "tasks"}.`,
          kind: "info",
          action: {
            label: "Undo",
            onClick: () => {
              for (const [id, dates] of previous) update.mutate({ id, ...dates, optimistic: (r: TaskRow) => ({ ...r, ...dates }) } as never);
            },
          },
        });
      }
    },
    [update, project.autoSchedule, scheduled, dependencies, rows, toast],
  );

  const onLink = async (link: { predecessorId: string; successorId: string; type: "fs" | "ss" | "ff" | "sf" }) => {
    const res = await addDependencyAction(slug, { ...link, lagDays: 0 });
    if (!res.ok) toast({ title: "Could not add the dependency", description: res.error.message, kind: "danger" });
    else toast({ title: "Dependency added", kind: "success" });
    invalidate();
  };
  const onDeleteDependency = async (id: string) => {
    const dep = dependencies.find((d) => d.id === id);
    const from = rows.find((r) => r.id === dep?.predecessorId);
    const to = rows.find((r) => r.id === dep?.successorId);
    if (!window.confirm(`Remove the dependency from ${from?.key ?? "the predecessor"} to ${to?.key ?? "the successor"}?`)) return;
    const res = await removeDependencyAction(slug, id);
    if (!res.ok) toast({ title: "Could not remove the dependency", description: res.error.message, kind: "danger" });
    setSelectedDependencyId(null);
    invalidate();
  };

  // Commands from the command bar (fit, today, scroll to selected, export) run through the Gantt store.
  const register = useGanttStore((s) => s.register);
  const runCommand = (command: GanttCommand) => {
    const engine = engineRef.current;
    if (command === "today") engine?.scrollToToday();
    if (command === "scroll-selected") {
      const id = openTaskId ?? selectedIds[0];
      if (id) engine?.scrollToTask(id);
      else toast({ title: "Select a task first", kind: "info" });
    }
    if (command === "fit") {
      const span = project.startDate && project.endDate ? { start: project.startDate, end: project.endDate } : coveringRange(rows);
      const target = span ? fitRange([span], today, 3) : defaultRange(today, zoom);
      const chartWidth = Math.max(320, (engine?.element()?.clientWidth ?? 1200) - (leftCollapsed ? NAME_ONLY_WIDTH : leftWidth));
      const days = daysBetween(target.start, target.end) + 1;
      const fitZoom = zoomOrder.find((z) => days * pxPerDayByZoom[z] <= chartWidth) ?? "quarter";
      setRange(target);
      setOption("ganttZoom", fitZoom);
      window.setTimeout(() => engine?.scrollToDate(target.start, "start"), 50);
    }
    if (command.startsWith("export")) {
      const exportRange = command === "export-png-visible" ? (engine?.visibleDates() ?? range) : range;
      const { svg, width, height } = buildTimelineSvg({ title: project.name, rows: engineRows, range: exportRange, zoom, today, weekStartsOn: workspace.weekStartsOn, dependencies, leftWidth: leftCollapsed ? NAME_ONLY_WIDTH : 280, rowHeight, barHeight: Math.round(rowHeight * 0.6), palette: readPalette(), criticalIds });
      if (command === "export-pdf") {
        try {
          printSvg(svg, `${project.name} Gantt`);
        } catch (error) {
          toast({ title: "Could not open the print view", description: (error as Error).message, kind: "danger" });
        }
      } else {
        svgToPngBlob(svg, width, height)
          .then((blob) => {
            downloadBlob(blob, `${project.key.toLowerCase()}-gantt-${today}.png`);
            toast({ title: "Gantt exported", kind: "success" });
          })
          .catch((error: Error) => toast({ title: "Could not export the image", description: error.message, kind: "danger" }));
      }
    }
  };
  const runCommandRef = React.useRef(runCommand);
  React.useEffect(() => {
    runCommandRef.current = runCommand;
  });
  React.useEffect(() => {
    register((command) => runCommandRef.current(command));
    return () => register(null);
  }, [register]);

  // Scroll to today on first paint, and to the open task when it changes.
  React.useEffect(() => {
    const t = window.setTimeout(() => engineRef.current?.scrollToToday(true), 30);
    return () => window.clearTimeout(t);
  }, []);
  React.useEffect(() => {
    if (openTaskId) engineRef.current?.scrollToTask(openTaskId);
  }, [openTaskId]);

  // Quick add from the command bar creates a task today in the first section.
  const [seenSignal, setSeenSignal] = React.useState(quickAddSignal);
  if (quickAddSignal !== seenSignal) {
    setSeenSignal(quickAddSignal);
    if (quickAddSignal && canEdit) openTask("new");
  }

  // Left grid: resizable, collapsible to the name column.
  const paneWidth = leftCollapsed ? NAME_ONLY_WIDTH : leftWidth;
  const resizing = React.useRef(false);
  const onPaneResize = (e: React.PointerEvent) => {
    if (leftCollapsed) return;
    resizing.current = true;
    const startX = e.clientX;
    const startWidth = leftWidth;
    const onMove = (ev: PointerEvent) => {
      if (!resizing.current) return;
      setOption("ganttLeftWidth", Math.max(220, Math.min(800, startWidth + ev.clientX - startX)));
    };
    const onUp = () => {
      resizing.current = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
  const gridColumns = leftCollapsed ? [] : [
    { key: "start", label: "Start", width: 84 },
    { key: "due", label: "Due", width: 84 },
    { key: "duration", label: "Days", width: 56 },
    { key: "assignee", label: "Assignee", width: 120 },
  ];

  const leftHeader = (
    <div className="flex h-full items-end">
      <div className="flex h-12 min-w-0 flex-1 items-center gap-1 px-2">
        <button type="button" onClick={() => setOption("ganttLeftCollapsed", !leftCollapsed)} className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-fg-tertiary hover:bg-hover hover:text-fg" aria-label={leftCollapsed ? "Show grid columns" : "Collapse grid to names"}>
          {leftCollapsed ? <ChevronDoubleRight16Regular /> : <ChevronDoubleLeft16Regular />}
        </button>
        <span className="type-caption-1-strong text-fg-secondary">Task</span>
      </div>
      {gridColumns.map((c) => (
        <div key={c.key} className="flex h-12 shrink-0 items-center px-2 type-caption-1-strong text-fg-secondary" style={{ width: c.width }}>
          {c.label}
        </div>
      ))}
      <div role="separator" aria-orientation="vertical" aria-label="Resize the grid" onPointerDown={onPaneResize} className={cn("absolute top-0 -right-1 z-20 h-full w-2 cursor-col-resize hover:bg-brand/30", leftCollapsed && "hidden")} />
    </div>
  );

  const renderLeftRow = (row: EngineRow) => {
    if (row.kind === "group") {
      const collapsed = row.collapsed;
      return (
        <div className="flex h-full items-center gap-2 px-2">
          <button type="button" onClick={() => toggleGroup(row.key)} className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-fg-secondary hover:bg-hover" aria-expanded={!collapsed} aria-label={collapsed ? `Expand ${row.label}` : `Collapse ${row.label}`}>
            <ChevronRight16Regular className={cn("transition-transform", !collapsed && "rotate-90")} />
          </button>
          {row.color ? <span data-color={row.color} className="h-2.5 w-2.5 rounded-full bg-item" aria-hidden /> : null}
          <span className="truncate type-body-1-strong">{row.label}</span>
          <span className="type-caption-1 text-fg-tertiary">{row.count}</span>
          {row.summary && !leftCollapsed ? <span className="ml-auto truncate type-caption-1 text-fg-tertiary">{formatDateShort(row.summary.start)} to {formatDateShort(row.summary.end)}</span> : null}
        </div>
      );
    }
    const t = row.task;
    const span = taskSpan(t);
    const done = t.status.category === "done";
    const selected = selectedIds.includes(t.id) || openTaskId === t.id;
    return (
      <div className={cn("flex h-full items-center", selected && "bg-selected")} data-task-row={t.id}>
        <div className="flex h-full min-w-0 flex-1 items-center gap-1 px-2" style={{ paddingLeft: 8 + row.depth * 16 }}>
          {row.hasChildren ? (
            <button type="button" onClick={() => toggleParent(t.id)} className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-xs text-fg-tertiary hover:bg-pressed" aria-expanded={row.expanded} aria-label={row.expanded ? "Collapse subtasks" : "Expand subtasks"}>
              <ChevronRight16Regular className={cn("transition-transform", row.expanded && "rotate-90")} />
            </button>
          ) : (
            <span className="w-5 shrink-0" />
          )}
          {t.isMilestone ? <Diamond16Regular className="shrink-0 text-brand" aria-label="Milestone" /> : null}
          <button type="button" className={cn("min-w-0 flex-1 truncate text-left type-body-1 hover:underline", done && "text-fg-secondary line-through")} onClick={(e) => (e.ctrlKey || e.metaKey ? toggle(t.id) : openTask(t.id))}>
            {t.title}
          </button>
          {!span ? <span className="shrink-0 type-caption-1 text-fg-tertiary">No dates</span> : null}
        </div>
        {gridColumns.map((c) => (
          <div key={c.key} className="flex h-full shrink-0 items-center truncate px-2 type-body-1 text-fg-secondary" style={{ width: c.width }}>
            {c.key === "start" ? (span && !t.isMilestone ? formatDateShort(span.start) : "") : null}
            {c.key === "due" ? (span ? formatDateShort(span.end) : "") : null}
            {c.key === "duration" ? (span && !t.isMilestone ? daysBetween(span.start, span.end) + 1 : "") : null}
            {c.key === "assignee" ? (t.assignee ? <span className="flex items-center gap-1.5 truncate"><Avatar name={t.assignee.displayName} src={t.assignee.avatarUrl} size="xs" /><span className="truncate">{t.assignee.displayName}</span></span> : null) : null}
          </div>
        ))}
      </div>
    );
  };

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No tasks match this view"
        description={spec.filters.items.length ? "Clear the filters to see everything, or add a task." : "Add the first task to see it on the Gantt."}
        action={canEdit ? <Button variant="primary" size="sm" onClick={() => openTask("new")}><Add20Regular className="h-4 w-4" /> Add task</Button> : undefined}
      />
    );
  }

  return (
    <div className="relative h-full" onKeyDown={(e) => { if ((e.key === "Delete" || e.key === "Backspace") && selectedDependencyId && editable && !(e.target as HTMLElement).closest("input,textarea")) { e.preventDefault(); onDeleteDependency(selectedDependencyId); } }}>
      <TimelineEngine
        ref={engineRef}
        rows={engineRows}
        range={range}
        zoom={zoom}
        today={today}
        weekStartsOn={workspace.weekStartsOn}
        rowHeight={rowHeight}
        barHeight={Math.round(rowHeight * 0.6)}
        dependencies={dependencies}
        showDependencies
        canEdit={editable}
        leftPane={{ width: paneWidth, header: leftHeader, renderRow: renderLeftRow }}
        criticalIds={criticalIds}
        baseline={baseline}
        barLabels="auto"
        selectedTaskIds={selectedIds}
        openTaskId={openTaskId}
        selectedDependencyId={selectedDependencyId}
        onMoveTask={(task, next) => applyDates(task, next, task.title)}
        onResizeTask={(task, next) => applyDates(task, next, task.title)}
        onLink={onLink}
        onSelectDependency={setSelectedDependencyId}
        onDeleteDependency={onDeleteDependency}
        onOpenTask={(id) => openTask(id)}
        onSelectTask={(id, additive) => (additive ? toggle(id) : select([id], id))}
        onToggleGroup={toggleGroup}
        onZoomChange={(z) => setOption("ganttZoom", z)}
        onCreateAt={(row, iso) => {
          const sectionId = row.kind === "group" ? ((row.meta?.sectionId as string | null | undefined) ?? null) : row.task.sectionId;
          const title = window.prompt(`New task starting ${formatDateShort(iso)}`);
          if (!title?.trim()) return;
          create.mutate({ projectId: project.id, title: title.trim(), sectionId, startDate: iso, dueDate: iso } as never);
        }}
      />
      <BulkActionBar project={project} />
      {baselineEntry && baselineQuery.isError ? <div className="absolute top-14 left-1/2 -translate-x-1/2 rounded-sm border border-border bg-surface-raised px-3 py-1 type-caption-1 text-fg-secondary shadow-menu">The baseline could not be loaded.</div> : null}
    </div>
  );
}
