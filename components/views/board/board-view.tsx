"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  pointerWithin,
  closestCenter,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  type Announcements,
} from "@dnd-kit/core";
import { Add20Regular, Add16Regular, ChevronRight16Regular, ChevronDoubleRight16Regular, MoreHorizontal16Regular, Comment16Regular, Attach16Regular, Diamond16Regular, TaskListSquareLtr16Regular, Warning16Regular } from "@fluentui/react-icons";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { EmptyState, ProgressBar } from "@/components/ui/misc";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger, ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { StatusPicker, PersonPicker, DatePicker, PriorityPicker, priorityMeta } from "@/components/task/field-editors";
import { BulkActionBar } from "@/components/views/shared/bulk-action-bar";
import { QuickAddRow } from "@/components/views/shared/quick-add-row";
import type { ViewProps } from "@/components/views/types";
import type { TaskRow, PersonRef } from "@/lib/query-engine/types";
import type { Group, GroupingContext } from "@/lib/client/grouping";
import type { FieldRef } from "@/lib/validation/view-spec";
import { readBoardOptions, buildColumns, columnKeyOf, fieldPatch, composeOptimistic, dropNeighbors, positionBetween, atWipCapacity, boardRows, type BoardColumn, type BoardDensity } from "@/lib/client/board";
import { useTaskMutations } from "@/lib/client/queries";
import { useViewState } from "@/lib/client/view-state";
import { useWorkspace } from "@/lib/client/workspace-context";
import { updateWorkflowAction } from "@/lib/actions/projects";
import { dueState, formatDue, formatDateShort } from "@/lib/client/dates";
import { cn } from "@/lib/utils";

const COLUMN_WIDTH = 280;
const COLLAPSED_WIDTH = 40;

type CellData = { laneKey: string; colKey: string; taskId?: string };
type DropTarget = { laneKey: string; colKey: string; overId: string | null; position: "before" | "after" };
type Composer = { laneKey: string; colKey: string; where: "top" | "bottom" };
type WorkflowDialog = { kind: "wip" | "rename" | "add"; column: BoardColumn; side?: "left" | "right" } | null;

const cellKey = (laneKey: string, colKey: string) => `${laneKey}|${colKey}`;

