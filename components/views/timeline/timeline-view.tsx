"use client";

import * as React from "react";
import { ChevronRight16Regular, Diamond16Regular, Add20Regular } from "@fluentui/react-icons";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { BulkActionBar } from "@/components/views/shared/bulk-action-bar";
import { TimelineEngine } from "@/components/views/engine/timeline-engine";
import type { EngineHandle, EngineRow } from "@/components/views/engine/types";
import type { ViewProps } from "@/components/views/types";
import type { TaskRow } from "@/lib/query-engine/types";
import type { GroupingContext } from "@/lib/client/grouping";
import { groupRows } from "@/lib/client/grouping";
import { defaultRange, ensureRange, fitRange, computeCriticalPath, shiftSuccessors, daysBetween, pxPerDayByZoom, zoomOrder, taskSpan, type DateRange } from "@/lib/client/timeline/scale";
import { buildTimelineRows, scheduledTasks, coveringRange } from "@/lib/client/timeline/rows";
import { buildTimelineSvg, svgToPngBlob, downloadBlob, printSvg, type ExportPalette } from "@/lib/client/timeline/export";
import { fieldPatch } from "@/lib/client/board";
import { useTaskMutations } from "@/lib/client/queries";
import { useViewState } from "@/lib/client/view-state";
import { useWorkspace } from "@/lib/client/workspace-context";
import { useTimelineCommands, type TimelineCommand } from "@/lib/client/timeline-commands";
import { addDependencyAction, removeDependencyAction } from "@/lib/actions/tasks";
import { formatDateShort } from "@/lib/client/dates";
import { readTimelineOptions } from "./timeline-options";
import { cn } from "@/lib/utils";

const ROW_HEIGHT = 44;
const BAR_HEIGHT = 32;
const DRAG_TYPE = "application/x-taskparty-task";

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

function readPalette(): ExportPalette {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return { surface: v("--color-surface"), subtle: v("--color-subtle"), border: v("--color-border"), fg: v("--color-fg"), fgSecondary: v("--color-fg-secondary"), fgTertiary: v("--color-fg-tertiary"), brand: v("--color-brand"), danger: v("--color-danger"), bar: v("--color-palette-blue-tint"), barEdge: v("--color-palette-blue"), fontFamily: v("--font-sans") || "sans-serif" };
}

/**
 * Timeline (docs/11 section 6): the plan at a glance. No grid, bars carry labels, grouped rows with summary bars,
 * dependencies and critical path only when toggled, and an unscheduled tray whose tasks drag onto the chart.
 */
