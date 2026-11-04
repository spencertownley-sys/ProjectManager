"use client";

import type { TaskRow } from "@/lib/query-engine/types";
import { useViewState } from "@/lib/client/view-state";
import { useWorkspace } from "@/lib/client/workspace-context";
import { formatDue, dueState } from "@/lib/client/dates";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function HomeTaskList({ rows, empty }: { rows: TaskRow[]; empty: string }) {
  const openTask = useViewState((s) => s.openTask);
  const { today } = useWorkspace();
  if (rows.length === 0) return <p className="px-4 py-3 type-body-1 text-fg-secondary">{empty}</p>;
  return (
    <ul className="divide-y divide-border">
      {rows.map((r) => {
        const st = dueState(r.dueDate, Boolean(r.completedAt), today);
        return (
          <li key={r.id}>
            <button type="button" onClick={() => openTask(r.id)} className="flex h-9 w-full items-center gap-3 px-4 text-left hover:bg-hover">
              <span data-color={r.projectColor} className="h-2 w-2 shrink-0 rounded-full bg-item" />
              <span className="truncate type-body-1">{r.title}</span>
              <span className="font-mono type-caption-1 text-fg-tertiary">{r.key}</span>
              <Badge color={r.status.color} className="ml-auto hidden sm:inline-flex">{r.status.name}</Badge>
              <span className={cn("shrink-0 type-caption-1 text-fg-secondary", st === "overdue" && "text-danger", st === "soon" && "text-warning")}>{formatDue(r.dueDate, today)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