export function BoardView(props: ViewProps & { quickAddSignal?: number }) {
  const { project, groups, spec, setSpec, canEdit, rows: allRows, quickAddSignal } = props;
  const { members, user, today, workspace, slug } = useWorkspace();
  const { update, move, create, remove } = useTaskMutations();
  const router = useRouter();
  const { toast } = useToast();
  const selectedIds = useViewState((s) => s.selectedIds);
  const select = useViewState((s) => s.select);
  const toggle = useViewState((s) => s.toggle);
  const clearSelection = useViewState((s) => s.clearSelection);
  const openTask = useViewState((s) => s.openTask);
  const openTaskId = useViewState((s) => s.openTaskId);

  const boardOptions = React.useMemo(() => readBoardOptions(spec), [spec]);
  const { columnField, density, collapsed } = boardOptions;
  const laneField: FieldRef | undefined = spec.groupBy && spec.groupBy !== columnField ? spec.groupBy : undefined;
  const manualOrder = spec.sorts[0]?.field === "manual";
  const canManageWorkflow = project.role === "owner";

  const [composer, setComposer] = React.useState<Composer | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [focusedId, setFocusedId] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState<TaskRow | null>(null);
  const [dropTarget, setDropTarget] = React.useState<DropTarget | null>(null);
  const [flashColumn, setFlashColumn] = React.useState<string | null>(null);
  const [collapsedLanes, setCollapsedLanes] = React.useState<Set<string>>(() => new Set());
  const [dialog, setDialog] = React.useState<WorkflowDialog>(null);
  const dropTargetRef = React.useRef<DropTarget | null>(null);

  const groupingCtx = React.useMemo<GroupingContext>(
    () => ({ sections: project.sections, statuses: project.statuses, members, fields: project.fields.map((f) => ({ id: f.id, name: f.name, type: f.type as never, config: f.config })), today }),
    [project.sections, project.statuses, project.fields, members, today],
  );
  const rows = React.useMemo(() => boardRows(allRows, spec.subtasks), [allRows, spec.subtasks]);
  const columns = React.useMemo(() => buildColumns(rows, columnField, groupingCtx, project.statuses, project.members), [rows, columnField, groupingCtx, project.statuses, project.members]);
  const lanes = React.useMemo<Group[]>(() => {
    if (!laneField) return [{ key: "all", label: "All tasks", rows }];
    const visible = new Set(rows.map((r) => r.id));
    return groups.map((g) => ({ ...g, rows: g.rows.filter((r) => visible.has(r.id)) }));
  }, [laneField, groups, rows]);
  const cells = React.useMemo(() => {
    const map = new Map<string, TaskRow[]>();
    for (const lane of lanes) for (const col of columns) map.set(cellKey(lane.key, col.key), []);
    for (const lane of lanes) {
      for (const r of lane.rows) {
        const key = cellKey(lane.key, columnKeyOf(r, columnField));
        const list = map.get(key);
        if (list) list.push(r);
      }
    }
    return map;
  }, [lanes, columns, columnField]);
  const visibleColumns = React.useMemo(() => columns.filter((c) => !collapsed.includes(c.key)), [columns, collapsed]);

  // The command bar's Add task button bumps quickAddSignal; open the composer at the top of the first column.
  const [seenSignal, setSeenSignal] = React.useState(quickAddSignal);
  if (quickAddSignal !== seenSignal) {
    setSeenSignal(quickAddSignal);
    if (quickAddSignal && columns[0] && lanes[0]) setComposer({ laneKey: lanes[0].key, colKey: columns[0].key, where: "top" });
  }

  // Lookups for live region announcements, kept in a ref so the memoized announcements stay current.
  const lookups = React.useRef({ titles: new Map<string, string>(), columns: new Map<string, string>(), lanes: new Map<string, string>() });
  React.useEffect(() => {
    lookups.current = {
      titles: new Map(rows.map((r) => [r.id, r.title])),
      columns: new Map(columns.map((c) => [c.key, c.label])),
      lanes: new Map(lanes.map((l) => [l.key, l.label])),
    };
  }, [rows, columns, lanes]);
  const announcements = React.useMemo<Announcements>(() => {
    const where = (data: CellData | undefined) => {
      if (!data) return "nowhere";
      const col = lookups.current.columns.get(data.colKey) ?? "a column";
      const lane = lookups.current.lanes.get(data.laneKey);
      return lane && data.laneKey !== "all" ? `${col} in ${lane}` : col;
    };
    return {
      onDragStart: ({ active }) => `Picked up ${lookups.current.titles.get(String(active.id)) ?? "the task"}. Use the arrow keys to move between columns and cards, Space to drop, Escape to cancel.`,
      onDragOver: ({ active, over }) => (over ? `${lookups.current.titles.get(String(active.id)) ?? "The task"} is over ${where(over.data.current as CellData)}.` : `${lookups.current.titles.get(String(active.id)) ?? "The task"} is not over a column.`),
      onDragEnd: ({ active, over }) => (over ? `Dropped ${lookups.current.titles.get(String(active.id)) ?? "the task"} in ${where(over.data.current as CellData)}.` : `Dropped ${lookups.current.titles.get(String(active.id)) ?? "the task"}. Nothing changed.`),
      onDragCancel: ({ active }) => `Moving ${lookups.current.titles.get(String(active.id)) ?? "the task"} was cancelled.`,
    };
  }, []);

  // Keyboard navigation between cards (J, K, arrows) plus the shared shortcuts.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable || target.closest("[role=menu],[role=dialog]"))) return;
      if (e.ctrlKey || e.metaKey || e.altKey || dragging) return;
      const openLanes = lanes.filter((l) => !collapsedLanes.has(l.key));
      const locate = () => {
        if (!focusedId) return null;
        for (const lane of openLanes) {
          for (const col of visibleColumns) {
            const list = cells.get(cellKey(lane.key, col.key)) ?? [];
            const idx = list.findIndex((r) => r.id === focusedId);
            if (idx >= 0) return { lane, col, list, idx };
          }
        }
        return null;
      };
      const focusCard = (id: string) => {
        setFocusedId(id);
        const el = document.querySelector<HTMLElement>(`[data-task-id="${id}"]`);
        el?.focus();
        el?.scrollIntoView({ block: "nearest", inline: "nearest" });
      };
      const firstCard = () => {
        for (const lane of openLanes) for (const col of visibleColumns) {
          const list = cells.get(cellKey(lane.key, col.key)) ?? [];
          if (list[0]) return list[0];
        }
        return null;
      };
      const loc = locate();
      const current = loc ? loc.list[loc.idx] : null;
      const moveVertical = (delta: number) => {
        if (!loc) {
          const f = firstCard();
          if (f) focusCard(f.id);
          return;
        }
        const next = loc.list[loc.idx + delta];
        if (next) focusCard(next.id);
      };
      const moveHorizontal = (delta: number) => {
        if (!loc) {
          const f = firstCard();
          if (f) focusCard(f.id);
          return;
        }
        let ci = visibleColumns.findIndex((c) => c.key === loc.col.key) + delta;
        while (ci >= 0 && ci < visibleColumns.length) {
          const list = cells.get(cellKey(loc.lane.key, visibleColumns[ci].key)) ?? [];
          if (list.length) {
            focusCard(list[Math.min(loc.idx, list.length - 1)].id);
            return;
          }
          ci += delta;
        }
      };
      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          moveVertical(1);
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          moveVertical(-1);
          break;
        case "l":
        case "ArrowRight":
          e.preventDefault();
          moveHorizontal(1);
          break;
        case "h":
        case "ArrowLeft":
          e.preventDefault();
          moveHorizontal(-1);
          break;
        case "Enter":
          if (current && target?.dataset.taskId === current.id) {
            e.preventDefault();
            openTask(current.id);
          }
          break;
        case "e":
          if (current && canEdit) {
            e.preventDefault();
            setEditingId(current.id);
          }
          break;
        case "x":
          if (current) toggle(current.id);
          break;
        case "Delete":
        case "Backspace":
          if (current && canEdit && target?.dataset.taskId === current.id && window.confirm(`Delete ${current.key}?`)) remove.mutate(current.id);
          break;
        case "Escape":
          clearSelection();
          setFocusedId(null);
          (target as HTMLElement | null)?.blur?.();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lanes, collapsedLanes, visibleColumns, cells, focusedId, dragging, openTask, toggle, clearSelection, canEdit, remove]);

  // Keyboard drag: arrows jump between cards and columns instead of moving by pixels.
  const coordinateGetter = React.useCallback<KeyboardCoordinateGetter>((event, { currentCoordinates, context }) => {
    const { droppableContainers, droppableRects, collisionRect, over } = context;
    if (!collisionRect || !over) return;
    const overData = over.data.current as CellData | undefined;
    if (!overData) return;
    const containers = droppableContainers.getEnabled();
    const dataOf = (c: (typeof containers)[number]) => c.data.current as CellData | undefined;
    const rectOf = (c: (typeof containers)[number]) => droppableRects.get(c.id);
    const cardsIn = (laneKey: string, colKey: string) =>
      containers
        .filter((c) => dataOf(c)?.taskId && dataOf(c)?.laneKey === laneKey && dataOf(c)?.colKey === colKey && rectOf(c))
        .sort((a, b) => rectOf(a)!.top - rectOf(b)!.top);
    let target: { left: number; top: number; width: number; height: number } | undefined;
    let bias = 0;
    if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
      const cellsInLane = containers.filter((c) => !dataOf(c)?.taskId && dataOf(c)?.laneKey === overData.laneKey && rectOf(c)).sort((a, b) => rectOf(a)!.left - rectOf(b)!.left);
      const idx = cellsInLane.findIndex((c) => dataOf(c)?.colKey === overData.colKey);
      const next = cellsInLane[idx + (event.code === "ArrowRight" ? 1 : -1)];
      if (!next) return;
      const nextData = dataOf(next)!;
      const cards = cardsIn(nextData.laneKey, nextData.colKey);
      target = cards[0] ? rectOf(cards[0]) : rectOf(next);
      bias = cards[0] ? -4 : 0;
    } else if (event.code === "ArrowUp" || event.code === "ArrowDown") {
      const cards = cardsIn(overData.laneKey, overData.colKey);
      const down = event.code === "ArrowDown";
      if (overData.taskId) {
        const idx = cards.findIndex((c) => c.id === over.id);
        const next = cards[idx + (down ? 1 : -1)];
        if (!next) {
          if (down) {
            const cell = containers.find((c) => !dataOf(c)?.taskId && dataOf(c)?.laneKey === overData.laneKey && dataOf(c)?.colKey === overData.colKey);
            const rect = cell ? rectOf(cell) : undefined;
            if (!rect) return;
            target = { left: rect.left, top: rect.top + rect.height - 8, width: rect.width, height: 8 };
          } else return;
        } else {
          target = rectOf(next);
          bias = down ? 4 : -4;
        }
      } else {
        if (down || cards.length === 0) return;
        target = rectOf(cards[cards.length - 1]);
        bias = -4;
      }
    } else return;
    if (!target) return;
    const dx = target.left + target.width / 2 - (collisionRect.left + collisionRect.width / 2);
    const dy = target.top + target.height / 2 + bias - (collisionRect.top + collisionRect.height / 2);
    return { x: currentCoordinates.x + dx, y: currentCoordinates.y + dy };
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter, keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] } }),
  );

  const collisionDetection = React.useCallback<CollisionDetection>((args) => {
    const within = pointerWithin(args);
    if (within.length) {
      const cards = within.filter((c) => String(c.id).startsWith("card:"));
      return cards.length ? cards : within;
    }
    return closestCenter(args);
  }, []);

  const setTarget = (next: DropTarget | null) => {
    const prev = dropTargetRef.current;
    if (prev === next || (prev && next && prev.laneKey === next.laneKey && prev.colKey === next.colKey && prev.overId === next.overId && prev.position === next.position)) return;
    dropTargetRef.current = next;
    setDropTarget(next);
  };

  const onDragStart = (e: DragStartEvent) => {
    setDragging(rows.find((r) => r.id === e.active.id) ?? null);
    setEditingId(null);
  };
  const onDragOver = (e: DragOverEvent) => {
    if (!e.over) {
      setTarget(null);
      return;
    }
    const data = e.over.data.current as CellData | undefined;
    if (!data) {
      setTarget(null);
      return;
    }
    if (data.taskId) {
      const rect = e.over.rect;
      const activeRect = e.active.rect.current.translated;
      const centerY = activeRect ? activeRect.top + activeRect.height / 2 : rect.top;
      setTarget({ laneKey: data.laneKey, colKey: data.colKey, overId: data.taskId, position: centerY < rect.top + rect.height / 2 ? "before" : "after" });
    } else {
      setTarget({ laneKey: data.laneKey, colKey: data.colKey, overId: null, position: "after" });
    }
  };
  const onDragEnd = (e: DragEndEvent) => {
    const target = dropTargetRef.current;
    setDragging(null);
    setTarget(null);
    if (!target) return;
    const row = rows.find((r) => r.id === e.active.id);
    if (!row) return;
    applyDrop(row, target);
  };

  const applyDrop = (row: TaskRow, target: DropTarget) => {
    const colChanged = columnKeyOf(row, columnField) !== target.colKey;
    const laneChanged = laneField ? columnKeyOf(row, laneField) !== target.laneKey : false;
    const colPatch = colChanged ? fieldPatch(columnField, target.colKey, groupingCtx) : null;
    const lanePatch = laneChanged && laneField ? fieldPatch(laneField, target.laneKey, groupingCtx) : null;
    if ((colChanged && !colPatch) || (laneChanged && !lanePatch)) return;
    const cellCards = (cells.get(cellKey(target.laneKey, target.colKey)) ?? []).filter((c) => c.id !== row.id);
    const { before, after } = dropNeighbors(cellCards, target.overId, target.position);
    const reorder = manualOrder && (colChanged || laneChanged || target.overId !== null);
    const patch: Record<string, unknown> = { ...colPatch?.patch, ...lanePatch?.patch };
    const sectionId = ("sectionId" in patch ? patch.sectionId : row.sectionId) as string | null;
    if (reorder) delete patch.sectionId;
    const positionPatch = reorder ? (r: TaskRow) => ({ ...r, position: positionBetween(before, after, r.position), sectionId }) : null;
    if (Object.keys(patch).length) {
      update.mutate({ id: row.id, ...patch, optimistic: composeOptimistic(colPatch?.optimistic, lanePatch?.optimistic, positionPatch) } as never);
    }
    if (reorder) {
      move.mutate({ id: row.id, sectionId, beforeId: before?.id ?? null, afterId: after?.id ?? null, optimistic: composeOptimistic(colPatch?.optimistic, lanePatch?.optimistic, positionPatch) });
    }
    const column = columns.find((c) => c.key === target.colKey);
    if (colChanged && column && atWipCapacity(column, column.rows.length)) {
      setFlashColumn(column.key);
      window.setTimeout(() => setFlashColumn((k) => (k === column.key ? null : k)), 1200);
    }
  };

  const quickAdd = (laneKey: string, colKey: string, where: "top" | "bottom", title: string) => {
    const colPatch = fieldPatch(columnField, colKey, groupingCtx)?.patch ?? {};
    const lanePatch = laneField ? (fieldPatch(laneField, laneKey, groupingCtx)?.patch ?? {}) : {};
    const first = (cells.get(cellKey(laneKey, colKey)) ?? [])[0];
    const placement = where === "top" && first ? { placement: { relativeTo: first.id, where: "before" as const } } : {};
    create.mutate({ projectId: project.id, title, ...colPatch, ...lanePatch, ...placement } as never);
  };

  const toggleCollapsed = (key: string) =>
    setSpec((prev) => {
      const cur = Array.isArray(prev.options.boardCollapsed) ? (prev.options.boardCollapsed as string[]) : [];
      return { ...prev, options: { ...prev.options, boardCollapsed: cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key] } };
    });

  const saveWorkflow = async (statuses: Array<{ id?: string; name: string; category: string; color: string; wipLimit: number | null }>) => {
    const res = await updateWorkflowAction(slug, { projectId: project.id, statuses });
    if (!res.ok) {
      toast({ title: "Could not update the workflow", description: res.error.message, kind: "danger" });
      return false;
    }
    toast({ title: "Workflow updated", kind: "success" });
    router.refresh();
    return true;
  };

  const onUpdate = React.useCallback((id: string, patch: Record<string, unknown>, optimistic: (r: TaskRow) => TaskRow) => update.mutate({ id, ...patch, optimistic } as never), [update]);

  const onCardClick = (row: TaskRow, laneKey: string, colKey: string, e: React.MouseEvent) => {
    setFocusedId(row.id);
    if (e.shiftKey && selectedIds.length) {
      const ids = (cells.get(cellKey(laneKey, colKey)) ?? []).map((r) => r.id);
      const a = ids.indexOf(selectedIds[selectedIds.length - 1]);
      const b = ids.indexOf(row.id);
      if (a >= 0 && b >= 0) select(ids.slice(Math.min(a, b), Math.max(a, b) + 1), row.id);
      else toggle(row.id);
    } else if (e.ctrlKey || e.metaKey) toggle(row.id);
    else openTask(row.id);
  };

  const showField = (f: string) => spec.visibleFields.includes(f as never);
  const customFieldDefs = project.fields;

  if (rows.length === 0 && !composer) {
    return (
      <EmptyState
        title="No tasks match this view"
        description={spec.filters.items.length ? "Clear the filters to see everything, or add a task." : "Add the first task to get started."}
        action={canEdit && columns[0] && lanes[0] ? <Button variant="primary" size="sm" onClick={() => setComposer({ laneKey: lanes[0].key, colKey: columns[0].key, where: "top" })}><Add20Regular className="h-4 w-4" /> Add task</Button> : undefined}
      />
    );
  }

  const cardProps = (row: TaskRow, laneKey: string, colKey: string) => ({
    row,
    laneKey,
    colKey,
    density,
    selected: selectedIds.includes(row.id),
    focused: focusedId === row.id || openTaskId === row.id,
    editing: editingId === row.id,
    dragEnabled: canEdit,
    dropIndicator: dropTarget?.overId === row.id ? dropTarget.position : null,
    showField,
    hideStatus: columnField === "status",
    today,
    canEdit,
    statuses: project.statuses,
    members,
    me: user.id,
    weekStartsOn: workspace.weekStartsOn,
    customFieldDefs,
    onClick: (e: React.MouseEvent) => onCardClick(row, laneKey, colKey, e),
    onStartEdit: () => canEdit && setEditingId(row.id),
    onEndEdit: () => setEditingId(null),
    onUpdate: (patch: Record<string, unknown>, optimistic: (r: TaskRow) => TaskRow) => onUpdate(row.id, patch, optimistic),
    onDelete: () => {
      if (window.confirm(`Delete ${row.key}?`)) remove.mutate(row.id);
    },
    onOpen: () => openTask(row.id),
    onSelect: () => toggle(row.id),
  });

  const renderCell = (lane: Group, col: BoardColumn, scrollable: boolean) => {
    const list = cells.get(cellKey(lane.key, col.key)) ?? [];
    const isTarget = dropTarget?.laneKey === lane.key && dropTarget.colKey === col.key;
    const composerHere = composer && composer.laneKey === lane.key && composer.colKey === col.key ? composer.where : null;
    return (
      <BoardCell
        key={`cell-${col.key}`}
        laneKey={lane.key}
        column={col}
        scrollable={scrollable}
        endIndicator={Boolean(isTarget && dropTarget?.overId === null && !(dragging && list.some((r) => r.id === dragging.id) && list.length === 1))}
        composer={composerHere}
        onComposerClose={() => setComposer(null)}
        onQuickAdd={(title, where) => quickAdd(lane.key, col.key, where, title)}
        onOpenComposer={canEdit ? () => setComposer({ laneKey: lane.key, colKey: col.key, where: "bottom" }) : undefined}
      >
        {list.map((row) => (
          <BoardCard key={row.id} {...cardProps(row, lane.key, col.key)} />
        ))}
      </BoardCell>
    );
  };

  const renderHeader = (col: BoardColumn) => (
    <ColumnHeader
      key={`head-${col.key}`}
      column={col}
      count={col.rows.length}
      flashing={flashColumn === col.key}
      canEdit={canEdit}
      canManageWorkflow={canManageWorkflow && columnField === "status"}
      sortField={String(spec.sorts[0]?.field ?? "manual")}
      onSort={(field) => setSpec((prev) => ({ ...prev, sorts: field === "manual" ? [{ field: "manual", direction: "asc" }] : [{ field: field as FieldRef, direction: field === "priority" ? "desc" : "asc" }] }))}
      onAdd={() => setComposer({ laneKey: lanes[0]?.key ?? "all", colKey: col.key, where: "top" })}
      onCollapse={() => toggleCollapsed(col.key)}
      onWorkflow={(kind, side) => setDialog({ kind, column: col, side })}
    />
  );

  return (
    <DndContext id="board-dnd" sensors={sensors} collisionDetection={collisionDetection} accessibility={{ announcements, screenReaderInstructions: { draggable: "Press Space to pick up the card. Use the arrow keys to move it between cards and columns, Space to drop it, and Escape to cancel." } }} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => { setDragging(null); setTarget(null); }}>
      {laneField ? (
        <div className="h-full overflow-auto" role="region" aria-label={`${project.name} board`}>
          <div className="min-w-max px-4 pb-4">
            <div className="sticky top-0 z-10 flex gap-3 bg-canvas pt-2">
              {columns.map((col) => (collapsed.includes(col.key) ? <CollapsedColumn key={col.key} column={col} laneKey={lanes[0]?.key ?? "all"} count={col.rows.length} onExpand={() => toggleCollapsed(col.key)} compact /> : renderHeader(col)))}
            </div>
            {lanes.map((lane) => {
              const laneCollapsed = collapsedLanes.has(lane.key);
              return (
                <section key={lane.key} aria-label={lane.label} className="border-t border-border">
                  <LaneHeader lane={lane} count={lane.rows.length} collapsed={laneCollapsed} onToggle={() => setCollapsedLanes((s) => { const n = new Set(s); if (n.has(lane.key)) n.delete(lane.key); else n.add(lane.key); return n; })} />
                  {!laneCollapsed ? (
                    <div className="flex items-stretch gap-3 pb-3">
                      {columns.map((col) => (collapsed.includes(col.key) ? <CollapsedColumn key={col.key} column={col} laneKey={lane.key} count={(cells.get(cellKey(lane.key, col.key)) ?? []).length} onExpand={() => toggleCollapsed(col.key)} hideLabel /> : renderCell(lane, col, false)))}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex h-full items-stretch gap-3 overflow-x-auto px-4 pt-2 pb-3" role="region" aria-label={`${project.name} board`}>
          {columns.map((col) =>
            collapsed.includes(col.key) ? (
              <CollapsedColumn key={col.key} column={col} laneKey="all" count={col.rows.length} onExpand={() => toggleCollapsed(col.key)} />
            ) : (
              <div key={col.key} className="flex h-full min-h-0 shrink-0 flex-col" style={{ width: COLUMN_WIDTH }}>
                {renderHeader(col)}
                {renderCell(lanes[0], col, true)}
              </div>
            ),
          )}
          {canManageWorkflow && columnField === "status" ? (
            <div className="shrink-0 pt-1">
              <Button variant="subtle" size="sm" className="text-fg-secondary" onClick={() => columns.length && setDialog({ kind: "add", column: columns[columns.length - 1], side: "right" })}>
                <Add16Regular /> Add status
              </Button>
            </div>
          ) : null}
        </div>
      )}
      <DragOverlay dropAnimation={null}>
        {dragging ? (
          <div className="rounded-sm border border-border bg-surface-raised opacity-95 shadow-menu" style={{ width: COLUMN_WIDTH - 8 }}>
            <CardContent row={dragging} density={density} showField={showField} hideStatus={columnField === "status"} today={today} customFieldDefs={customFieldDefs} statuses={project.statuses} members={members} me={user.id} weekStartsOn={workspace.weekStartsOn} readOnly />
          </div>
        ) : null}
      </DragOverlay>
      <BulkActionBar project={project} />
      <WorkflowDialogView dialog={dialog} onClose={() => setDialog(null)} statuses={project.statuses} onSave={saveWorkflow} />
    </DndContext>
  );
}

/* Column header: name, count, WIP limit, add, menu. */
function ColumnHeader({ column, count, flashing, canEdit, canManageWorkflow, sortField, onSort, onAdd, onCollapse, onWorkflow }: { column: BoardColumn; count: number; flashing: boolean; canEdit: boolean; canManageWorkflow: boolean; sortField: string; onSort: (field: string) => void; onAdd: () => void; onCollapse: () => void; onWorkflow: (kind: "wip" | "rename" | "add", side?: "left" | "right") => void }) {
  const over = column.wipLimit != null && count > column.wipLimit;
  const person = column.meta?.person as PersonRef | null | undefined;
  return (
    <div className="flex h-9 shrink-0 items-center gap-2 px-1" style={{ width: COLUMN_WIDTH }} role="heading" aria-level={2}>
      {person ? <Avatar name={person.displayName} src={person.avatarUrl} size="xs" /> : column.color ? <span data-color={column.color} className="h-2.5 w-2.5 shrink-0 rounded-full bg-item" aria-hidden /> : null}
      <span className="truncate type-body-1-strong">{column.label}</span>
      <span className={cn("inline-flex h-5 items-center gap-1 rounded-sm px-1 type-caption-1 text-fg-tertiary", over && "bg-danger-tint font-semibold text-danger", flashing && "animate-pulse bg-danger-tint text-danger")} aria-label={column.wipLimit != null ? `${count} of ${column.wipLimit} allowed` : `${count} tasks`}>
        {over ? <Warning16Regular className="h-3 w-3" aria-hidden /> : null}
        {count}
        {column.wipLimit != null ? ` / ${column.wipLimit}` : ""}
      </span>
      <div className="flex-1" />
      {canEdit ? (
        <button type="button" onClick={onAdd} className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-fg-tertiary hover:bg-hover hover:text-fg" aria-label={`Add task to ${column.label}`}>
          <Add16Regular />
        </button>
      ) : null}
      <Menu>
        <MenuTrigger asChild>
          <button type="button" className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-fg-tertiary hover:bg-hover hover:text-fg" aria-label={`${column.label} column options`}>
            <MoreHorizontal16Regular />
          </button>
        </MenuTrigger>
        <MenuContent className="w-56">
          <MenuLabel>Sort cards</MenuLabel>
          <MenuRadioGroup value={sortField} onValueChange={onSort}>
            <MenuRadioItem value="manual">Manual</MenuRadioItem>
            <MenuRadioItem value="due_date">Due date</MenuRadioItem>
            <MenuRadioItem value="priority">Priority</MenuRadioItem>
          </MenuRadioGroup>
          <MenuSeparator />
          {canManageWorkflow ? (
            <>
              <MenuItem onSelect={() => onWorkflow("wip")}>Set WIP limit</MenuItem>
              <MenuItem onSelect={() => onWorkflow("rename")}>Rename status</MenuItem>
              <MenuItem onSelect={() => onWorkflow("add", "left")}>Add status to the left</MenuItem>
              <MenuItem onSelect={() => onWorkflow("add", "right")}>Add status to the right</MenuItem>
              <MenuSeparator />
            </>
          ) : null}
          <MenuItem onSelect={onCollapse}>Collapse column</MenuItem>
        </MenuContent>
      </Menu>
    </div>
  );
}

function CollapsedColumn({ column, laneKey, count, onExpand, compact, hideLabel }: { column: BoardColumn; laneKey: string; count: number; onExpand: () => void; compact?: boolean; hideLabel?: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `cell:${laneKey}|${column.key}:collapsed`, data: { laneKey, colKey: column.key } satisfies CellData });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onExpand}
      aria-label={`Expand ${column.label}, ${count} tasks`}
      className={cn("flex shrink-0 flex-col items-center gap-2 rounded-sm py-2 text-fg-secondary hover:bg-hover", compact ? "h-9" : "min-h-16", isOver && "bg-selected")}
      style={{ width: COLLAPSED_WIDTH }}
    >
      {!hideLabel ? <ChevronDoubleRight16Regular aria-hidden /> : null}
      {!hideLabel && !compact ? (
        <>
          <span className="type-body-1-strong text-fg" style={{ writingMode: "vertical-rl" }}>
            {column.label}
          </span>
          <span className="type-caption-1 text-fg-tertiary">{count}</span>
        </>
      ) : null}
      {hideLabel ? <span className="type-caption-1 text-fg-tertiary">{count}</span> : null}
      {compact ? <span className="sr-only">{column.label}</span> : null}
    </button>
  );
}

function LaneHeader({ lane, count, collapsed, onToggle }: { lane: Group; count: number; collapsed: boolean; onToggle: () => void }) {
  const person = lane.meta?.person as PersonRef | null | undefined;
  return (
    <div className="sticky left-0 z-[5] flex h-9 w-max items-center gap-2 bg-canvas pr-4">
      <button type="button" onClick={onToggle} className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-fg-secondary hover:bg-hover" aria-expanded={!collapsed} aria-label={collapsed ? `Expand ${lane.label}` : `Collapse ${lane.label}`}>
        <ChevronRight16Regular className={cn("transition-transform", !collapsed && "rotate-90")} />
      </button>
      {person ? <Avatar name={person.displayName} src={person.avatarUrl} size="xs" /> : lane.color ? <span data-color={lane.color} className="h-2.5 w-2.5 rounded-full bg-item" aria-hidden /> : null}
      <span className="type-body-1-strong">{lane.label}</span>
      <span className="type-caption-1 text-fg-tertiary">{count}</span>
    </div>
  );
}

/* A droppable column body (or swimlane cell) holding the cards, composer, and the add button. */
function BoardCell({ laneKey, column, scrollable, endIndicator, composer, onComposerClose, onQuickAdd, onOpenComposer, children }: { laneKey: string; column: BoardColumn; scrollable: boolean; endIndicator: boolean; composer: "top" | "bottom" | null; onComposerClose: () => void; onQuickAdd: (title: string, where: "top" | "bottom") => void; onOpenComposer?: () => void; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `cell:${laneKey}|${column.key}`, data: { laneKey, colKey: column.key } satisfies CellData });
  const composerBox = (where: "top" | "bottom") => (
    <div className="rounded-sm border border-border bg-surface p-1.5">
      <QuickAddRow autoFocus onSubmit={(title) => onQuickAdd(title, where)} onCancel={onComposerClose} />
    </div>
  );
  return (
    <div ref={setNodeRef} role="list" aria-label={column.label} className={cn("group/cell flex min-h-0 flex-col gap-2 rounded-sm px-0.5 pt-1", scrollable ? "flex-1 overflow-y-auto pb-2" : "min-h-16 shrink-0 pb-1", isOver && "bg-hover/60")} style={{ width: COLUMN_WIDTH }}>
      {composer === "top" ? composerBox("top") : null}
      {children}
      {endIndicator ? <span className="h-0.5 w-full shrink-0 rounded-full bg-brand" aria-hidden /> : null}
      {composer === "bottom" ? composerBox("bottom") : null}
      {onOpenComposer && composer !== "bottom" ? (
        <button type="button" onClick={onOpenComposer} className={cn("flex h-8 shrink-0 items-center gap-1.5 rounded-sm px-2 type-body-1 text-fg-tertiary hover:bg-hover hover:text-fg focus-visible:opacity-100", !scrollable && "opacity-0 group-hover/cell:opacity-100")}>
          <Add16Regular /> Add task
        </button>
      ) : null}
    </div>
  );
}

