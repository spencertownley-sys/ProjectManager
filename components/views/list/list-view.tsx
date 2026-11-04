"use client";

import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors, useDraggable, useDroppable, type DragEndEvent, type DragOverEvent, type DragStartEvent } from "@dnd-kit/core";
import { ChevronRight16Regular, Add20Regular, ReOrderDotsVertical16Regular, Comment16Regular, Diamond16Regular, Attach16Regular } from "@fluentui/react-icons";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { StatusPicker, PersonPicker, DatePicker, PriorityPicker, priorityMeta } from "@/components/task/field-editors";
import { BulkActionBar } from "@/components/views/shared/bulk-action-bar";
import { QuickAddRow } from "@/components/views/shared/quick-add-row";
import type { ViewProps } from "@/components/views/types";
import type { TaskRow } from "@/lib/query-engine/types";
import type { Group } from "@/lib/client/grouping";
import { buildTree } from "@/lib/client/grouping";
import { useTaskMutations } from "@/lib/client/queries";
import { useViewState, useShellState } from "@/lib/client/view-state";
import { useWorkspace } from "@/lib/client/workspace-context";
import { dueState, formatDue } from "@/lib/client/dates";
import { cn } from "@/lib/utils";

type Item = { kind: "header"; group: Group; count: number } | { kind: "row"; row: TaskRow; depth: number; hasChildren: boolean; groupKey: string } | { kind: "add"; group: Group };

const rowHeights = { compact: 28, default: 36, comfortable: 44 } as const;

