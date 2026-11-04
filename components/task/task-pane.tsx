"use client";

import * as React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import type { JSONContent } from "@tiptap/react";
import {
  Dismiss20Regular,
  Link16Regular,
  MoreHorizontal20Regular,
  Checkmark16Regular,
  Add20Regular,
  Eye20Regular,
  Comment16Regular,
  Delete16Regular,
  Copy16Regular,
  ArrowRight16Regular,
} from "@fluentui/react-icons";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton, Divider } from "@/components/ui/misc";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command } from "cmdk";
import { useToast } from "@/components/ui/toast";
import { StatusPicker, PriorityPicker, PersonPicker, DatePicker, MilestoneToggle, EstimateInput, SimpleSelect } from "./field-editors";
import { RichTextEditor } from "./rich-text";
import { CommentComposer } from "./comment-composer";
import { useTaskDetail, useTaskMutations, keys } from "@/lib/client/queries";
import { useWorkspace } from "@/lib/client/workspace-context";
import { useViewState } from "@/lib/client/view-state";
import { addCommentAction, deleteCommentAction, toggleReactionAction, toggleFollowAction, addDependencyAction, removeDependencyAction, queryProjectTasksAction } from "@/lib/actions/tasks";
import type { TaskDetail } from "@/lib/services/tasks";
import type { TaskRow } from "@/lib/query-engine/types";
import { formatRelativeTime, formatDateLong, dueState } from "@/lib/client/dates";
import { defaultViewSpec } from "@/lib/validation/view-spec";
import { cn } from "@/lib/utils";

export function TaskPane({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const detail = useTaskDetail(taskId);
  if (detail.isLoading) return <PaneSkeleton onClose={onClose} />;
  if (detail.isError || !detail.data) {
    return (
      <div className="flex h-full flex-col">
        <PaneHeaderBar onClose={onClose} />
        <div className="p-6">
          <p className="type-body-1-strong">This task is not available.</p>
          <p className="type-body-1 text-fg-secondary">It may have been deleted, or you may not have access.</p>
        </div>
      </div>
    );
  }
  return <TaskPaneBody detail={detail.data} onClose={onClose} />;
}

function PaneHeaderBar({ onClose, children }: { onClose: () => void; children?: React.ReactNode }) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-3">
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
      <Tooltip content="Close" shortcut="Esc">
        <Button variant="subtle" size="icon" aria-label="Close task" onClick={onClose}>
          <Dismiss20Regular />
        </Button>
      </Tooltip>
    </div>
  );
}

function PaneSkeleton({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <PaneHeaderBar onClose={onClose}>
        <Skeleton className="h-4 w-24" />
      </PaneHeaderBar>
      <div className="flex flex-col gap-4 p-5">
        <Skeleton className="h-8 w-3/4" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-7" />
          ))}
        </div>
        <Skeleton className="h-24" />
      </div>
    </div>
  );
}

