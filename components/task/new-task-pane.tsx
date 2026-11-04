"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Dismiss20Regular } from "@fluentui/react-icons";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/tooltip";
import { useWorkspace } from "@/lib/client/workspace-context";
import { useTaskMutations } from "@/lib/client/queries";
import { useViewState } from "@/lib/client/view-state";
import { PersonPicker, DatePicker, PriorityPicker } from "./field-editors";
import { listProjectsAction } from "@/lib/actions/workspace";
import type { Priority } from "@/lib/db/schema";

export function NewTaskPane({ onClose, defaultProjectId }: { onClose: () => void; defaultProjectId?: string }) {
  const { slug, members, user, today, workspace } = useWorkspace();
  const { create } = useTaskMutations();
  const openTask = useViewState((s) => s.openTask);
  const [title, setTitle] = React.useState("");
  const [projectId, setProjectId] = React.useState<string>(() => defaultProjectId ?? (typeof window === "undefined" ? "" : (localStorage.getItem("tp-last-project") ?? "")));
  const [assigneeId, setAssigneeId] = React.useState<string | null>(user.id);
  const [dueDate, setDueDate] = React.useState<string | null>(null);
  const [priority, setPriority] = React.useState<Priority>("none");
  const projects = useQuery({
    queryKey: ["projects", slug, "list"],
    queryFn: async () => {
      const res = await listProjectsAction(slug, today);
      if (!res.ok) throw new Error(res.error.message);
      return res.data;
    },
  });

  const firstProjectId = projects.data?.[0]?.id ?? "";
  const knownProject = projects.data?.some((p) => p.id === projectId) ?? true;
  if (firstProjectId && (!projectId || !knownProject)) setProjectId(firstProjectId);

  const submit = (keepOpen: boolean) => {
    const v = title.trim();
    if (!v || !projectId) return;
    localStorage.setItem("tp-last-project", projectId);
    create.mutate(
      { projectId, title: v, assigneeId, dueDate, priority },
      {
        onSuccess: (task) => {
          setTitle("");
          if (!keepOpen) openTask(task.id);
        },
      },
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <span className="type-body-1-strong">New task</span>
        <div className="flex-1" />
        <Tooltip content="Close" shortcut="Esc">
          <Button variant="subtle" size="icon" aria-label="Close" onClick={onClose}>
            <Dismiss20Regular />
          </Button>
        </Tooltip>
      </div>
      <form
        className="flex flex-col gap-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit(false);
        }}
      >
        <Field label="Title">
          <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to be done" required />
        </Field>
        <Field label="Project">
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="h-8 w-full rounded-sm border border-border-strong bg-surface px-2 type-body-1 focus:border-brand focus:outline-none" aria-label="Project">
            {(projects.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Assignee">
            <PersonPicker value={members.find((m) => m.id === assigneeId) ?? null} people={members} me={user.id} onChange={setAssigneeId} />
          </Field>
          <Field label="Due date">
            <DatePicker value={dueDate} onChange={setDueDate} label="Due date" weekStartsOn={workspace.weekStartsOn} />
          </Field>
          <Field label="Priority">
            <PriorityPicker value={priority} onChange={setPriority} />
          </Field>
        </div>
        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary" disabled={!title.trim() || !projectId} loading={create.isPending}>
            Create task
          </Button>
          <Button type="button" variant="secondary" disabled={!title.trim() || !projectId} onClick={() => submit(true)}>
            Create and add another
          </Button>
        </div>
      </form>
    </div>
  );
}
