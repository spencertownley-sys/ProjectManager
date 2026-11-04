"use client";

import * as React from "react";
import { Command } from "cmdk";
import { addMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, format, isSameDay, isSameMonth, parseISO } from "date-fns";
import { ChevronRight16Regular, Checkmark16Regular, Dismiss20Regular, Flag16Regular, Person16Regular, Calendar20Regular, Diamond16Regular } from "@fluentui/react-icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Menu, MenuContent, MenuItem, MenuTrigger, MenuRadioGroup, MenuRadioItem } from "@/components/ui/menu";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { StatusRef, PersonRef } from "@/lib/query-engine/types";
import type { Priority } from "@/lib/db/schema";
import { formatDue, toIso, todayIso, addDays as addDaysIso } from "@/lib/client/dates";

export const priorityMeta: Record<Priority, { label: string; color: string; rank: number }> = {
  urgent: { label: "Urgent", color: "red", rank: 4 },
  high: { label: "High", color: "orange", rank: 3 },
  medium: { label: "Medium", color: "yellow", rank: 2 },
  low: { label: "Low", color: "navy", rank: 1 },
  none: { label: "No priority", color: "gray", rank: 0 },
};

export function StatusPicker({ value, statuses, onChange, size = "md", disabled }: { value: StatusRef; statuses: StatusRef[]; onChange: (statusId: string) => void; size?: "sm" | "md"; disabled?: boolean }) {
  return (
    <Menu>
      <MenuTrigger asChild disabled={disabled}>
        <button type="button" className={cn("inline-flex max-w-full items-center rounded-sm hover:bg-hover", size === "md" ? "h-7 px-1" : "h-5")} aria-label={`Status: ${value.name}`}>
          <Badge color={value.color} dot>
            {value.name}
          </Badge>
        </button>
      </MenuTrigger>
      <MenuContent>
        <MenuRadioGroup value={value.id} onValueChange={onChange}>
          {statuses.map((s) => (
            <MenuRadioItem key={s.id} value={s.id}>
              <span data-color={s.color} className="mr-2 inline-block h-2 w-2 rounded-full bg-item" />
              {s.name}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}

export function PriorityPicker({ value, onChange, compact, disabled }: { value: Priority; onChange: (p: Priority) => void; compact?: boolean; disabled?: boolean }) {
  const meta = priorityMeta[value];
  return (
    <Menu>
      <MenuTrigger asChild disabled={disabled}>
        <button type="button" className={cn("inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-sm px-1 type-body-1 hover:bg-hover", value === "none" && "text-fg-tertiary")} aria-label={`Priority: ${meta.label}`}>
          <Flag16Regular data-color={meta.color} className={cn(value !== "none" && "text-item")} />
          {!compact ? <span>{value === "none" ? "None" : meta.label}</span> : null}
        </button>
      </MenuTrigger>
      <MenuContent>
        <MenuRadioGroup value={value} onValueChange={(v) => onChange(v as Priority)}>
          {(Object.keys(priorityMeta) as Priority[]).map((p) => (
            <MenuRadioItem key={p} value={p}>
              <Flag16Regular data-color={priorityMeta[p].color} className={cn("mr-2", p !== "none" && "text-item")} />
              {priorityMeta[p].label}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}

export function PersonPicker({ value, people, onChange, me, compact, placeholder = "Unassigned", disabled }: { value: PersonRef | null; people: PersonRef[]; onChange: (id: string | null) => void; me?: string; compact?: boolean; placeholder?: string; disabled?: boolean }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button type="button" className={cn("inline-flex h-7 max-w-full items-center gap-1.5 rounded-sm px-1 type-body-1 hover:bg-hover", !value && "text-fg-tertiary")} aria-label={value ? `Assignee: ${value.displayName}` : "Assign"}>
          {value ? <Avatar name={value.displayName} src={value.avatarUrl} size="xs" /> : <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-border-strong"><Person16Regular className="h-3 w-3" /></span>}
          {!compact ? <span className="truncate">{value ? value.displayName : placeholder}</span> : null}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0">
        <Command label="Assign to">
          <Command.Input autoFocus placeholder="Search people" className="h-9 w-full border-b border-border bg-transparent px-3 type-body-1 outline-none placeholder:text-fg-tertiary" />
          <Command.List className="max-h-64 overflow-y-auto p-1">
            <Command.Empty className="px-2 py-4 type-body-1 text-fg-secondary">No one matches.</Command.Empty>
            {me ? (
              <Command.Item value="me assign to me" className="flex h-8 items-center gap-2 rounded-sm px-2 type-body-1 data-[selected=true]:bg-hover" onSelect={() => { onChange(me); setOpen(false); }}>
                <Person16Regular className="text-fg-secondary" /> Assign to me
              </Command.Item>
            ) : null}
            <Command.Item value="unassigned none" className="flex h-8 items-center gap-2 rounded-sm px-2 type-body-1 data-[selected=true]:bg-hover" onSelect={() => { onChange(null); setOpen(false); }}>
              <Dismiss20Regular className="h-4 w-4 text-fg-secondary" /> Unassigned
            </Command.Item>
            {people.map((p) => (
              <Command.Item key={p.id} value={`${p.displayName} ${p.email ?? ""}`} className="flex h-8 items-center gap-2 rounded-sm px-2 type-body-1 data-[selected=true]:bg-hover" onSelect={() => { onChange(p.id); setOpen(false); }}>
                <Avatar name={p.displayName} src={p.avatarUrl} size="xs" />
                <span className="truncate">{p.displayName}</span>
                {value?.id === p.id ? <Checkmark16Regular className="ml-auto text-brand" /> : null}
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function DatePicker({ value, onChange, label, compact, minDate, state, disabled, weekStartsOn = 1 }: { value: string | null; onChange: (iso: string | null) => void; label?: string; compact?: boolean; minDate?: string | null; state?: "overdue" | "soon" | "later" | "none"; disabled?: boolean; weekStartsOn?: number }) {
  const [open, setOpenState] = React.useState(false);
  const today = todayIso();
  const [month, setMonth] = React.useState(() => startOfMonth(parseISO(value ?? today)));
  const setOpen = (next: boolean) => {
    if (next) setMonth(startOfMonth(parseISO(value ?? today)));
    setOpenState(next);
  };
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(month), { weekStartsOn: weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6 }) });
  const weekdays = Array.from({ length: 7 }, (_, i) => format(days[i], "EEEEE"));
  const quick = [
    { label: "Today", iso: today },
    { label: "Tomorrow", iso: addDaysIso(today, 1) },
    { label: "Next week", iso: addDaysIso(today, 7) },
  ];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn("inline-flex h-7 items-center gap-1.5 rounded-sm px-1 type-body-1 hover:bg-hover", !value && "text-fg-tertiary", state === "overdue" && "text-danger", state === "soon" && "text-warning")}
          aria-label={label ?? "Date"}
        >
          <Calendar20Regular className="h-4 w-4" />
          {!compact || value ? <span>{value ? formatDue(value, today) : (label ?? "Set date")}</span> : null}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64">
        <div className="flex items-center justify-between px-1 pb-2">
          <Button variant="subtle" size="icon-sm" aria-label="Previous month" onClick={() => setMonth((m) => addMonths(m, -1))}>
            <ChevronRight16Regular className="rotate-180" />
          </Button>
          <span className="type-body-1-strong">{format(month, "MMMM yyyy")}</span>
          <Button variant="subtle" size="icon-sm" aria-label="Next month" onClick={() => setMonth((m) => addMonths(m, 1))}>
            <ChevronRight16Regular />
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-px">
          {weekdays.map((d, i) => (
            <div key={i} className="py-1 text-center type-caption-1 text-fg-tertiary">
              {d}
            </div>
          ))}
          {days.map((d) => {
            const iso = toIso(d);
            const selected = value === iso;
            const disabledDay = minDate ? iso < minDate : false;
            return (
              <button
                key={iso}
                type="button"
                disabled={disabledDay}
                onClick={() => {
                  onChange(iso);
                  setOpen(false);
                }}
                className={cn(
                  "h-8 rounded-sm type-body-1 hover:bg-hover disabled:text-fg-disabled",
                  !isSameMonth(d, month) && "text-fg-tertiary",
                  isSameDay(d, parseISO(today)) && "font-semibold text-brand",
                  selected && "bg-brand text-fg-on-brand hover:bg-brand-hover",
                )}
              >
                {format(d, "d")}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex items-center gap-1 border-t border-border pt-2">
          {quick.map((q) => (
            <Button key={q.label} variant="subtle" size="sm" onClick={() => { onChange(q.iso); setOpen(false); }}>
              {q.label}
            </Button>
          ))}
          {value ? (
            <Button variant="subtle" size="sm" className="ml-auto text-fg-secondary" onClick={() => { onChange(null); setOpen(false); }}>
              Clear
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function MilestoneToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!value)} className={cn("inline-flex h-7 items-center gap-1.5 rounded-sm px-1 type-body-1 hover:bg-hover", value ? "text-brand" : "text-fg-tertiary")} aria-pressed={value}>
      <Diamond16Regular />
      {value ? "Milestone" : "Not a milestone"}
    </button>
  );
}

export function EstimateInput({ value, unit, onChange }: { value: number | null; unit: "points" | "hours"; onChange: (v: number | null) => void }) {
  const [draft, setDraft] = React.useState(value == null ? "" : String(value));
  const [lastValue, setLastValue] = React.useState(value);
  if (lastValue !== value) {
    setLastValue(value);
    setDraft(value == null ? "" : String(value));
  }
  return (
    <span className="inline-flex items-center gap-1">
      <input
        value={draft}
        inputMode="decimal"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = draft.trim() === "" ? null : Number(draft);
          if (n !== value && (n === null || Number.isFinite(n))) onChange(n);
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="h-7 w-16 rounded-sm border border-transparent bg-transparent px-1.5 type-body-1 hover:border-border focus:border-brand focus:bg-surface focus:outline-none"
        placeholder="0"
        aria-label="Estimate"
      />
      <span className="type-caption-1 text-fg-tertiary">{unit === "points" ? "pts" : "h"}</span>
    </span>
  );
}

export function SimpleSelect<T extends string>({ value, options, onChange, placeholder = "Select", ariaLabel }: { value: T | null; options: Array<{ value: T; label: string; color?: string }>; onChange: (v: T | null) => void; placeholder?: string; ariaLabel: string }) {
  const current = options.find((o) => o.value === value);
  return (
    <Menu>
      <MenuTrigger asChild>
        <button type="button" className={cn("inline-flex h-7 max-w-full items-center gap-1 rounded-sm px-1 type-body-1 hover:bg-hover", !current && "text-fg-tertiary")} aria-label={ariaLabel}>
          {current ? (current.color ? <Badge color={current.color}>{current.label}</Badge> : current.label) : placeholder}
        </button>
      </MenuTrigger>
      <MenuContent>
        <MenuItem onSelect={() => onChange(null)}>None</MenuItem>
        {options.map((o) => (
          <MenuItem key={o.value} onSelect={() => onChange(o.value)}>
            {o.color ? <span data-color={o.color} className="mr-2 inline-block h-2 w-2 rounded-full bg-item" /> : null}
            {o.label}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}
