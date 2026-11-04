"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, useDraggable, useDroppable, pointerWithin, type DragEndEvent, type DragOverEvent, type DragStartEvent } from "@dnd-kit/core";
import { Add20Regular, ChevronDown16Regular, ArrowLeft16Regular, Diamond16Regular } from "@fluentui/react-icons";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "@/components/ui/menu";
import { EmptyState, ProgressBar } from "@/components/ui/misc";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { BoardView } from "@/components/views/board/board-view";
import type { ProjectInfo, ViewProps } from "@/components/views/types";
import type { TaskRow, DependencyRow } from "@/lib/query-engine/types";
import type { CycleSummary } from "@/lib/services/cycles";
import { computeBurndown, computeVelocity, cycleProgress, cycleStatus, daysRemaining, defaultCycle, nextCycle, type Burndown, type CycleEvent, type CycleRef, type VelocityPoint } from "@/lib/client/cycles";
import { useProjectTasks, useTaskMutations, type ProjectTasksData } from "@/lib/client/queries";
import { useViewState } from "@/lib/client/view-state";
import { useWorkspace } from "@/lib/client/workspace-context";
import { call } from "@/lib/client/actions";
import { createCycleAction, closeCycleAction } from "@/lib/actions/projects";
import { listCyclesAction, cycleBurndownAction, projectVelocityAction, updateCycleAction, planTasksAction } from "@/lib/actions/cycles";
import { defaultViewSpec, type ViewSpec } from "@/lib/validation/view-spec";
import { formatDateShort } from "@/lib/client/dates";
import { BurndownChart, VelocityChart } from "./cycle-charts";
import { cn } from "@/lib/utils";

type Tab = "backlog" | "active" | "burndown" | "history";
type Props = {
  project: ProjectInfo;
  cycles: CycleSummary[];
  initialData: ProjectTasksData;
  /** Dev preview: serve these rows for every spec and compute charts from these events client side. */
  staticData?: ProjectTasksData;
  staticEvents?: CycleEvent[];
};

const tasksSpec: ViewSpec = { ...defaultViewSpec(), showCompleted: "all", subtasks: "flat", sorts: [{ field: "manual", direction: "asc" }] };

const statusMeta = { active: { label: "Active", color: "green" }, upcoming: { label: "Upcoming", color: "navy" }, overdue: { label: "Past end date", color: "orange" }, closed: { label: "Closed", color: "gray" } } as const;

