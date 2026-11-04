"use client";

import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Diamond16Regular, ChevronRight16Regular } from "@fluentui/react-icons";
import type { TaskRow, DependencyRow } from "@/lib/query-engine/types";
import { createScale, dateToX, xToDate, pxToDays, taskSpan, spanRect, headerTicks, nonWorkingRanges, shiftSpan, resizeSpan, connectorPath, stepZoom, snapDaysByZoom, daysBetween, type Scale, type DateRange, type BarBox } from "@/lib/client/timeline/scale";
import { formatDateShort } from "@/lib/client/dates";
import { cn } from "@/lib/utils";
import type { EngineProps, EngineRow, EngineHandle } from "./types";

export const HEADER_ROW = 24;
const HEADER_HEIGHT = HEADER_ROW * 2;
const OVERSCAN_PX = 400;
const LABEL_CHAR_PX = 7;

type Drag = { kind: "move" | "resize-start" | "resize-end"; task: TaskRow; span: DateRange; startX: number; days: number; snap: boolean } | { kind: "link"; task: TaskRow; fromX: number; fromY: number; x: number; y: number; targetId: string | null; edge: "start" | "end" } | null;

type Geometry = { row: EngineRow; task: TaskRow; index: number; span: DateRange; kind: "task" | "milestone"; box: BarBox };

/**
 * The shared timeline engine (docs/05 decision 7): a date scale with four zoom levels, virtualized rows and header
 * columns, bars and dependency connectors in one SVG per viewport, drag to move and resize, drag to link, keyboard
 * operation, a today line, and non working day shading. Gantt, Timeline, and Calendar week build on it.
 */