export function ListView(props: ViewProps & { quickAddSignal?: number }) {
  const { project, groups, spec, canEdit, rows, quickAddSignal } = props;
  const { members, user, today, workspace } = useWorkspace();
  const { update, move, create } = useTaskMutations();
  const { density } = useShellState();
  const selectedIds = useViewState((s) => s.selectedIds);
  const select = useViewState((s) => s.select);
  const toggle = useViewState((s) => s.toggle);
  const clearSelection = useViewState((s) => s.clearSelection);
  const openTask = useViewState((s) => s.openTask);
  const openTaskId = useViewState((s) => s.openTaskId);
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
  const [expandedParents, setExpandedParents] = React.useState<Set<string>>(() => new Set());
  const [addingIn, setAddingIn] = React.useState<string | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [focusIndex, setFocusIndex] = React.useState<number>(-1);
  const [dragging, setDragging] = React.useState<TaskRow | null>(null);
  const [dropTarget, setDropTarget] = React.useState<{ id: string; position: "before" | "after" } | null>(null);
  const parentRef = React.useRef<HTMLDivElement>(null);
  const rowHeight = rowHeights[density];
  const groupedBySection = !spec.groupBy || spec.groupBy === "section";
  const manualOrder = spec.sorts[0]?.field === "manual";

  React.useEffect(() => {
    if (quickAddSignal) setAddingIn(groups[0]?.key ?? "all");
  }, [quickAddSignal, groups]);

  const items = React.useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const g of groups) {
      out.push({ kind: "header", group: g, count: g.rows.length });
      if (collapsed.has(g.key)) continue;
      if (spec.subtasks === "nested") {
        const tree = buildTree(g.rows);
        const hidden = new Set<string>();
        for (const node of tree) {
          if (node.row.parentId && (hidden.has(node.row.parentId) || !expandedParents.has(node.row.parentId))) {
            hidden.add(node.row.id);
            continue;
          }
          out.push({ kind: "row", row: node.row, depth: node.depth, hasChildren: node.hasChildren, groupKey: g.key });
        }
      } else {
        for (const r of g.rows) out.push({ kind: "row", row: r, depth: 0, hasChildren: false, groupKey: g.key });
      }
      if (canEdit) out.push({ kind: "add", group: g });
    }
    return out;
  }, [groups, collapsed, spec.subtasks, expandedParents, canEdit]);

  const virtualizer = useVirtualizer({ count: items.length, getScrollElement: () => parentRef.current, estimateSize: (i) => (items[i].kind === "header" ? 36 : rowHeight), overscan: 12 });

  const rowItems = items.map((it, i) => ({ it, i })).filter((x) => x.it.kind === "row");

  // Keyboard navigation.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const idx = rowItems.findIndex((x) => x.i === focusIndex);
      const moveFocus = (delta: number) => {
        const next = rowItems[Math.max(0, Math.min(rowItems.length - 1, (idx < 0 ? (delta > 0 ? -1 : rowItems.length) : idx) + delta))];
        if (next) {
          setFocusIndex(next.i);
          virtualizer.scrollToIndex(next.i, { align: "auto" });
        }
      };
      const current = idx >= 0 ? (rowItems[idx].it as Extract<Item, { kind: "row" }>).row : null;
      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          moveFocus(1);
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          moveFocus(-1);
          break;
        case "Enter":
          if (current) openTask(current.id);
          break;
        case "e":
          if (current && canEdit) setEditingId(current.id);
          break;
        case "x":
          if (current) toggle(current.id);
          break;
        case "Escape":
          clearSelection();
          setFocusIndex(-1);
          break;
        case "ArrowRight":
          if (current) setExpandedParents((s) => new Set(s).add(current.id));
          break;
        case "ArrowLeft":
          if (current) setExpandedParents((s) => { const n = new Set(s); n.delete(current.id); return n; });
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rowItems, focusIndex, openTask, toggle, clearSelection, canEdit, virtualizer]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  const onDragStart = (e: DragStartEvent) => {
    const row = rows.find((r) => r.id === e.active.id);
    setDragging(row ?? null);
  };
  const onDragOver = (e: DragOverEvent) => {
    if (!e.over) {
      setDropTarget(null);
      return;
    }
    const overId = String(e.over.id);
    if (overId.startsWith("group:")) {
      setDropTarget({ id: overId, position: "after" });
      return;
    }
    const rect = e.over.rect;
    const pointerY = (e.activatorEvent as PointerEvent).clientY + (e.delta?.y ?? 0);
    const position = pointerY < rect.top + rect.height / 2 ? "before" : "after";
    setDropTarget({ id: overId, position });
  };
  const onDragEnd = (e: DragEndEvent) => {
    const target = dropTarget;
    setDragging(null);
    setDropTarget(null);
    if (!target || !e.active) return;
    const row = rows.find((r) => r.id === e.active.id);
    if (!row) return;
    if (target.id.startsWith("group:")) {
      const groupKey = target.id.slice(6);
      const group = groups.find((g) => g.key === groupKey);
      if (!group) return;
      applyGroupDrop(row, group, null, null);
      return;
    }
    const overRow = rows.find((r) => r.id === target.id);
    if (!overRow || overRow.id === row.id) return;
    const group = groups.find((g) => g.rows.some((r) => r.id === overRow.id));
    if (!group) return;
    const visible = group.rows.filter((r) => r.id !== row.id && r.parentId === overRow.parentId);
    const idx = visible.findIndex((r) => r.id === overRow.id);
    const before = target.position === "before" ? visible[idx - 1] ?? null : overRow;
    const after = target.position === "before" ? overRow : visible[idx + 1] ?? null;
    applyGroupDrop(row, group, before, after);
  };

  const applyGroupDrop = (row: TaskRow, group: Group, before: TaskRow | null, after: TaskRow | null) => {
    if (groupedBySection) {
      const sectionId = (group.meta?.sectionId as string | null | undefined) ?? null;
      if (!manualOrder && sectionId === row.sectionId) return;
      move.mutate({ id: row.id, sectionId, beforeId: before?.id ?? null, afterId: after?.id ?? null, optimistic: (r) => ({ ...r, sectionId, position: before && after ? (before.position + after.position) / 2 : before ? before.position + 1 : after ? after.position - 1 : r.position }) });
      return;
    }
    if (spec.groupBy === "status" && group.meta?.statusId) {
      const status = project.statuses.find((s) => s.id === group.meta?.statusId);
      if (status && status.id !== row.status.id) update.mutate({ id: row.id, statusId: status.id, optimistic: (r) => ({ ...r, status, completedAt: status.category === "done" ? new Date().toISOString() : null }) });
      return;
    }
    if (spec.groupBy === "assignee") {
      const assigneeId = (group.meta?.assigneeId as string | null | undefined) ?? null;
      if (assigneeId !== (row.assignee?.id ?? null)) update.mutate({ id: row.id, assigneeId, optimistic: (r) => ({ ...r, assignee: assigneeId ? (members.find((m) => m.id === assigneeId) ?? null) : null }) });
      return;
    }
    if (spec.groupBy === "priority") {
      const priority = group.key as TaskRow["priority"];
      if (priority !== row.priority) update.mutate({ id: row.id, priority, optimistic: (r) => ({ ...r, priority }) });
    }
  };

  const quickAdd = (group: Group, title: string) => {
    const sectionId = groupedBySection ? ((group.meta?.sectionId as string | null | undefined) ?? null) : null;
    const extra: Record<string, unknown> = {};
    if (spec.groupBy === "status" && group.meta?.statusId) extra.statusId = group.meta.statusId;
    if (spec.groupBy === "assignee" && group.meta?.assigneeId) extra.assigneeId = group.meta.assigneeId;
    if (spec.groupBy === "priority") extra.priority = group.key;
    create.mutate({ projectId: project.id, title, sectionId, ...extra });
  };

  const fields = spec.visibleFields;
  const showField = (f: string) => fields.includes(f as never);

  if (rows.length === 0 && !addingIn) {
    return (
      <EmptyState
        title="No tasks match this view"
        description={spec.filters.items.length ? "Clear the filters to see everything, or add a task." : "Add the first task to get started."}
        action={canEdit ? <Button variant="primary" size="sm" onClick={() => setAddingIn(groups[0]?.key ?? "all")}><Add20Regular className="h-4 w-4" /> Add task</Button> : undefined}
      />
    );
  }

  return (
    <DndContext id="list-dnd" sensors={sensors} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => { setDragging(null); setDropTarget(null); }}>
      <div ref={parentRef} className="h-full overflow-auto" role="grid" aria-label={`${project.name} list`} aria-rowcount={rows.length}>
        <div className="sticky top-0 z-10 flex h-8 items-center border-b border-border bg-surface px-3 type-caption-1-strong text-fg-secondary" role="row">
          <span className="w-7" />
          <span className="min-w-0 flex-1 pl-6">Task</span>
          {showField("status") ? <span className="w-32 shrink-0">Status</span> : null}
          {showField("assignee") ? <span className="w-36 shrink-0">Assignee</span> : null}
          {showField("due_date") ? <span className="w-28 shrink-0">Due date</span> : null}
          {showField("start_date") ? <span className="w-28 shrink-0">Start</span> : null}
          {showField("priority") ? <span className="w-28 shrink-0">Priority</span> : null}
          {showField("estimate") ? <span className="w-16 shrink-0">Est.</span> : null}
          {showField("tags") ? <span className="w-40 shrink-0">Tags</span> : null}
        </div>
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((v) => {
            const item = items[v.index];
            const style: React.CSSProperties = { position: "absolute", top: 0, left: 0, width: "100%", height: v.size, transform: `translateY(${v.start}px)` };
            if (item.kind === "header") {
              return (
                <GroupHeader key={`h-${item.group.key}`} style={style} group={item.group} count={item.count} collapsed={collapsed.has(item.group.key)} onToggle={() => setCollapsed((s) => { const n = new Set(s); if (n.has(item.group.key)) n.delete(item.group.key); else n.add(item.group.key); return n; })} onAdd={canEdit ? () => setAddingIn(item.group.key) : undefined} isDropTarget={dropTarget?.id === `group:${item.group.key}`} />
              );
            }
            if (item.kind === "add") {
              return (
                <div key={`a-${item.group.key}`} style={style} className="flex items-center border-b border-border bg-surface px-3">
                  {addingIn === item.group.key ? (
                    <QuickAddRow autoFocus onSubmit={(title) => quickAdd(item.group, title)} onCancel={() => setAddingIn(null)} className="pl-7" />
                  ) : (
                    <button type="button" className="flex h-full w-full items-center gap-2 pl-7 type-body-1 text-fg-tertiary hover:text-fg" onClick={() => setAddingIn(item.group.key)}>
                      <Add20Regular className="h-4 w-4" /> Add task
                    </button>
                  )}
                </div>
              );
            }
            const r = item.row;
            return (
              <ListRow
                key={r.id}
                style={style}
                row={r}
                depth={item.depth}
                hasChildren={item.hasChildren}
                expanded={expandedParents.has(r.id)}
                onToggleExpand={() => setExpandedParents((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })}
                selected={selectedIds.includes(r.id)}
                focused={focusIndex === v.index || openTaskId === r.id}
                editing={editingId === r.id}
                onStartEdit={() => canEdit && setEditingId(r.id)}
                onEndEdit={() => setEditingId(null)}
                onClick={(e) => {
                  setFocusIndex(v.index);
                  if (e.shiftKey && selectedIds.length) {
                    const ids = rowItems.map((x) => (x.it as Extract<Item, { kind: "row" }>).row.id);
                    const a = ids.indexOf(selectedIds[selectedIds.length - 1]);
                    const b = ids.indexOf(r.id);
                    select(ids.slice(Math.min(a, b), Math.max(a, b) + 1), r.id);
                  } else if (e.ctrlKey || e.metaKey) toggle(r.id);
                  else openTask(r.id);
                }}
                onToggleSelect={() => toggle(r.id)}
                showField={showField}
                dropIndicator={dropTarget?.id === r.id ? dropTarget.position : null}
                dragEnabled={canEdit && (manualOrder || !groupedBySection)}
                today={today}
                canEdit={canEdit}
                statuses={project.statuses}
                members={members}
                me={user.id}
                weekStartsOn={workspace.weekStartsOn}
                onUpdate={(patch, optimistic) => update.mutate({ id: r.id, ...patch, optimistic } as never)}
              />
            );
          })}
        </div>
      </div>
      <DragOverlay dropAnimation={null}>
        {dragging ? (
          <div className="flex h-9 w-96 items-center gap-2 rounded-sm border border-border bg-surface-raised px-3 opacity-95 shadow-menu">
            <span className="font-mono type-caption-1 text-fg-tertiary">{dragging.key}</span>
            <span className="truncate type-body-1">{dragging.title}</span>
          </div>
        ) : null}
      </DragOverlay>
      <BulkActionBar project={project} />
    </DndContext>
  );
}

