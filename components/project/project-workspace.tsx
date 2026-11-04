"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MoreHorizontal20Regular, Info20Regular, Add20Regular, LockClosed16Regular, ArrowSync20Regular } from "@fluentui/react-icons";
import { AvatarGroup } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/misc";
import { CommandBar } from "./command-bar";
import { ProjectOverviewPane } from "./project-overview-pane";
import type { ProjectInfo, ViewProps } from "@/components/views/types";
import { viewOrder, viewMeta } from "@/components/views/view-registry";
import { ListView } from "@/components/views/list/list-view";
import { BoardViewOptions } from "@/components/views/board/board-options";
import { GanttViewOptions } from "@/components/views/gantt/gantt-options";
import { TimelineViewOptions } from "@/components/views/timeline/timeline-options";
import { CalendarViewOptions } from "@/components/views/calendar/calendar-options";
import { ArrowDownload16Regular } from "@fluentui/react-icons";
import { tableColumns, visibleTableColumns, rowsToCsv } from "@/lib/client/table";
import { useProjectTasks, type ProjectTasksData } from "@/lib/client/queries";
import { useProjectSpec } from "@/lib/client/spec-store";
import { useProjectRealtime } from "@/lib/client/realtime";
import { useWorkspace } from "@/lib/client/workspace-context";
import { useViewState } from "@/lib/client/view-state";
import { groupRows } from "@/lib/client/grouping";
import { saveViewAction, archiveProjectAction, deleteProjectAction, setDefaultViewAction } from "@/lib/actions/projects";
import type { ViewType } from "@/lib/db/schema";
import type { ViewSpec } from "@/lib/validation/view-spec";
import { cn } from "@/lib/utils";

const BoardView = React.lazy(() => import("@/components/views/board/board-view").then((m) => ({ default: m.BoardView })));
const TableView = React.lazy(() => import("@/components/views/table/table-view").then((m) => ({ default: m.TableView })));
const GanttView = React.lazy(() => import("@/components/views/gantt/gantt-view").then((m) => ({ default: m.GanttView })));
const TimelineView = React.lazy(() => import("@/components/views/timeline/timeline-view").then((m) => ({ default: m.TimelineView })));
const CalendarView = React.lazy(() => import("@/components/views/calendar/calendar-view").then((m) => ({ default: m.CalendarView })));

type Props = {
  project: ProjectInfo;
  viewType: ViewType;
  savedViewId: string | null;
  initialData: ProjectTasksData;
  initialSpec: ViewSpec;
  /** Dev preview only: serve these rows for every spec instead of querying the server. */
  staticData?: ProjectTasksData;
};

const healthMeta: Record<string, { label: string; color: string }> = {
  on_track: { label: "On track", color: "green" },
  at_risk: { label: "At risk", color: "orange" },
  off_track: { label: "Off track", color: "red" },
  on_hold: { label: "On hold", color: "gray" },
  complete: { label: "Complete", color: "blue" },
};