type CardProps = {
  row: TaskRow;
  laneKey: string;
  colKey: string;
  density: BoardDensity;
  selected: boolean;
  focused: boolean;
  editing: boolean;
  dragEnabled: boolean;
  dropIndicator: "before" | "after" | null;
  showField: (f: string) => boolean;
  hideStatus: boolean;
  today: string;
  canEdit: boolean;
  statuses: ViewProps["project"]["statuses"];
  members: PersonRef[];
  me: string;
  weekStartsOn: number;
  customFieldDefs: ViewProps["project"]["fields"];
  onClick: (e: React.MouseEvent) => void;
  onStartEdit: () => void;
  onEndEdit: () => void;
  onUpdate: (patch: Record<string, unknown>, optimistic: (r: TaskRow) => TaskRow) => void;
  onDelete: () => void;
  onOpen: () => void;
  onSelect: () => void;
};

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

const BoardCard = React.memo(function BoardCard(p: CardProps) {
  const { row, laneKey, colKey, selected, focused, editing, dragEnabled, dropIndicator, canEdit, statuses, members, me, onClick, onStartEdit, onEndEdit, onUpdate, onDelete, onOpen, onSelect } = p;
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: row.id, data: { laneKey, colKey } satisfies CellData, disabled: !dragEnabled || editing });
  const { setNodeRef: setDropRef } = useDroppable({ id: `card:${row.id}`, data: { laneKey, colKey, taskId: row.id } satisfies CellData, disabled: isDragging });
  const done = row.status.category === "done";
  const doneStatus = statuses.find((s) => s.category === "done");
  const firstOpen = statuses.find((s) => s.category !== "done") ?? statuses[0];
  const { role: _role, ...dragAttributes } = attributes;
  void _role;

  return (
    <div role="listitem" className="relative shrink-0">
      {dropIndicator === "before" ? <span className="absolute -top-[5px] left-0 right-0 h-0.5 rounded-full bg-brand" aria-hidden /> : null}
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            ref={(el) => {
              setDropRef(el);
              setDragRef(el);
            }}
            {...dragAttributes}
            {...listeners}
            role="button"
            tabIndex={0}
            data-task-id={row.id}
            aria-pressed={selected}
            aria-label={`${row.title}, ${row.key}, ${row.status.name}`}
            className={cn(
              "group rounded-sm border border-border bg-surface px-2.5 py-2 text-left outline-none select-none hover:border-border-strong",
              selected && "border-brand bg-selected",
              focused && "outline outline-1 -outline-offset-1 outline-brand",
              isDragging && "opacity-40",
              dragEnabled ? "cursor-grab active:cursor-grabbing" : "cursor-default",
            )}
            onClick={onClick}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onStartEdit();
            }}
          >
            <CardContent {...p} editing={editing} onEndEdit={onEndEdit} />
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuItem onSelect={onOpen}>Open</ContextMenuItem>
          <ContextMenuItem onSelect={onSelect}>{selected ? "Deselect" : "Select"}</ContextMenuItem>
          {canEdit ? (
            <>
              <ContextMenuItem onSelect={onStartEdit}>Edit title</ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuSub>
                <ContextMenuSubTrigger>Status</ContextMenuSubTrigger>
                <ContextMenuSubContent>
                  {statuses.map((s) => (
                    <ContextMenuItem key={s.id} onSelect={() => onUpdate({ statusId: s.id }, (r) => ({ ...r, status: s, completedAt: s.category === "done" ? new Date().toISOString() : null }))}>
                      <span data-color={s.color} className="mr-2 inline-block h-2 w-2 rounded-full bg-item" />
                      {s.name}
                    </ContextMenuItem>
                  ))}
                </ContextMenuSubContent>
              </ContextMenuSub>
              <ContextMenuSub>
                <ContextMenuSubTrigger>Assignee</ContextMenuSubTrigger>
                <ContextMenuSubContent className="max-h-72">
                  <ContextMenuItem onSelect={() => onUpdate({ assigneeId: null }, (r) => ({ ...r, assignee: null }))}>Unassigned</ContextMenuItem>
                  {members.map((m) => (
                    <ContextMenuItem key={m.id} onSelect={() => onUpdate({ assigneeId: m.id }, (r) => ({ ...r, assignee: m }))}>
                      {m.displayName}
                      {m.id === me ? " (me)" : ""}
                    </ContextMenuItem>
                  ))}
                </ContextMenuSubContent>
              </ContextMenuSub>
              <ContextMenuSub>
                <ContextMenuSubTrigger>Priority</ContextMenuSubTrigger>
                <ContextMenuSubContent>
                  {(Object.keys(priorityMeta) as Array<keyof typeof priorityMeta>).map((pr) => (
                    <ContextMenuItem key={pr} onSelect={() => onUpdate({ priority: pr }, (r) => ({ ...r, priority: pr }))}>
                      {priorityMeta[pr].label}
                    </ContextMenuItem>
                  ))}
                </ContextMenuSubContent>
              </ContextMenuSub>
              <ContextMenuSeparator />
              <ContextMenuItem
                onSelect={() => {
                  const next = done ? firstOpen : doneStatus;
                  if (next) onUpdate({ statusId: next.id }, (r) => ({ ...r, status: next, completedAt: done ? null : new Date().toISOString() }));
                }}
              >
                {done ? "Mark incomplete" : "Mark complete"}
              </ContextMenuItem>
              <ContextMenuItem destructive onSelect={onDelete}>
                Delete
              </ContextMenuItem>
            </>
          ) : null}
        </ContextMenuContent>
      </ContextMenu>
      {dropIndicator === "after" ? <span className="absolute -bottom-[5px] left-0 right-0 h-0.5 rounded-full bg-brand" aria-hidden /> : null}
    </div>
  );
});

