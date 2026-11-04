"use client";

import * as React from "react";
import { Dismiss20Regular, Delete16Regular } from "@fluentui/react-icons";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { useViewState } from "@/lib/client/view-state";
import { useWorkspace } from "@/lib/client/workspace-context";
import { useTaskMutations } from "@/lib/client/queries";
import { bulkUpdateTasksAction, deleteTaskAction } from "@/lib/actions/tasks";
import { DatePicker } from "@/components/task/field-editors";
import type { ProjectInfo } from "@/components/views/types";

export function BulkActionBar({ project }: { project: ProjectInfo }) {
  const selectedIds = useViewState((s) => s.selectedIds);
  const clearSelection = useViewState((s) => s.clearSelection);
  const { slug, members, workspace } = useWorkspace();
  const { invalidate } = useTaskMutations();
  const { toast } = useToast();
  const [pending, setPending] = React.useState(false);
  if (selectedIds.length === 0) return null;

  const apply = async (patch: Record<string, unknown>, label: string) => {
    setPending(true);
    const res = await bulkUpdateTasksAction(slug, { ids: selectedIds, patch });
    setPending(false);
    if (!res.ok) toast({ title: `Could not update ${label}`, description: res.error.message, kind: "danger" });
    else toast({ title: `Updated ${res.data.count} tasks`, kind: "success" });
    invalidate();
  };

  const remove = async () => {
    if (!window.confirm(`Delete ${selectedIds.length} tasks?`)) return;
    setPending(true);
    for (const id of selectedIds) await deleteTaskAction(slug, id);
    setPending(false);
    clearSelection();
    invalidate();
    toast({ title: "Tasks deleted", kind: "info" });
  };

  return (
    <div role="toolbar" aria-label="Bulk actions" className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-md border border-border bg-surface-raised px-2 py-1.5 shadow-dialog">
      <span className="px-2 type-body-1-strong">{selectedIds.length} selected</span>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="subtle" size="sm" disabled={pending}>
            Status
          </Button>
        </MenuTrigger>
        <MenuContent>
          {project.statuses.map((s) => (
            <MenuItem key={s.id} onSelect={() => apply({ statusId: s.id }, "status")}>
              <span data-color={s.color} className="mr-2 inline-block h-2 w-2 rounded-full bg-item" />
              {s.name}
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="subtle" size="sm" disabled={pending}>
            Assignee
          </Button>
        </MenuTrigger>
        <MenuContent className="max-h-72">
          <MenuItem onSelect={() => apply({ assigneeId: null }, "assignee")}>Unassigned</MenuItem>
          {members.map((m) => (
            <MenuItem key={m.id} onSelect={() => apply({ assigneeId: m.id }, "assignee")}>
              {m.displayName}
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>
      <DatePicker value={null} label="Due date" onChange={(iso) => apply({ dueDate: iso }, "due date")} weekStartsOn={workspace.weekStartsOn} />
      <Menu>
        <MenuTrigger asChild>
          <Button variant="subtle" size="sm" disabled={pending}>
            Priority
          </Button>
        </MenuTrigger>
        <MenuContent>
          {(["urgent", "high", "medium", "low", "none"] as const).map((p) => (
            <MenuItem key={p} onSelect={() => apply({ priority: p }, "priority")}>
              {p === "none" ? "No priority" : p[0].toUpperCase() + p.slice(1)}
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="subtle" size="sm" disabled={pending}>
            Section
          </Button>
        </MenuTrigger>
        <MenuContent>
          {project.sections.map((s) => (
            <MenuItem key={s.id} onSelect={() => apply({ sectionId: s.id }, "section")}>
              {s.name}
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>
      <Button variant="subtle" size="sm" className="text-danger" disabled={pending} onClick={remove}>
        <Delete16Regular /> Delete
      </Button>
      <Button variant="subtle" size="icon-sm" aria-label="Clear selection" onClick={clearSelection}>
        <Dismiss20Regular className="h-4 w-4" />
      </Button>
    </div>
  );
}
