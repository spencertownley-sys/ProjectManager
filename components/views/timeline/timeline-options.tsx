"use client";

import * as React from "react";
import { ZoomIn20Regular, Branch20Regular, CalendarToday20Regular, ArrowDownload16Regular } from "@fluentui/react-icons";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/tooltip";
import type { ViewSpec } from "@/lib/validation/view-spec";
import { zoomOrder, zoomLabels, type Zoom } from "@/lib/client/timeline/scale";
import { useTimelineCommands } from "@/lib/client/timeline-commands";
import { cn } from "@/lib/utils";

export type TimelineOptions = { zoom: Zoom; dependencies: boolean; criticalPath: boolean; collapsedGroups: string[]; trayCollapsed: boolean };

export function readTimelineOptions(spec: ViewSpec): TimelineOptions {
  const o = spec.options as Record<string, unknown>;
  return {
    zoom: zoomOrder.includes(o.timelineZoom as Zoom) ? (o.timelineZoom as Zoom) : "month",
    dependencies: o.timelineDependencies === true,
    criticalPath: o.timelineCriticalPath === true,
    collapsedGroups: Array.isArray(o.timelineCollapsed) ? (o.timelineCollapsed as unknown[]).filter((k): k is string => typeof k === "string") : [],
    trayCollapsed: o.timelineTrayCollapsed === true,
  };
}

/** Timeline controls in the command bar: zoom and fit, today, dependencies, critical path, export (docs/11 section 6). */
export function TimelineViewOptions({ spec, setSpec }: { spec: ViewSpec; setSpec: (updater: (prev: ViewSpec) => ViewSpec) => void }) {
  const { zoom, dependencies, criticalPath } = readTimelineOptions(spec);
  const send = useTimelineCommands((s) => s.send);
  const setOption = (key: string, value: unknown) => setSpec((prev) => ({ ...prev, options: { ...prev.options, [key]: value } }));
  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="subtle" size="sm" aria-label={`Zoom ${zoomLabels[zoom]}`}>
            <ZoomIn20Regular className="h-4 w-4" /> Zoom: {zoomLabels[zoom]}
          </Button>
        </MenuTrigger>
        <MenuContent className="w-48">
          <MenuRadioGroup value={zoom} onValueChange={(v) => setOption("timelineZoom", v as Zoom)}>
            {zoomOrder.map((z) => (
              <MenuRadioItem key={z} value={z}>
                {zoomLabels[z]}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
          <MenuSeparator />
          <MenuItem onSelect={() => send("fit")}>Fit to plan</MenuItem>
          <MenuItem onSelect={() => send("scroll-selected")}>Scroll to selected</MenuItem>
        </MenuContent>
      </Menu>
      <Tooltip content="Scroll to today">
        <Button variant="subtle" size="sm" aria-label="Scroll to today" onClick={() => send("today")}>
          <CalendarToday20Regular className="h-4 w-4" /> Today
        </Button>
      </Tooltip>
      <Button variant="subtle" size="sm" aria-pressed={dependencies} className={cn(dependencies && "bg-selected text-brand")} onClick={() => setOption("timelineDependencies", !dependencies)}>
        <Branch20Regular className="h-4 w-4" /> Dependencies
      </Button>
      {dependencies ? (
        <Button variant="subtle" size="sm" aria-pressed={criticalPath} className={cn(criticalPath && "bg-selected text-brand")} onClick={() => setOption("timelineCriticalPath", !criticalPath)}>
          Critical path
        </Button>
      ) : null}
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
        </MenuContent>
      </Menu>
    </>
  );
}