type ContentProps = {
  row: TaskRow;
  density: BoardDensity;
  showField: (f: string) => boolean;
  hideStatus: boolean;
  today: string;
  customFieldDefs: ViewProps["project"]["fields"];
  readOnly?: boolean;
  editing?: boolean;
  canEdit?: boolean;
  statuses?: ViewProps["project"]["statuses"];
  members?: PersonRef[];
  me?: string;
  weekStartsOn?: number;
  onUpdate?: (patch: Record<string, unknown>, optimistic: (r: TaskRow) => TaskRow) => void;
  onEndEdit?: () => void;
};

/* The visual content of a card, shared by the board and the drag overlay. */
function CardContent({ row, density, showField, hideStatus, today, customFieldDefs, readOnly, editing, canEdit, statuses = [], members = [], me, weekStartsOn = 1, onUpdate, onEndEdit }: ContentProps) {
  const done = row.status.category === "done";
  const state = dueState(row.dueDate, done, today);
  const detailed = density === "detailed";
  // The drag overlay renders the same pickers as the card, disabled, so the lifted card looks identical.
  const editable = readOnly || (Boolean(canEdit) && Boolean(onUpdate));
  const disabled = readOnly || !canEdit;
  const change = onUpdate ?? (() => undefined);
  const customShown = detailed ? customFieldDefs.filter((f) => showField(`custom:${f.id}`) && row.customFields[f.id] !== undefined && row.customFields[f.id] !== null && row.customFields[f.id] !== "").slice(0, 3) : [];
  const stopAll = { onPointerDown: stop, onClick: stop, onKeyDown: stop, onDoubleClick: stop };
  const meta: React.ReactNode[] = [];
  if (showField("due_date") && (row.dueDate || detailed)) {
    meta.push(
      editable ? (
        <span key="due" {...stopAll} className="-ml-1">
          <DatePicker value={row.dueDate} label="Due date" state={state} compact disabled={disabled} minDate={row.startDate} weekStartsOn={weekStartsOn} onChange={(iso) => change({ dueDate: iso, ...(row.isMilestone ? { startDate: iso } : {}) }, (r) => ({ ...r, dueDate: iso }))} />
        </span>
      ) : (
        <span key="due" className={cn("type-caption-1", state === "overdue" ? "text-danger" : state === "soon" ? "text-warning" : "text-fg-secondary")}>
          {formatDue(row.dueDate, today)}
        </span>
      ),
    );
  }
  if (showField("priority") && (row.priority !== "none" || detailed)) {
    meta.push(
      editable ? (
        <span key="pri" {...stopAll} className="-ml-1">
          <PriorityPicker value={row.priority} compact disabled={disabled} onChange={(pr) => change({ priority: pr }, (r) => ({ ...r, priority: pr }))} />
        </span>
      ) : (
        <span key="pri" data-color={priorityMeta[row.priority].color} className={cn("type-caption-1", row.priority !== "none" ? "text-item" : "text-fg-tertiary")} aria-label={`Priority ${priorityMeta[row.priority].label}`}>
          {priorityMeta[row.priority].label}
        </span>
      ),
    );
  }
  if (showField("estimate") && row.estimate != null && detailed) meta.push(<span key="est" className="type-caption-1 text-fg-secondary">{row.estimate} pts</span>);
  if (row.subtaskCount > 0) meta.push(<span key="sub" className="inline-flex items-center gap-0.5 type-caption-1 text-fg-tertiary" aria-label={`${row.subtaskDoneCount} of ${row.subtaskCount} subtasks done`}><TaskListSquareLtr16Regular className="h-3.5 w-3.5" aria-hidden />{row.subtaskDoneCount}/{row.subtaskCount}</span>);
  if (row.commentCount > 0) meta.push(<span key="com" className="inline-flex items-center gap-0.5 type-caption-1 text-fg-tertiary" aria-label={`${row.commentCount} comments`}><Comment16Regular className="h-3 w-3" aria-hidden />{row.commentCount}</span>);
  if (row.attachmentCount > 0) meta.push(<span key="att" className="inline-flex items-center gap-0.5 type-caption-1 text-fg-tertiary" aria-label={`${row.attachmentCount} attachments`}><Attach16Regular className="h-3 w-3" aria-hidden />{row.attachmentCount}</span>);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-start gap-1.5">
        {row.isMilestone ? <Diamond16Regular className="mt-0.5 shrink-0 text-brand" aria-label="Milestone" /> : null}
        {editing && onEndEdit ? (
          <input
            autoFocus
            defaultValue={row.title}
            aria-label="Task title"
            className="h-7 min-w-0 flex-1 rounded-sm border border-brand bg-surface px-1.5 type-body-1 outline-none"
            {...stopAll}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                (e.target as HTMLInputElement).value = row.title;
                (e.target as HTMLInputElement).blur();
              }
            }}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== row.title && onUpdate) onUpdate({ title: v }, (r) => ({ ...r, title: v }));
              onEndEdit();
            }}
          />
        ) : (
          <span className={cn("min-w-0 flex-1 break-words type-body-1", density === "compact" ? "line-clamp-1" : "line-clamp-2", done && "text-fg-secondary line-through")}>{row.title}</span>
        )}
        {row.blockedByCount > 0 ? <Badge color="red">Blocked</Badge> : null}
      </div>
      {density !== "compact" ? (
        <>
          {showField("tags") && row.tags.length ? (
            <div className="flex flex-wrap gap-1">
              {row.tags.slice(0, detailed ? 6 : 3).map((t) => (
                <Badge key={t.id} color={t.color}>
                  {t.name}
                </Badge>
              ))}
            </div>
          ) : null}
          {detailed && !hideStatus && showField("status") ? (
            <div className="flex items-center gap-2">
              {editable ? (
                <span {...stopAll} className="-ml-1">
                  <StatusPicker value={row.status} statuses={statuses} disabled={disabled} onChange={(id) => { const s = statuses.find((x) => x.id === id)!; change({ statusId: id }, (r) => ({ ...r, status: s, completedAt: s.category === "done" ? new Date().toISOString() : null })); }} />
                </span>
              ) : (
                <Badge color={row.status.color} dot>
                  {row.status.name}
                </Badge>
              )}
            </div>
          ) : null}
          {detailed && row.subtaskCount > 0 ? <ProgressBar value={row.subtaskDoneCount} max={row.subtaskCount} /> : null}
          {customShown.map((f) => (
            <div key={f.id} className="flex items-baseline gap-1 type-caption-1">
              <span className="text-fg-tertiary">{f.name}</span>
              <span className="truncate text-fg-secondary">{customValueLabel(f, row.customFields[f.id], members)}</span>
            </div>
          ))}
          <div className="flex min-h-5 items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-mono type-caption-1 text-fg-tertiary">{row.key}</span>
              {detailed && showField("start_date") && row.startDate ? <span className="type-caption-1 text-fg-secondary">From {formatDateShort(row.startDate)}</span> : null}
              {meta}
            </div>
            {showField("assignee") ? (
              editable ? (
                <span {...stopAll} className="-mr-1">
                  <PersonPicker value={row.assignee} people={members} me={me} compact disabled={disabled} onChange={(id) => change({ assigneeId: id }, (r) => ({ ...r, assignee: id ? (members.find((m) => m.id === id) ?? null) : null }))} />
                </span>
              ) : row.assignee ? (
                <Avatar name={row.assignee.displayName} src={row.assignee.avatarUrl} size="xs" />
              ) : null
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function customValueLabel(def: ViewProps["project"]["fields"][number], value: unknown, members: PersonRef[]): string {
  const options = ((def.config as { options?: Array<{ id: string; name: string }> } | null)?.options) ?? [];
  const one = (v: unknown) => options.find((o) => o.id === v)?.name ?? members.find((m) => m.id === v)?.displayName ?? (typeof v === "boolean" ? (v ? "Yes" : "No") : String(v));
  if (Array.isArray(value)) return value.map(one).join(", ");
  return one(value);
}

/* Dialog for the status column menu: WIP limit, rename, add a status beside this one. */
function WorkflowDialogView({ dialog, onClose, statuses, onSave }: { dialog: WorkflowDialog; onClose: () => void; statuses: ViewProps["project"]["statuses"]; onSave: (statuses: Array<{ id?: string; name: string; category: string; color: string; wipLimit: number | null }>) => Promise<boolean> }) {
  const [draft, setDraft] = React.useState("");
  const [seen, setSeen] = React.useState<WorkflowDialog>(null);
  const [pending, setPending] = React.useState(false);
  if (dialog !== seen) {
    setSeen(dialog);
    if (dialog) setDraft(dialog.kind === "wip" ? (dialog.column.wipLimit != null ? String(dialog.column.wipLimit) : "") : dialog.kind === "rename" ? dialog.column.label : "");
  }
  if (!dialog) return null;
  const title = dialog.kind === "wip" ? "Set WIP limit" : dialog.kind === "rename" ? "Rename status" : "Add status";
  const description = dialog.kind === "wip" ? `Cards in ${dialog.column.label} above this number show a red count. Leave empty for no limit.` : dialog.kind === "rename" ? "The new name applies to every task in this status." : `The new status goes ${dialog.side === "left" ? "before" : "after"} ${dialog.column.label}.`;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const base: Array<{ id?: string; name: string; category: string; color: string; wipLimit: number | null }> = statuses.map((s) => ({ id: s.id, name: s.name, category: s.category, color: s.color, wipLimit: s.wipLimit }));
    let next = base;
    if (dialog.kind === "wip") {
      const n = draft.trim() === "" ? null : Number(draft);
      if (n !== null && (!Number.isInteger(n) || n <= 0)) return;
      next = base.map((s) => (s.id === dialog.column.key ? { ...s, wipLimit: n } : s));
    } else if (dialog.kind === "rename") {
      if (!draft.trim()) return;
      next = base.map((s) => (s.id === dialog.column.key ? { ...s, name: draft.trim() } : s));
    } else {
      if (!draft.trim()) return;
      const idx = base.findIndex((s) => s.id === dialog.column.key);
      const anchor = base[idx];
      const created = { name: draft.trim(), category: anchor?.category ?? "not_started", color: "gray", wipLimit: null };
      next = [...base];
      next.splice(dialog.side === "left" ? idx : idx + 1, 0, created);
    }
    setPending(true);
    const ok = await onSave(next);
    setPending(false);
    if (ok) onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={title}
        description={description}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="board-workflow" loading={pending}>
              Save
            </Button>
          </>
        }
      >
        <form id="board-workflow" onSubmit={submit}>
          <Field label={dialog.kind === "wip" ? "Limit" : "Name"}>
            <Input autoFocus type={dialog.kind === "wip" ? "number" : "text"} min={1} step={1} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={dialog.kind === "wip" ? "No limit" : "Status name"} maxLength={60} />
          </Field>
        </form>
      </DialogContent>
    </Dialog>
  );
}
