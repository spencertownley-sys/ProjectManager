"use client";

import * as React from "react";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, useDraggable, useDroppable, pointerWithin, type DragStartEvent, type DragEndEvent, type DragOverEvent } from "@dnd-kit/core";
import { format, parseISO } from "date-fns";
import { Diamond16Regular, Add20Regular, Clock16Regular } from "@fluentui/react-icons";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { BulkActionBar } from "@/components/views/shared/bulk-action-bar";
import { QuickAddRow } from "@/components/views/shared/quick-add-row";
import { TimelineEngine } from "@/components/views/engine/timeline-engine";
import type { EngineHandle, EngineRow } from "@/components/views/engine/types";
import type { ViewProps } from "@/components/views/types";
import type { TaskRow } from "@/lib/query-engine/types";
import type { GroupingContext } from "@/lib/client/grouping";
import { groupRows } from "@/lib/client/grouping";
import { readCalendarOptions, layoutCalendar, monthGridRange, weekRange, moveSpanByDrop, scheduleDays, weekDays, type CalendarItem, type CalendarWeek } from "@/lib/client/calendar";
import { useCalendarStore } from "@/lib/client/calendar-store";
import { taskSpan, resizeSpan, shiftSpan, addDays, type DateRange } from "@/lib/client/timeline/scale";
import { buildTimelineRows } from "@/lib/client/timeline/rows";
import { useTaskMutations } from "@/lib/client/queries";
import { useViewState } from "@/lib/client/view-state";
import { useWorkspace } from "@/lib/client/workspace-context";
import { formatDue, formatDateShort } from "@/lib/client/dates";
import { cn } from "@/lib/utils";

const LANE_HEIGHT = 24;
const DAY_HEADER = 28;
const MAX_LANES = 3;
const chipId = (taskId: string, weekKey: string) => `chip:${taskId}:${weekKey}`;

type DragData = { taskId: string; grabbedIso: string };