export const TimelineEngine = React.forwardRef<EngineHandle, EngineProps>(function TimelineEngine(props, ref) {
  const { rows, range, zoom, today, weekStartsOn, rowHeight, barHeight, dependencies, showDependencies, canEdit, leftPane, criticalIds, baseline, barLabels, selectedTaskIds, openTaskId, selectedDependencyId, onMoveTask, onResizeTask, onLink, onSelectDependency, onDeleteDependency, onOpenTask, onSelectTask, onToggleGroup, onZoomChange, onCreateAt, onDropExternal, className } = props;
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = React.useState({ left: 0, width: 1200 });
  const [drag, setDrag] = React.useState<Drag>(null);
  const dragRef = React.useRef<Drag>(null);
  const [hoverTask, setHoverTask] = React.useState<string | null>(null);
  const [focusTask, setFocusTask] = React.useState<string | null>(null);
  const [linkMode, setLinkMode] = React.useState<{ sourceId: string; targetId: string | null } | null>(null);
  const leftWidth = leftPane?.width ?? 0;

  const scale = React.useMemo<Scale>(() => createScale(range.start, range.end, zoom), [range.start, range.end, zoom]);
  const ticks = React.useMemo(() => headerTicks(scale, today, weekStartsOn), [scale, today, weekStartsOn]);
  const shading = React.useMemo(() => nonWorkingRanges(scale), [scale]);
  const virtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: () => rowHeight, overscan: 8, getItemKey: (i) => rows[i].key });
  const virtualItems = virtualizer.getVirtualItems();
  const totalHeight = virtualizer.getTotalSize();

  // Track the horizontal viewport so columns, bars, and connectors are only rendered where visible.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      setViewport((v) => (v.left === el.scrollLeft && v.width === el.clientWidth ? v : { left: el.scrollLeft, width: el.clientWidth }));
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  // Ctrl or Cmd with the wheel zooms. A native listener is needed to call preventDefault.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      onZoomChange(stepZoom(zoom, e.deltaY < 0 ? 1 : -1));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoom, onZoomChange]);

  const scrollToX = React.useCallback(
    (x: number, align: "start" | "center" = "center") => {
      const el = scrollRef.current;
      if (!el) return;
      const target = align === "center" ? x - (el.clientWidth - leftWidth) / 2 : x - 24;
      el.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
    },
    [leftWidth],
  );
  React.useImperativeHandle(
    ref,
    () => ({
      scrollToDate: (iso, align) => scrollToX(dateToX(scale, iso), align),
      scrollToToday: () => scrollToX(dateToX(scale, today)),
      scrollToTask: (taskId) => {
        const idx = rows.findIndex((r) => r.kind === "task" && r.task.id === taskId);
        if (idx < 0) return;
        virtualizer.scrollToIndex(idx, { align: "center" });
        const row = rows[idx];
        const span = row.kind === "task" ? taskSpan(row.task) : null;
        if (span) scrollToX(dateToX(scale, span.start));
      },
      element: () => scrollRef.current,
    }),
    [scale, today, rows, virtualizer, scrollToX],
  );

  // Geometry for every scheduled task row (cheap: one object per row) and for visible rows only when drawing.
  const geometry = React.useMemo(() => {
    const map = new Map<string, Geometry>();
    rows.forEach((row, index) => {
      if (row.kind !== "task") return;
      const span = taskSpan(row.task);
      if (!span) return;
      const rect = spanRect(scale, span);
      const h = span.kind === "milestone" ? barHeight : barHeight;
      map.set(row.task.id, { row, task: row.task, index, span, kind: span.kind, box: { x: rect.x, width: span.kind === "milestone" ? barHeight : rect.width, y: index * rowHeight + (rowHeight - h) / 2, height: h } });
    });
    return map;
  }, [rows, scale, rowHeight, barHeight]);

  const previewSpan = (g: Geometry): DateRange => {
    const d = drag;
    if (!d || d.kind === "link" || d.task.id !== g.task.id) return g.span;
    if (d.kind === "move") return shiftSpan(d.span, d.days);
    return resizeSpan(d.span, d.kind === "resize-start" ? "start" : "end", d.days);
  };

  const minX = viewport.left - leftWidth - OVERSCAN_PX;
  const maxX = viewport.left - leftWidth + viewport.width + OVERSCAN_PX;
  const visibleRange = virtualItems.length ? { from: virtualItems[0].index, to: virtualItems[virtualItems.length - 1].index } : { from: 0, to: -1 };
  const visibleTicksTop = ticks.top.filter((t) => t.x + t.width >= minX && t.x <= maxX);
  const visibleTicksBottom = ticks.bottom.filter((t) => t.x + t.width >= minX && t.x <= maxX);
  const visibleShading = shading.filter((s) => s.x + s.width >= minX && s.x <= maxX);

  // Pointer interactions on bars.
  const beginDrag = (e: React.PointerEvent, g: Geometry, kind: "move" | "resize-start" | "resize-end") => {
    if (!canEdit || e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const next: Drag = { kind, task: g.task, span: g.span, startX: e.clientX, days: 0, snap: !e.shiftKey };
    dragRef.current = next;
    setDrag(next);
  };
  const beginLink = (e: React.PointerEvent, g: Geometry, edge: "start" | "end") => {
    if (!canEdit || e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const fromX = edge === "end" ? g.box.x + g.box.width : g.box.x;
    const fromY = g.box.y + g.box.height / 2;
    const next: Drag = { kind: "link", task: g.task, fromX, fromY, x: fromX, y: fromY, targetId: null, edge };
    dragRef.current = next;
    setDrag(next);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    if (d.kind === "link") {
      const svg = (e.currentTarget as Element).closest("svg");
      const rect = svg?.getBoundingClientRect();
      const x = rect ? e.clientX - rect.left : d.x;
      const y = rect ? e.clientY - rect.top : d.y;
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-bar-task]");
      const targetId = el?.dataset.barTask && el.dataset.barTask !== d.task.id ? el.dataset.barTask : null;
      const next = { ...d, x, y, targetId };
      dragRef.current = next;
      setDrag(next);
      return;
    }
    const snap = d.snap && !e.shiftKey ? snapDaysByZoom[zoom] : 1;
    const days = pxToDays(scale, e.clientX - d.startX, snap);
    if (days !== d.days) {
      const next = { ...d, days };
      dragRef.current = next;
      setDrag(next);
    }
  };
  const endDrag = (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!d) return;
    if (d.kind === "link") {
      if (d.targetId) {
        const target = geometry.get(d.targetId);
        const dropOnStart = target ? e.clientX < (scrollRef.current?.getBoundingClientRect().left ?? 0) - scrollRef.current!.scrollLeft + leftWidth + target.box.x + target.box.width / 2 : true;
        const type = d.edge === "end" ? (dropOnStart ? "fs" : "ff") : dropOnStart ? "ss" : "sf";
        onLink({ predecessorId: d.task.id, successorId: d.targetId, type });
      }
      return;
    }
    if (d.days === 0) return;
    const next = d.kind === "move" ? shiftSpan(d.span, d.days) : resizeSpan(d.span, d.kind === "resize-start" ? "start" : "end", d.days);
    if (d.kind === "move") onMoveTask(d.task, next);
    else onResizeTask(d.task, next);
  };

  // Keyboard on a focused bar: arrows move by a unit, Shift with arrows resizes the end, Enter opens, L links, + and - zoom.
  const onBarKeyDown = (e: React.KeyboardEvent, g: Geometry) => {
    const unit = snapDaysByZoom[zoom];
    if (linkMode && linkMode.sourceId === g.task.id) {
      const targets = [...geometry.values()].filter((x) => x.task.id !== g.task.id).sort((a, b) => a.index - b.index);
      const idx = targets.findIndex((t) => t.task.id === linkMode.targetId);
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        setLinkMode({ ...linkMode, targetId: targets[Math.min(targets.length - 1, idx + 1)]?.task.id ?? null });
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        setLinkMode({ ...linkMode, targetId: targets[Math.max(0, idx - 1)]?.task.id ?? targets[0]?.task.id ?? null });
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (linkMode.targetId) onLink({ predecessorId: g.task.id, successorId: linkMode.targetId, type: "fs" });
        setLinkMode(null);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setLinkMode(null);
      }
      return;
    }
    switch (e.key) {
      case "ArrowLeft":
      case "ArrowRight": {
        if (!canEdit) return;
        e.preventDefault();
        const delta = (e.key === "ArrowRight" ? 1 : -1) * unit;
        if (e.shiftKey) onResizeTask(g.task, resizeSpan(g.span, "end", delta));
        else onMoveTask(g.task, shiftSpan(g.span, delta));
        return;
      }
      case "Enter":
        e.preventDefault();
        onOpenTask(g.task.id);
        return;
      case " ":
        e.preventDefault();
        onSelectTask(g.task.id, true);
        return;
      case "l":
      case "L":
        if (!canEdit) return;
        e.preventDefault();
        setLinkMode({ sourceId: g.task.id, targetId: null });
        return;
      case "+":
      case "=":
        e.preventDefault();
        onZoomChange(stepZoom(zoom, 1));
        return;
      case "-":
        e.preventDefault();
        onZoomChange(stepZoom(zoom, -1));
        return;
      default:
        return;
    }
  };

  const highlightedDeps = React.useMemo(() => {
    const id = hoverTask ?? focusTask;
    if (!id) return new Set<string>();
    return new Set(dependencies.filter((d) => d.predecessorId === id || d.successorId === id).map((d) => d.id));
  }, [dependencies, hoverTask, focusTask]);

  const todayX = dateToX(scale, today);
  const todayVisible = today >= scale.start && today <= scale.end;

  const chartPointToDate = (clientX: number) => {
    const el = scrollRef.current;
    if (!el) return today;
    const x = clientX - el.getBoundingClientRect().left + el.scrollLeft - leftWidth;
    return xToDate(scale, Math.max(0, Math.min(scale.width - 1, x)));
  };

  const rowAt = (clientY: number): EngineRow | null => {
    const el = scrollRef.current;
    if (!el) return null;
    const y = clientY - el.getBoundingClientRect().top + el.scrollTop - HEADER_HEIGHT;
    const idx = Math.floor(y / rowHeight);
    return rows[idx] ?? null;
  };

  return (
    <div
      ref={scrollRef}
      className={cn("relative h-full overflow-auto bg-surface outline-none", className)}
      role="application"
      aria-label="Timeline"
      onDragOver={onDropExternal ? (e) => { if (e.dataTransfer.types.includes("application/x-taskparty-task")) e.preventDefault(); } : undefined}
      onDrop={onDropExternal ? (e) => { const id = e.dataTransfer.getData("application/x-taskparty-task"); if (!id) return; e.preventDefault(); onDropExternal(id, rowAt(e.clientY), chartPointToDate(e.clientX)); } : undefined}
    >
      <div style={{ width: leftWidth + scale.width, height: HEADER_HEIGHT + totalHeight, position: "relative" }}>
        {/* Header: two rows of ticks, with the left pane header frozen. */}
        <div className="sticky top-0 z-20 flex border-b border-border bg-surface" style={{ height: HEADER_HEIGHT, width: leftWidth + scale.width }}>
          {leftPane ? (
            <div className="sticky left-0 z-30 shrink-0 border-r border-border bg-surface" style={{ width: leftWidth, height: HEADER_HEIGHT }}>
              {leftPane.header}
            </div>
          ) : null}
          <div className="relative shrink-0" style={{ width: scale.width, height: HEADER_HEIGHT }}>
            {visibleTicksTop.map((t) => (
              <div key={t.key} className="absolute top-0 flex items-center overflow-hidden border-r border-border px-2 type-caption-1-strong text-fg-secondary" style={{ left: t.x, width: t.width, height: HEADER_ROW }}>
                <span className="truncate">{t.label}</span>
              </div>
            ))}
            {visibleTicksBottom.map((t) => (
              <div key={t.key} className={cn("absolute flex items-center justify-center gap-1 overflow-hidden border-r border-border type-caption-1 text-fg-tertiary", t.weekend && "bg-subtle", t.today && "font-semibold text-brand")} style={{ left: t.x, width: t.width, top: HEADER_ROW, height: HEADER_ROW }}>
                {t.sub && scale.zoom === "day" ? <span className="type-caption-2">{t.sub}</span> : null}
                <span className="truncate">{t.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Rows */}
        <div className="relative" style={{ height: totalHeight, width: leftWidth + scale.width }}>
          {virtualItems.map((v) => {
            const row = rows[v.index];
            const isTask = row.kind === "task";
            const highlighted = isTask && (selectedTaskIds.includes(row.task.id) || openTaskId === row.task.id);
            return (
              <div
                key={row.key}
                data-index={v.index}
                className={cn("absolute left-0 flex border-b border-border", row.kind === "group" ? "bg-subtle" : highlighted ? "bg-selected" : "bg-surface hover:bg-hover/60")}
                style={{ top: v.start, height: v.size, width: leftWidth + scale.width }}
                onDoubleClick={isTask && onCreateAt ? undefined : undefined}
              >
                {leftPane ? (
                  <div className={cn("sticky left-0 z-10 shrink-0 overflow-hidden border-r border-border", row.kind === "group" ? "bg-subtle" : highlighted ? "bg-selected" : "bg-surface")} style={{ width: leftWidth }}>
                    {leftPane.renderRow(row, v.index)}
                  </div>
                ) : null}
                <div
                  className="relative shrink-0"
                  style={{ width: scale.width }}
                  onDoubleClick={onCreateAt && canEdit ? (e) => onCreateAt(row, chartPointToDate(e.clientX)) : undefined}
                >
                  {!leftPane && row.kind === "group" ? (
                    <button type="button" onClick={() => onToggleGroup(row.key)} className="sticky left-0 z-10 flex h-full items-center gap-2 bg-subtle pr-4 pl-3 text-left" aria-expanded={!row.collapsed} aria-label={row.collapsed ? `Expand ${row.label}` : `Collapse ${row.label}`} style={{ width: "max-content" }}>
                      <ChevronRight16Regular className={cn("text-fg-secondary transition-transform", !row.collapsed && "rotate-90")} />
                      {row.color ? <span data-color={row.color} className="h-2.5 w-2.5 rounded-full bg-item" aria-hidden /> : null}
                      <span className="type-body-1-strong">{row.label}</span>
                      <span className="type-caption-1 text-fg-tertiary">{row.count}</span>
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}

          {/* Background layers: non working days and the today line, spanning every row. */}
          <div className="pointer-events-none absolute top-0" style={{ left: leftWidth, width: scale.width, height: totalHeight }} aria-hidden>
            {visibleShading.map((s) => (
              <div key={s.key} className="absolute top-0 h-full bg-subtle/80" style={{ left: s.x, width: s.width }} />
            ))}
            {todayVisible ? <div className="absolute top-0 h-full w-0.5 bg-brand" style={{ left: todayX + scale.pxPerDay / 2 - 1 }} /> : null}
          </div>

          {/* Bars and connectors in one SVG for the viewport. */}
          <svg className="absolute top-0 overflow-visible" style={{ left: leftWidth, width: scale.width, height: totalHeight, pointerEvents: "none" }} width={scale.width} height={totalHeight} aria-hidden={false} role="group" aria-label="Task bars">
            <defs>
              <marker id="tp-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--color-fg-tertiary)" />
              </marker>
              <marker id="tp-arrow-active" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--color-brand)" />
              </marker>
            </defs>
            {/* Summary bars for groups */}
            {virtualItems.map((v) => {
              const row = rows[v.index];
              if (row.kind !== "group" || !row.summary) return null;
              const rect = spanRect(scale, row.summary);
              if (rect.x + rect.width < minX || rect.x > maxX) return null;
              const y = v.start + Math.round(rowHeight / 2) - 3;
              return (
                <g key={`sum-${row.key}`} aria-label={`${row.label}, ${formatDateShort(row.summary.start)} to ${formatDateShort(row.summary.end)}`}>
                  <rect x={rect.x} y={y} width={rect.width} height={6} fill="var(--color-fg-secondary)" rx={1} />
                  <path d={`M ${rect.x} ${y} v 12 l 6 -6 z`} fill="var(--color-fg-secondary)" />
                  <path d={`M ${rect.x + rect.width} ${y} v 12 l -6 -6 z`} fill="var(--color-fg-secondary)" />
                </g>
              );
            })}
            {/* Dependency connectors */}
            {showDependencies
              ? dependencies.map((d) => {
                  const from = geometry.get(d.predecessorId);
                  const to = geometry.get(d.successorId);
                  if (!from || !to) return null;
                  if (Math.max(from.index, to.index) < visibleRange.from - 20 || Math.min(from.index, to.index) > visibleRange.to + 20) return null;
                  const fromSpan = previewSpan(from);
                  const toSpan = previewSpan(to);
                  const fromRect = spanRect(scale, fromSpan);
                  const toRect = spanRect(scale, toSpan);
                  const fromBox = { ...from.box, x: fromRect.x, width: from.kind === "milestone" ? from.box.width : fromRect.width };
                  const toBox = { ...to.box, x: toRect.x, width: to.kind === "milestone" ? to.box.width : toRect.width };
                  const active = selectedDependencyId === d.id || highlightedDeps.has(d.id);
                  const dimmed = criticalIds && !(criticalIds.has(d.predecessorId) && criticalIds.has(d.successorId));
                  return (
                    <g key={d.id} style={{ pointerEvents: "auto" }} className="cursor-pointer" onClick={(e) => { e.stopPropagation(); onSelectDependency(selectedDependencyId === d.id ? null : d.id); }} tabIndex={0} role="button" aria-label={`Dependency ${d.type.toUpperCase()} from ${from.task.key} to ${to.task.key}`} onKeyDown={(e) => { if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); onDeleteDependency(d.id); } if (e.key === "Enter") onSelectDependency(d.id); }}>
                      <path d={connectorPath(fromBox, toBox, d.type)} fill="none" stroke="transparent" strokeWidth={10} />
                      <path d={connectorPath(fromBox, toBox, d.type)} fill="none" stroke={active ? "var(--color-brand)" : "var(--color-fg-tertiary)"} strokeWidth={active ? 2 : 1.25} opacity={dimmed && !active ? 0.35 : 1} markerEnd={active ? "url(#tp-arrow-active)" : "url(#tp-arrow)"} />
                    </g>
                  );
                })
              : null}
            {/* Task bars */}
            {virtualItems.map((v) => {
              const row = rows[v.index];
              if (row.kind !== "task") return null;
              const g = geometry.get(row.task.id);
              if (!g) return null;
              const span = previewSpan(g);
              const rect = spanRect(scale, span);
              if (rect.x + rect.width < minX || rect.x > maxX) return null;
              return (
                <Bar
                  key={row.task.id}
                  g={g}
                  span={span}
                  rect={rect}
                  y={v.start + (rowHeight - barHeight) / 2}
                  height={barHeight}
                  today={today}
                  scale={scale}
                  canEdit={canEdit}
                  selected={selectedTaskIds.includes(row.task.id) || openTaskId === row.task.id}
                  dimmed={Boolean(criticalIds && !criticalIds.has(row.task.id))}
                  critical={Boolean(criticalIds?.has(row.task.id))}
                  baseline={baseline?.get(row.task.id) ?? null}
                  labelMode={barLabels}
                  linkTarget={linkMode?.targetId === row.task.id || (drag?.kind === "link" && drag.targetId === row.task.id)}
                  linkSource={linkMode?.sourceId === row.task.id}
                  dragging={drag !== null && drag.kind !== "link" && drag.task.id === row.task.id}
                  onPointerDown={(e, kind) => beginDrag(e, g, kind)}
                  onLinkStart={(e, edge) => beginLink(e, g, edge)}
                  onPointerMove={onPointerMove}
                  onPointerUp={endDrag}
                  onClick={(e) => onSelectTask(row.task.id, e.ctrlKey || e.metaKey || e.shiftKey)}
                  onDoubleClick={() => onOpenTask(row.task.id)}
                  onKeyDown={(e) => onBarKeyDown(e, g)}
                  onFocus={() => setFocusTask(row.task.id)}
                  onBlur={() => setFocusTask((f) => (f === row.task.id ? null : f))}
                  onHover={(h) => setHoverTask(h ? row.task.id : null)}
                />
              );
            })}
            {/* Link rubber band */}
            {drag?.kind === "link" ? <path d={`M ${drag.fromX} ${drag.fromY} L ${drag.x} ${drag.y}`} stroke="var(--color-brand)" strokeWidth={1.5} strokeDasharray="4 3" fill="none" /> : null}
          </svg>
        </div>
      </div>
      <span className="sr-only" aria-live="polite">
        {drag && drag.kind !== "link" ? `${drag.task.title}: ${formatDateShort(previewSpan(geometry.get(drag.task.id)!).start)} to ${formatDateShort(previewSpan(geometry.get(drag.task.id)!).end)}` : ""}
        {linkMode ? `Link mode. ${linkMode.targetId ? `Target ${geometry.get(linkMode.targetId)?.task.title ?? ""}. ` : ""}Use the arrow keys to pick a task, Enter to link, Escape to cancel.` : ""}
      </span>
    </div>
  );
});

type BarProps = {
  g: Geometry;
  span: DateRange;
  rect: { x: number; width: number };
  y: number;
  height: number;
  today: string;
  scale: Scale;
  canEdit: boolean;
  selected: boolean;
  dimmed: boolean;
  critical: boolean;
  baseline: DateRange | null;
  labelMode: "auto" | "always";
  linkTarget: boolean;
  linkSource: boolean;
  dragging: boolean;
  onPointerDown: (e: React.PointerEvent, kind: "move" | "resize-start" | "resize-end") => void;
  onLinkStart: (e: React.PointerEvent, edge: "start" | "end") => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onFocus: () => void;
  onBlur: () => void;
  onHover: (hovering: boolean) => void;
};

const Bar = React.memo(function Bar({ g, span, rect, y, height, today, scale, canEdit, selected, dimmed, critical, baseline, labelMode, linkTarget, linkSource, dragging, onPointerDown, onLinkStart, onPointerMove, onPointerUp, onClick, onDoubleClick, onKeyDown, onFocus, onBlur, onHover }: BarProps) {
  const task = g.task;
  const done = task.status.category === "done";
  const overdue = !done && span.end < today;
  const progress = task.subtaskCount > 0 ? task.subtaskDoneCount / task.subtaskCount : done ? 1 : 0;
  const label = task.title;
  const labelWidth = label.length * LABEL_CHAR_PX + 16;
  const inside = labelMode === "auto" ? rect.width >= labelWidth : rect.width >= labelWidth;
  const name = `${task.title}, ${formatDateShort(span.start)}${span.start !== span.end ? ` to ${formatDateShort(span.end)}` : ""}, ${task.status.name}`;
  const common = {
    "data-bar-task": task.id,
    tabIndex: 0,
    role: "button" as const,
    "aria-label": name,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    onClick,
    onDoubleClick,
    onKeyDown,
    onFocus,
    onBlur,
    onMouseEnter: () => onHover(true),
    onMouseLeave: () => onHover(false),
  };
  const fillOpacity = dimmed && !critical ? 0.4 : 1;

  if (g.kind === "milestone") {
    const cx = rect.x + scale.pxPerDay / 2;
    const cy = y + height / 2;
    const r = height / 2;
    return (
      <g {...common} data-color={task.projectColor} style={{ pointerEvents: "auto", opacity: fillOpacity }} className={cn("cursor-pointer outline-none", canEdit && "cursor-grab")} onPointerDown={(e) => onPointerDown(e, "move")}>
        <path d={`M ${cx} ${cy - r} L ${cx + r} ${cy} L ${cx} ${cy + r} L ${cx - r} ${cy} Z`} fill={critical ? "var(--color-brand)" : "var(--color-brand)"} stroke={selected || linkTarget ? "var(--color-fg)" : "var(--color-surface)"} strokeWidth={selected || linkTarget ? 2 : 1} />
        <text x={cx + r + 6} y={cy + 4} className="type-caption-1" fill="var(--color-fg)" fontSize={12}>
          {label}
        </text>
        {canEdit ? <circle cx={cx + r + 2} cy={cy} r={4} fill="var(--color-surface)" stroke="var(--color-brand)" style={{ pointerEvents: "auto", cursor: "crosshair" }} onPointerDown={(e) => onLinkStart(e, "end")} aria-hidden /> : null}
      </g>
    );
  }

  const barFill = critical ? "var(--color-brand)" : "var(--item-tint)";
  const edgeFill = critical ? "var(--color-brand-pressed)" : "var(--item-color)";
  const textFill = critical ? "var(--color-fg-on-brand)" : "var(--color-fg)";
  return (
    <g {...common} data-color={task.projectColor} style={{ pointerEvents: "auto", opacity: fillOpacity }} className={cn("group outline-none", canEdit ? (dragging ? "cursor-grabbing" : "cursor-grab") : "cursor-pointer")} onPointerDown={(e) => onPointerDown(e, "move")}>
      {baseline ? (
        <BaselineBar scale={scale} baseline={baseline} span={span} y={y + height} />
      ) : null}
      <rect x={rect.x} y={y} width={rect.width} height={height} rx={3} fill={barFill} stroke={selected || linkTarget || linkSource ? "var(--color-brand)" : "var(--item-color)"} strokeWidth={selected || linkTarget || linkSource ? 2 : 1} />
      {progress > 0 ? <rect x={rect.x} y={y} width={Math.max(0, rect.width * progress)} height={height} rx={3} fill={critical ? "var(--color-brand-pressed)" : "var(--item-color)"} opacity={critical ? 0.5 : 0.25} /> : null}
      <rect x={rect.x} y={y} width={4} height={height} rx={2} fill={edgeFill} />
      {overdue ? <rect x={rect.x + rect.width - 3} y={y} width={3} height={height} rx={1} fill="var(--color-danger)" /> : null}
      {inside ? (
        <text x={rect.x + 10} y={y + height / 2 + 4} fontSize={12} fill={textFill} className={cn(done && "line-through")} style={{ pointerEvents: "none" }}>
          {label}
        </text>
      ) : (
        <text x={rect.x + rect.width + 8} y={y + height / 2 + 4} fontSize={12} fill="var(--color-fg)" className={cn(done && "line-through")} style={{ pointerEvents: "none" }}>
          {label}
        </text>
      )}
      {canEdit ? (
        <>
          <rect x={rect.x - 2} y={y} width={6} height={height} fill="transparent" style={{ cursor: "ew-resize" }} onPointerDown={(e) => onPointerDown(e, "resize-start")} aria-hidden />
          <rect x={rect.x + rect.width - 4} y={y} width={6} height={height} fill="transparent" style={{ cursor: "ew-resize" }} onPointerDown={(e) => onPointerDown(e, "resize-end")} aria-hidden />
          <circle cx={rect.x + rect.width + 3} cy={y + height / 2} r={4} fill="var(--color-surface)" stroke="var(--color-brand)" className="opacity-0 group-hover:opacity-100" style={{ pointerEvents: "auto", cursor: "crosshair", opacity: selected || linkSource ? 1 : undefined }} onPointerDown={(e) => onLinkStart(e, "end")} aria-hidden />
        </>
      ) : null}
    </g>
  );
});

function BaselineBar({ scale, baseline, span, y }: { scale: Scale; baseline: DateRange; span: DateRange; y: number }) {
  const rect = spanRect(scale, baseline);
  const delta = daysBetween(baseline.end, span.end);
  return (
    <g aria-label={`Baseline ${formatDateShort(baseline.start)} to ${formatDateShort(baseline.end)}`}>
      <rect x={rect.x} y={y + 1} width={rect.width} height={4} rx={1} fill="var(--color-fg-tertiary)" opacity={0.7} />
      {delta !== 0 ? (
        <text x={rect.x + rect.width + 6} y={y + 6} fontSize={10} fill={delta > 0 ? "var(--color-danger)" : "var(--color-success)"} style={{ pointerEvents: "none" }}>
          {delta > 0 ? `+${delta}d` : `${delta}d`}
        </text>
      ) : null}
    </g>
  );
}

export { Diamond16Regular as MilestoneIcon };
export type { DependencyRow as EngineDependency };
