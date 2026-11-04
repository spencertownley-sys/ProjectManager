"use client";

import * as React from "react";
import Link from "next/link";
import { Add20Regular } from "@fluentui/react-icons";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { NewProjectDialog } from "./new-project-dialog";
import { useWorkspace } from "@/lib/client/workspace-context";
import type { ProjectSummary } from "@/lib/services/projects";
import { formatDateShort } from "@/lib/client/dates";
import { cn } from "@/lib/utils";

const healthMeta: Record<string, { label: string; color: string }> = {
  on_track: { label: "On track", color: "green" },
  at_risk: { label: "At risk", color: "orange" },
  off_track: { label: "Off track", color: "red" },
  on_hold: { label: "On hold", color: "gray" },
  complete: { label: "Complete", color: "blue" },
};

export function ProjectsTable({ projects }: { projects: ProjectSummary[]; members: unknown[] }) {
  const { slug, members, role } = useWorkspace();
  const [open, setOpen] = React.useState(false);
  const [filter, setFilter] = React.useState<"active" | "archived" | "all">("active");
  const shown = projects.filter((p) => (filter === "all" ? true : filter === "archived" ? Boolean(p.archivedAt) : !p.archivedAt));
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 items-center gap-1 border-b border-border bg-surface px-3">
        {role !== "guest" ? (
          <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
            <Add20Regular className="h-4 w-4" /> New project
          </Button>
        ) : null}
        <div className="ml-auto inline-flex rounded-sm bg-subtle p-0.5">
          {(["active", "archived", "all"] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)} className={cn("h-7 rounded-xs px-3 type-body-1 capitalize", filter === f && "bg-surface font-semibold")}>
              {f}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-surface">
            <tr className="border-b border-border text-left type-caption-1-strong text-fg-secondary">
              <th className="h-8 px-4 font-semibold">Project</th>
              <th className="h-8 px-2 font-semibold">Key</th>
              <th className="h-8 px-2 font-semibold">Owner</th>
              <th className="h-8 px-2 font-semibold">Health</th>
              <th className="h-8 px-2 font-semibold">Dates</th>
              <th className="h-8 w-48 px-2 font-semibold">Progress</th>
              <th className="h-8 px-2 font-semibold">Overdue</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => {
              const owner = members.find((m) => m.id === p.ownerId);
              const h = p.latestHealth ? healthMeta[p.latestHealth] : null;
              return (
                <tr key={p.id} className="border-b border-border bg-surface hover:bg-hover">
                  <td className="h-11 px-4">
                    <Link href={`/w/${slug}/projects/${p.key}`} className="flex items-center gap-2 type-body-1-strong hover:underline">
                      <span data-color={p.color} className="h-2.5 w-2.5 rounded-full bg-item" />
                      {p.name}
                      {p.archivedAt ? <Badge color="gray">Archived</Badge> : null}
                    </Link>
                  </td>
                  <td className="px-2 font-mono type-caption-1 text-fg-tertiary">{p.key}</td>
                  <td className="px-2">{owner ? <span className="inline-flex items-center gap-1.5 type-body-1"><Avatar name={owner.displayName} src={owner.avatarUrl} size="xs" />{owner.displayName}</span> : <span className="type-body-1 text-fg-tertiary">Unassigned</span>}</td>
                  <td className="px-2">{h ? <Badge color={h.color} dot>{h.label}</Badge> : <span className="type-caption-1 text-fg-tertiary">No update</span>}</td>
                  <td className="px-2 type-body-1 text-fg-secondary">{p.startDate || p.endDate ? `${formatDateShort(p.startDate) || "?"} to ${formatDateShort(p.endDate) || "?"}` : ""}</td>
                  <td className="px-2">
                    <div className="flex items-center gap-2">
                      <ProgressBar value={p.doneCount} max={p.taskCount} color={p.color} className="w-28" />
                      <span className="type-caption-1 text-fg-secondary">{p.taskCount ? Math.round((p.doneCount / p.taskCount) * 100) : 0}%</span>
                    </div>
                  </td>
                  <td className={cn("px-2 type-body-1", p.overdueCount ? "text-danger" : "text-fg-tertiary")}>{p.overdueCount || ""}</td>
                </tr>
              );
            })}
            {shown.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 type-body-1 text-fg-secondary">
                  No projects here yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <NewProjectDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