export function ProjectWorkspace({ project, viewType, savedViewId, initialData, initialSpec, staticData }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const { slug, today, members, user, workspace } = useWorkspace();
  const { toast } = useToast();
  const openTask = useViewState((s) => s.openTask);
  const savedView = savedViewId ? project.views.find((v) => v.id === savedViewId) ?? null : null;
  const { spec, setSpec, reset, shareUrl } = useProjectSpec(project.id, savedView?.spec ?? (params.get("spec") ? null : initialSpec));
  const tasks = useProjectTasks(project.id, spec, JSON.stringify(spec) === JSON.stringify(initialSpec) ? initialData : undefined, staticData);
  useProjectRealtime(project.id);
  const [overviewOpen, setOverviewOpen] = React.useState(false);
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [quickAddSignal, setQuickAddSignal] = React.useState(0);
  const canEdit = project.role === "owner" || project.role === "editor";
  const base = `/w/${slug}/projects/${project.key}`;

  // Deep link: ?task=KEY opens the pane.
  React.useEffect(() => {
    const t = params.get("task");
    if (t) openTask(t);
  }, [params, openTask]);

  // Keyboard: N adds a task, 1 to 8 switch views, ? opens help.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.toLowerCase() === "n" && canEdit) {
        e.preventDefault();
        setQuickAddSignal((v) => v + 1);
      }
      const idx = Number(e.key);
      if (idx >= 1 && idx <= 8) {
        const vt = viewOrder[idx - 1];
        if (viewMeta[vt].phase === 1) router.push(`${base}/${vt}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [base, router, canEdit]);

  const rows = React.useMemo(() => tasks.data?.rows ?? [], [tasks.data]);
  const dependencies = React.useMemo(() => tasks.data?.dependencies ?? [], [tasks.data]);
  const groupingCtx = React.useMemo(() => ({ sections: project.sections, statuses: project.statuses, members, fields: project.fields.map((f) => ({ id: f.id, name: f.name, type: f.type as never, config: f.config })), today }), [project, members, today]);
  const groups = React.useMemo(() => groupRows(rows, spec.groupBy ?? (viewType === "list" ? "section" : undefined), groupingCtx), [rows, spec.groupBy, viewType, groupingCtx]);

  const viewProps: ViewProps & { quickAddSignal: number } = { project, rows, dependencies, groups, spec, setSpec, isFetching: tasks.isFetching, canEdit, quickAddSignal };

  const share = async () => {
    await navigator.clipboard.writeText(shareUrl());
    toast({ title: "Link copied", kind: "success" });
  };

  const exportCsv = () => {
    const columns = visibleTableColumns(tableColumns(groupingCtx.fields, workspace.cycleLabel), spec.visibleFields);
    const csv = rowsToCsv(rows, columns, groupingCtx);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.key.toLowerCase()}-tasks-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: `Exported ${rows.length} tasks`, kind: "success" });
  };

  const projectMembers = members.filter((m) => project.members.some((pm) => pm.id === m.id));
  const latestHealth = null as null | string;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
        <span data-color={project.color} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-item-tint type-caption-1-strong text-item">
          {project.key.slice(0, 2)}
        </span>
        <h1 className="truncate type-subtitle-1 text-fg">{project.name}</h1>
        {project.privacy === "private" ? (
          <Tooltip content="Private project">
            <LockClosed16Regular className="text-fg-tertiary" />
          </Tooltip>
        ) : null}
        {latestHealth ? <Badge color={healthMeta[latestHealth].color}>{healthMeta[latestHealth].label}</Badge> : null}
        <Tooltip content="Project overview">
          <Button variant="subtle" size="icon" aria-label="Project overview" onClick={() => setOverviewOpen(true)}>
            <Info20Regular />
          </Button>
        </Tooltip>
        <Tooltip content={`${workspace.cycleLabel}s`}>
          <Button asChild variant="subtle" size="icon">
            <Link href={`${base}/cycles`} aria-label={`${workspace.cycleLabel}s`}>
              <ArrowSync20Regular />
            </Link>
          </Button>
        </Tooltip>
        <div className="flex-1" />
        <AvatarGroup people={projectMembers.length ? projectMembers : members} max={5} size="sm" />
        <Button variant="secondary" size="sm" onClick={share}>
          Share
        </Button>
        {project.role === "owner" ? (
          <Menu>
            <MenuTrigger asChild>
              <Button variant="subtle" size="icon" aria-label="Project actions">
                <MoreHorizontal20Regular />
              </Button>
            </MenuTrigger>
            <MenuContent align="end">
              <MenuItem onSelect={() => setOverviewOpen(true)}>Edit details</MenuItem>
              <MenuItem asChild>
                <Link href={`${base}/settings`}>Workflow and fields</Link>
              </MenuItem>
              <MenuItem asChild>
                <Link href={`${base}/cycles`}>{workspace.cycleLabel}s</Link>
              </MenuItem>
              <MenuItem onSelect={async () => { const res = await setDefaultViewAction(slug, project.id, savedViewId); if (res.ok) toast({ title: "Default view updated", kind: "success" }); router.refresh(); }}>Set current view as default</MenuItem>
              <MenuSeparator />
              <MenuItem onSelect={async () => { const res = await archiveProjectAction(slug, project.id, !project.archivedAt); if (res.ok) { toast({ title: project.archivedAt ? "Project restored" : "Project archived", kind: "success" }); router.refresh(); } }}>{project.archivedAt ? "Restore project" : "Archive project"}</MenuItem>
              <MenuItem destructive onSelect={async () => { if (!window.confirm(`Delete ${project.name} and all of its tasks?`)) return; const res = await deleteProjectAction(slug, project.id); if (res.ok) router.push(`/w/${slug}/home`); }}>Delete project</MenuItem>
            </MenuContent>
          </Menu>
        ) : null}
      </header>

      <nav aria-label="Views" className="flex h-10 shrink-0 items-end gap-0.5 border-b border-border bg-surface px-3">
        {viewOrder.map((vt) => {
          const meta = viewMeta[vt];
          const active = viewType === vt && !savedViewId;
          if (meta.phase === 2) {
            return (
              <Tooltip key={vt} content="Coming in the next release">
                <span className="inline-flex h-10 cursor-default items-center px-3 type-body-1 text-fg-disabled">{meta.label}</span>
              </Tooltip>
            );
          }
          return (
            <Link key={vt} href={`${base}/${vt}`} aria-current={active ? "page" : undefined} className={cn("relative -mb-px inline-flex h-10 items-center border-b-2 border-transparent px-3 type-body-1 text-fg-secondary hover:text-fg", active && "border-brand font-semibold text-fg")}>
              {meta.label}
            </Link>
          );
        })}
        {project.views.filter((v) => v.name !== "Default").length ? <span className="mx-1 mb-2 h-5 w-px bg-border" /> : null}
        {project.views
          .filter((v) => v.name !== "Default")
          .map((v) => {
            const active = savedViewId === v.id;
            return (
              <Link key={v.id} href={`${base}/views/${v.id}`} aria-current={active ? "page" : undefined} className={cn("relative -mb-px inline-flex h-10 items-center gap-1 border-b-2 border-transparent px-3 type-body-1 hover:text-fg", active ? "border-brand font-semibold text-fg" : v.isShared ? "text-fg-secondary" : "text-fg-tertiary")}>
                {v.name}
                {!v.isShared ? <span className="type-caption-2 text-fg-tertiary">personal</span> : null}
              </Link>
            );
          })}
        <Tooltip content="Save the current view">
          <button type="button" onClick={() => setSaveOpen(true)} className="mb-1 ml-1 inline-flex h-7 w-7 items-center justify-center rounded-sm text-fg-tertiary hover:bg-hover hover:text-fg" aria-label="Save view">
            <Add20Regular className="h-4 w-4" />
          </button>
        </Tooltip>
      </nav>

      <CommandBar
        project={project}
        spec={spec}
        setSpec={setSpec}
        onReset={reset}
        onQuickAdd={() => setQuickAddSignal((v) => v + 1)}
        onSaveView={() => setSaveOpen(true)}
        onShare={share}
        canEdit={canEdit}
        viewOptions={
          viewType === "board" ? (
            <BoardViewOptions project={project} spec={spec} setSpec={setSpec} />
          ) : viewType === "gantt" ? (
            <GanttViewOptions project={project} spec={spec} setSpec={setSpec} canEdit={canEdit} />
          ) : viewType === "timeline" ? (
            <TimelineViewOptions spec={spec} setSpec={setSpec} />
          ) : viewType === "calendar" ? (
            <CalendarViewOptions spec={spec} setSpec={setSpec} />
          ) : undefined
        }
        extraMenuItems={
          viewType === "table" ? (
            <MenuItem icon={<ArrowDownload16Regular />} onSelect={exportCsv}>
              Export CSV
            </MenuItem>
          ) : undefined
        }
      />

      <div className="relative min-h-0 flex-1 bg-canvas">
        {tasks.isError ? (
          <div className="p-6">
            <p className="type-body-1-strong">Could not load tasks.</p>
            <p className="type-body-1 text-fg-secondary">{(tasks.error as Error).message}</p>
          </div>
        ) : (
          <React.Suspense fallback={<ViewSkeleton />}>
            {viewType === "list" ? <ListView {...viewProps} /> : null}
            {viewType === "board" ? <BoardView {...viewProps} /> : null}
            {viewType === "table" ? <TableView {...viewProps} /> : null}
            {viewType === "gantt" ? <GanttView {...viewProps} /> : null}
            {viewType === "timeline" ? <TimelineView {...viewProps} /> : null}
            {viewType === "calendar" ? <CalendarView {...viewProps} /> : null}
          </React.Suspense>
        )}
        {tasks.data?.truncated ? <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-sm border border-border bg-surface-raised px-3 py-1 type-caption-1 text-fg-secondary shadow-menu">Showing the first 5,000 tasks. Add a filter to narrow the view.</div> : null}
      </div>

      <ProjectOverviewPane project={project} open={overviewOpen} onOpenChange={setOverviewOpen} />
      <SaveViewDialog open={saveOpen} onOpenChange={setSaveOpen} project={project} viewType={viewType} spec={spec} canShare={canEdit} ownerId={user.id} />
    </div>
  );
}

function ViewSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-9" />
      ))}
    </div>
  );
}

function SaveViewDialog({ open, onOpenChange, project, viewType, spec, canShare }: { open: boolean; onOpenChange: (o: boolean) => void; project: ProjectInfo; viewType: ViewType; spec: ViewSpec; canShare: boolean; ownerId: string }) {
  const router = useRouter();
  const { slug } = useWorkspace();
  const { toast } = useToast();
  const [name, setName] = React.useState("");
  const [shared, setShared] = React.useState(canShare);
  const [pending, setPending] = React.useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    const res = await saveViewAction(slug, { projectId: project.id, name, type: viewType, spec, isShared: canShare && shared });
    setPending(false);
    if (!res.ok) {
      toast({ title: "Could not save the view", description: res.error.message, kind: "danger" });
      return;
    }
    onOpenChange(false);
    setName("");
    toast({ title: `${res.data.name} saved`, kind: "success" });
    router.push(`/w/${slug}/projects/${project.key}/views/${res.data.id}`);
    router.refresh();
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Save view"
        description={`Saves the current ${viewMeta[viewType].label} layout with its filters, sort, grouping, and fields.`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="save-view" loading={pending} disabled={!name.trim()}>
              Save view
            </Button>
          </>
        }
      >
        <form id="save-view" onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Name">
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="My open tasks" maxLength={80} required />
          </Field>
          {canShare ? (
            <label className="flex items-center gap-2 type-body-1">
              <Checkbox checked={shared} onCheckedChange={(v) => setShared(Boolean(v))} />
              Share with everyone on the project
            </label>
          ) : (
            <p className="type-caption-1 text-fg-secondary">This view will be personal to you.</p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