function TaskPaneBody({ detail, onClose }: { detail: TaskDetail; onClose: () => void }) {
  const { slug, members, user, workspace, today } = useWorkspace();
  const { update, create, remove } = useTaskMutations();
  const client = useQueryClient();
  const { toast } = useToast();
  const openTask = useViewState((s) => s.openTask);
  const { task, project } = detail;
  const [tab, setTab] = React.useState<"comments" | "all">("comments");
  const [posting, setPosting] = React.useState(false);
  const titleRef = React.useRef<HTMLTextAreaElement>(null);
  const done = task.status.category === "done";
  const invalidateDetail = () => client.invalidateQueries({ queryKey: keys.taskDetail(slug, task.id) });

  const patch = (input: Record<string, unknown>, optimistic?: (row: TaskRow) => TaskRow) => update.mutate({ id: task.id, ...input, optimistic } as never);

  const toggleComplete = () => {
    const doneStatus = project.statuses.find((s) => s.category === "done");
    const firstStatus = project.statuses.find((s) => s.category !== "done") ?? project.statuses[0];
    const next = done ? firstStatus : doneStatus;
    if (!next) return;
    patch({ statusId: next.id }, (r) => ({ ...r, status: { ...next }, completedAt: done ? null : new Date().toISOString() }));
  };

  const copyLink = async () => {
    const url = `${window.location.origin}/w/${slug}/projects/${project.key}?task=${task.key}`;
    await navigator.clipboard.writeText(url);
    toast({ title: "Link copied", kind: "success" });
  };

  const del = async () => {
    if (!window.confirm(`Delete ${task.key}${task.subtaskCount ? ` and its ${task.subtaskCount} subtasks` : ""}?`)) return;
    onClose();
    remove.mutate(task.id);
  };

  const postComment = async (doc: JSONContent, text: string) => {
    setPosting(true);
    const res = await addCommentAction(slug, { taskId: task.id, body: doc, bodyText: text, mentionUserIds: [] });
    setPosting(false);
    if (!res.ok) {
      toast({ title: "Could not post the comment", description: res.error.message, kind: "danger" });
      return;
    }
    invalidateDetail();
    client.invalidateQueries({ queryKey: keys.allTasks(slug) });
  };

  const follow = async () => {
    const res = await toggleFollowAction(slug, task.id);
    if (res.ok) invalidateDetail();
  };

  const addSubtask = (title: string) => {
    create.mutate({ projectId: project.id, title, parentId: task.id }, { onSuccess: () => invalidateDetail() });
  };

  const dueSt = dueState(task.dueDate, done, today);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PaneHeaderBar onClose={onClose}>
        <Link href={`/w/${slug}/projects/${project.key}`} className="flex min-w-0 items-center gap-1.5 type-caption-1 text-fg-secondary hover:text-fg">
          <span data-color={project.color} className="h-2 w-2 shrink-0 rounded-full bg-item" />
          <span className="truncate">{project.name}</span>
        </Link>
        <span className="font-mono type-caption-1 text-fg-tertiary">{task.key}</span>
        <div className="flex-1" />
        <Tooltip content={done ? "Mark incomplete" : "Mark complete"}>
          <Button variant={done ? "secondary" : "secondary"} size="sm" onClick={toggleComplete} className={cn(done && "border-success text-success")}>
            <Checkmark16Regular /> {done ? "Completed" : "Mark complete"}
          </Button>
        </Tooltip>
        <Tooltip content="Copy link">
          <Button variant="subtle" size="icon" aria-label="Copy link" onClick={copyLink}>
            <Link16Regular />
          </Button>
        </Tooltip>
        <Tooltip content={detail.isFollowing ? "Stop watching" : "Watch"}>
          <Button variant="subtle" size="icon" aria-label={detail.isFollowing ? "Stop watching" : "Watch"} onClick={follow} className={cn(detail.isFollowing && "text-brand")}>
            <Eye20Regular />
          </Button>
        </Tooltip>
        <Menu>
          <MenuTrigger asChild>
            <Button variant="subtle" size="icon" aria-label="More actions">
              <MoreHorizontal20Regular />
            </Button>
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem icon={<Copy16Regular />} onSelect={() => create.mutate({ projectId: project.id, title: `${task.title} (copy)`, sectionId: task.sectionId, priority: task.priority, assigneeId: task.assignee?.id ?? null, startDate: task.startDate, dueDate: task.dueDate, estimate: task.estimate })}>
              Duplicate
            </MenuItem>
            {task.parentId ? <MenuItem icon={<ArrowRight16Regular />} onSelect={() => patch({ parentId: null }, (r) => ({ ...r, parentId: null }))}>Convert to task</MenuItem> : null}
            <MenuSeparator />
            <MenuItem icon={<Delete16Regular />} destructive onSelect={del}>
              Delete
            </MenuItem>
          </MenuContent>
        </Menu>
      </PaneHeaderBar>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-5 px-5 py-4">
          {task.parentId ? (
            <button type="button" className="self-start type-caption-1 text-fg-secondary hover:text-fg" onClick={() => openTask(task.parentId)}>
              Back to parent task
            </button>
          ) : null}
          <textarea
            ref={titleRef}
            key={task.id + task.version}
            defaultValue={task.title}
            rows={1}
            aria-label="Task title"
            className={cn("w-full resize-none rounded-sm border border-transparent bg-transparent px-1.5 py-1 type-title-3 text-fg hover:border-border focus:border-brand focus:bg-surface focus:outline-none", done && "text-fg-secondary line-through")}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${el.scrollHeight}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
              if (e.key === "Escape") {
                e.currentTarget.value = task.title;
                e.currentTarget.blur();
              }
            }}
            onBlur={(e) => {
              const v = e.currentTarget.value.trim();
              if (v && v !== task.title) patch({ title: v }, (r) => ({ ...r, title: v }));
              else e.currentTarget.value = task.title;
            }}
          />

          <dl className="grid grid-cols-[112px_1fr] gap-x-3 gap-y-1 [&>dt]:flex [&>dt]:h-7 [&>dt]:items-center [&>dt]:type-caption-1-strong [&>dt]:text-fg-secondary [&>dd]:flex [&>dd]:min-w-0 [&>dd]:items-center">
            <dt>Status</dt>
            <dd>
              <StatusPicker value={task.status} statuses={project.statuses} onChange={(statusId) => { const s = project.statuses.find((x) => x.id === statusId)!; patch({ statusId }, (r) => ({ ...r, status: s, completedAt: s.category === "done" ? new Date().toISOString() : null })); }} />
            </dd>
            <dt>Assignee</dt>
            <dd>
              <PersonPicker value={task.assignee} people={members} me={user.id} onChange={(id) => patch({ assigneeId: id }, (r) => ({ ...r, assignee: id ? (members.find((m) => m.id === id) ?? null) : null }))} />
            </dd>
            <dt>Start date</dt>
            <dd>
              <DatePicker value={task.startDate} label="Start date" onChange={(iso) => patch({ startDate: iso }, (r) => ({ ...r, startDate: iso }))} weekStartsOn={workspace.weekStartsOn} />
            </dd>
            <dt>Due date</dt>
            <dd>
              <DatePicker value={task.dueDate} label="Due date" minDate={task.startDate} state={dueSt} onChange={(iso) => patch({ dueDate: iso, ...(task.isMilestone ? { startDate: iso } : {}) }, (r) => ({ ...r, dueDate: iso }))} weekStartsOn={workspace.weekStartsOn} />
            </dd>
            <dt>Priority</dt>
            <dd>
              <PriorityPicker value={task.priority} onChange={(p) => patch({ priority: p }, (r) => ({ ...r, priority: p }))} />
            </dd>
            <dt>Estimate</dt>
            <dd>
              <EstimateInput value={task.estimate} unit={workspace.estimateUnit} onChange={(v) => patch({ estimate: v }, (r) => ({ ...r, estimate: v }))} />
            </dd>
            <dt>Section</dt>
            <dd>
              <SimpleSelect ariaLabel="Section" value={task.sectionId} options={project.sections.map((s) => ({ value: s.id, label: s.name }))} placeholder="No section" onChange={(id) => patch({ sectionId: id }, (r) => ({ ...r, sectionId: id }))} />
            </dd>
            {project.cycles.length ? (
              <>
                <dt>{workspace.cycleLabel}</dt>
                <dd>
                  <SimpleSelect ariaLabel={workspace.cycleLabel} value={task.cycleId} options={project.cycles.map((c) => ({ value: c.id, label: c.name }))} placeholder={`No ${workspace.cycleLabel.toLowerCase()}`} onChange={(id) => patch({ cycleId: id }, (r) => ({ ...r, cycleId: id }))} />
                </dd>
              </>
            ) : null}
            <dt>Milestone</dt>
            <dd>
              <MilestoneToggle value={task.isMilestone} onChange={(v) => patch({ isMilestone: v }, (r) => ({ ...r, isMilestone: v }))} />
            </dd>
            {task.tags.length ? (
              <>
                <dt>Tags</dt>
                <dd className="flex-wrap gap-1">
                  {task.tags.map((t) => (
                    <Badge key={t.id} color={t.color}>
                      {t.name}
                    </Badge>
                  ))}
                </dd>
              </>
            ) : null}
          </dl>

          <section>
            <h3 className="mb-1 type-caption-1-strong text-fg-secondary">Description</h3>
            <RichTextEditor key={task.id} value={(detail.description as JSONContent | null) ?? null} onSave={(doc, text) => { if (text.trim() || detail.description) patch({ description: text.trim() ? doc : null }); }} />
          </section>

          <Subtasks detail={detail} onAdd={addSubtask} />
          <Dependencies detail={detail} onChanged={invalidateDetail} />

          {detail.attachments.length ? (
            <section>
              <h3 className="mb-1 type-caption-1-strong text-fg-secondary">Attachments</h3>
              <ul className="flex flex-col gap-1">
                {detail.attachments.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 type-body-1">
                    <Link16Regular className="text-fg-tertiary" />
                    {a.url ? (
                      <a href={a.url} target="_blank" rel="noreferrer" className="truncate text-brand hover:underline">
                        {a.name}
                      </a>
                    ) : (
                      <span className="truncate">{a.name}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <Divider />

          <section>
            <div className="mb-2 flex items-center gap-2">
              <h3 className="type-caption-1-strong text-fg-secondary">Activity</h3>
              <div className="ml-auto inline-flex rounded-sm bg-subtle p-0.5">
                <button type="button" className={cn("h-6 rounded-xs px-2 type-caption-1", tab === "comments" && "bg-surface font-semibold")} onClick={() => setTab("comments")}>
                  Comments
                </button>
                <button type="button" className={cn("h-6 rounded-xs px-2 type-caption-1", tab === "all" && "bg-surface font-semibold")} onClick={() => setTab("all")}>
                  All activity
                </button>
              </div>
            </div>
            <ActivityList detail={detail} mode={tab} onChanged={invalidateDetail} />
          </section>
        </div>
      </div>

      <div className="shrink-0 border-t border-border bg-surface-raised px-4 py-3">
        <div className="flex gap-2">
          <Avatar name={user.displayName} src={user.avatarUrl} size="md" />
          <CommentComposer onSubmit={postComment} submitting={posting} className="flex-1" />
        </div>
      </div>
    </div>
  );
}

function Subtasks({ detail, onAdd }: { detail: TaskDetail; onAdd: (title: string) => void }) {
  const [adding, setAdding] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const openTask = useViewState((s) => s.openTask);
  const { update } = useTaskMutations();
  const done = detail.subtasks.filter((s) => s.status.category === "done").length;
  const submit = () => {
    const v = title.trim();
    if (!v) return;
    onAdd(v);
    setTitle("");
  };
  return (
    <section>
      <div className="mb-1 flex items-center gap-2">
        <h3 className="type-caption-1-strong text-fg-secondary">Subtasks</h3>
        {detail.subtasks.length ? (
          <span className="type-caption-1 text-fg-tertiary">
            {done} of {detail.subtasks.length}
          </span>
        ) : null}
        <Button variant="subtle" size="sm" className="ml-auto" onClick={() => setAdding(true)}>
          <Add20Regular className="h-4 w-4" /> Add subtask
        </Button>
      </div>
      <ul className="flex flex-col">
        {detail.subtasks.map((s) => {
          const isDone = s.status.category === "done";
          return (
            <li key={s.id} className="group flex h-9 items-center gap-2 rounded-sm px-1 hover:bg-hover">
              <Checkbox
                round
                checked={isDone}
                aria-label={isDone ? "Mark incomplete" : "Mark complete"}
                onCheckedChange={() => {
                  const next = isDone ? detail.project.statuses.find((x) => x.category !== "done") : detail.project.statuses.find((x) => x.category === "done");
                  if (next) update.mutate({ id: s.id, statusId: next.id, optimistic: (r) => ({ ...r, status: next, completedAt: isDone ? null : new Date().toISOString() }) });
                }}
              />
              <button type="button" className={cn("min-w-0 flex-1 truncate text-left type-body-1", isDone && "text-fg-secondary line-through")} onClick={() => openTask(s.id)}>
                {s.title}
              </button>
              {s.assignee ? <Avatar name={s.assignee.displayName} src={s.assignee.avatarUrl} size="xs" /> : null}
              {s.dueDate ? <span className="type-caption-1 text-fg-tertiary">{formatDateLong(s.dueDate)}</span> : null}
            </li>
          );
        })}
        {adding ? (
          <li className="flex h-9 items-center gap-2 px-1">
            <span className="inline-block h-4 w-4 rounded-full border border-dashed border-border-strong" />
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
                if (e.key === "Escape") {
                  setAdding(false);
                  setTitle("");
                }
              }}
              onBlur={() => {
                if (!title.trim()) setAdding(false);
                else submit();
              }}
              placeholder="Subtask title"
              className="h-7 flex-1 rounded-sm border border-brand bg-surface px-1.5 type-body-1 outline-none"
              aria-label="New subtask title"
            />
          </li>
        ) : null}
      </ul>
    </section>
  );
}

function Dependencies({ detail, onChanged }: { detail: TaskDetail; onChanged: () => void }) {
  const { slug, today } = useWorkspace();
  const { toast } = useToast();
  const openTask = useViewState((s) => s.openTask);
  const [open, setOpen] = React.useState<"blocked_by" | "blocking" | null>(null);
  const [candidates, setCandidates] = React.useState<TaskRow[]>([]);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    queryProjectTasksAction(slug, detail.project.id, { ...defaultViewSpec(), subtasks: "flat", showCompleted: "all" }, today).then((res) => {
      if (!cancelled && res.ok) setCandidates(res.data.rows.filter((r) => r.id !== detail.task.id));
    });
    return () => {
      cancelled = true;
    };
  }, [open, slug, detail.project.id, detail.task.id, today]);

  const add = async (otherId: string) => {
    const input = open === "blocked_by" ? { predecessorId: otherId, successorId: detail.task.id } : { predecessorId: detail.task.id, successorId: otherId };
    const res = await addDependencyAction(slug, { ...input, type: "fs", lagDays: 0 });
    setOpen(null);
    if (!res.ok) toast({ title: "Could not add the dependency", description: res.error.message, kind: "danger" });
    else onChanged();
  };
  const removeDep = async (id: string) => {
    const res = await removeDependencyAction(slug, id);
    if (res.ok) onChanged();
  };

  const row = (dep: TaskDetail["predecessors"][number]) => (
    <li key={dep.id} className="group flex h-8 items-center gap-2 rounded-sm px-1 hover:bg-hover">
      <span data-color={dep.task.status.color} className="h-2 w-2 shrink-0 rounded-full bg-item" />
      <button type="button" className={cn("min-w-0 flex-1 truncate text-left type-body-1", dep.task.status.category === "done" && "text-fg-secondary line-through")} onClick={() => openTask(dep.task.id)}>
        <span className="mr-1 font-mono type-caption-1 text-fg-tertiary">{dep.task.key}</span>
        {dep.task.title}
      </button>
      <span className="type-caption-1 text-fg-tertiary">{dep.type.toUpperCase()}{dep.lagDays ? ` ${dep.lagDays > 0 ? "+" : ""}${dep.lagDays}d` : ""}</span>
      <button type="button" aria-label="Remove dependency" className="invisible text-fg-tertiary hover:text-danger group-hover:visible" onClick={() => removeDep(dep.id)}>
        <Dismiss20Regular className="h-4 w-4" />
      </button>
    </li>
  );

  const picker = (kind: "blocked_by" | "blocking") => (
    <Popover open={open === kind} onOpenChange={(o) => setOpen(o ? kind : null)}>
      <PopoverTrigger asChild>
        <Button variant="subtle" size="sm">
          <Add20Regular className="h-4 w-4" /> Add
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0">
        <Command label="Choose a task">
          <Command.Input autoFocus placeholder="Search tasks in this project" className="h-9 w-full border-b border-border bg-transparent px-3 type-body-1 outline-none placeholder:text-fg-tertiary" />
          <Command.List className="max-h-64 overflow-y-auto p-1">
            <Command.Empty className="px-2 py-4 type-body-1 text-fg-secondary">No tasks match.</Command.Empty>
            {candidates.map((c) => (
              <Command.Item key={c.id} value={`${c.key} ${c.title}`} className="flex h-8 items-center gap-2 rounded-sm px-2 type-body-1 data-[selected=true]:bg-hover" onSelect={() => add(c.id)}>
                <span className="font-mono type-caption-1 text-fg-tertiary">{c.key}</span>
                <span className="truncate">{c.title}</span>
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );

  return (
    <section className="grid gap-3">
      <div>
        <div className="mb-1 flex items-center">
          <h3 className="type-caption-1-strong text-fg-secondary">Blocked by</h3>
          <span className="ml-auto">{picker("blocked_by")}</span>
        </div>
        {detail.predecessors.length ? <ul className="flex flex-col">{detail.predecessors.map(row)}</ul> : <p className="px-1 type-caption-1 text-fg-tertiary">Nothing blocks this task.</p>}
      </div>
      <div>
        <div className="mb-1 flex items-center">
          <h3 className="type-caption-1-strong text-fg-secondary">Blocking</h3>
          <span className="ml-auto">{picker("blocking")}</span>
        </div>
        {detail.successors.length ? <ul className="flex flex-col">{detail.successors.map(row)}</ul> : <p className="px-1 type-caption-1 text-fg-tertiary">This task blocks nothing.</p>}
      </div>
    </section>
  );
}

function describeEvent(e: TaskDetail["events"][number], detail: TaskDetail): string {
  const who = e.actor?.displayName ?? "Someone";
  const statusName = (id: unknown) => detail.project.statuses.find((s) => s.id === id)?.name ?? "a status";
  switch (e.type) {
    case "task.created":
      return `${who} created this task`;
    case "task.status_changed":
      return `${who} changed status from ${statusName(e.before)} to ${statusName(e.after)}`;
    case "task.assigned":
      return e.after ? `${who} assigned this task` : `${who} removed the assignee`;
    case "task.dates_changed": {
      const a = e.after as { startDate?: string | null; dueDate?: string | null } | null;
      return `${who} set dates to ${a?.startDate ? formatDateLong(a.startDate) : "no start"} to ${a?.dueDate ? formatDateLong(a.dueDate) : "no due date"}`;
    }
    case "task.completed":
      return `${who} completed this task`;
    case "task.reopened":
      return `${who} reopened this task`;
    case "task.moved":
      return `${who} moved this task`;
    case "task.updated":
      return `${who} changed the ${e.field ?? "task"}`;
    case "subtask.added":
      return `${who} added a subtask`;
    case "dependency.added":
      return `${who} added a dependency`;
    case "dependency.removed":
      return `${who} removed a dependency`;
    case "tag.added":
      return `${who} added a tag`;
    case "tag.removed":
      return `${who} removed a tag`;
    case "field.changed":
      return `${who} changed a field`;
    case "comment.edited":
      return `${who} edited a comment`;
    case "attachment.added":
      return `${who} added an attachment`;
    default:
      return `${who} updated this task`;
  }
}

function ActivityList({ detail, mode, onChanged }: { detail: TaskDetail; mode: "comments" | "all"; onChanged: () => void }) {
  const { slug, user } = useWorkspace();
  const items: Array<{ kind: "comment"; at: string; comment: TaskDetail["comments"][number] } | { kind: "event"; at: string; event: TaskDetail["events"][number] }> = [
    ...detail.comments.map((c) => ({ kind: "comment" as const, at: c.createdAt, comment: c })),
    ...(mode === "all" ? detail.events.filter((e) => e.type !== "comment.created").map((e) => ({ kind: "event" as const, at: e.createdAt, event: e })) : []),
  ].sort((a, b) => a.at.localeCompare(b.at));

  if (items.length === 0) return <p className="type-body-1 text-fg-secondary">No comments yet.</p>;

  return (
    <ol className="flex flex-col gap-3">
      {items.map((item) =>
        item.kind === "comment" ? (
          <li key={item.comment.id} className="flex gap-2">
            <Avatar name={item.comment.author.displayName} src={item.comment.author.avatarUrl} size="md" />
            <div className="min-w-0 flex-1 rounded-md border border-border bg-surface p-2">
              <div className="mb-1 flex items-center gap-2">
                <span className="type-body-1-strong">{item.comment.author.displayName}</span>
                <span className="type-caption-1 text-fg-tertiary">{formatRelativeTime(item.comment.createdAt)}</span>
                {item.comment.editedAt ? <span className="type-caption-1 text-fg-tertiary">(edited)</span> : null}
                {item.comment.author.id === user.id ? (
                  <button
                    type="button"
                    className="ml-auto type-caption-1 text-fg-tertiary hover:text-danger"
                    onClick={async () => {
                      if (!window.confirm("Delete this comment?")) return;
                      const res = await deleteCommentAction(slug, item.comment.id);
                      if (res.ok) onChanged();
                    }}
                  >
                    Delete
                  </button>
                ) : null}
              </div>
              <p className="whitespace-pre-wrap type-body-1">{item.comment.bodyText}</p>
              <div className="mt-1 flex items-center gap-1">
                {item.comment.reactions.map((r) => (
                  <button
                    key={r.emoji}
                    type="button"
                    className={cn("inline-flex h-6 items-center gap-1 rounded-full border border-border px-2 type-caption-1 hover:bg-hover", r.userIds.includes(user.id) && "border-brand bg-selected")}
                    onClick={async () => {
                      await toggleReactionAction(slug, { commentId: item.comment.id, emoji: r.emoji });
                      onChanged();
                    }}
                  >
                    <span>{r.emoji}</span>
                    <span>{r.userIds.length}</span>
                  </button>
                ))}
                <button
                  type="button"
                  className="inline-flex h-6 items-center rounded-full px-2 type-caption-1 text-fg-tertiary hover:bg-hover"
                  onClick={async () => {
                    await toggleReactionAction(slug, { commentId: item.comment.id, emoji: "👍" });
                    onChanged();
                  }}
                  aria-label="React with thumbs up"
                >
                  <Comment16Regular className="h-3 w-3" />
                </button>
              </div>
            </div>
          </li>
        ) : (
          <li key={`e${item.event.id}`} className="flex items-center gap-2 pl-10 type-caption-1 text-fg-secondary">
            <span className="h-1 w-1 rounded-full bg-border-strong" />
            <span>{describeEvent(item.event, detail)}</span>
            <span className="text-fg-tertiary">{formatRelativeTime(item.event.createdAt)}</span>
          </li>
        ),
      )}
    </ol>
  );
}