/** Cycles (docs/10 section 16): header with the active cycle, then Backlog, Active, Burndown, and History tabs. */
export function CyclesPage({ project, cycles: initialCycles, initialData, staticData, staticEvents }: Props) {
  const { slug, today, workspace } = useWorkspace();
  const router = useRouter();
  const { toast } = useToast();
  const label = workspace.cycleLabel;
  const canManage = project.role === "owner" || project.role === "editor";

  const cyclesQuery = useQuery({
    queryKey: ["cycles", slug, project.id],
    queryFn: async () => {
      if (staticData) return initialCycles;
      const res = await call(listCyclesAction(slug, project.id));
      if (!res.ok) throw new Error(res.error.message);
      return res.data;
    },
    initialData: initialCycles,
    staleTime: 15_000,
  });
  const cycles = cyclesQuery.data ?? initialCycles;
  const [selectedId, setSelectedId] = React.useState<string | null>(() => defaultCycle(initialCycles, today)?.id ?? null);
  const cycle = cycles.find((c) => c.id === selectedId) ?? defaultCycle(cycles, today);
  const [tab, setTab] = React.useState<Tab>("backlog");
  const [dialog, setDialog] = React.useState<"new" | "edit" | "close" | null>(null);

  const tasks = useProjectTasks(project.id, tasksSpec, initialData, staticData);
  const rows = React.useMemo(() => tasks.data?.rows ?? [], [tasks.data]);
  const dependencies = React.useMemo(() => tasks.data?.dependencies ?? [], [tasks.data]);
  const progress = cycle ? cycleProgress(rows.map((r) => ({ id: r.id, estimate: r.estimate, cycleId: r.cycleId, completedAt: r.completedAt, createdAt: r.createdAt })), cycle.id) : null;
  const status = cycle ? cycleStatus(cycle, today) : null;
  const unitLabel = (unit: Burndown["unit"]) => (unit === "tasks" ? "tasks" : workspace.estimateUnit === "hours" ? "h" : "pts");

  const refresh = () => {
    cyclesQuery.refetch();
    tasks.refetch();
    router.refresh();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
        <Link href={`/w/${slug}/projects/${project.key}`} className="inline-flex items-center gap-1 type-caption-1-strong text-brand hover:underline">
          <ArrowLeft16Regular /> {project.name}
        </Link>
        <h1 className="type-subtitle-1">{label}s</h1>
        <div className="flex-1" />
        {cycles.length > 1 ? (
          <Menu>
            <MenuTrigger asChild>
              <Button variant="secondary" size="sm" aria-label={`Choose ${label.toLowerCase()}`}>
                {cycle?.name ?? `Choose ${label.toLowerCase()}`} <ChevronDown16Regular />
              </Button>
            </MenuTrigger>
            <MenuContent align="end" className="w-64">
              <MenuRadioGroup value={cycle?.id ?? ""} onValueChange={setSelectedId}>
                {[...cycles].sort((a, b) => b.startDate.localeCompare(a.startDate)).map((c) => (
                  <MenuRadioItem key={c.id} value={c.id}>
                    <span className="flex-1 truncate">{c.name}</span>
                    <Badge color={statusMeta[cycleStatus(c, today)].color} className="ml-2">{statusMeta[cycleStatus(c, today)].label}</Badge>
                  </MenuRadioItem>
                ))}
              </MenuRadioGroup>
            </MenuContent>
          </Menu>
        ) : null}
        {canManage ? (
          <Button variant="primary" size="sm" onClick={() => setDialog("new")}>
            <Add20Regular className="h-4 w-4" /> New {label.toLowerCase()}
          </Button>
        ) : null}
      </header>

      {cycle && progress && status ? (
        <section className="shrink-0 border-b border-border bg-surface px-4 py-3" aria-label={`${cycle.name} summary`}>
          <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="type-subtitle-2">{cycle.name}</h2>
                <Badge color={statusMeta[status].color}>{statusMeta[status].label}</Badge>
              </div>
              <p className="type-caption-1 text-fg-secondary">
                {formatDateShort(cycle.startDate)} to {formatDateShort(cycle.endDate)}
                {status === "active" ? ` · ${daysRemaining(cycle, today)} ${daysRemaining(cycle, today) === 1 ? "day" : "days"} remaining` : ""}
              </p>
              <p className="mt-1 max-w-xl type-body-1">{cycle.goal ?? <span className="text-fg-tertiary">No goal yet</span>}</p>
            </div>
            <div className="min-w-56 flex-1">
              <div className="flex items-baseline justify-between">
                <span className="type-caption-1-strong text-fg-secondary">Capacity</span>
                <span className="type-caption-1 text-fg-secondary">
                  {progress.committed} of {cycle.capacity ?? "no limit"} {unitLabel(progress.unit)} committed
                </span>
              </div>
              <ProgressBar value={progress.committed} max={cycle.capacity ?? Math.max(progress.committed, 1)} className="mt-1" color={cycle.capacity && progress.committed > cycle.capacity ? "red" : undefined} />
              <div className="mt-2 flex items-baseline justify-between">
                <span className="type-caption-1-strong text-fg-secondary">Done</span>
                <span className="type-caption-1 text-fg-secondary">
                  {progress.doneCount} of {progress.count} tasks, {progress.completed} {unitLabel(progress.unit)}
                </span>
              </div>
              <ProgressBar value={progress.completed} max={Math.max(progress.committed, 1)} className="mt-1" color="green" />
            </div>
            {canManage ? (
              <div className="flex items-center gap-2">
                <Button variant="subtle" size="sm" onClick={() => setDialog("edit")}>
                  Edit
                </Button>
                {!cycle.closedAt ? (
                  <Button variant="secondary" size="sm" onClick={() => setDialog("close")}>
                    Close {label.toLowerCase()}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="shrink-0 border-b border-border bg-surface px-4 py-3">
          <p className="type-body-1-strong">No {label.toLowerCase()}s yet</p>
          <p className="type-body-1 text-fg-secondary">Create the first {label.toLowerCase()} to plan from the backlog and track a burndown.</p>
        </section>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="shrink-0 bg-surface px-3">
          <TabsTrigger value="backlog">Backlog</TabsTrigger>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="burndown">Burndown</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <div className="min-h-0 flex-1">
          {tab === "backlog" ? <BacklogPlanner project={project} cycle={cycle} rows={rows} canEdit={canManage} onChanged={refresh} /> : null}
          {tab === "active" ? <ActiveBoard project={project} cycle={cycle} rows={rows} dependencies={dependencies} canEdit={canManage} isFetching={tasks.isFetching} /> : null}
          {tab === "burndown" ? <BurndownTab project={project} cycle={cycle} rows={rows} staticEvents={staticEvents} unitLabel={unitLabel} /> : null}
          {tab === "history" ? <HistoryTab project={project} cycles={cycles} rows={rows} staticEvents={staticEvents} unitLabel={unitLabel} onSelect={(id) => { setSelectedId(id); setTab("burndown"); }} /> : null}
        </div>
      </Tabs>

      {dialog === "new" || (dialog === "edit" && cycle) ? (
        <CycleDialog
          label={label}
          cycle={dialog === "edit" ? cycle : null}
          unit={workspace.estimateUnit}
          onClose={() => setDialog(null)}
          onSubmit={async (values) => {
            const res = dialog === "edit" && cycle ? await call(updateCycleAction(slug, { id: cycle.id, ...values })) : await call(createCycleAction(slug, { projectId: project.id, ...values }));
            if (!res.ok) {
              toast({ title: dialog === "edit" ? `Could not save the ${label.toLowerCase()}` : `Could not create the ${label.toLowerCase()}`, description: res.error.details?.[0]?.message ?? res.error.message, kind: "danger" });
              return false;
            }
            toast({ title: dialog === "edit" ? `${values.name} saved` : `${values.name} created`, kind: "success" });
            if (dialog === "new") setSelectedId(res.data.id);
            refresh();
            return true;
          }}
        />
      ) : null}
      {dialog === "close" && cycle ? (
        <CloseCycleDialog
          label={label}
          cycle={cycle}
          next={nextCycle(cycles, cycle)}
          openCount={rows.filter((r) => r.cycleId === cycle.id && !r.completedAt).length}
          onClose={() => setDialog(null)}
          onConfirm={async (moveTo) => {
            const res = await call(closeCycleAction(slug, cycle.id, moveTo));
            if (!res.ok) {
              toast({ title: `Could not close the ${label.toLowerCase()}`, description: res.error.message, kind: "danger" });
              return false;
            }
            toast({ title: `${cycle.name} closed`, kind: "success" });
            refresh();
            return true;
          }}
        />
      ) : null}
    </div>
  );
}

/* Backlog: drag between the backlog and the cycle column, reorder within the backlog, select many and plan at once. */
function BacklogPlanner({ project, cycle, rows, canEdit, onChanged }: { project: ProjectInfo; cycle: CycleRef | null; rows: TaskRow[]; canEdit: boolean; onChanged: () => void }) {
  const { slug, workspace } = useWorkspace();
  const { update, move } = useTaskMutations();
  const { toast } = useToast();
  const openTask = useViewState((s) => s.openTask);
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [dragging, setDragging] = React.useState<TaskRow | null>(null);
  const [over, setOver] = React.useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const backlog = React.useMemo(() => rows.filter((r) => !r.cycleId && !r.completedAt).sort((a, b) => a.position - b.position), [rows]);
  const planned = React.useMemo(() => (cycle ? rows.filter((r) => r.cycleId === cycle.id).sort((a, b) => a.position - b.position) : []), [rows, cycle]);
  const unit = workspace.estimateUnit === "hours" ? "h" : "pts";
  const sum = (list: TaskRow[]) => list.reduce((n, r) => n + (r.estimate ?? 0), 0);

  const setCycle = (task: TaskRow, cycleId: string | null) => {
    if (task.cycleId === cycleId) return;
    update.mutate({ id: task.id, cycleId, optimistic: (r: TaskRow) => ({ ...r, cycleId }) });
  };
  const planSelected = async (cycleId: string | null) => {
    const ids = [...selected];
    if (ids.length === 0) return;
    const res = await call(planTasksAction(slug, { projectId: project.id, taskIds: ids, cycleId }));
    if (!res.ok) {
      toast({ title: "Could not move the tasks", description: res.error.message, kind: "danger" });
      return;
    }
    toast({ title: `${res.data.count} ${res.data.count === 1 ? "task" : "tasks"} ${cycleId ? "added to the " + (cycle?.name ?? "cycle") : "moved to the backlog"}`, kind: "success" });
    setSelected(new Set());
    onChanged();
  };

  const onDragStart = (e: DragStartEvent) => setDragging(rows.find((r) => r.id === e.active.id) ?? null);
  const onDragOver = (e: DragOverEvent) => setOver(e.over ? String(e.over.id) : null);
  const onDragEnd = (e: DragEndEvent) => {
    const task = dragging;
    const target = e.over ? String(e.over.id) : null;
    setDragging(null);
    setOver(null);
    if (!task || !target) return;
    if (target === "col:cycle") {
      if (cycle) setCycle(task, cycle.id);
      return;
    }
    if (target === "col:backlog") {
      setCycle(task, null);
      return;
    }
    if (target.startsWith("row:")) {
      const overId = target.slice(4);
      const overTask = rows.find((r) => r.id === overId);
      if (!overTask || overTask.id === task.id) return;
      const list = overTask.cycleId ? planned : backlog;
      if (overTask.cycleId !== task.cycleId) {
        setCycle(task, overTask.cycleId);
        return;
      }
      const others = list.filter((r) => r.id !== task.id);
      const idx = others.findIndex((r) => r.id === overTask.id);
      const before = others[idx - 1] ?? null;
      move.mutate({ id: task.id, sectionId: task.sectionId, beforeId: before?.id ?? null, afterId: overTask.id, optimistic: (r: TaskRow) => ({ ...r, position: before ? (before.position + overTask.position) / 2 : overTask.position - 1 }) });
    }
  };

  const column = (key: "backlog" | "cycle", title: string, list: TaskRow[], footer: React.ReactNode) => (
    <Column id={`col:${key}`} title={title} count={list.length} isOver={over === `col:${key}`} footer={footer} action={key === "backlog" && cycle && canEdit && selected.size > 0 && [...selected].some((id) => backlog.some((r) => r.id === id)) ? <Button variant="primary" size="sm" onClick={() => planSelected(cycle.id)}>Add {selected.size} to {cycle.name}</Button> : key === "cycle" && canEdit && selected.size > 0 && [...selected].some((id) => planned.some((r) => r.id === id)) ? <Button variant="secondary" size="sm" onClick={() => planSelected(null)}>Move {selected.size} to backlog</Button> : null}>
      {list.length === 0 ? <p className="px-3 py-6 type-body-1 text-fg-tertiary">{key === "backlog" ? "The backlog is empty. Every open task is planned." : `Drag tasks here to plan the ${cycle?.name ?? "cycle"}.`}</p> : null}
      {list.map((r) => (
        <PlannerRow key={r.id} task={r} canEdit={canEdit} selected={selected.has(r.id)} isOver={over === `row:${r.id}`} ghost={dragging?.id === r.id} unit={unit} onToggle={() => setSelected((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} onOpen={() => openTask(r.id)} />
      ))}
    </Column>
  );

  return (
    <DndContext id="backlog-dnd" sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => { setDragging(null); setOver(null); }}>
      <div className="grid h-full min-h-0 grid-cols-1 gap-4 overflow-y-auto p-4 md:grid-cols-2">
        {column("backlog", "Backlog", backlog, <span>{backlog.length} tasks, {sum(backlog)} {unit}</span>)}
        {cycle ? column("cycle", cycle.name, planned, <span>{planned.length} tasks, {sum(planned)} of {cycle.capacity ?? "no limit"} {unit}</span>) : <div className="rounded-md border border-dashed border-border-strong p-6 type-body-1 text-fg-secondary">Create a cycle to plan into it.</div>}
      </div>
      <DragOverlay dropAnimation={null}>
        {dragging ? (
          <div className="flex h-9 w-80 items-center gap-2 rounded-sm border border-border bg-surface-raised px-3 opacity-95 shadow-menu">
            <span className="font-mono type-caption-1 text-fg-tertiary">{dragging.key}</span>
            <span className="truncate type-body-1">{dragging.title}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({ id, title, count, isOver, footer, action, children }: { id: string; title: string; count: number; isOver: boolean; footer: React.ReactNode; action: React.ReactNode; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <section ref={setNodeRef} aria-label={title} className={cn("flex min-h-64 flex-col rounded-md border border-border bg-surface", isOver && "border-brand")}>
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <h3 className="type-body-1-strong">{title}</h3>
        <span className="type-caption-1 text-fg-tertiary">{count}</span>
        <div className="flex-1" />
        {action}
      </div>
      <div role="list" className="flex-1">
        {children}
      </div>
      <div className="flex h-8 shrink-0 items-center border-t border-border px-3 type-caption-1 text-fg-secondary">{footer}</div>
    </section>
  );
}

function PlannerRow({ task, canEdit, selected, isOver, ghost, unit, onToggle, onOpen }: { task: TaskRow; canEdit: boolean; selected: boolean; isOver: boolean; ghost: boolean; unit: string; onToggle: () => void; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef: setDragRef } = useDraggable({ id: task.id, disabled: !canEdit });
  const { setNodeRef: setDropRef } = useDroppable({ id: `row:${task.id}` });
  const { role: _r, ...rest } = attributes;
  void _r;
  return (
    <div
      ref={(el) => {
        setDragRef(el);
        setDropRef(el);
      }}
      {...rest}
      {...listeners}
      role="listitem"
      data-task-id={task.id}
      className={cn("flex h-9 items-center gap-2 border-b border-border px-3 hover:bg-hover", selected && "bg-selected", ghost && "opacity-40", isOver && "shadow-[inset_0_2px_0_0_var(--color-brand)]", canEdit && "cursor-grab")}
    >
      <span onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={selected} onCheckedChange={onToggle} aria-label={`Select ${task.key}`} />
      </span>
      {task.isMilestone ? <Diamond16Regular className="shrink-0 text-brand" aria-label="Milestone" /> : null}
      <button type="button" className={cn("min-w-0 flex-1 truncate text-left type-body-1 hover:underline", task.completedAt && "text-fg-secondary line-through")} onClick={onOpen}>
        {task.title}
      </button>
      <span className="font-mono type-caption-1 text-fg-tertiary">{task.key}</span>
      <Badge color={task.status.color} dot className="hidden lg:inline-flex">{task.status.name}</Badge>
      <span className="w-12 text-right type-caption-1 text-fg-secondary">{task.estimate != null ? `${task.estimate} ${unit}` : ""}</span>
      {task.assignee ? <Avatar name={task.assignee.displayName} src={task.assignee.avatarUrl} size="xs" /> : <span className="w-5" />}
    </div>
  );
}

/* Active: the Board filtered to the cycle. */
function ActiveBoard({ project, cycle, rows, dependencies, canEdit, isFetching }: { project: ProjectInfo; cycle: CycleRef | null; rows: TaskRow[]; dependencies: DependencyRow[]; canEdit: boolean; isFetching: boolean }) {
  const [spec, setSpec] = React.useState<ViewSpec>(() => ({ ...defaultViewSpec(), filters: { kind: "group", op: "and", items: cycle ? [{ kind: "filter", field: "cycle", op: "is_any_of", value: [cycle.id] }] : [] } }));
  const inCycle = React.useMemo(() => (cycle ? rows.filter((r) => r.cycleId === cycle.id) : []), [rows, cycle]);
  const viewProps: ViewProps = { project, rows: inCycle, dependencies, groups: [{ key: "all", label: "All tasks", rows: inCycle }], spec, setSpec: (updater) => setSpec((prev) => updater(prev)), isFetching, canEdit };
  if (!cycle) return <EmptyState title="No cycle selected" description="Create a cycle to see its board." />;
  return (
    <div className="relative h-full bg-canvas">
      <BoardView {...viewProps} />
    </div>
  );
}

/* Burndown: scope, remaining, and the ideal line for the selected cycle. */
function BurndownTab({ project, cycle, rows, staticEvents, unitLabel }: { project: ProjectInfo; cycle: CycleRef | null; rows: TaskRow[]; staticEvents?: CycleEvent[]; unitLabel: (u: Burndown["unit"]) => string }) {
  const { slug, today } = useWorkspace();
  const query = useQuery({
    queryKey: ["burndown", slug, cycle?.id ?? "", today],
    queryFn: async () => {
      if (!cycle) return null;
      if (staticEvents) return computeBurndown(cycle, rows.map((r) => ({ id: r.id, estimate: r.estimate, cycleId: r.cycleId, completedAt: r.completedAt, createdAt: r.createdAt })), staticEvents, today);
      const res = await call(cycleBurndownAction(slug, cycle.id, today));
      if (!res.ok) throw new Error(res.error.message);
      return res.data;
    },
    enabled: Boolean(cycle),
    staleTime: 30_000,
  });
  if (!cycle) return <EmptyState title="No cycle selected" description="Create a cycle to see its burndown." />;
  if (query.isError) return <EmptyState title="The burndown could not be loaded" description={(query.error as Error).message} />;
  const data = query.data;
  const latest = data ? [...data.points].reverse().find((p) => !p.future) : null;
  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Scope" value={latest ? `${latest.scope} ${unitLabel(data!.unit)}` : ""} />
        <Stat label="Remaining" value={latest ? `${latest.remaining} ${unitLabel(data!.unit)}` : ""} />
        <Stat label="Done" value={latest && latest.scope > 0 ? `${Math.round(((latest.scope - latest.remaining) / latest.scope) * 100)}%` : "0%"} />
      </div>
      <div className="rounded-md border border-border bg-surface p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="type-subtitle-2">{cycle.name} burndown</h3>
          <span className="type-caption-1 text-fg-secondary">{project.name}</span>
        </div>
        {data ? <BurndownChart data={data} today={today} unitLabel={unitLabel(data.unit)} /> : <div className="h-72 animate-pulse rounded-sm bg-hover" />}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-surface px-4 py-3">
      <p className="type-caption-1-strong text-fg-secondary">{label}</p>
      <p className="type-title-3 text-fg">{value || "0"}</p>
    </div>
  );
}

/* History: velocity across closed cycles and a table of past cycles. */
function HistoryTab({ project, cycles, rows, staticEvents, unitLabel, onSelect }: { project: ProjectInfo; cycles: CycleSummary[]; rows: TaskRow[]; staticEvents?: CycleEvent[]; unitLabel: (u: Burndown["unit"]) => string; onSelect: (id: string) => void }) {
  const { slug } = useWorkspace();
  const query = useQuery({
    queryKey: ["velocity", slug, project.id],
    queryFn: async () => {
      if (staticEvents) return computeVelocity(cycles, rows.map((r) => ({ id: r.id, estimate: r.estimate, cycleId: r.cycleId, completedAt: r.completedAt, createdAt: r.createdAt })), staticEvents);
      const res = await call(projectVelocityAction(slug, project.id));
      if (!res.ok) throw new Error(res.error.message);
      return res.data;
    },
    staleTime: 30_000,
  });
  const past = cycles.filter((c) => c.closedAt).sort((a, b) => b.endDate.localeCompare(a.endDate));
  const points: VelocityPoint[] = query.data?.points ?? [];
  const average = points.length ? Math.round((points.reduce((n, p) => n + p.completed, 0) / points.length) * 10) / 10 : 0;
  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mb-4 rounded-md border border-border bg-surface p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="type-subtitle-2">Velocity</h3>
          <span className="type-caption-1 text-fg-secondary">{points.length ? `Average ${average} ${unitLabel(query.data!.unit)} per cycle` : "Closes a cycle to start the history"}</span>
        </div>
        {query.data && points.length ? <VelocityChart points={points} unitLabel={unitLabel(query.data.unit)} /> : <p className="py-8 type-body-1 text-fg-secondary">No closed cycles yet.</p>}
      </div>
      <div className="overflow-x-auto rounded-md border border-border bg-surface" role="table" aria-label="Past cycles">
        <div role="row" className="flex h-8 min-w-[560px] items-center gap-3 border-b border-border bg-subtle px-4 type-caption-1-strong text-fg-secondary">
          <span className="min-w-0 flex-1" role="columnheader">Cycle</span>
          <span className="w-40" role="columnheader">Dates</span>
          <span className="w-24 text-right" role="columnheader">Committed</span>
          <span className="w-24 text-right" role="columnheader">Completed</span>
          <span className="w-16 text-right" role="columnheader">Done</span>
        </div>
        {past.length === 0 ? <p className="p-4 type-body-1 text-fg-secondary">No past cycles.</p> : null}
        {past.map((c) => {
          const v = points.find((p) => p.cycleId === c.id);
          const committed = v?.committed ?? c.committed;
          const completed = v?.completed ?? c.completed;
          return (
            <div key={c.id} role="row" className="flex h-10 min-w-[560px] items-center gap-3 border-b border-border px-4 last:border-b-0 hover:bg-hover">
              <button type="button" className="min-w-0 flex-1 truncate text-left type-body-1-strong hover:underline" onClick={() => onSelect(c.id)} role="cell">
                {c.name}
              </button>
              <span className="w-40 type-caption-1 text-fg-secondary" role="cell">{formatDateShort(c.startDate)} to {formatDateShort(c.endDate)}</span>
              <span className="w-24 text-right type-body-1" role="cell">{committed}</span>
              <span className="w-24 text-right type-body-1" role="cell">{completed}</span>
              <span className="w-16 text-right type-body-1" role="cell">{committed ? `${Math.round((completed / committed) * 100)}%` : ""}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CycleDialog({ label, cycle, unit, onClose, onSubmit }: { label: string; cycle: CycleRef | null; unit: "points" | "hours"; onClose: () => void; onSubmit: (values: { name: string; goal: string | null; startDate: string; endDate: string; capacity: number | null }) => Promise<boolean> }) {
  const { today } = useWorkspace();
  const [name, setName] = React.useState(cycle?.name ?? "");
  const [goal, setGoal] = React.useState(cycle?.goal ?? "");
  const [startDate, setStartDate] = React.useState(cycle?.startDate ?? today);
  const [endDate, setEndDate] = React.useState(cycle?.endDate ?? "");
  const [capacity, setCapacity] = React.useState(cycle?.capacity != null ? String(cycle.capacity) : "");
  const [pending, setPending] = React.useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    const ok = await onSubmit({ name: name.trim(), goal: goal.trim() || null, startDate, endDate, capacity: capacity.trim() === "" ? null : Number(capacity) });
    setPending(false);
    if (ok) onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={cycle ? `Edit ${label.toLowerCase()}` : `New ${label.toLowerCase()}`} description={cycle ? undefined : `A ${label.toLowerCase()} has a start, an end, a goal, and a capacity.`} size="sm" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="cycle-form" loading={pending} disabled={!name.trim() || !startDate || !endDate || endDate < startDate}>{cycle ? "Save" : `Create ${label.toLowerCase()}`}</Button></>}>
        <form id="cycle-form" onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Name">
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={`${label} 1`} maxLength={80} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            </Field>
            <Field label="End" error={endDate && endDate < startDate ? "Must be after the start date" : undefined}>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
            </Field>
          </div>
          <Field label="Goal" hint="One sentence the team can rally around.">
            <Textarea value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={2000} className="min-h-16" />
          </Field>
          <Field label={`Capacity (${unit})`} hint="Leave empty for no limit.">
            <Input type="number" min={0} value={capacity} onChange={(e) => setCapacity(e.target.value)} className="w-32" />
          </Field>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CloseCycleDialog({ label, cycle, next, openCount, onClose, onConfirm }: { label: string; cycle: CycleRef; next: CycleRef | null; openCount: number; onClose: () => void; onConfirm: (moveTo: "backlog" | "next") => Promise<boolean> }) {
  const [moveTo, setMoveTo] = React.useState<"backlog" | "next">(next ? "next" : "backlog");
  const [pending, setPending] = React.useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Close ${cycle.name}`} description={openCount ? `${openCount} ${openCount === 1 ? "task is" : "tasks are"} not done. Choose where they go.` : `Every task is done. The ${label.toLowerCase()} moves to the history.`} size="sm" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" loading={pending} onClick={async () => { setPending(true); const ok = await onConfirm(moveTo); setPending(false); if (ok) onClose(); }}>Close {label.toLowerCase()}</Button></>}>
        {openCount ? (
          <div className="flex flex-col gap-2" role="radiogroup" aria-label="Move incomplete tasks">
            {next ? (
              <label className={cn("flex cursor-pointer items-start gap-3 rounded-sm border border-border p-3", moveTo === "next" && "border-brand bg-selected")}>
                <input type="radio" name="move-to" checked={moveTo === "next"} onChange={() => setMoveTo("next")} className="mt-1" />
                <span>
                  <span className="block type-body-1-strong">Move to {next.name}</span>
                  <span className="block type-caption-1 text-fg-secondary">Starts {formatDateShort(next.startDate)}.</span>
                </span>
              </label>
            ) : null}
            <label className={cn("flex cursor-pointer items-start gap-3 rounded-sm border border-border p-3", moveTo === "backlog" && "border-brand bg-selected")}>
              <input type="radio" name="move-to" checked={moveTo === "backlog"} onChange={() => setMoveTo("backlog")} className="mt-1" />
              <span>
                <span className="block type-body-1-strong">Back to the backlog</span>
                <span className="block type-caption-1 text-fg-secondary">Plan them into a later {label.toLowerCase()}.</span>
              </span>
            </label>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
