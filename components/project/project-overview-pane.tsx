"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Dismiss20Regular } from "@fluentui/react-icons";
import { Sheet } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast";
import { useWorkspace } from "@/lib/client/workspace-context";
import { updateProjectAction, postStatusUpdateAction } from "@/lib/actions/projects";
import { listStatusUpdatesAction } from "@/lib/actions/project-reads";
import type { ProjectInfo } from "@/components/views/types";
import { PersonPicker, DatePicker } from "@/components/task/field-editors";
import { formatRelativeTime } from "@/lib/client/dates";
import { cn } from "@/lib/utils";

const healthOptions = [
  { value: "on_track", label: "On track", color: "green" },
  { value: "at_risk", label: "At risk", color: "orange" },
  { value: "off_track", label: "Off track", color: "red" },
  { value: "on_hold", label: "On hold", color: "gray" },
  { value: "complete", label: "Complete", color: "blue" },
] as const;

export function ProjectOverviewPane({ project, open, onOpenChange }: { project: ProjectInfo; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const { slug, members, user, today, workspace } = useWorkspace();
  const { toast } = useToast();
  const [description, setDescription] = React.useState("");
  const [updates, setUpdates] = React.useState<Array<{ id: string; health: string; title: string; createdAt: string; author: { displayName: string; avatarUrl: string | null }; metrics: Record<string, number> | null }>>([]);
  const [health, setHealth] = React.useState<(typeof healthOptions)[number]["value"]>("on_track");
  const [title, setTitle] = React.useState("");
  const [posting, setPosting] = React.useState(false);
  const canEdit = project.role === "owner";

  React.useEffect(() => {
    if (!open) return;
    listStatusUpdatesAction(slug, project.id).then((res) => {
      if (res.ok) setUpdates(res.data);
    });
  }, [open, slug, project.id]);

  const save = async (patch: Record<string, unknown>) => {
    const res = await updateProjectAction(slug, { id: project.id, ...patch });
    if (!res.ok) toast({ title: "Could not save", description: res.error.message, kind: "danger" });
    else router.refresh();
  };

  const post = async (e: React.FormEvent) => {
    e.preventDefault();
    setPosting(true);
    const res = await postStatusUpdateAction(slug, { projectId: project.id, health, title }, today);
    setPosting(false);
    if (!res.ok) {
      toast({ title: "Could not post the update", description: res.error.message, kind: "danger" });
      return;
    }
    setTitle("");
    const refreshed = await listStatusUpdatesAction(slug, project.id);
    if (refreshed.ok) setUpdates(refreshed.data);
    router.refresh();
    toast({ title: "Status update posted", kind: "success" });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Project overview" className="max-w-[560px]">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <span data-color={project.color} className="h-3 w-3 rounded-full bg-item" />
        <span className="truncate type-body-1-strong">{project.name}</span>
        <span className="font-mono type-caption-1 text-fg-tertiary">{project.key}</span>
        <div className="flex-1" />
        <Button variant="subtle" size="icon" aria-label="Close" onClick={() => onOpenChange(false)}>
          <Dismiss20Regular />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5">
        <section>
          <h3 className="mb-1 type-caption-1-strong text-fg-secondary">Description</h3>
          {canEdit ? (
            <Textarea defaultValue={description} rows={3} placeholder="What this project is for and how it is run" onBlur={(e) => { setDescription(e.target.value); save({ description: e.target.value || null }); }} />
          ) : (
            <p className="type-body-1 text-fg-secondary">{description || "No description."}</p>
          )}
        </section>
        <section className="grid grid-cols-2 gap-3">
          <Field label="Owner">
            <PersonPicker value={members.find((m) => m.id === project.ownerId) ?? null} people={members} me={user.id} onChange={(id) => canEdit && save({ ownerId: id })} disabled={!canEdit} />
          </Field>
          <Field label="Privacy">
            <Badge color="gray">{project.privacy === "workspace" ? "Workspace" : project.privacy === "team" ? "Team" : "Private"}</Badge>
          </Field>
          <Field label="Start date">
            <DatePicker value={project.startDate} label="Start date" onChange={(iso) => canEdit && save({ startDate: iso })} disabled={!canEdit} weekStartsOn={workspace.weekStartsOn} />
          </Field>
          <Field label="End date">
            <DatePicker value={project.endDate} label="End date" minDate={project.startDate} onChange={(iso) => canEdit && save({ endDate: iso })} disabled={!canEdit} weekStartsOn={workspace.weekStartsOn} />
          </Field>
        </section>
        <section>
          <h3 className="mb-2 type-caption-1-strong text-fg-secondary">Status updates</h3>
          {canEdit ? (
            <form onSubmit={post} className="mb-3 flex flex-col gap-2 rounded-md border border-border bg-surface p-3">
              <div className="flex flex-wrap gap-1">
                {healthOptions.map((h) => (
                  <button key={h.value} type="button" onClick={() => setHealth(h.value)} aria-pressed={health === h.value} className={cn("rounded-sm border border-transparent", health === h.value && "border-brand")}>
                    <Badge color={h.color} dot>
                      {h.label}
                    </Badge>
                  </button>
                ))}
              </div>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="One line on where things stand" maxLength={200} required />
              <div className="flex justify-end">
                <Button type="submit" variant="primary" size="sm" loading={posting} disabled={!title.trim()}>
                  Post update
                </Button>
              </div>
            </form>
          ) : null}
          <ul className="flex flex-col gap-2">
            {updates.map((u) => {
              const h = healthOptions.find((x) => x.value === u.health);
              return (
                <li key={u.id} className="rounded-md border border-border bg-surface p-3">
                  <div className="flex items-center gap-2">
                    {h ? (
                      <Badge color={h.color} dot>
                        {h.label}
                      </Badge>
                    ) : null}
                    <span className="truncate type-body-1-strong">{u.title}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 type-caption-1 text-fg-secondary">
                    <Avatar name={u.author.displayName} src={u.author.avatarUrl} size="xs" />
                    <span>{u.author.displayName}</span>
                    <span>{formatRelativeTime(u.createdAt)}</span>
                    {u.metrics ? (
                      <span className="ml-auto">
                        {u.metrics.completedWeek} done this week, {u.metrics.overdue} overdue
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
            {updates.length === 0 ? <li className="type-body-1 text-fg-secondary">No status updates yet.</li> : null}
          </ul>
        </section>
        <section>
          <h3 className="mb-1 type-caption-1-strong text-fg-secondary">Workflow</h3>
          <div className="flex flex-wrap gap-1">
            {project.statuses.map((s) => (
              <Badge key={s.id} color={s.color} dot>
                {s.name}
              </Badge>
            ))}
          </div>
        </section>
      </div>
    </Sheet>
  );
}