export function TimelineView(props: ViewProps & { quickAddSignal?: number }) {
  const { project, rows, dependencies, groups, spec, setSpec, canEdit, quickAddSignal } = props;
  const { members, today, workspace, slug } = useWorkspace();
  const { update, invalidate } = useTaskMutations();
  const { toast } = useToast();
  const narrow = useMediaQuery("(max-width: 767px)");
  const selectedIds = useViewState((s) => s.selectedIds);
  const select = useViewState((s) => s.select);
  const toggle = useViewState((s) => s.toggle);
  const openTask = useViewState((s) => s.openTask);
  const openTaskId = useViewState((s) => s.openTaskId);
  const engineRef = React.useRef<EngineHandle>(null);
  const options = React.useMemo(() => readTimelineOptions(spec), [spec]);
  const { zoom, dependencies: showDependencies, criticalPath, collapsedGroups, trayCollapsed } = options;
  const editable = canEdit && !narrow;
  const [selectedDependencyId, setSelectedDependencyId] = React.useState<string | null>(null);

  const groupingCtx = React.useMemo<GroupingContext>(
    () => ({ sections: project.sections, statuses: project.statuses, members, fields: project.fields.map((f) => ({ id: f.id, name: f.name, type: f.type as never, config: f.config })), today }),
    [project.sections, project.statuses, project.fields, members, today],
  );
  const groupField = spec.groupBy ?? "section";
  const scheduledRows = React.useMemo(() => rows.filter((r) => taskSpan(r) !== null), [rows]);
  const unscheduled = React.useMemo(() => rows.filter((r) => taskSpan(r) === null && !(r.parentId && rows.some((p) => p.id === r.parentId) && spec.subtasks !== "flat")), [rows, spec.subtasks]);
  const effectiveGroups = React.useMemo(() => (spec.groupBy ? groups.map((g) => ({ ...g, rows: g.rows.filter((r) => taskSpan(r) !== null) })) : groupRows(scheduledRows, "section", groupingCtx)), [spec.groupBy, groups, scheduledRows, groupingCtx]);
  const engineRows = React.useMemo(() => buildTimelineRows(effectiveGroups, { collapsedGroups, collapsedParents: [], subtasks: spec.subtasks, showGroups: true }), [effectiveGroups, collapsedGroups, spec.subtasks]);
  const scheduled = React.useMemo(() => scheduledTasks(rows), [rows]);
  const spans = React.useMemo(() => scheduled.map((t) => ({ start: t.start, end: t.end })), [scheduled]);
  const [range, setRange] = React.useState<DateRange>(() => ensureRange(defaultRange(today, zoom), spans, today));
  const needed = ensureRange(range, spans, today);
  if (needed.start !== range.start || needed.end !== range.end) setRange(needed);
  const criticalIds = React.useMemo(() => (showDependencies && criticalPath ? computeCriticalPath(scheduled, dependencies) : null), [showDependencies, criticalPath, scheduled, dependencies]);

  const setOption = React.useCallback((key: string, value: unknown) => setSpec((prev) => ({ ...prev, options: { ...prev.options, [key]: value } })), [setSpec]);
  const toggleGroup = (key: string) => {
    const bare = key.replace(/^group:/, "");
    setOption("timelineCollapsed", collapsedGroups.includes(bare) ? collapsedGroups.filter((k) => k !== bare) : [...collapsedGroups, bare]);
  };

  const applyDates = React.useCallback(
    (task: TaskRow, next: DateRange) => {
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
        toast({ title: `${moved.size + 1} tasks moved`, description: `${task.title} shifted ${moved.size} dependent ${moved.size === 1 ? "task" : "tasks"}.`, kind: "info", action: { label: "Undo", onClick: () => { for (const [id, dates] of previous) update.mutate({ id, ...dates, optimistic: (r: TaskRow) => ({ ...r, ...dates }) } as never); } } });
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
    if (!window.confirm("Remove this dependency?")) return;
    const res = await removeDependencyAction(slug, id);
    if (!res.ok) toast({ title: "Could not remove the dependency", description: res.error.message, kind: "danger" });
    setSelectedDependencyId(null);
    invalidate();
  };

  // A task dropped from the tray onto a row takes that date and the row's group value.
  const onDropExternal = (taskId: string, row: EngineRow | null, iso: string) => {
    const task = rows.find((r) => r.id === taskId);
    if (!task || !editable) return;
    const groupKey = row ? (row.kind === "group" ? row.key.replace(/^group:/, "") : row.groupKey) : undefined;
    const groupPatch = groupKey ? fieldPatch(groupField, groupKey, groupingCtx) : null;
    const dates = task.isMilestone ? { startDate: iso, dueDate: iso } : { startDate: iso, dueDate: iso };
    update.mutate({ id: task.id, ...dates, ...(groupPatch?.patch ?? {}), optimistic: (r: TaskRow) => (groupPatch ? groupPatch.optimistic({ ...r, ...dates }) : { ...r, ...dates }) } as never);
    toast({ title: `${task.title} scheduled for ${formatDateShort(iso)}`, kind: "success" });
  };

  // Command bar commands.
  const register = useTimelineCommands((s) => s.register);
  const runCommand = (command: TimelineCommand) => {
    const engine = engineRef.current;
    if (command === "today") engine?.scrollToToday();
    if (command === "scroll-selected") {
      const id = openTaskId ?? selectedIds[0];
      if (id) engine?.scrollToTask(id);
      else toast({ title: "Select a task first", kind: "info" });
    }
    if (command === "fit") {
      const span = coveringRange(rows) ?? (project.startDate && project.endDate ? { start: project.startDate, end: project.endDate } : null);
      const target = span ? fitRange([span], today, 3) : defaultRange(today, zoom);
      const chartWidth = Math.max(320, engine?.element()?.clientWidth ?? 1200);
      const days = daysBetween(target.start, target.end) + 1;
      const fitZoom = zoomOrder.find((z) => days * pxPerDayByZoom[z] <= chartWidth) ?? "quarter";
      setRange(target);
      setOption("timelineZoom", fitZoom);
      window.setTimeout(() => engine?.scrollToDate(target.start, "start"), 50);
    }
    if (command.startsWith("export")) {
      const exportRange = command === "export-png-visible" ? (engine?.visibleDates() ?? range) : range;
      const { svg, width, height } = buildTimelineSvg({ title: project.name, rows: engineRows, range: exportRange, zoom, today, weekStartsOn: workspace.weekStartsOn, dependencies: showDependencies ? dependencies : [], leftWidth: 0, rowHeight: ROW_HEIGHT, barHeight: BAR_HEIGHT, palette: readPalette(), criticalIds });
      if (command === "export-pdf") {
        try {
          printSvg(svg, `${project.name} timeline`);
        } catch (error) {
          toast({ title: "Could not open the print view", description: (error as Error).message, kind: "danger" });
        }
      } else {
        svgToPngBlob(svg, width, height)
          .then((blob) => {
            downloadBlob(blob, `${project.key.toLowerCase()}-timeline-${today}.png`);
            toast({ title: "Timeline exported", kind: "success" });
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
  React.useEffect(() => {
    const t = window.setTimeout(() => engineRef.current?.scrollToToday(true), 30);
    return () => window.clearTimeout(t);
  }, []);
  React.useEffect(() => {
    if (openTaskId) engineRef.current?.scrollToTask(openTaskId);
  }, [openTaskId]);

  const [seenSignal, setSeenSignal] = React.useState(quickAddSignal);
  if (quickAddSignal !== seenSignal) {
    setSeenSignal(quickAddSignal);
    if (quickAddSignal && canEdit) openTask("new");
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No tasks match this view"
        description={spec.filters.items.length ? "Clear the filters to see everything, or add a task." : "Add the first task to see it on the timeline."}
        action={canEdit ? <Button variant="primary" size="sm" onClick={() => openTask("new")}><Add20Regular className="h-4 w-4" /> Add task</Button> : undefined}
      />
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col" onKeyDown={(e) => { if ((e.key === "Delete" || e.key === "Backspace") && selectedDependencyId && editable && !(e.target as HTMLElement).closest("input,textarea")) { e.preventDefault(); onDeleteDependency(selectedDependencyId); } }}>
      <div className="min-h-0 flex-1">
        <TimelineEngine
          ref={engineRef}
          rows={engineRows}
          range={range}
          zoom={zoom}
          today={today}
          weekStartsOn={workspace.weekStartsOn}
          rowHeight={ROW_HEIGHT}
          barHeight={BAR_HEIGHT}
          dependencies={dependencies}
          showDependencies={showDependencies}
          canEdit={editable}
          criticalIds={criticalIds}
          barLabels="always"
          selectedTaskIds={selectedIds}
          openTaskId={openTaskId}
          selectedDependencyId={selectedDependencyId}
          onMoveTask={applyDates}
          onResizeTask={applyDates}
          onLink={onLink}
          onSelectDependency={setSelectedDependencyId}
          onDeleteDependency={onDeleteDependency}
          onOpenTask={(id) => openTask(id)}
          onSelectTask={(id, additive) => (additive ? toggle(id) : select([id], id))}
          onToggleGroup={toggleGroup}
          onZoomChange={(z) => setOption("timelineZoom", z)}
          onDropExternal={editable ? onDropExternal : undefined}
        />
      </div>
      {unscheduled.length > 0 ? (
        <section aria-label="Unscheduled tasks" className="shrink-0 border-t border-border bg-surface">
          <button type="button" onClick={() => setOption("timelineTrayCollapsed", !trayCollapsed)} className="flex h-9 w-full items-center gap-2 px-3 text-left hover:bg-hover" aria-expanded={!trayCollapsed}>
            <ChevronRight16Regular className={cn("text-fg-secondary transition-transform", !trayCollapsed && "rotate-90")} />
            <span className="type-body-1-strong">Unscheduled</span>
            <span className="type-caption-1 text-fg-tertiary">{unscheduled.length}</span>
            <span className="ml-2 type-caption-1 text-fg-tertiary">{editable ? "Drag a task onto the timeline to schedule it" : ""}</span>
          </button>
          {!trayCollapsed ? (
            <ul className="flex max-h-40 flex-wrap gap-2 overflow-y-auto px-3 pb-3" role="list">
              {unscheduled.map((t) => (
                <li key={t.id}>
                  <div
                    draggable={editable}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DRAG_TYPE, t.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    role="button"
                    tabIndex={0}
                    data-tray-task={t.id}
                    aria-label={`${t.title}, unscheduled`}
                    onClick={() => openTask(t.id)}
                    onKeyDown={(e) => { if (e.key === "Enter") openTask(t.id); }}
                    className={cn("flex h-8 max-w-72 items-center gap-2 rounded-sm border border-border bg-surface px-2 type-body-1 hover:border-border-strong", editable && "cursor-grab", (selectedIds.includes(t.id) || openTaskId === t.id) && "border-brand bg-selected")}
                  >
                    {t.isMilestone ? <Diamond16Regular className="shrink-0 text-brand" aria-label="Milestone" /> : null}
                    <span className="truncate">{t.title}</span>
                    <span className="shrink-0 font-mono type-caption-1 text-fg-tertiary">{t.key}</span>
                    {t.assignee ? <Avatar name={t.assignee.displayName} src={t.assignee.avatarUrl} size="xs" /> : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
      <BulkActionBar project={project} />
    </div>
  );
}
