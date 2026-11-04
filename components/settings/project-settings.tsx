"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft16Regular } from "@fluentui/react-icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { useWorkspace } from "@/lib/client/workspace-context";
import { call } from "@/lib/client/actions";
import { attachFieldAction, detachFieldAction } from "@/lib/actions/settings";
import { updateProjectAction } from "@/lib/actions/projects";
import { WorkflowEditor, type StatusDraft } from "./workflow-editor";
import { FieldsLibrary, fieldTypeLabels, type FieldRow } from "./fields-library";
import type { FieldTypeValue } from "@/lib/validation/settings";

/** Project settings: workflow and fields, for project owners (docs/10 section 6, "Workflow and fields"). */
export function ProjectSettings({ project, statuses, attached, library }: { project: { id: string; key: string; name: string; color: string; autoSchedule: boolean }; statuses: StatusDraft[]; attached: FieldRow[]; library: FieldRow[] }) {
  const { slug } = useWorkspace();
  const router = useRouter();
  const { toast } = useToast();
  const [autoSchedule, setAutoSchedule] = React.useState(project.autoSchedule);
  const [libraryRows, setLibraryRows] = React.useState(library);
  const [attachedRows, setAttachedRows] = React.useState(attached);
  const base = `/w/${slug}/projects/${project.key}`;

  const toggleAutoSchedule = async (v: boolean) => {
    setAutoSchedule(v);
    const res = await call(updateProjectAction(slug, { id: project.id, autoSchedule: v }));
    if (!res.ok) {
      setAutoSchedule(!v);
      toast({ title: "Could not save the setting", description: res.error.message, kind: "danger" });
    }
  };
  const adopt = async (f: FieldRow) => {
    const res = await call(attachFieldAction(slug, { projectId: project.id, fieldId: f.id }));
    if (!res.ok) {
      toast({ title: "Could not add the field", description: res.error.message, kind: "danger" });
      return;
    }
    setLibraryRows((r) => r.filter((x) => x.id !== f.id));
    setAttachedRows((r) => [...r, f]);
    toast({ title: `${f.name} added to ${project.name}`, kind: "success" });
    router.refresh();
  };
  const detach = async (f: FieldRow) => {
    const res = await call(detachFieldAction(slug, { projectId: project.id, fieldId: f.id }));
    if (!res.ok) {
      toast({ title: "Could not remove the field", description: res.error.message, kind: "danger" });
      return;
    }
    setAttachedRows((r) => r.filter((x) => x.id !== f.id));
    if (!f.projectId) setLibraryRows((r) => [...r, f]);
    router.refresh();
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl px-6 py-5">
        <Link href={base} className="inline-flex items-center gap-1 type-caption-1-strong text-brand hover:underline">
          <ArrowLeft16Regular /> Back to {project.name}
        </Link>
        <div className="flex items-center gap-3 pt-2 pb-5">
          <span data-color={project.color} className="inline-flex h-8 w-8 items-center justify-center rounded-sm bg-item-tint type-caption-1-strong text-item">{project.key.slice(0, 2)}</span>
          <div>
            <h1 className="type-subtitle-1">Workflow and fields</h1>
            <p className="type-body-1 text-fg-secondary">{project.name}</p>
          </div>
        </div>
        <section className="flex flex-col gap-3 pb-8">
          <h2 className="type-subtitle-2">Workflow</h2>
          <p className="type-body-1 text-fg-secondary">Statuses in column order. The category drives roll-ups and burndowns regardless of names; a WIP limit turns the Board count red when exceeded.</p>
          <WorkflowEditor projectId={project.id} initial={statuses} />
        </section>
        <section className="flex flex-col gap-3 pb-8">
          <h2 className="type-subtitle-2">Scheduling</h2>
          <label className="flex items-center justify-between gap-4 rounded-md border border-border bg-surface p-4">
            <span>
              <span className="block type-body-1-strong">Auto schedule</span>
              <span className="block type-caption-1 text-fg-secondary">Moving a task on the Gantt shifts its dependents, respecting lag. Each move offers Undo.</span>
            </span>
            <Switch checked={autoSchedule} onCheckedChange={toggleAutoSchedule} aria-label="Auto schedule" />
          </label>
        </section>
        <section className="flex flex-col gap-3 pb-8">
          <FieldsLibrary
            initial={attachedRows}
            projectId={project.id}
            title="Fields"
            emptyText="No custom fields on this project. Add one or adopt a library field."
            extraActions={(f) => <MenuItem onSelect={() => detach(f)}>{f.projectId ? "Remove from project" : "Stop using in this project"}</MenuItem>}
          />
          {libraryRows.length > 0 ? (
            <div className="flex items-center gap-2 rounded-md border border-dashed border-border-strong p-3">
              <span className="min-w-0 flex-1 type-body-1 text-fg-secondary">Adopt a field from the workspace library.</span>
              <Menu>
                <MenuTrigger asChild>
                  <Button variant="secondary" size="sm">
                    Add from library
                  </Button>
                </MenuTrigger>
                <MenuContent align="end" className="w-64">
                  {libraryRows.map((f) => (
                    <MenuItem key={f.id} onSelect={() => adopt(f)}>
                      <span className="flex-1 truncate">{f.name}</span>
                      <Badge className="ml-2">{fieldTypeLabels[f.type as FieldTypeValue] ?? f.type}</Badge>
                    </MenuItem>
                  ))}
                </MenuContent>
              </Menu>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
