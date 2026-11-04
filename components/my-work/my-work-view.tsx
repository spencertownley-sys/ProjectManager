"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Add20Regular, ChevronRight16Regular, Comment16Regular, Diamond16Regular } from "@fluentui/react-icons";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { PageHeader } from "@/components/shell/page-header";
import { DatePicker, PriorityPicker } from "@/components/task/field-editors";
import { useMyWork, useTaskMutations, keys, type MyWorkData } from "@/lib/client/queries";
import { useViewState } from "@/lib/client/view-state";
import { useWorkspace } from "@/lib/client/workspace-context";
import { groupRows } from "@/lib/client/grouping";
import { dueState, formatDue } from "@/lib/client/dates";
import { defaultViewSpec, type ViewSpec } from "@/lib/validation/view-spec";
import { setTaskCompletedAction } from "@/lib/actions/tasks";
import type { TaskRow } from "@/lib/query-engine/types";
import { cn } from "@/lib/utils";

type Mode = "assigned" | "created" | "following";

const baseSpec: ViewSpec = { ...defaultViewSpec(), showCompleted: "none", subtasks: "flat", sorts: [{ field: "due_date", direction: "asc" }] };

export function MyWorkView({ initialData }: { initialData: MyWorkData }) {
  const { slug, today, members, user, workspace } = useWorkspace();
  const [mode, setMode] = React.useState<Mode>("assigned");
  const [showDone, setShowDone] = React.useState(false);
  const spec = React.useMemo<ViewSpec>(() => ({ ...baseSpec, showCompleted: showDone ? "recent" : "none" }), [showDone]);
  const query = useMyWork(spec, mode, mode === "assigned" && !showDone ? initialData : undefined);
  const { update } = useTaskMutations();
  const client = useQueryClient();
  const { toast } = useToast();
  const openTask = useViewState((s) => s.openTask);
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
  const rows = React.useMemo(() => query.data?.rows ?? [], [query.data]);
  const groups = React.useMemo(() => groupRows(rows, "due_date", { sections: [], statuses: [], members, fields: [], today }), [rows, members, today]);

  const complete = async (row: TaskRow, done: boolean) => {
    client.setQueriesData<{ rows: TaskRow[] }>({ queryKey: keys.allTasks(slug) }, (old) => (old && Array.isArray(old.rows) ? { ...old, rows: old.rows.map((r) => (r.id === row.id ? { ...r, completedAt: done ? new Date().toISOString() : null, status: { ...r.status, category: done ? "done" : "in_progress" } } : r)) } : old));
    const res = await setTaskCompletedAction(slug, row.id, done);
    if (!res.ok) toast({ title: "Could not update the task", description: res.error.message, kind: "danger" });
    client.invalidateQueries({ queryKey: keys.allTasks(slug) });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="My work"
        actions={
          <Button variant="primary" size="sm" onClick={() => openTask("new")}>
            <Add20Regular className="h-4 w-4" /> Add task
          </Button>
        }
      >
        <div className="flex items-end justify-between">
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList className="border-b-0">
              <TabsTrigger value="assigned">Assigned to me</TabsTrigger>
              <TabsTrigger value="created">Created by me</TabsTrigger>
              <TabsTrigger value="following">Following</TabsTrigger>
            </TabsList>
          </Tabs>
          <label className="mb-2 flex items-center gap-2 type-caption-1 text-fg-secondary">
            <Checkbox checked={showDone} onCheckedChange={(v) => setShowDone(Boolean(v))} /> Show recently completed
          </label>
        </div>
      </PageHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {query.isLoading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-9" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title={mode === "assigned" ? "Nothing is assigned to you" : mode === "created" ? "You have not created any open tasks" : "You are not following any open tasks"} description="Tasks appear here as soon as they are assigned to you or you start following them." action={<Button variant="primary" size="sm" onClick={() => openTask("new")}>Add task</Button>} />
        ) : (
          groups.map((g) => (
            <section key={g.key}>
              <button type="button" onClick={() => setCollapsed((s) => { const n = new Set(s); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })} className="flex h-9 w-full items-center gap-2 border-b border-border bg-subtle px-4 text-left" aria-expanded={!collapsed.has(g.key)}>
                <ChevronRight16Regular className={cn("text-fg-secondary transition-transform", !collapsed.has(g.key) && "rotate-90")} />
                <span className={cn("type-body-1-strong", g.key === "overdue" && "text-danger")}>{g.label}</span>
                <span className="type-caption-1 text-fg-tertiary">{g.rows.length}</span>
              </button>
              {!collapsed.has(g.key)
                ? g.rows.map((r) => {
                    const done = r.status.category === "done";
                    const st = dueState(r.dueDate, done, today);
                    return (
                      <div key={r.id} className="group flex h-9 items-center gap-2 border-b border-border bg-surface px-4 hover:bg-hover" role="row">
                        <Checkbox round checked={done} aria-label={done ? "Mark incomplete" : "Mark complete"} onCheckedChange={(v) => complete(r, Boolean(v))} />
                        <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 text-left" onClick={() => openTask(r.id)}>
                          {r.isMilestone ? <Diamond16Regular className="shrink-0 text-brand" /> : null}
                          <span className={cn("truncate type-body-1", done && "text-fg-secondary line-through")}>{r.title}</span>
                          <span className="shrink-0 font-mono type-caption-1 text-fg-tertiary">{r.key}</span>
                          {r.commentCount ? <span className="inline-flex items-center gap-0.5 type-caption-1 text-fg-tertiary"><Comment16Regular className="h-3 w-3" />{r.commentCount}</span> : null}
                        </button>
                        <span className="hidden w-40 items-center gap-1.5 truncate type-caption-1 text-fg-secondary md:flex">
                          <span data-color={r.projectColor} className="h-2 w-2 shrink-0 rounded-full bg-item" />
                          <span className="truncate">{r.projectKey}</span>
                        </span>
                        <Badge color={r.status.color} className="hidden w-28 md:inline-flex">{r.status.name}</Badge>
                        {mode !== "assigned" ? <span className="hidden w-8 md:inline-flex">{r.assignee ? <Avatar name={r.assignee.displayName} src={r.assignee.avatarUrl} size="xs" /> : null}</span> : null}
                        <span className="w-28" onClick={(e) => e.stopPropagation()}>
                          <DatePicker value={r.dueDate} label="Due date" state={st} compact weekStartsOn={workspace.weekStartsOn} onChange={(iso) => update.mutate({ id: r.id, dueDate: iso, optimistic: (x) => ({ ...x, dueDate: iso }) })} />
                        </span>
                        <span className="w-8" onClick={(e) => e.stopPropagation()}>
                          <PriorityPicker value={r.priority} compact onChange={(p) => update.mutate({ id: r.id, priority: p, optimistic: (x) => ({ ...x, priority: p }) })} />
                        </span>
                        <span className="sr-only">{formatDue(r.dueDate, today)} {user.displayName}</span>
                      </div>
                    );
                  })
                : null}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