function GroupHeader({ group, count, collapsed, onToggle, onAdd, style, isDropTarget }: { group: Group; count: number; collapsed: boolean; onToggle: () => void; onAdd?: () => void; style: React.CSSProperties; isDropTarget: boolean }) {
  const { setNodeRef } = useDroppable({ id: `group:${group.key}` });
  return (
    <div ref={setNodeRef} style={style} role="row" className={cn("flex items-center gap-2 border-b border-border bg-subtle px-3", isDropTarget && "bg-selected")}>
      <button type="button" onClick={onToggle} className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-fg-secondary hover:bg-hover" aria-expanded={!collapsed} aria-label={collapsed ? `Expand ${group.label}` : `Collapse ${group.label}`}>
        <ChevronRight16Regular className={cn("transition-transform", !collapsed && "rotate-90")} />
      </button>
      {group.color ? <span data-color={group.color} className="h-2.5 w-2.5 rounded-full bg-item" /> : null}
      {group.meta?.person ? <Avatar name={(group.meta.person as { displayName: string }).displayName} src={(group.meta.person as { avatarUrl: string | null }).avatarUrl} size="xs" /> : null}
      <span className="type-body-1-strong">{group.label}</span>
      <span className="type-caption-1 text-fg-tertiary">{count}</span>
      {onAdd ? (
        <button type="button" onClick={onAdd} className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-sm text-fg-tertiary hover:bg-hover hover:text-fg" aria-label={`Add task to ${group.label}`}>
          <Add20Regular className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

type RowProps = {
  row: TaskRow;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  selected: boolean;
  focused: boolean;
  editing: boolean;
  onStartEdit: () => void;
  onEndEdit: () => void;
  onClick: (e: React.MouseEvent) => void;
  onToggleSelect: () => void;
  showField: (f: string) => boolean;
  dropIndicator: "before" | "after" | null;
  dragEnabled: boolean;
  today: string;
  canEdit: boolean;
  statuses: ViewProps["project"]["statuses"];
  members: ViewProps["project"]["members"];
  me: string;
  weekStartsOn: number;
  onUpdate: (patch: Record<string, unknown>, optimistic: (r: TaskRow) => TaskRow) => void;
  style: React.CSSProperties;
};

const ListRow = React.memo(function ListRow({ row, depth, hasChildren, expanded, onToggleExpand, selected, focused, editing, onStartEdit, onEndEdit, onClick, onToggleSelect, showField, dropIndicator, dragEnabled, today, canEdit, statuses, members, me, weekStartsOn, onUpdate, style }: RowProps) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: row.id, disabled: !dragEnabled });
  const { setNodeRef: setDropRef } = useDroppable({ id: row.id });
  const done = row.status.category === "done";
  const state = dueState(row.dueDate, done, today);
  const doneStatus = statuses.find((s) => s.category === "done");
  const firstOpen = statuses.find((s) => s.category !== "done") ?? statuses[0];

  return (
    <div
      ref={(el) => {
        setDropRef(el);
        setDragRef(el);
      }}
      style={style}
      role="row"
      aria-selected={selected}
      data-task-id={row.id}
      className={cn(
        "group flex items-center border-b border-border bg-surface px-3 hover:bg-hover",
        selected && "bg-selected hover:bg-selected",
        focused && "outline outline-1 -outline-offset-1 outline-brand",
        isDragging && "opacity-40",
        dropIndicator === "before" && "shadow-[inset_0_2px_0_0_var(--color-brand)]",
        dropIndicator === "after" && "shadow-[inset_0_-2px_0_0_var(--color-brand)]",
      )}
      onClick={onClick}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onStartEdit();
      }}
    >
      <span className="flex w-7 shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
        <button type="button" className={cn("invisible -ml-2 cursor-grab text-fg-tertiary group-hover:visible", !dragEnabled && "hidden")} aria-label="Drag to reorder" {...attributes} {...listeners}>
          <ReOrderDotsVertical16Regular />
        </button>
        <Checkbox
          round
          checked={done}
          aria-label={done ? "Mark incomplete" : "Mark complete"}
          disabled={!canEdit}
          onCheckedChange={() => {
            const next = done ? firstOpen : doneStatus;
            if (next) onUpdate({ statusId: next.id }, (r) => ({ ...r, status: next, completedAt: done ? null : new Date().toISOString() }));
          }}
        />
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-1" style={{ paddingLeft: depth * 20 }}>
        {hasChildren || row.subtaskCount > 0 ? (
          <button type="button" onClick={(e) => { e.stopPropagation(); onToggleExpand(); }} className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-xs text-fg-tertiary hover:bg-pressed" aria-label={expanded ? "Collapse subtasks" : "Expand subtasks"} aria-expanded={expanded}>
            <ChevronRight16Regular className={cn("transition-transform", expanded && "rotate-90")} />
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        {row.isMilestone ? <Diamond16Regular className="shrink-0 text-brand" aria-label="Milestone" /> : null}
        {editing ? (
          <input
            autoFocus
            defaultValue={row.title}
            aria-label="Task title"
            className="h-7 min-w-0 flex-1 rounded-sm border border-brand bg-surface px-1.5 type-body-1 outline-none"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                (e.target as HTMLInputElement).value = row.title;
                (e.target as HTMLInputElement).blur();
              }
            }}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== row.title) onUpdate({ title: v }, (r) => ({ ...r, title: v }));
              onEndEdit();
            }}
          />
        ) : (
          <span className={cn("truncate type-body-1", done && "text-fg-secondary line-through")}>{row.title}</span>
        )}
        <span className="ml-1 shrink-0 font-mono type-caption-1 text-fg-tertiary">{row.key}</span>
        {row.subtaskCount > 0 ? <span className="ml-1 shrink-0 type-caption-1 text-fg-tertiary">{row.subtaskDoneCount}/{row.subtaskCount}</span> : null}
        {row.commentCount > 0 ? <span className="ml-1 inline-flex shrink-0 items-center gap-0.5 type-caption-1 text-fg-tertiary"><Comment16Regular className="h-3 w-3" />{row.commentCount}</span> : null}
        {row.attachmentCount > 0 ? <span className="ml-1 inline-flex shrink-0 items-center gap-0.5 type-caption-1 text-fg-tertiary"><Attach16Regular className="h-3 w-3" />{row.attachmentCount}</span> : null}
        {row.blockedByCount > 0 ? <Badge color="red" className="ml-1">Blocked</Badge> : null}
      </span>
      {showField("status") ? (
        <span className="w-32 shrink-0" onClick={(e) => e.stopPropagation()}>
          <StatusPicker value={row.status} statuses={statuses} disabled={!canEdit} onChange={(id) => { const s = statuses.find((x) => x.id === id)!; onUpdate({ statusId: id }, (r) => ({ ...r, status: s, completedAt: s.category === "done" ? new Date().toISOString() : null })); }} />
        </span>
      ) : null}
      {showField("assignee") ? (
        <span className="w-36 shrink-0" onClick={(e) => e.stopPropagation()}>
          <PersonPicker value={row.assignee} people={members} me={me} disabled={!canEdit} onChange={(id) => onUpdate({ assigneeId: id }, (r) => ({ ...r, assignee: id ? (members.find((m) => m.id === id) ?? null) : null }))} />
        </span>
      ) : null}
      {showField("due_date") ? (
        <span className="w-28 shrink-0" onClick={(e) => e.stopPropagation()}>
          <DatePicker value={row.dueDate} label="Due date" state={state} compact disabled={!canEdit} minDate={row.startDate} weekStartsOn={weekStartsOn} onChange={(iso) => onUpdate({ dueDate: iso, ...(row.isMilestone ? { startDate: iso } : {}) }, (r) => ({ ...r, dueDate: iso }))} />
        </span>
      ) : null}
      {showField("start_date") ? (
        <span className="w-28 shrink-0" onClick={(e) => e.stopPropagation()}>
          <DatePicker value={row.startDate} label="Start date" compact disabled={!canEdit} weekStartsOn={weekStartsOn} onChange={(iso) => onUpdate({ startDate: iso }, (r) => ({ ...r, startDate: iso }))} />
        </span>
      ) : null}
      {showField("priority") ? (
        <span className="w-28 shrink-0" onClick={(e) => e.stopPropagation()}>
          <PriorityPicker value={row.priority} disabled={!canEdit} onChange={(p) => onUpdate({ priority: p }, (r) => ({ ...r, priority: p }))} />
        </span>
      ) : null}
      {showField("estimate") ? <span className="w-16 shrink-0 type-body-1 text-fg-secondary">{row.estimate ?? ""}</span> : null}
      {showField("tags") ? (
        <span className="flex w-40 shrink-0 gap-1 overflow-hidden">
          {row.tags.slice(0, 3).map((t) => (
            <Badge key={t.id} color={t.color}>
              {t.name}
            </Badge>
          ))}
        </span>
      ) : null}
      <span className="sr-only">{formatDue(row.dueDate, today)} {priorityMeta[row.priority].label}</span>
    </div>
  );
});
