"use client";

import * as React from "react";
import { ColumnTriple20Regular, Layer20Regular, AppsListDetail20Regular } from "@fluentui/react-icons";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuTrigger, MenuRadioGroup, MenuRadioItem, MenuLabel } from "@/components/ui/menu";
import type { ProjectInfo } from "@/components/views/types";
import type { ViewSpec, FieldRef } from "@/lib/validation/view-spec";
import { readBoardOptions, columnFieldOptions, swimlaneFieldOptions, boardDensities, type BoardDensity } from "@/lib/client/board";
import { useWorkspace } from "@/lib/client/workspace-context";

/** Board controls that live in the command bar: columns field, swimlanes, and card density (docs/11 section 3). */
export function BoardViewOptions({ project, spec, setSpec }: { project: ProjectInfo; spec: ViewSpec; setSpec: (updater: (prev: ViewSpec) => ViewSpec) => void }) {
  const { workspace } = useWorkspace();
  const { columnField, density } = readBoardOptions(spec);
  const columnOptions = React.useMemo(() => columnFieldOptions(project.fields.map((f) => ({ id: f.id, name: f.name, type: f.type as never, config: f.config }))), [project.fields]);
  const laneOptions = swimlaneFieldOptions.map((o) => (o.value === "cycle" ? { ...o, label: workspace.cycleLabel } : o));
  const columnLabel = columnOptions.find((o) => o.value === columnField)?.label ?? "Status";
  const laneValue = spec.groupBy && spec.groupBy !== columnField ? spec.groupBy : "none";
  const laneLabel = laneOptions.find((o) => o.value === laneValue)?.label ?? "None";
  const densityLabel = boardDensities.find((d) => d.value === density)?.label ?? "Standard";

  const setOption = (key: string, value: unknown) => setSpec((prev) => ({ ...prev, options: { ...prev.options, [key]: value } }));

  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="subtle" size="sm" aria-label={`Columns by ${columnLabel}`}>
            <ColumnTriple20Regular className="h-4 w-4" /> Columns: {columnLabel}
          </Button>
        </MenuTrigger>
        <MenuContent className="w-56">
          <MenuLabel>Columns by</MenuLabel>
          <MenuRadioGroup value={columnField} onValueChange={(v) => setOption("boardColumns", v as FieldRef)}>
            {columnOptions.map((o) => (
              <MenuRadioItem key={o.value} value={o.value}>
                {o.label}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuContent>
      </Menu>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="subtle" size="sm" aria-label={`Swimlanes by ${laneLabel}`}>
            <Layer20Regular className="h-4 w-4" /> Swimlanes: {laneLabel}
          </Button>
        </MenuTrigger>
        <MenuContent className="w-56">
          <MenuLabel>Swimlanes by</MenuLabel>
          <MenuRadioGroup value={laneValue} onValueChange={(v) => setSpec((prev) => ({ ...prev, groupBy: v === "none" ? undefined : (v as FieldRef) }))}>
            <MenuRadioItem value="none">None</MenuRadioItem>
            {laneOptions
              .filter((o) => o.value !== columnField)
              .map((o) => (
                <MenuRadioItem key={o.value} value={o.value}>
                  {o.label}
                </MenuRadioItem>
              ))}
          </MenuRadioGroup>
        </MenuContent>
      </Menu>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="subtle" size="sm" aria-label={`Card density ${densityLabel}`}>
            <AppsListDetail20Regular className="h-4 w-4" /> Cards: {densityLabel}
          </Button>
        </MenuTrigger>
        <MenuContent className="w-48">
          <MenuLabel>Card density</MenuLabel>
          <MenuRadioGroup value={density} onValueChange={(v) => setOption("boardDensity", v as BoardDensity)}>
            {boardDensities.map((d) => (
              <MenuRadioItem key={d.value} value={d.value}>
                {d.label}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuContent>
      </Menu>
    </>
  );
}
