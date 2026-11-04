"use client";

import * as React from "react";
import { ChevronLeft20Regular, ChevronRight20Regular, Person20Regular, PersonProhibited20Regular } from "@fluentui/react-icons";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuCheckboxItem, MenuRadioGroup, MenuRadioItem, MenuTrigger, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/tooltip";
import type { ViewSpec, Filter } from "@/lib/validation/view-spec";
import { readCalendarOptions, stepAnchor, monthLabel, weekLabel, dayLabel, weekRange, type CalendarMode } from "@/lib/client/calendar";
import { useCalendarStore } from "@/lib/client/calendar-store";
import { useWorkspace } from "@/lib/client/workspace-context";
import { cn } from "@/lib/utils";

const modes: Array<{ value: CalendarMode; label: string }> = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "day", label: "Day" },
  { value: "schedule", label: "Schedule" },
];

const isMe = (f: Filter | { kind: "group" }): boolean => f.kind === "filter" && f.field === "assignee" && f.op === "is_me";
const isUnassigned = (f: Filter | { kind: "group" }): boolean => f.kind === "filter" && f.field === "assignee" && f.op === "is_empty";

/** Calendar controls in the command bar: mode, period navigation, Me and Unassigned chips, weekends (docs/11 section 7). */
export function CalendarViewOptions({ spec, setSpec }: { spec: ViewSpec; setSpec: (updater: (prev: ViewSpec) => ViewSpec) => void }) {
  const { today, workspace } = useWorkspace();
  const { mode, weekends } = readCalendarOptions(spec);
  const anchor = useCalendarStore((s) => s.anchor) ?? today;
  const setAnchor = useCalendarStore((s) => s.setAnchor);
  const setOption = (key: string, value: unknown) => setSpec((prev) => ({ ...prev, options: { ...prev.options, [key]: value } }));
  const meOn = spec.filters.items.some(isMe);
  const unassignedOn = spec.filters.items.some(isUnassigned);
  const toggleFilter = (on: boolean, match: (f: Filter | { kind: "group" }) => boolean, add: Filter) =>
    setSpec((prev) => ({ ...prev, filters: { ...prev.filters, items: on ? prev.filters.items.filter((f) => !match(f)) : [...prev.filters.items.filter((f) => !isMe(f) && !isUnassigned(f)), add] } }));
  const label = mode === "month" ? monthLabel(anchor) : mode === "week" ? weekLabel(weekRange(anchor, workspace.weekStartsOn)) : mode === "day" ? dayLabel(anchor) : "Next 60 days";

  return (
    <>
      <div className="inline-flex rounded-sm bg-subtle p-0.5" role="radiogroup" aria-label="Calendar mode">
        {modes.map((m) => (
          <button key={m.value} type="button" role="radio" aria-checked={mode === m.value} onClick={() => setOption("calendarMode", m.value)} className={cn("h-6 rounded-xs px-2 type-caption-1-strong text-fg-secondary", mode === m.value && "bg-surface text-fg shadow-menu")}>
            {m.label}
          </button>
        ))}
      </div>
      {mode !== "schedule" ? (
        <div className="flex items-center gap-0.5">
          <Button variant="subtle" size="icon-sm" aria-label={`Previous ${mode}`} onClick={() => setAnchor(stepAnchor(anchor, mode, -1))}>
            <ChevronLeft20Regular className="h-4 w-4" />
          </Button>
          <Button variant="subtle" size="sm" onClick={() => setAnchor(today)}>
            Today
          </Button>
          <Button variant="subtle" size="icon-sm" aria-label={`Next ${mode}`} onClick={() => setAnchor(stepAnchor(anchor, mode, 1))}>
            <ChevronRight20Regular className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
      <span className="px-1 type-body-1-strong" aria-live="polite">
        {label}
      </span>
      <Tooltip content="Only my tasks">
        <Button variant="subtle" size="sm" aria-label="Only my tasks" aria-pressed={meOn} className={cn(meOn && "bg-selected text-brand")} onClick={() => toggleFilter(meOn, isMe, { kind: "filter", field: "assignee", op: "is_me" })}>
          <Person20Regular className="h-4 w-4" /> Me
        </Button>
      </Tooltip>
      <Tooltip content="Only unassigned tasks">
        <Button variant="subtle" size="sm" aria-label="Only unassigned tasks" aria-pressed={unassignedOn} className={cn(unassignedOn && "bg-selected text-brand")} onClick={() => toggleFilter(unassignedOn, isUnassigned, { kind: "filter", field: "assignee", op: "is_empty" })}>
          <PersonProhibited20Regular className="h-4 w-4" /> Unassigned
        </Button>
      </Tooltip>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="subtle" size="sm" aria-label="Calendar options">
            More
          </Button>
        </MenuTrigger>
        <MenuContent className="w-56">
          <MenuCheckboxItem checked={weekends} onSelect={(e) => e.preventDefault()} onCheckedChange={(v) => setOption("calendarWeekends", Boolean(v))}>
            Show weekends
          </MenuCheckboxItem>
          <MenuSeparator />
          <MenuLabel>Mode</MenuLabel>
          <MenuRadioGroup value={mode} onValueChange={(v) => setOption("calendarMode", v as CalendarMode)}>
            {modes.map((m) => (
              <MenuRadioItem key={m.value} value={m.value}>
                {m.label}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuContent>
      </Menu>
    </>
  );
}
