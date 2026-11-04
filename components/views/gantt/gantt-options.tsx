"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ZoomIn20Regular, Branch20Regular, History20Regular, CalendarToday20Regular, ArrowDownload16Regular } from "@fluentui/react-icons";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger, MenuCheckboxItem } from "@/components/ui/menu";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import type { ProjectInfo } from "@/components/views/types";
import type { ViewSpec } from "@/lib/validation/view-spec";
import { zoomOrder, zoomLabels, type Zoom } from "@/lib/client/timeline/scale";
import { useTimelineCommands } from "@/lib/client/timeline-commands";
import { useWorkspace } from "@/lib/client/workspace-context";
import { saveBaselineAction } from "@/lib/actions/projects";
import { formatDateShort } from "@/lib/client/dates";
import { cn } from "@/lib/utils";

export type GanttOptions = { zoom: Zoom; criticalPath: boolean; baselineId: string | null; leftCollapsed: boolean; leftWidth: number; collapsedGroups: string[]; collapsedParents: string[] };

export function readGanttOptions(spec: ViewSpec): GanttOptions {
  const o = spec.options as Record<string, unknown>;
  return {
    zoom: zoomOrder.includes(o.ganttZoom as Zoom) ? (o.ganttZoom as Zoom) : "week",
    criticalPath: o.ganttCriticalPath === true,
    baselineId: typeof o.ganttBaseline === "string" ? o.ganttBaseline : null,
    leftCollapsed: o.ganttLeftCollapsed === true,
    leftWidth: typeof o.ganttLeftWidth === "number" ? Math.max(220, Math.min(800, o.ganttLeftWidth)) : 520,
    collapsedGroups: Array.isArray(o.ganttCollapsed) ? (o.ganttCollapsed as unknown[]).filter((k): k is string => typeof k === "string") : [],
    collapsedParents: Array.isArray(o.ganttCollapsedParents) ? (o.ganttCollapsedParents as unknown[]).filter((k): k is string => typeof k === "string") : [],
  };
}

/** Gantt controls in the command bar: zoom and fit, critical path, baseline, scroll to today, export (docs/10 section 4). */
export function GanttViewOptions({ project, spec, setSpec, canEdit }: { project: ProjectInfo; spec: ViewSpec; setSpec: (updater: (prev: ViewSpec) => ViewSpec) => void; canEdit: boolean }) {
  const { zoom, criticalPath, baselineId } = readGanttOptions(spec);
  const send = useTimelineCommands((s) => s.send);
  const { slug } = useWorkspace();
  const { toast } = useToast();
  const router = useRouter();
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const setOption = (key: string, value: unknown) => setSpec((prev) => ({ ...prev, options: { ...prev.options, [key]: value } }));
  const baseline = project.baselines.find((b) => b.id === baselineId) ?? null;

  const saveBaseline = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    const res = await saveBaselineAction(slug, { projectId: project.id, name: name.trim() || `Baseline ${formatDateShort(new Date().toISOString().slice(0, 10))}` });
    setPending(false);
    if (!res.ok) {
      toast({ title: "Could not save the baseline", description: res.error.message, kind: "danger" });
      return;
    }
    toast({ title: `${res.data.name} saved`, description: `${res.data.taskCount} tasks captured.`, kind: "success" });
    setOption("ganttBaseline", res.data.id);
    setSaveOpen(false);
    setName("");
    router.refresh();
  };

  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="subtle" size="sm" aria-label={`Zoom ${zoomLabels[zoom]}`}>
            <ZoomIn20Regular className="h-4 w-4" /> Zoom: {zoomLabels[zoom]}
          </Button>
        </MenuTrigger>
        <MenuContent className="w-48">
          <MenuRadioGroup value={zoom} onValueChange={(v) => setOption("ganttZoom", v as Zoom)}>
            {zoomOrder.map((z) => (
              <MenuRadioItem key={z} value={z}>
                {zoomLabels[z]}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
          <MenuSeparator />
          <MenuItem onSelect={() => send("fit")}>Fit to project</MenuItem>
          <MenuItem onSelect={() => send("scroll-selected")}>Scroll to selected</MenuItem>
        </MenuContent>
      </Menu>
      <Tooltip content="Scroll to today">
        <Button variant="subtle" size="sm" aria-label="Scroll to today" onClick={() => send("today")}>
          <CalendarToday20Regular className="h-4 w-4" /> Today
        </Button>
      </Tooltip>
      <Button variant="subtle" size="sm" aria-pressed={criticalPath} className={cn(criticalPath && "bg-selected text-brand")} onClick={() => setOption("ganttCriticalPath", !criticalPath)}>
        <Branch20Regular className="h-4 w-4" /> Critical path
      </Button>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="subtle" size="sm" aria-label={baseline ? `Baseline ${baseline.name}` : "Baseline"} className={cn(baseline && "bg-selected text-brand")}>
            <History20Regular className="h-4 w-4" /> {baseline ? `Baseline: ${baseline.name}` : "Baseline"}
          </Button>
        </MenuTrigger>
        <MenuContent className="w-64">
          <MenuLabel>Compare with</MenuLabel>
          <MenuRadioGroup value={baselineId ?? "none"} onValueChange={(v) => setOption("ganttBaseline", v === "none" ? null : v)}>
            <MenuRadioItem value="none">None</MenuRadioItem>
            {project.baselines.map((b) => (
              <MenuRadioItem key={b.id} value={b.id}>
                <span className="flex-1 truncate">{b.name}</span>
                <span className="ml-2 type-caption-1 text-fg-tertiary">{formatDateShort(b.createdAt.slice(0, 10))}</span>
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
          {canEdit ? (
            <>
              <MenuSeparator />
              <MenuItem onSelect={() => setSaveOpen(true)}>Save current dates as a baseline</MenuItem>
            </>
          ) : null}
        </MenuContent>
      </Menu>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="subtle" size="sm" aria-label="Export">
            <ArrowDownload16Regular /> Export
          </Button>
        </MenuTrigger>
        <MenuContent className="w-56">
          <MenuItem onSelect={() => send("export-png-visible")}>PNG of the visible range</MenuItem>
          <MenuItem onSelect={() => send("export-png-full")}>PNG of the full plan</MenuItem>
          <MenuItem onSelect={() => send("export-pdf")}>PDF (print)</MenuItem>
          <MenuSeparator />
          <MenuCheckboxItem checked={spec.subtasks === "nested"} onSelect={(e) => e.preventDefault()} onCheckedChange={(v) => setSpec((prev) => ({ ...prev, subtasks: v ? "nested" : "hidden" }))}>
            Show subtasks
          </MenuCheckboxItem>
        </MenuContent>
      </Menu>
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent
          title="Save baseline"
          description="Captures the start and due date of every task so you can compare the plan later."
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setSaveOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" form="save-baseline" loading={pending}>
                Save baseline
              </Button>
            </>
          }
        >
          <form id="save-baseline" onSubmit={saveBaseline}>
            <Field label="Name">
              <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Plan v1" maxLength={80} />
            </Field>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
