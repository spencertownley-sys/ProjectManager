"use client";

import * as React from "react";
import Link from "next/link";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTable, tableFeatures, createColumnHelper, columnSizingFeature, columnResizingFeature, columnPinningFeature, columnOrderingFeature } from "@tanstack/react-table";
import { DndContext, PointerSensor, useSensor, useSensors, useDraggable, useDroppable, type DragEndEvent, type DragOverEvent } from "@dnd-kit/core";
import {
  Add20Regular,
  Add16Regular,
  ChevronRight16Regular,
  ArrowUp16Regular,
  ArrowDown16Regular,
  TextT16Regular,
  Status16Regular,
  Person16Regular,
  Calendar16Regular,
  Flag16Regular,
  NumberSymbol16Regular,
  Tag16Regular,
  CheckboxChecked16Regular,
  Folder16Regular,
  ArrowSync16Regular,
  Key16Regular,
  TextBulletListSquare16Regular,
  Clock16Regular,
  Branch16Regular,
  Diamond16Regular,
  Checkmark16Regular,
} from "@fluentui/react-icons";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { Menu, MenuContent, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuTrigger, ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from "@/components/ui/menu";
import { StatusPicker, PersonPicker, DatePicker, PriorityPicker, SimpleSelect } from "@/components/task/field-editors";
import { BulkActionBar } from "@/components/views/shared/bulk-action-bar";
import { QuickAddRow } from "@/components/views/shared/quick-add-row";
import { fieldDefs, defaultFilterFor } from "@/components/project/command-bar";
import type { ViewProps } from "@/components/views/types";
import type { TaskRow, PersonRef } from "@/lib/query-engine/types";
import type { Group, GroupingContext } from "@/lib/client/grouping";
import type { FieldRef } from "@/lib/validation/view-spec";
import { tableColumns, visibleTableColumns, cellValue, cellText, aggregate, formatAggregate, aggregateLabel, groupRollup, readAggregates, defaultAggregate, parseClipboard, coerceCellInput, fillPatch, nextVisibleFields, type TableColumn, type AggregateKind, type CoerceResult } from "@/lib/client/table";
import { useTaskMutations } from "@/lib/client/queries";
import { useViewState, useShellState } from "@/lib/client/view-state";
import { useWorkspace } from "@/lib/client/workspace-context";
import { dueState, formatDateShort } from "@/lib/client/dates";
import { cn } from "@/lib/utils";

const features = tableFeatures({ columnSizingFeature, columnResizingFeature, columnPinningFeature, columnOrderingFeature });
const helper = createColumnHelper<typeof features, TaskRow>();

const SELECT_COLUMN = "select";
const SELECT_WIDTH = 40;
const rowHeights = { compact: 28, default: 36, comfortable: 44 } as const;
const HEADER_HEIGHT = 36;

type Item = { kind: "header"; group: Group; count: number } | { kind: "row"; row: TaskRow; groupKey: string } | { kind: "add"; group: Group };
type ActiveCell = { rowId: string; colId: string };
type Editing = ActiveCell & { initial?: string };
type Fill = { colId: string; fromRowId: string; toRowId: string };
type PastePreview = { grid: string[][]; rowIndex: number; colIndex: number } | null;

const kindIcons: Record<TableColumn["kind"], React.ComponentType<{ className?: string }>> = {
  title: TextT16Regular,
  text: TextT16Regular,
  key: Key16Regular,
  status: Status16Regular,
  status_category: Status16Regular,
  person: Person16Regular,
  date: Calendar16Regular,
  datetime: Clock16Regular,
  priority: Flag16Regular,
  number: NumberSymbol16Regular,
  select: TextBulletListSquare16Regular,
  multi_select: TextBulletListSquare16Regular,
  checkbox: CheckboxChecked16Regular,
  section: Folder16Regular,
  cycle: ArrowSync16Regular,
  tags: Tag16Regular,
  parent: Branch16Regular,
};

const textKinds = new Set<TableColumn["kind"]>(["title", "text", "number"]);
const clearableKinds = new Set<TableColumn["kind"]>(["text", "number", "date", "person", "select", "section", "cycle"]);

export function TableView(props: ViewProps & { quickAddSignal?: number }) {
  const { project, groups, spec, setSpec, canEdit, rows, quickAddSignal } = props;
  const { members, user, today, workspace, slug } = useWorkspace();
  const { update, create, remove, bulk } = useTaskMutations();
  const { toast } = useToast();
  const { density } = useShellState();
  const selectedIds = useViewState((s) => s.selectedIds);
  const select = useViewState((s) => s.select);
  const toggle = useViewState((s) => s.toggle);
  const clearSelection = useViewState((s) => s.clearSelection);
  const openTask = useViewState((s) => s.openTask);
  const openTaskId = useViewState((s) => s.openTaskId);
  const rowHeight = rowHeights[density];

  const [collapsed, setCollapsed] = React.useState<Set<string>>(() => new Set());
  const [addingIn, setAddingIn] = React.useState<string | null>(null);
  const [active, setActive] = React.useState<ActiveCell | null>(null);
  const [editing, setEditing] = React.useState<Editing | null>(null);
  const [fill, setFill] = React.useState<Fill | null>(null);
  const [pastePreview, setPastePreview] = React.useState<PastePreview>(null);
  const [dragOverCol, setDragOverCol] = React.useState<string | null>(null);
  const parentRef = React.useRef<HTMLDivElement>(null);
  const fillRef = React.useRef<Fill | null>(null);

  const groupingCtx = React.useMemo<GroupingContext>(
    () => ({ sections: project.sections, statuses: project.statuses, members, fields: project.fields.map((f) => ({ id: f.id, name: f.name, type: f.type as never, config: f.config })), today }),
    [project.sections, project.statuses, project.fields, members, today],
  );
  const allColumns = React.useMemo(() => tableColumns(groupingCtx.fields, workspace.cycleLabel), [groupingCtx.fields, workspace.cycleLabel]);
  const columns = React.useMemo(() => visibleTableColumns(allColumns, spec.visibleFields), [allColumns, spec.visibleFields]);
  const columnById = React.useMemo(() => new Map(columns.map((c) => [c.id as string, c])), [columns]);
  const aggregates = React.useMemo(() => readAggregates(spec), [spec]);
  const rowsById = React.useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  // The command bar's Add task button bumps quickAddSignal.
  const [seenSignal, setSeenSignal] = React.useState(quickAddSignal);
  if (quickAddSignal !== seenSignal) {
    setSeenSignal(quickAddSignal);
    if (quickAddSignal) setAddingIn(groups[0]?.key ?? "all");
  }

  const items = React.useMemo<Item[]>(() => {
    const out: Item[] = [];
    const showHeaders = Boolean(spec.groupBy);
    for (const g of groups) {
      if (showHeaders) out.push({ kind: "header", group: g, count: g.rows.length });
      if (!collapsed.has(g.key)) for (const r of g.rows) out.push({ kind: "row", row: r, groupKey: g.key });
      if (canEdit && !collapsed.has(g.key)) out.push({ kind: "add", group: g });
    }
    return out;
  }, [groups, collapsed, canEdit, spec.groupBy]);
  const visibleRows = React.useMemo(() => items.filter((i): i is Extract<Item, { kind: "row" }> => i.kind === "row").map((i) => i.row), [items]);

  // TanStack Table owns column sizing, order, pinning, and the resize gesture; rows come from the shared grouping.
  const columnDefs = React.useMemo(
    () => [
      helper.display({ id: SELECT_COLUMN, size: SELECT_WIDTH, minSize: SELECT_WIDTH, maxSize: SELECT_WIDTH, enableResizing: false }),
      ...columns.map((c) => helper.display({ id: c.id, size: spec.columnWidths[c.id] ?? c.width, minSize: 64, maxSize: 900 })),
    ],
    [columns, spec.columnWidths],
  );
  const columnSizing = React.useMemo(() => Object.fromEntries([[SELECT_COLUMN, SELECT_WIDTH], ...columns.map((c) => [c.id, spec.columnWidths[c.id] ?? c.width])]) as Record<string, number>, [columns, spec.columnWidths]);
  const columnOrder = React.useMemo(() => [SELECT_COLUMN, ...columns.map((c) => c.id as string)], [columns]);
  const columnPinning = React.useMemo(() => ({ start: [SELECT_COLUMN, "title"], end: [] as string[] }), []);
  const tableState = React.useMemo(() => ({ columnSizing, columnOrder, columnPinning }), [columnSizing, columnOrder, columnPinning]);
  const table = useTable({
    features,
    columns: columnDefs,
    data: rows,
    getRowId: (r) => r.id,
    columnResizeMode: "onEnd",
    state: tableState,
    onColumnSizingChange: (updater) => {
      const next = typeof updater === "function" ? updater(columnSizing) : updater;
      setSpec((prev) => ({ ...prev, columnWidths: { ...prev.columnWidths, ...Object.fromEntries(Object.entries(next).filter(([k]) => k !== SELECT_COLUMN).map(([k, v]) => [k, Math.round(v)])) } }));
    },
    onColumnOrderChange: () => undefined,
    onColumnPinningChange: () => undefined,
  });
  const leafHeaders = table.getHeaderGroups()[0]?.headers ?? [];
  const totalWidth = table.getTotalSize();
  const resizing = table.state.columnResizing;

  const virtualizer = useVirtualizer({ count: items.length, getScrollElement: () => parentRef.current, estimateSize: (i) => (items[i].kind === "header" ? HEADER_HEIGHT : rowHeight), overscan: 10, getItemKey: (i) => (items[i].kind === "row" ? items[i].row.id : `${items[i].kind}-${items[i].group.key}`) });

  // Mutations shared by cells, paste, and fill.
  const applyResult = React.useCallback(
    (row: TaskRow, result: CoerceResult) => {
      if (!result.ok) {
        toast({ title: "Could not apply the value", description: result.reason, kind: "warning" });
        return false;
      }
      update.mutate({ id: row.id, ...result.patch, optimistic: result.optimistic } as never);
      return true;
    },
    [toast, update],
  );
  const onUpdate = React.useCallback((id: string, patch: Record<string, unknown>, optimistic: (r: TaskRow) => TaskRow) => update.mutate({ id, ...patch, optimistic } as never), [update]);

  // Spreadsheet navigation.
  const moveActive = React.useCallback(
    (dRow: number, dCol: number) => {
      if (!active) {
        if (visibleRows[0] && columns[0]) setActive({ rowId: visibleRows[0].id, colId: columns[0].id });
        return;
      }
      const ri = visibleRows.findIndex((r) => r.id === active.rowId);
      const ci = columns.findIndex((c) => c.id === active.colId);
      const nr = Math.max(0, Math.min(visibleRows.length - 1, ri + dRow));
      const nc = Math.max(0, Math.min(columns.length - 1, ci + dCol));
      const row = visibleRows[nr];
      const col = columns[nc];
      if (!row || !col) return;
      setActive({ rowId: row.id, colId: col.id });
      const idx = items.findIndex((i) => i.kind === "row" && i.row.id === row.id);
      if (idx >= 0) virtualizer.scrollToIndex(idx, { align: "auto" });
      window.requestAnimationFrame(() => {
        const el = parentRef.current?.querySelector<HTMLElement>(`[data-cell="${row.id}:${col.id}"]`);
        el?.focus({ preventScroll: true });
        el?.scrollIntoView({ block: "nearest", inline: "nearest" });
      });
    },
    [active, visibleRows, columns, items, virtualizer],
  );

  const openEditorInCell = (cell: ActiveCell) => {
    const el = parentRef.current?.querySelector<HTMLElement>(`[data-cell="${cell.rowId}:${cell.colId}"]`);
    const trigger = el?.querySelector<HTMLElement>("button,[role=checkbox]");
    if (!trigger) return false;
    trigger.focus();
    if (trigger.getAttribute("aria-haspopup") === "menu") trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    else trigger.click();
    return true;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Keys this view dispatches itself (to open a picker) must not be handled again.
    if (!e.nativeEvent.isTrusted) return;
    const target = e.target as HTMLElement;
    const inInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
    if (inInput && !editing) return;
    if (target.closest("[role=menu],[role=dialog],[role=listbox]")) return;
    if (editing) {
      // The editor handles its own keys; only Tab moves on.
      if (e.key === "Tab") {
        e.preventDefault();
        (target as HTMLInputElement).blur?.();
        moveActive(0, e.shiftKey ? -1 : 1);
      }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const column = active ? columnById.get(active.colId) : undefined;
    const row = active ? rowsById.get(active.rowId) : undefined;
    switch (e.key) {
      case "ArrowDown":
      case "ArrowUp":
      case "ArrowLeft":
      case "ArrowRight":
        e.preventDefault();
        moveActive(e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0, e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0);
        return;
      case "Tab":
        e.preventDefault();
        moveActive(0, e.shiftKey ? -1 : 1);
        return;
      case "Enter":
        if (!active || !row || !column) return;
        e.preventDefault();
        if (column.editable && canEdit && textKinds.has(column.kind)) setEditing({ ...active });
        else if (column.id === "title") openTask(row.id);
        else if (column.editable && canEdit) openEditorInCell(active);
        return;
      case " ":
        if (!active || !row || !column) return;
        if (column.kind === "checkbox" && column.editable && canEdit) {
          e.preventDefault();
          openEditorInCell(active);
        } else if (column.id === "title") {
          e.preventDefault();
          openTask(row.id);
        }
        return;
      case "Escape":
        setActive(null);
        clearSelection();
        parentRef.current?.focus();
        return;
      case "Delete":
      case "Backspace":
        if (!active || !row || !column || !canEdit || !column.editable || !clearableKinds.has(column.kind)) return;
        e.preventDefault();
        applyResult(row, coerceCellInput(column, "", groupingCtx));
        return;
      case "x":
        if (row) {
          e.preventDefault();
          toggle(row.id);
        }
        return;
      case "e":
        if (row && canEdit) {
          e.preventDefault();
          setEditing({ rowId: row.id, colId: "title" });
          setActive({ rowId: row.id, colId: "title" });
        }
        return;
      default:
        break;
    }
    // Type to edit text and number cells.
    if (active && row && column && canEdit && column.editable && textKinds.has(column.kind) && e.key.length === 1) {
      e.preventDefault();
      setEditing({ ...active, initial: e.key });
    }
  };

  // Paste tab separated text starting at the active cell.
  const applyGrid = React.useCallback(
    (grid: string[][], rowIndex: number, colIndex: number) => {
      let skipped = 0;
      let applied = 0;
      let created = 0;
      grid.forEach((line, i) => {
        const row = visibleRows[rowIndex + i];
        if (row) {
          line.forEach((text, j) => {
            const column = columns[colIndex + j];
            if (!column || !column.editable) return;
            const result = coerceCellInput(column, text, groupingCtx);
            if (!result.ok) {
              skipped += 1;
              return;
            }
            update.mutate({ id: row.id, ...result.patch, optimistic: result.optimistic } as never);
            applied += 1;
          });
          return;
        }
        // Past the end: create a task when the block carries a title.
        const titleIdx = columns.findIndex((c) => c.id === "title") - colIndex;
        const title = titleIdx >= 0 ? line[titleIdx]?.trim() : "";
        if (!title) {
          skipped += line.length;
          return;
        }
        const extra: Record<string, unknown> = {};
        line.forEach((text, j) => {
          const column = columns[colIndex + j];
          if (!column || column.id === "title" || !column.editable) return;
          const result = coerceCellInput(column, text, groupingCtx);
          if (result.ok) Object.assign(extra, result.patch);
          else skipped += 1;
        });
        create.mutate({ projectId: project.id, title, ...extra } as never);
        created += 1;
      });
      const parts = [applied ? `${applied} cells updated` : "", created ? `${created} tasks created` : "", skipped ? `${skipped} cells skipped` : ""].filter(Boolean);
      if (parts.length) toast({ title: "Pasted", description: parts.join(", "), kind: skipped ? "warning" : "success" });
    },
    [visibleRows, columns, groupingCtx, update, create, project.id, toast],
  );
  const onPaste = (e: React.ClipboardEvent) => {
    if (!active || !canEdit || editing) return;
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;
    e.preventDefault();
    const grid = parseClipboard(text);
    const rowIndex = visibleRows.findIndex((r) => r.id === active.rowId);
    const colIndex = columns.findIndex((c) => c.id === active.colId);
    if (rowIndex < 0 || colIndex < 0) return;
    const cellCount = grid.reduce((n, line) => n + line.length, 0);
    if (cellCount > 20) setPastePreview({ grid, rowIndex, colIndex });
    else applyGrid(grid, rowIndex, colIndex);
  };

  // Fill handle: drag the corner of the active cell down (or up) to copy its value.
  const startFill = (e: React.PointerEvent, cell: ActiveCell) => {
    e.preventDefault();
    e.stopPropagation();
    const next = { colId: cell.colId, fromRowId: cell.rowId, toRowId: cell.rowId };
    fillRef.current = next;
    setFill(next);
    const onMove = (ev: PointerEvent) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>("[data-row-id]");
      const rowId = el?.dataset.rowId;
      if (rowId && fillRef.current && rowId !== fillRef.current.toRowId) {
        fillRef.current = { ...fillRef.current, toRowId: rowId };
        setFill(fillRef.current);
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const f = fillRef.current;
      fillRef.current = null;
      setFill(null);
      if (!f) return;
      const column = columnById.get(f.colId);
      const source = rowsById.get(f.fromRowId);
      if (!column || !source) return;
      const a = visibleRows.findIndex((r) => r.id === f.fromRowId);
      const b = visibleRows.findIndex((r) => r.id === f.toRowId);
      if (a < 0 || b < 0 || a === b) return;
      const targets = visibleRows.slice(Math.min(a, b), Math.max(a, b) + 1).filter((r) => r.id !== source.id);
      const result = fillPatch(column, source, groupingCtx);
      if (!result.ok) {
        toast({ title: "Could not fill", description: result.reason, kind: "warning" });
        return;
      }
      bulk.mutate({ ids: targets.map((r) => r.id), patch: result.patch, optimistic: result.optimistic });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
  const fillRange = React.useMemo(() => {
    if (!fill) return null;
    const a = visibleRows.findIndex((r) => r.id === fill.fromRowId);
    const b = visibleRows.findIndex((r) => r.id === fill.toRowId);
    if (a < 0 || b < 0) return null;
    return { colId: fill.colId, ids: new Set(visibleRows.slice(Math.min(a, b), Math.max(a, b) + 1).map((r) => r.id)) };
  }, [fill, visibleRows]);

  // Header drag to reorder columns.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const onHeaderDragOver = (e: DragOverEvent) => setDragOverCol(e.over ? String(e.over.id).replace(/^col:/, "") : null);
  const onHeaderDragEnd = (e: DragEndEvent) => {
    setDragOverCol(null);
    if (!e.over) return;
    const activeId = String(e.active.id).replace(/^col:/, "") as FieldRef;
    const overId = String(e.over.id).replace(/^col:/, "") as FieldRef;
    if (activeId === "title" || overId === "title" || activeId === overId) return;
    setSpec((prev) => ({ ...prev, visibleFields: nextVisibleFields(prev.visibleFields.filter((f) => f !== "title"), activeId, overId) }));
  };

  const sortField = String(spec.sorts[0]?.field ?? "manual");
  const sortDir = spec.sorts[0]?.direction ?? "asc";
  const setSort = (field: FieldRef, direction: "asc" | "desc" | null) => setSpec((prev) => ({ ...prev, sorts: direction ? [{ field, direction }] : [{ field: "manual", direction: "asc" }] }));
  const cycleSort = (field: FieldRef) => {
    if (sortField !== field) setSort(field, "asc");
    else if (sortDir === "asc") setSort(field, "desc");
    else setSort(field, null);
  };
  const hideColumn = (id: FieldRef) => setSpec((prev) => ({ ...prev, visibleFields: prev.visibleFields.filter((f) => f !== id) }));
  const addColumn = (id: FieldRef, besideId: FieldRef, side: "left" | "right") =>
    setSpec((prev) => {
      const list = prev.visibleFields.filter((f) => f !== id && f !== "title");
      const idx = list.indexOf(besideId);
      const at = idx < 0 ? (side === "left" ? 0 : list.length) : side === "left" ? idx : idx + 1;
      list.splice(at, 0, id);
      return { ...prev, visibleFields: list };
    });
  const setAggregate = (id: FieldRef, kind: AggregateKind) => setSpec((prev) => ({ ...prev, options: { ...prev.options, tableAggregates: { ...((prev.options.tableAggregates as Record<string, string>) ?? {}), [id]: kind } } }));
  const defs = React.useMemo(() => fieldDefs(project, workspace.cycleLabel), [project, workspace.cycleLabel]);
  const filterBy = (id: FieldRef) => {
    const def = defs.find((d) => d.ref === id);
    if (!def) return;
    setSpec((prev) => ({ ...prev, filters: { ...prev.filters, items: [...prev.filters.items, defaultFilterFor(def)] } }));
  };
  const hiddenColumns = allColumns.filter((c) => c.id !== "title" && !spec.visibleFields.includes(c.id));

  const quickAdd = (group: Group, title: string) => {
    const extra: Record<string, unknown> = {};
    if (spec.groupBy === "section" || !spec.groupBy) extra.sectionId = (group.meta?.sectionId as string | null | undefined) ?? null;
    if (spec.groupBy === "status" && group.meta?.statusId) extra.statusId = group.meta.statusId;
    if (spec.groupBy === "assignee" && group.meta?.assigneeId) extra.assigneeId = group.meta.assigneeId;
    if (spec.groupBy === "priority") extra.priority = group.key;
    create.mutate({ projectId: project.id, title, ...extra } as never);
  };

  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every((r) => selectedIds.includes(r.id));
  const someSelected = visibleRows.some((r) => selectedIds.includes(r.id));

  if (rows.length === 0 && !addingIn) {
    return (
      <EmptyState
        title="No tasks match this view"
        description={spec.filters.items.length ? "Clear the filters to see everything, or add a task." : "Add the first task to get started."}
        action={canEdit ? <Button variant="primary" size="sm" onClick={() => setAddingIn(groups[0]?.key ?? "all")}><Add20Regular className="h-4 w-4" /> Add task</Button> : undefined}
      />
    );
  }

  const stickyStyle = (columnId: string): React.CSSProperties => {
    const column = table.getColumn(columnId);
    if (!column) return {};
    const pinned = column.getIsPinned() === "start";
    return { width: column.getSize(), position: pinned ? "sticky" : undefined, left: pinned ? column.getStart("start") : undefined, zIndex: pinned ? 2 : undefined };
  };
  const lastPinnedId = "title";

  return (
    <DndContext id="table-columns" sensors={sensors} onDragOver={onHeaderDragOver} onDragEnd={onHeaderDragEnd} onDragCancel={() => setDragOverCol(null)}>
      <div
        ref={parentRef}
        className="relative h-full overflow-auto outline-none"
        role="grid"
        aria-label={`${project.name} table`}
        aria-rowcount={rows.length}
        aria-colcount={columns.length}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
      >
        <div style={{ width: totalWidth, minWidth: "100%" }}>
          {/* Header */}
          <div role="row" className="sticky top-0 z-10 flex h-9 border-b border-border bg-surface" style={{ width: "100%", minWidth: totalWidth }}>
            {leafHeaders.map((header) => {
              const id = header.column.id;
              if (id === SELECT_COLUMN) {
                return (
                  <div key={id} role="columnheader" className="flex shrink-0 items-center justify-center border-r border-border bg-surface" style={stickyStyle(id)}>
                    <Checkbox checked={allVisibleSelected ? true : someSelected ? "indeterminate" : false} aria-label="Select all tasks" onCheckedChange={(v) => (v === true ? select(visibleRows.map((r) => r.id)) : clearSelection())} />
                  </div>
                );
              }
              const column = columnById.get(id);
              if (!column) return null;
              return (
                <HeaderCell
                  key={id}
                  column={column}
                  style={stickyStyle(id)}
                  isLastPinned={id === lastPinnedId}
                  sort={sortField === column.id ? sortDir : null}
                  onSort={() => cycleSort(column.id)}
                  onSetSort={(dir) => setSort(column.id, dir)}
                  onFilter={() => filterBy(column.id)}
                  onGroup={() => setSpec((prev) => ({ ...prev, groupBy: column.id }))}
                  onHide={column.id === "title" ? undefined : () => hideColumn(column.id)}
                  aggregate={aggregates[column.id] ?? defaultAggregate(column)}
                  onAggregate={(k) => setAggregate(column.id, k)}
                  hiddenColumns={hiddenColumns}
                  onAddColumn={(id2, side) => addColumn(id2, column.id, side)}
                  resizeHandler={header.getResizeHandler()}
                  isResizing={resizing.isResizingColumn === id}
                  dragOver={dragOverCol === id}
                  canDrag={column.id !== "title"}
                  isOwner={project.role === "owner"}
                  settingsHref={column.fieldId ? `/w/${slug}/projects/${project.key}/settings` : null}
                  canGroup={["status", "person", "priority", "section", "cycle", "select", "date", "checkbox", "tags"].includes(column.kind) && !["created_at", "updated_at", "completed_at", "start_date", "created_by"].includes(column.id)}
                />
              );
            })}
            {resizing.isResizingColumn && resizing.deltaOffset != null ? (
              <span aria-hidden className="pointer-events-none absolute top-0 z-20 h-full w-0.5 bg-brand" style={{ left: (table.getColumn(String(resizing.isResizingColumn))?.getStart() ?? 0) + (table.getColumn(String(resizing.isResizingColumn))?.getSize() ?? 0) + resizing.deltaOffset }} />
            ) : null}
          </div>

          {/* Body */}
          <div style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%", minWidth: totalWidth }}>
            {virtualizer.getVirtualItems().map((v) => {
              const item = items[v.index];
              const style: React.CSSProperties = { position: "absolute", top: 0, left: 0, width: "100%", minWidth: totalWidth, height: v.size, transform: `translateY(${v.start}px)` };
              if (item.kind === "header") {
                const isCollapsed = collapsed.has(item.group.key);
                return (
                  <div key={`h-${item.group.key}`} role="row" style={style} className="flex border-b border-border bg-subtle">
                    {leafHeaders.map((header) => {
                      const id = header.column.id;
                      const base = cn("flex shrink-0 items-center overflow-hidden bg-subtle px-2", id === lastPinnedId && "border-r border-border");
                      if (id === SELECT_COLUMN) {
                        return (
                          <div key={id} className={cn(base, "justify-center")} style={stickyStyle(id)}>
                            <button type="button" onClick={() => setCollapsed((s) => { const n = new Set(s); if (n.has(item.group.key)) n.delete(item.group.key); else n.add(item.group.key); return n; })} className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-fg-secondary hover:bg-hover" aria-expanded={!isCollapsed} aria-label={isCollapsed ? `Expand ${item.group.label}` : `Collapse ${item.group.label}`}>
                              <ChevronRight16Regular className={cn("transition-transform", !isCollapsed && "rotate-90")} />
                            </button>
                          </div>
                        );
                      }
                      const column = columnById.get(id);
                      if (!column) return null;
                      if (id === "title") {
                        const person = item.group.meta?.person as PersonRef | null | undefined;
                        return (
                          <div key={id} className={cn(base, "gap-2")} style={stickyStyle(id)}>
                            {person ? <Avatar name={person.displayName} src={person.avatarUrl} size="xs" /> : item.group.color ? <span data-color={item.group.color} className="h-2.5 w-2.5 rounded-full bg-item" /> : null}
                            <span className="truncate type-body-1-strong">{item.group.label}</span>
                            <span className="type-caption-1 text-fg-tertiary">{item.count}</span>
                          </div>
                        );
                      }
                      return (
                        <div key={id} className={cn(base, "line-clamp-2 type-caption-1 leading-4 text-fg-tertiary")} style={stickyStyle(id)} title={groupRollup(item.group.rows, column)}>
                          <span className="line-clamp-2 leading-4">{groupRollup(item.group.rows, column)}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              }
              if (item.kind === "add") {
                return (
                  <div key={`a-${item.group.key}`} role="row" style={style} className="flex border-b border-border bg-surface">
                    <div className="shrink-0 bg-surface" style={stickyStyle(SELECT_COLUMN)} />
                    <div className="flex shrink-0 items-center border-r border-border bg-surface px-2" style={stickyStyle("title")}>
                      {addingIn === item.group.key ? (
                        <QuickAddRow autoFocus onSubmit={(title) => quickAdd(item.group, title)} onCancel={() => setAddingIn(null)} />
                      ) : (
                        <button type="button" className="flex h-full w-full items-center gap-2 type-body-1 text-fg-tertiary hover:text-fg" onClick={() => setAddingIn(item.group.key)}>
                          <Add16Regular /> Add task
                        </button>
                      )}
                    </div>
                  </div>
                );
              }
              const r = item.row;
              const rowSelected = selectedIds.includes(r.id);
              const rowFocused = openTaskId === r.id || active?.rowId === r.id;
              return (
                <div key={r.id} role="row" aria-selected={rowSelected} data-row-id={r.id} style={style} className={cn("group flex border-b border-border bg-surface hover:bg-hover", rowSelected && "bg-selected hover:bg-selected", rowFocused && "bg-subtle")}>
                  {leafHeaders.map((header) => {
                    const id = header.column.id;
                    if (id === SELECT_COLUMN) {
                      return (
                        <div key={id} role="gridcell" className={cn("flex shrink-0 items-center justify-center bg-inherit", rowSelected ? "bg-selected" : "bg-surface group-hover:bg-hover", rowFocused && !rowSelected && "bg-subtle")} style={stickyStyle(id)}>
                          <Checkbox
                            checked={rowSelected}
                            aria-label={`Select ${r.key}`}
                            onClick={(e) => {
                              if (e.shiftKey && selectedIds.length) {
                                const ids = visibleRows.map((x) => x.id);
                                const a = ids.indexOf(selectedIds[selectedIds.length - 1]);
                                const b = ids.indexOf(r.id);
                                if (a >= 0 && b >= 0) {
                                  e.preventDefault();
                                  select(ids.slice(Math.min(a, b), Math.max(a, b) + 1), r.id);
                                }
                              }
                            }}
                            onCheckedChange={() => toggle(r.id)}
                          />
                        </div>
                      );
                    }
                    const column = columnById.get(id);
                    if (!column) return null;
                    const isActive = active?.rowId === r.id && active.colId === id;
                    return (
                      <TableCell
                        key={id}
                        row={r}
                        column={column}
                        style={stickyStyle(id)}
                        isLastPinned={id === lastPinnedId}
                        rowSelected={rowSelected}
                        rowFocused={rowFocused}
                        active={isActive}
                        editing={editing?.rowId === r.id && editing.colId === id ? editing : null}
                        inFill={Boolean(fillRange && fillRange.colId === id && fillRange.ids.has(r.id))}
                        canEdit={canEdit}
                        ctx={groupingCtx}
                        rowsById={rowsById}
                        cycles={project.cycles}
                        me={user.id}
                        today={today}
                        weekStartsOn={workspace.weekStartsOn}
                        onActivate={() => setActive({ rowId: r.id, colId: id })}
                        onStartEdit={() => canEdit && column.editable && textKinds.has(column.kind) && setEditing({ rowId: r.id, colId: id })}
                        onEndEdit={() => {
                          setEditing(null);
                          window.requestAnimationFrame(() => parentRef.current?.querySelector<HTMLElement>(`[data-cell="${r.id}:${id}"]`)?.focus({ preventScroll: true }));
                        }}
                        onCommitText={(text) => applyResult(r, coerceCellInput(column, text, groupingCtx))}
                        onCommitAndMove={() => moveActive(1, 0)}
                        onUpdate={(patch, optimistic) => onUpdate(r.id, patch, optimistic)}
                        onOpen={() => openTask(r.id)}
                        onFillStart={(e) => startFill(e, { rowId: r.id, colId: id })}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Footer aggregates */}
          <div role="row" className="group/footer sticky bottom-0 z-10 flex h-9 border-t border-border bg-surface" style={{ width: "100%", minWidth: totalWidth }}>
            {leafHeaders.map((header) => {
              const id = header.column.id;
              if (id === SELECT_COLUMN) return <div key={id} className="shrink-0 bg-surface" style={stickyStyle(id)} />;
              const column = columnById.get(id);
              if (!column) return null;
              const kind = aggregates[column.id] ?? defaultAggregate(column);
              const text = formatAggregate(aggregate(rows, column, kind), column, kind);
              return (
                <div key={id} className={cn("flex shrink-0 items-center bg-surface px-1", id === lastPinnedId && "border-r border-border")} style={stickyStyle(id)}>
                  <Menu>
                    <MenuTrigger asChild>
                      <button type="button" className={cn("h-7 max-w-full truncate rounded-sm px-1 text-left type-caption-1 hover:bg-hover focus-visible:opacity-100", text ? "text-fg-secondary" : "text-fg-tertiary opacity-0 group-hover/footer:opacity-100")} aria-label={`${column.label} aggregate: ${aggregateLabel(kind)}`}>
                        {text || "Aggregate"}
                      </button>
                    </MenuTrigger>
                    <MenuContent className="w-48">
                      <MenuLabel>{column.label}</MenuLabel>
                      <MenuRadioGroup value={kind} onValueChange={(v) => setAggregate(column.id, v as AggregateKind)}>
                        {column.aggregates.map((k) => (
                          <MenuRadioItem key={k} value={k}>
                            {aggregateLabel(k)}
                          </MenuRadioItem>
                        ))}
                      </MenuRadioGroup>
                    </MenuContent>
                  </Menu>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <BulkActionBar project={project} />
      <PastePreviewDialog preview={pastePreview} columns={columns} onClose={() => setPastePreview(null)} onApply={() => { if (pastePreview) applyGrid(pastePreview.grid, pastePreview.rowIndex, pastePreview.colIndex); setPastePreview(null); }} />
      <span className="sr-only">
        {active ? `Active cell ${columnById.get(active.colId)?.label ?? ""} for ${rowsById.get(active.rowId)?.key ?? ""}` : ""}
        {remove.isPending ? "Deleting" : ""}
      </span>
    </DndContext>
  );
}

/* Column header: icon, name, sort arrow, drag handle, resize handle, and the right-click menu. */
type HeaderProps = {
  column: TableColumn;
  style: React.CSSProperties;
  isLastPinned: boolean;
  sort: "asc" | "desc" | null;
  onSort: () => void;
  onSetSort: (dir: "asc" | "desc") => void;
  onFilter: () => void;
  onGroup: () => void;
  onHide?: () => void;
  aggregate: AggregateKind;
  onAggregate: (k: AggregateKind) => void;
  hiddenColumns: TableColumn[];
  onAddColumn: (id: FieldRef, side: "left" | "right") => void;
  resizeHandler: (event: unknown) => void;
  isResizing: boolean;
  dragOver: boolean;
  canDrag: boolean;
  canGroup: boolean;
  isOwner: boolean;
  settingsHref: string | null;
};

function HeaderCell({ column, style, isLastPinned, sort, onSort, onSetSort, onFilter, onGroup, onHide, aggregate: agg, onAggregate, hiddenColumns, onAddColumn, resizeHandler, isResizing, dragOver, canDrag, canGroup, isOwner, settingsHref }: HeaderProps) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: `col:${column.id}`, disabled: !canDrag });
  const { setNodeRef: setDropRef } = useDroppable({ id: `col:${column.id}` });
  const Icon = kindIcons[column.kind];
  const addMenu = (side: "left" | "right") => (
    <ContextMenuSub>
      <ContextMenuSubTrigger>{side === "left" ? "Add column to the left" : "Add column to the right"}</ContextMenuSubTrigger>
      <ContextMenuSubContent className="max-h-72">
        {hiddenColumns.length === 0 ? <ContextMenuLabel>Every field is shown</ContextMenuLabel> : null}
        {hiddenColumns.map((c) => (
          <ContextMenuItem key={c.id} onSelect={() => onAddColumn(c.id, side)}>
            {c.label}
          </ContextMenuItem>
        ))}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={(el) => {
            setDragRef(el);
            setDropRef(el);
          }}
          {...attributes}
          {...listeners}
          role="columnheader"
          tabIndex={-1}
          aria-sort={sort === "asc" ? "ascending" : sort === "desc" ? "descending" : "none"}
          className={cn("group/head relative flex shrink-0 select-none items-center gap-1.5 border-r border-border bg-surface px-2 type-caption-1-strong text-fg-secondary", isLastPinned && "border-r-border-strong", dragOver && "shadow-[inset_2px_0_0_0_var(--color-brand)]", isDragging && "opacity-50")}
          style={style}
        >
          <button type="button" onClick={onSort} className="flex min-w-0 flex-1 items-center gap-1.5 rounded-sm text-left hover:text-fg" aria-label={`Sort by ${column.label}`}>
            <Icon className="h-4 w-4 shrink-0 text-fg-tertiary" />
            <span className="truncate">{column.label}</span>
            {sort === "asc" ? <ArrowUp16Regular className="h-3.5 w-3.5 shrink-0 text-brand" /> : sort === "desc" ? <ArrowDown16Regular className="h-3.5 w-3.5 shrink-0 text-brand" /> : null}
          </button>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={`Resize ${column.label}`}
            onMouseDown={(e) => {
              e.stopPropagation();
              resizeHandler(e);
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
              resizeHandler(e);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className={cn("absolute top-0 -right-1 z-10 h-full w-2 cursor-col-resize hover:bg-brand/30", isResizing && "bg-brand/40")}
          />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-60">
        <ContextMenuItem onSelect={() => onSetSort("asc")}>Sort ascending</ContextMenuItem>
        <ContextMenuItem onSelect={() => onSetSort("desc")}>Sort descending</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={onFilter}>Filter by this field</ContextMenuItem>
        {canGroup ? <ContextMenuItem onSelect={onGroup}>Group by this field</ContextMenuItem> : null}
        {onHide ? <ContextMenuItem onSelect={onHide}>Hide column</ContextMenuItem> : null}
        <ContextMenuSub>
          <ContextMenuSubTrigger>Aggregate</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {column.aggregates.map((k) => (
              <ContextMenuItem key={k} icon={agg === k ? <Checkmark16Regular /> : undefined} onSelect={() => onAggregate(k)}>
                {aggregateLabel(k)}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        {addMenu("left")}
        {addMenu("right")}
        {isOwner && settingsHref ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem asChild>
              <Link href={settingsHref}>Edit field</Link>
            </ContextMenuItem>
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}

/* A body cell: read only text, an inline editor, or a typed picker depending on the column kind. */
type CellProps = {
  row: TaskRow;
  column: TableColumn;
  style: React.CSSProperties;
  isLastPinned: boolean;
  rowSelected: boolean;
  rowFocused: boolean;
  active: boolean;
  editing: Editing | null;
  inFill: boolean;
  canEdit: boolean;
  ctx: GroupingContext;
  rowsById: Map<string, TaskRow>;
  cycles: ViewProps["project"]["cycles"];
  me: string;
  today: string;
  weekStartsOn: number;
  onActivate: () => void;
  onStartEdit: () => void;
  onEndEdit: () => void;
  onCommitText: (text: string) => boolean;
  onCommitAndMove: () => void;
  onUpdate: (patch: Record<string, unknown>, optimistic: (r: TaskRow) => TaskRow) => void;
  onOpen: () => void;
  onFillStart: (e: React.PointerEvent) => void;
};

const TableCell = React.memo(function TableCell(p: CellProps) {
  const { row, column, style, isLastPinned, rowSelected, rowFocused, active, editing, inFill, canEdit, ctx, rowsById, cycles, me, today, weekStartsOn, onActivate, onStartEdit, onEndEdit, onCommitText, onCommitAndMove, onUpdate, onOpen, onFillStart } = p;
  const editable = canEdit && column.editable;
  const custom = (value: unknown) => onUpdate({ customFields: { [column.fieldId!]: value } }, (r) => ({ ...r, customFields: { ...r.customFields, [column.fieldId!]: value } }));
  const value = cellValue(row, column);

  let content: React.ReactNode;
  if (editing) {
    content = (
      <input
        autoFocus
        defaultValue={editing.initial ?? (value === null || value === undefined ? "" : String(value))}
        aria-label={column.label}
        inputMode={column.kind === "number" ? "decimal" : undefined}
        className={cn("h-7 w-full min-w-0 rounded-sm border border-brand bg-surface px-1.5 type-body-1 outline-none", column.kind === "number" && "text-right")}
        onFocus={(e) => e.target.setSelectionRange(e.target.value.length, e.target.value.length)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const ok = onCommitText((e.target as HTMLInputElement).value);
            (e.target as HTMLInputElement).dataset.committed = "1";
            onEndEdit();
            if (ok) onCommitAndMove();
          } else if (e.key === "Escape") {
            e.preventDefault();
            (e.target as HTMLInputElement).dataset.committed = "1";
            onEndEdit();
          }
        }}
        onBlur={(e) => {
          if (e.target.dataset.committed) return;
          const v = e.target.value;
          const current = value === null || value === undefined ? "" : String(value);
          if (v !== current) onCommitText(v);
          onEndEdit();
        }}
      />
    );
  } else {
    switch (column.kind) {
      case "title":
        content = (
          <span className="flex min-w-0 flex-1 items-center gap-1">
            {row.isMilestone ? <Diamond16Regular className="shrink-0 text-brand" aria-label="Milestone" /> : null}
            <button type="button" className={cn("min-w-0 flex-1 truncate text-left type-body-1 hover:underline", row.status.category === "done" && "text-fg-secondary line-through")} onClick={(e) => { e.stopPropagation(); onOpen(); }}>
              {row.title}
            </button>
            {row.subtaskCount > 0 ? <span className="shrink-0 type-caption-1 text-fg-tertiary">{row.subtaskDoneCount}/{row.subtaskCount}</span> : null}
            {row.blockedByCount > 0 ? <Badge color="red">Blocked</Badge> : null}
          </span>
        );
        break;
      case "key":
        content = <span className="font-mono type-caption-1 text-fg-secondary">{row.key}</span>;
        break;
      case "status":
        content = editable ? (
          <StatusPicker value={row.status} statuses={ctx.statuses} onChange={(id) => { const s = ctx.statuses.find((x) => x.id === id)!; onUpdate({ statusId: id }, (r) => ({ ...r, status: s, completedAt: s.category === "done" ? new Date().toISOString() : null })); }} />
        ) : (
          <Badge color={row.status.color} dot>{row.status.name}</Badge>
        );
        break;
      case "person": {
        if (column.id === "assignee") {
          content = editable ? (
            <PersonPicker value={row.assignee} people={ctx.members} me={me} onChange={(id) => onUpdate({ assigneeId: id }, (r) => ({ ...r, assignee: id ? (ctx.members.find((m) => m.id === id) ?? null) : null }))} />
          ) : row.assignee ? (
            <span className="flex items-center gap-1.5 truncate type-body-1"><Avatar name={row.assignee.displayName} src={row.assignee.avatarUrl} size="xs" />{row.assignee.displayName}</span>
          ) : null;
        } else {
          const person = ctx.members.find((m) => m.id === value) ?? null;
          content = editable && column.fieldId ? (
            <PersonPicker value={person} people={ctx.members} me={me} onChange={(id) => custom(id)} />
          ) : person ? (
            <span className="flex items-center gap-1.5 truncate type-body-1"><Avatar name={person.displayName} src={person.avatarUrl} size="xs" />{person.displayName}</span>
          ) : null;
        }
        break;
      }
      case "date": {
        const iso = (value as string | null) ?? null;
        const state = column.id === "due_date" ? dueState(row.dueDate, row.status.category === "done", today) : "none";
        content = editable ? (
          <DatePicker
            value={iso}
            label={column.label}
            state={state}
            compact
            minDate={column.id === "due_date" ? row.startDate : null}
            weekStartsOn={weekStartsOn}
            onChange={(next) => {
              if (column.fieldId) custom(next);
              else if (column.id === "start_date") onUpdate({ startDate: next }, (r) => ({ ...r, startDate: next }));
              else onUpdate({ dueDate: next, ...(row.isMilestone ? { startDate: next } : {}) }, (r) => ({ ...r, dueDate: next }));
            }}
          />
        ) : (
          <span className="type-body-1 text-fg-secondary">{iso ? formatDateShort(iso) : ""}</span>
        );
        break;
      }
      case "priority":
        content = editable ? <PriorityPicker value={row.priority} onChange={(pr) => onUpdate({ priority: pr }, (r) => ({ ...r, priority: pr }))} /> : <span className="type-body-1">{cellText(row, column, ctx)}</span>;
        break;
      case "section":
        content = editable ? (
          <SimpleSelect ariaLabel="Section" value={row.sectionId} options={ctx.sections.map((s) => ({ value: s.id, label: s.name }))} placeholder="No section" onChange={(id) => onUpdate({ sectionId: id }, (r) => ({ ...r, sectionId: id }))} />
        ) : (
          <span className="type-body-1">{cellText(row, column, ctx)}</span>
        );
        break;
      case "cycle":
        content = editable ? (
          <SimpleSelect ariaLabel={column.label} value={row.cycleId} options={cycles.map((c) => ({ value: c.id, label: c.name }))} placeholder={`No ${column.label.toLowerCase()}`} onChange={(id) => onUpdate({ cycleId: id }, (r) => ({ ...r, cycleId: id }))} />
        ) : (
          <span className="type-body-1">{cycles.find((c) => c.id === row.cycleId)?.name ?? ""}</span>
        );
        break;
      case "select":
        content = editable && column.fieldId ? (
          <SimpleSelect ariaLabel={column.label} value={(value as string | null) ?? null} options={(column.options ?? []).map((o) => ({ value: o.id, label: o.name, color: o.color }))} placeholder="None" onChange={(id) => custom(id)} />
        ) : (
          <span className="type-body-1">{cellText(row, column, ctx)}</span>
        );
        break;
      case "checkbox":
        content = (
          <Checkbox
            checked={Boolean(value)}
            disabled={!editable}
            aria-label={column.label}
            onCheckedChange={(v) => {
              const next = Boolean(v);
              if (column.fieldId) custom(next);
              else onUpdate({ isMilestone: next }, (r) => ({ ...r, isMilestone: next }));
            }}
          />
        );
        break;
      case "tags":
        content = (
          <span className="flex gap-1 overflow-hidden">
            {row.tags.slice(0, 4).map((t) => (
              <Badge key={t.id} color={t.color}>{t.name}</Badge>
            ))}
          </span>
        );
        break;
      case "multi_select":
        content = (
          <span className="flex gap-1 overflow-hidden">
            {(Array.isArray(value) ? value : value ? [value] : []).map((id) => {
              const opt = column.options?.find((o) => o.id === id);
              return <Badge key={String(id)} color={opt?.color}>{opt?.name ?? String(id)}</Badge>;
            })}
          </span>
        );
        break;
      case "number":
        content = <span className="w-full truncate text-right type-body-1">{cellText(row, column, ctx)}</span>;
        break;
      case "parent":
        content = <span className="font-mono type-caption-1 text-fg-secondary">{cellText(row, column, ctx, rowsById)}</span>;
        break;
      default:
        content = <span className="truncate type-body-1 text-fg-secondary">{cellText(row, column, ctx, rowsById)}</span>;
    }
  }

  return (
    <div
      role="gridcell"
      data-cell={`${row.id}:${column.id}`}
      tabIndex={-1}
      aria-selected={active || undefined}
      className={cn(
        "relative flex shrink-0 items-center overflow-hidden px-2 outline-none",
        rowSelected ? "bg-selected" : rowFocused ? "bg-subtle" : "bg-surface group-hover:bg-hover",
        isLastPinned && "border-r border-border",
        active && "shadow-[inset_0_0_0_2px_var(--color-brand)]",
        inFill && !active && "bg-brand-tint",
        column.kind === "number" && "justify-end",
      )}
      style={style}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        onActivate();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onStartEdit();
      }}
    >
      {content}
      {active && editable && !editing && column.kind !== "title" ? (
        <span role="presentation" aria-hidden onPointerDown={onFillStart} className="absolute right-0 bottom-0 z-[3] h-2 w-2 cursor-crosshair bg-brand" />
      ) : null}
    </div>
  );
});

function PastePreviewDialog({ preview, columns, onClose, onApply }: { preview: PastePreview; columns: TableColumn[]; onClose: () => void; onApply: () => void }) {
  if (!preview) return null;
  const targetColumns = preview.grid[0]?.map((_, j) => columns[preview.colIndex + j]) ?? [];
  const cellCount = preview.grid.reduce((n, line) => n + line.length, 0);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Paste into the table"
        description={`${cellCount} cells will be written into ${preview.grid.length} rows starting at the active cell. Columns that are read only are skipped.`}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={onApply}>
              Paste {cellCount} cells
            </Button>
          </>
        }
      >
        <div className="max-h-80 overflow-auto rounded-sm border border-border">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {targetColumns.map((c, j) => (
                  <th key={j} className="border-b border-border bg-subtle px-2 py-1 text-left type-caption-1-strong text-fg-secondary">
                    {c ? c.label : "Ignored"}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.grid.slice(0, 50).map((line, i) => (
                <tr key={i}>
                  {line.map((cell, j) => (
                    <td key={j} className="border-b border-border px-2 py-1 type-caption-1">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {preview.grid.length > 50 ? <p className="px-2 py-1 type-caption-1 text-fg-tertiary">Showing the first 50 rows.</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