/** Calendar (docs/11 section 7): month grid with multi day lanes, week and day on the engine, and a schedule list. */
export function CalendarView(props: ViewProps & { quickAddSignal?: number }) {
  const { project, rows, spec, canEdit, groups, dependencies, quickAddSignal } = props;
  const { members, today, workspace, user } = useWorkspace();
  const { update, create } = useTaskMutations();
  const selectedIds = useViewState((s) => s.selectedIds);
  const select = useViewState((s) => s.select);
  const toggle = useViewState((s) => s.toggle);
  const openTask = useViewState((s) => s.openTask);
  const openTaskId = useViewState((s) => s.openTaskId);
  const { mode, weekends } = readCalendarOptions(spec);
  const anchor = useCalendarStore((s) => s.anchor) ?? today;
  const setAnchor = useCalendarStore((s) => s.setAnchor);
  const [composerIso, setComposerIso] = React.useState<string | null>(null);
  const [expandedWeeks, setExpandedWeeks] = React.useState<Set<string>>(() => new Set());
  const [dragging, setDragging] = React.useState<{ task: TaskRow; grabbedIso: string } | null>(null);
  const [dropIso, setDropIso] = React.useState<string | null>(null);
  const [resizing, setResizing] = React.useState<{ taskId: string; edge: "start" | "end"; iso: string } | null>(null);
  const resizingRef = React.useRef<{ taskId: string; edge: "start" | "end"; iso: string } | null>(null);

  const groupingCtx = React.useMemo<GroupingContext>(
    () => ({ sections: project.sections, statuses: project.statuses, members, fields: project.fields.map((f) => ({ id: f.id, name: f.name, type: f.type as never, config: f.config })), today }),
    [project.sections, project.statuses, project.fields, members, today],
  );

  const applyDates = React.useCallback(
    (task: TaskRow, next: DateRange) => {
      const patch = task.isMilestone || !task.startDate ? { startDate: task.isMilestone ? next.end : task.startDate ? next.start : null, dueDate: next.end } : { startDate: next.start, dueDate: next.end };
      update.mutate({ id: task.id, ...patch, optimistic: (r: TaskRow) => ({ ...r, ...patch }) } as never);
    },
    [update],
  );

  const [seenSignal, setSeenSignal] = React.useState(quickAddSignal);
  if (quickAddSignal !== seenSignal) {
    setSeenSignal(quickAddSignal);
    if (quickAddSignal && canEdit) setComposerIso(anchor);
  }

  // Month layout.
  const monthRange = React.useMemo(() => monthGridRange(anchor, workspace.weekStartsOn), [anchor, workspace.weekStartsOn]);
  const weeks = React.useMemo<CalendarWeek[]>(() => {
    if (mode !== "month") return [];
    const preview = rows.map((r) => {
      if (resizing && resizing.taskId === r.id) {
        const span = taskSpan(r);
        if (!span) return r;
        const next = resizing.edge === "start" ? { start: resizing.iso <= span.end ? resizing.iso : span.end, end: span.end } : { start: span.start, end: resizing.iso >= span.start ? resizing.iso : span.start };
        return { ...r, startDate: r.isMilestone ? next.end : next.start, dueDate: next.end };
      }
      return r;
    });
    return layoutCalendar(preview, monthRange, { weekStartsOn: workspace.weekStartsOn, weekends, today, monthOf: anchor });
  }, [mode, rows, monthRange, workspace.weekStartsOn, weekends, today, anchor, resizing]);
  const columns = weekDays(workspace.weekStartsOn, weekends);
  const dayNames = columns.map((dow) => format(parseISO(addDays("2026-11-01", dow)), "EEE"));

  // Drag chips between days.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const onDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as DragData | undefined;
    const task = data ? rows.find((r) => r.id === data.taskId) : undefined;
    if (!task || !data) return;
    setDragging({ task, grabbedIso: data.grabbedIso });
  };
  const onDragOver = (e: DragOverEvent) => setDropIso(e.over ? String(e.over.id).replace(/^day:/, "") : null);
  const onDragEnd = (e: DragEndEvent) => {
    const d = dragging;
    const target = e.over ? String(e.over.id).replace(/^day:/, "") : null;
    setDragging(null);
    setDropIso(null);
    if (!d || !target) return;
    const span = taskSpan(d.task);
    if (!span) return;
    const next = moveSpanByDrop(span, d.grabbedIso, target);
    if (next.start === span.start) return;
    applyDates(d.task, next);
  };

  const startResize = (e: React.PointerEvent, task: TaskRow, edge: "start" | "end") => {
    if (!canEdit) return;
    e.preventDefault();
    e.stopPropagation();
    const span = taskSpan(task);
    if (!span) return;
    const initial = { taskId: task.id, edge, iso: edge === "start" ? span.start : span.end };
    resizingRef.current = initial;
    setResizing(initial);
    const onMove = (ev: PointerEvent) => {
      const cell = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>("[data-day]");
      const iso = cell?.dataset.day;
      if (iso && resizingRef.current && iso !== resizingRef.current.iso) {
        resizingRef.current = { ...resizingRef.current, iso };
        setResizing(resizingRef.current);
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const r = resizingRef.current;
      resizingRef.current = null;
      setResizing(null);
      if (!r) return;
      const next = r.edge === "start" ? { start: r.iso <= span.end ? r.iso : span.end, end: span.end } : { start: span.start, end: r.iso >= span.start ? r.iso : span.start };
      if (next.start === span.start && next.end === span.end) return;
      update.mutate({ id: task.id, startDate: next.start, dueDate: next.end, optimistic: (row: TaskRow) => ({ ...row, startDate: next.start, dueDate: next.end }) } as never);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const onChipKeyDown = (e: React.KeyboardEvent, task: TaskRow) => {
    const span = taskSpan(task);
    if (!span) return;
    if (e.key === "Enter") {
      e.preventDefault();
      openTask(task.id);
    } else if (e.key === " ") {
      e.preventDefault();
      toggle(task.id);
    } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && canEdit) {
      e.preventDefault();
      const delta = e.key === "ArrowRight" ? 1 : -1;
      applyDates(task, e.shiftKey ? resizeSpan(span, "end", delta) : shiftSpan(span, delta));
    }
  };

  const quickAdd = (iso: string, title: string) => create.mutate({ projectId: project.id, title, dueDate: iso } as never);

  // Week and day on the engine.
  const chartRef = React.useRef<HTMLDivElement>(null);
  const engineRef = React.useRef<EngineHandle>(null);
  const [chartWidth, setChartWidth] = React.useState(1000);
  React.useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setChartWidth(el.clientWidth));
    ro.observe(el);
    setChartWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [mode]);
  const LEFT = 220;
  const engineRange = React.useMemo<DateRange>(() => (mode === "day" ? { start: anchor, end: anchor } : weekRange(anchor, workspace.weekStartsOn)), [mode, anchor, workspace.weekStartsOn]);
  const engineRows = React.useMemo<EngineRow[]>(() => {
    if (mode !== "week" && mode !== "day") return [];
    const inRange = rows.filter((r) => {
      const span = taskSpan(r);
      return span && span.end >= engineRange.start && span.start <= engineRange.end;
    });
    const g = spec.groupBy ? groups.map((x) => ({ ...x, rows: x.rows.filter((r) => inRange.includes(r)) })).filter((x) => x.rows.length) : groupRows(inRange, "section", groupingCtx).filter((x) => x.rows.length);
    return buildTimelineRows(g, { collapsedGroups: [], collapsedParents: [], subtasks: spec.subtasks === "hidden" ? "hidden" : "flat", showGroups: g.length > 1 });
  }, [mode, rows, engineRange, spec.groupBy, spec.subtasks, groups, groupingCtx]);
  const days = mode === "day" ? 1 : 7;
  const pxPerDay = Math.max(96, Math.floor((chartWidth - LEFT) / days));

  // Schedule.
  const schedule = React.useMemo(() => (mode === "schedule" ? scheduleDays(rows, today) : []), [mode, rows, today]);

  if (rows.length === 0 && !composerIso && mode !== "month") {
    return <EmptyState title="No tasks match this view" description={spec.filters.items.length ? "Clear the filters to see everything, or add a task." : "Add a task with a due date to see it here."} action={canEdit ? <Button variant="primary" size="sm" onClick={() => openTask("new")}><Add20Regular className="h-4 w-4" /> Add task</Button> : undefined} />;
  }

  if (mode === "schedule") {
    return (
      <div className="h-full overflow-y-auto" role="list" aria-label="Schedule">
        {schedule.length === 0 ? (
          <EmptyState title="No tasks are due in the next 60 days" description="Tasks with a due date show up here in order." action={canEdit ? <Button variant="primary" size="sm" onClick={() => openTask("new")}><Add20Regular className="h-4 w-4" /> Add task</Button> : undefined} />
        ) : (
          schedule.map((day) => (
            <section key={day.iso} aria-label={format(parseISO(day.iso), "EEEE d MMMM")}>
              <h2 className={cn("sticky top-0 z-10 flex h-9 items-center gap-2 border-b border-border bg-subtle px-4 type-body-1-strong", day.iso === today && "text-brand")}>
                {format(parseISO(day.iso), "EEEE d MMMM")}
                {day.iso === today || day.iso === addDays(today, 1) ? <span className="type-caption-1 font-normal text-fg-tertiary">{formatDue(day.iso, today)}</span> : null}
              </h2>
              {day.tasks.map((t) => {
                const done = t.status.category === "done";
                return (
                  <div key={t.id} role="listitem" className={cn("flex h-9 items-center gap-3 border-b border-border bg-surface px-4 hover:bg-hover", (selectedIds.includes(t.id) || openTaskId === t.id) && "bg-selected")}>
                    <span className="w-12 shrink-0 type-caption-1 text-fg-tertiary">{t.dueTime ? t.dueTime.slice(0, 5) : "All day"}</span>
                    <span data-color={t.projectColor} className="h-2.5 w-2.5 shrink-0 rounded-full bg-item" aria-hidden />
                    {t.isMilestone ? <Diamond16Regular className="shrink-0 text-brand" aria-label="Milestone" /> : null}
                    <button type="button" className={cn("min-w-0 flex-1 truncate text-left type-body-1 hover:underline", done && "text-fg-secondary line-through")} onClick={(e) => (e.ctrlKey || e.metaKey ? toggle(t.id) : openTask(t.id))}>
                      {t.title}
                    </button>
                    <span className="shrink-0 font-mono type-caption-1 text-fg-tertiary">{t.key}</span>
                    <Badge color={t.status.color} dot className="hidden md:inline-flex">{t.status.name}</Badge>
                    {t.assignee ? <Avatar name={t.assignee.displayName} src={t.assignee.avatarUrl} size="xs" /> : <span className="w-5" />}
                  </div>
                );
              })}
            </section>
          ))
        )}
        <BulkActionBar project={project} />
      </div>
    );
  }

  if (mode === "week" || mode === "day") {
    return (
      <div ref={chartRef} className="relative h-full">
        {engineRows.length === 0 ? (
          <EmptyState title={mode === "week" ? "Nothing is scheduled this week" : "Nothing is scheduled on this day"} description="Use the arrows to move to another period, or add a task." action={canEdit ? <Button variant="primary" size="sm" onClick={() => setComposerIso(anchor)}><Add20Regular className="h-4 w-4" /> Add task</Button> : undefined} />
        ) : (
          <TimelineEngine
            ref={engineRef}
            rows={engineRows}
            range={engineRange}
            zoom="day"
            pxPerDay={pxPerDay}
            today={today}
            weekStartsOn={workspace.weekStartsOn}
            rowHeight={36}
            barHeight={24}
            dependencies={dependencies}
            showDependencies={false}
            canEdit={canEdit}
            leftPane={{
              width: LEFT,
              header: <div className="flex h-full items-end px-3 pb-1 type-caption-1-strong text-fg-secondary">Task</div>,
              renderRow: (row) =>
                row.kind === "group" ? (
                  <div className="flex h-full items-center gap-2 px-3"><span className="truncate type-body-1-strong">{row.label}</span><span className="type-caption-1 text-fg-tertiary">{row.count}</span></div>
                ) : (
                  <div className={cn("flex h-full items-center gap-2 px-3", (selectedIds.includes(row.task.id) || openTaskId === row.task.id) && "bg-selected")}>
                    <span data-color={row.task.projectColor} className="h-2.5 w-2.5 shrink-0 rounded-full bg-item" aria-hidden />
                    <button type="button" className={cn("min-w-0 flex-1 truncate text-left type-body-1 hover:underline", row.task.status.category === "done" && "text-fg-secondary line-through")} onClick={() => openTask(row.task.id)}>
                      {row.task.title}
                    </button>
                    {row.task.dueTime ? <span className="inline-flex shrink-0 items-center gap-0.5 type-caption-1 text-fg-tertiary"><Clock16Regular className="h-3 w-3" />{row.task.dueTime.slice(0, 5)}</span> : null}
                  </div>
                ),
            }}
            barLabels="always"
            selectedTaskIds={selectedIds}
            openTaskId={openTaskId}
            selectedDependencyId={null}
            onMoveTask={applyDates}
            onResizeTask={applyDates}
            onLink={() => undefined}
            onSelectDependency={() => undefined}
            onDeleteDependency={() => undefined}
            onOpenTask={(id) => openTask(id)}
            onSelectTask={(id, additive) => (additive ? toggle(id) : select([id], id))}
            onToggleGroup={() => undefined}
            onZoomChange={() => undefined}
            onCreateAt={canEdit ? (_row, iso) => setComposerIso(iso) : undefined}
          />
        )}
        {composerIso ? (
          <div className="absolute top-14 left-1/2 z-20 w-80 -translate-x-1/2 rounded-md border border-border bg-surface-raised p-2 shadow-menu">
            <p className="px-1 pb-1 type-caption-1 text-fg-secondary">New task due {formatDateShort(composerIso)}</p>
            <QuickAddRow autoFocus onSubmit={(title) => quickAdd(composerIso, title)} onCancel={() => setComposerIso(null)} />
          </div>
        ) : null}
        <BulkActionBar project={project} />
      </div>
    );
  }

  // Month.
  return (
    <DndContext id="calendar-dnd" sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => { setDragging(null); setDropIso(null); }}>
      <div className="flex h-full min-h-0 flex-col" role="grid" aria-label={`${project.name} calendar`}>
        <div className="grid shrink-0 border-b border-border bg-surface" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }} role="row">
          {dayNames.map((name, i) => (
            <div key={name} role="columnheader" className={cn("flex h-8 items-center px-2 type-caption-1-strong text-fg-secondary", (columns[i] === 0 || columns[i] === 6) && "text-fg-tertiary")}>
              {name}
            </div>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {weeks.map((week) => {
            const expanded = expandedWeeks.has(week.key);
            const shownLanes = expanded ? week.lanes : Math.min(week.lanes, MAX_LANES);
            const hiddenPerCol = week.days.map((_, col) => (expanded ? 0 : week.items.filter((i) => i.lane >= MAX_LANES && col >= i.col && col < i.col + i.cols).length));
            const hasOverflow = hiddenPerCol.some((n) => n > 0);
            const composerHere = composerIso && week.days.some((d) => d.iso === composerIso);
            const height = DAY_HEADER + shownLanes * LANE_HEIGHT + (hasOverflow || expanded ? 22 : 0) + (composerHere ? 36 : 0) + 8;
            return (
              <div key={week.key} role="row" className="relative grid border-b border-border" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`, minHeight: Math.max(96, height) }}>
                {week.days.map((day, col) => (
                  <DayCell
                    key={day.iso}
                    day={day}
                    isDropTarget={dropIso === day.iso}
                    hidden={hiddenPerCol[col]}
                    composer={composerIso === day.iso}
                    canEdit={canEdit}
                    onExpand={() => setExpandedWeeks((s) => { const n = new Set(s); if (n.has(week.key)) n.delete(week.key); else n.add(week.key); return n; })}
                    expanded={expanded}
                    onAdd={() => setComposerIso(day.iso)}
                    onQuickAdd={(title) => quickAdd(day.iso, title)}
                    onCancelAdd={() => setComposerIso(null)}
                    onSelectDay={() => setAnchor(day.iso)}
                    lanesHeight={shownLanes * LANE_HEIGHT + (hasOverflow || expanded ? 22 : 0)}
                  />
                ))}
                <div className="pointer-events-none absolute inset-x-0" style={{ top: DAY_HEADER }} aria-hidden={false}>
                  {week.items
                    .filter((item) => expanded || item.lane < MAX_LANES)
                    .map((item) => (
                      <Chip
                        key={item.task.id}
                        item={item}
                        weekKey={week.key}
                        weekDays={week.days}
                        columns={columns.length}
                        canEdit={canEdit}
                        today={today}
                        me={user.id}
                        selected={selectedIds.includes(item.task.id) || openTaskId === item.task.id}
                        ghost={dragging?.task.id === item.task.id}
                        onOpen={(e) => (e.ctrlKey || e.metaKey ? toggle(item.task.id) : openTask(item.task.id))}
                        onKeyDown={(e) => onChipKeyDown(e, item.task)}
                        onResizeStart={(e, edge) => startResize(e, item.task, edge)}
                      />
                    ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <DragOverlay dropAnimation={null}>
        {dragging ? (
          <div className="flex h-6 w-48 items-center gap-1.5 rounded-sm border border-border bg-surface-raised px-1.5 opacity-95 shadow-menu type-caption-1">
            <span data-color={dragging.task.projectColor} className="h-2 w-2 shrink-0 rounded-full bg-item" />
            <span className="truncate">{dragging.task.title}</span>
          </div>
        ) : null}
      </DragOverlay>
      <BulkActionBar project={project} />
    </DndContext>
  );
}

function DayCell({ day, isDropTarget, hidden, composer, canEdit, onExpand, expanded, onAdd, onQuickAdd, onCancelAdd, onSelectDay, lanesHeight }: { day: { iso: string; inMonth: boolean; weekend: boolean; today: boolean; label: string }; isDropTarget: boolean; hidden: number; composer: boolean; canEdit: boolean; onExpand: () => void; expanded: boolean; onAdd: () => void; onQuickAdd: (title: string) => void; onCancelAdd: () => void; onSelectDay: () => void; lanesHeight: number }) {
  const { setNodeRef } = useDroppable({ id: `day:${day.iso}` });
  return (
    <div
      ref={setNodeRef}
      role="gridcell"
      data-day={day.iso}
      aria-label={format(parseISO(day.iso), "EEEE d MMMM")}
      className={cn("group/day relative flex min-w-0 flex-col border-r border-border last:border-r-0", day.weekend ? "bg-subtle" : "bg-surface", !day.inMonth && "bg-canvas", isDropTarget && "bg-selected")}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button,input")) return;
        if (canEdit) onAdd();
        else onSelectDay();
      }}
    >
      <div className="flex h-7 items-center justify-between px-1.5">
        <span className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 type-caption-1", day.today ? "bg-brand font-semibold text-fg-on-brand" : day.inMonth ? "text-fg-secondary" : "text-fg-tertiary")}>{day.label}</span>
        {canEdit ? (
          <button type="button" onClick={(e) => { e.stopPropagation(); onAdd(); }} className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-fg-tertiary opacity-0 hover:bg-hover hover:text-fg group-hover/day:opacity-100 focus-visible:opacity-100" aria-label={`Add task due ${format(parseISO(day.iso), "d MMMM")}`}>
            <Add20Regular className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <div style={{ height: lanesHeight }} className="relative">
        {hidden > 0 || expanded ? (
          <button type="button" onClick={(e) => { e.stopPropagation(); onExpand(); }} className="absolute bottom-0 left-1 h-5 rounded-xs px-1 type-caption-1 text-fg-secondary hover:bg-hover hover:text-fg" style={{ pointerEvents: "auto" }}>
            {expanded ? "Show less" : `+${hidden} more`}
          </button>
        ) : null}
      </div>
      {composer ? (
        <div className="px-1 pb-1" onClick={(e) => e.stopPropagation()}>
          <QuickAddRow autoFocus onSubmit={onQuickAdd} onCancel={onCancelAdd} />
        </div>
      ) : null}
    </div>
  );
}

function Chip({ item, weekKey, weekDays: days, columns, canEdit, today, selected, ghost, onOpen, onKeyDown, onResizeStart }: { item: CalendarItem; weekKey: string; weekDays: Array<{ iso: string }>; columns: number; canEdit: boolean; today: string; me: string; selected: boolean; ghost: boolean; onOpen: (e: React.MouseEvent) => void; onKeyDown: (e: React.KeyboardEvent) => void; onResizeStart: (e: React.PointerEvent, edge: "start" | "end") => void }) {
  const t = item.task;
  const done = t.status.category === "done";
  const overdue = !done && item.span.end < today;
  const grabbedFor = (clientX: number, rect: DOMRect) => {
    const idx = Math.max(0, Math.min(item.cols - 1, Math.floor(((clientX - rect.left) / rect.width) * item.cols)));
    return days[item.col + idx]?.iso ?? item.span.start;
  };
  const [grabbedIso, setGrabbedIso] = React.useState(item.span.start);
  const { attributes, listeners, setNodeRef } = useDraggable({ id: chipId(t.id, weekKey), data: { taskId: t.id, grabbedIso } satisfies DragData, disabled: !canEdit });
  const { role: _r, ...dragAttributes } = attributes;
  void _r;
  const left = `${(item.col / columns) * 100}%`;
  const width = `calc(${(item.cols / columns) * 100}% - 8px)`;
  return (
    <div
      ref={setNodeRef}
      {...dragAttributes}
      {...listeners}
      onPointerDown={(e) => {
        setGrabbedIso(grabbedFor(e.clientX, (e.currentTarget as HTMLElement).getBoundingClientRect()));
        listeners?.onPointerDown?.(e);
      }}
      role="button"
      tabIndex={0}
      data-task-id={t.id}
      aria-label={`${t.title}, ${item.span.start === item.span.end ? formatDateShort(item.span.end) : `${formatDateShort(item.span.start)} to ${formatDateShort(item.span.end)}`}, ${t.status.name}`}
      className={cn(
        "group/chip absolute flex h-5 items-center gap-1 rounded-sm border border-border bg-surface-raised px-1.5 type-caption-1 outline-none select-none hover:border-border-strong focus-visible:outline-2 focus-visible:outline-brand",
        selected && "border-brand bg-selected",
        ghost && "opacity-40",
        item.continuesLeft && "rounded-l-none border-l-0",
        item.continuesRight && "rounded-r-none border-r-0",
        overdue && "border-l-2 border-l-danger",
        canEdit ? "cursor-grab" : "cursor-pointer",
      )}
      style={{ left: `calc(${left} + 4px)`, width, top: item.lane * LANE_HEIGHT + 2, pointerEvents: "auto" }}
      onClick={onOpen}
      onKeyDown={onKeyDown}
    >
      {item.kind === "milestone" ? <Diamond16Regular className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden /> : <span data-color={t.projectColor} className="h-2 w-2 shrink-0 rounded-full bg-item" aria-hidden />}
      {t.dueTime && item.cols === 1 ? <span className="shrink-0 text-fg-tertiary">{t.dueTime.slice(0, 5)}</span> : null}
      <span className={cn("min-w-0 flex-1 truncate", done && "text-fg-secondary line-through")}>{t.title}</span>
      {t.assignee ? <Avatar name={t.assignee.displayName} src={t.assignee.avatarUrl} size="xs" className="-mr-1 scale-75" /> : null}
      {canEdit && item.kind === "task" && !item.continuesLeft ? <span role="presentation" aria-hidden onPointerDown={(e) => onResizeStart(e, "start")} className="absolute inset-y-0 -left-1 w-2 cursor-ew-resize opacity-0 group-hover/chip:opacity-100" /> : null}
      {canEdit && item.kind === "task" && !item.continuesRight ? <span role="presentation" aria-hidden onPointerDown={(e) => onResizeStart(e, "end")} className="absolute inset-y-0 -right-1 w-2 cursor-ew-resize opacity-0 group-hover/chip:opacity-100" /> : null}
    </div>
  );
}
