"use client";

import * as React from "react";
import { Add20Regular, Filter20Regular, ArrowSort20Regular, Group20Regular, Eye20Regular, Dismiss20Regular, MoreHorizontal20Regular, Link16Regular } from "@fluentui/react-icons";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuTrigger, MenuRadioGroup, MenuRadioItem, MenuCheckboxItem, MenuSeparator, MenuLabel } from "@/components/ui/menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { Divider } from "@/components/ui/misc";
import type { ViewSpec, Filter, FilterOperator, FieldRef } from "@/lib/validation/view-spec";
import type { ProjectInfo } from "@/components/views/types";
import { useWorkspace } from "@/lib/client/workspace-context";
import { cn } from "@/lib/utils";

type FieldDef = { ref: FieldRef; label: string; kind: "text" | "status" | "person" | "date" | "priority" | "number" | "select" | "checkbox" | "section" | "cycle" | "tags" };

export function fieldDefs(project: ProjectInfo, cycleLabel: string): FieldDef[] {
  const std: FieldDef[] = [
    { ref: "title", label: "Title", kind: "text" },
    { ref: "status", label: "Status", kind: "status" },
    { ref: "assignee", label: "Assignee", kind: "person" },
    { ref: "due_date", label: "Due date", kind: "date" },
    { ref: "start_date", label: "Start date", kind: "date" },
    { ref: "priority", label: "Priority", kind: "priority" },
    { ref: "estimate", label: "Estimate", kind: "number" },
    { ref: "section", label: "Section", kind: "section" },
    { ref: "cycle", label: cycleLabel, kind: "cycle" },
    { ref: "tags", label: "Tags", kind: "tags" },
    { ref: "is_milestone", label: "Milestone", kind: "checkbox" },
    { ref: "created_at", label: "Created", kind: "date" },
    { ref: "updated_at", label: "Updated", kind: "date" },
  ];
  const custom: FieldDef[] = project.fields.map((f) => ({
    ref: `custom:${f.id}` as FieldRef,
    label: f.name,
    kind: f.type === "single_select" || f.type === "multi_select" ? "select" : f.type === "person" ? "person" : f.type === "date" ? "date" : f.type === "checkbox" ? "checkbox" : ["number", "currency", "percent"].includes(f.type) ? "number" : "text",
  }));
  return [...std, ...custom];
}

const operatorsByKind: Record<FieldDef["kind"], Array<{ op: FilterOperator; label: string; needsValue: boolean }>> = {
  text: [
    { op: "contains", label: "contains", needsValue: true },
    { op: "not_contains", label: "does not contain", needsValue: true },
    { op: "is", label: "is", needsValue: true },
    { op: "is_empty", label: "is empty", needsValue: false },
    { op: "is_not_empty", label: "is not empty", needsValue: false },
  ],
  status: [
    { op: "is_any_of", label: "is any of", needsValue: true },
    { op: "is_none_of", label: "is none of", needsValue: true },
  ],
  person: [
    { op: "is_me", label: "is me", needsValue: false },
    { op: "is_any_of", label: "is any of", needsValue: true },
    { op: "is_none_of", label: "is none of", needsValue: true },
    { op: "is_empty", label: "is unassigned", needsValue: false },
    { op: "is_not_empty", label: "is assigned", needsValue: false },
  ],
  date: [
    { op: "is_today", label: "is today", needsValue: false },
    { op: "next_7_days", label: "is in the next 7 days", needsValue: false },
    { op: "is_this_week", label: "is this week", needsValue: false },
    { op: "is_overdue", label: "is overdue", needsValue: false },
    { op: "before", label: "is before", needsValue: true },
    { op: "after", label: "is after", needsValue: true },
    { op: "is", label: "is", needsValue: true },
    { op: "is_empty", label: "is empty", needsValue: false },
    { op: "is_not_empty", label: "is set", needsValue: false },
  ],
  priority: [
    { op: "is_any_of", label: "is any of", needsValue: true },
    { op: "is_none_of", label: "is none of", needsValue: true },
  ],
  number: [
    { op: "eq", label: "equals", needsValue: true },
    { op: "gt", label: "is greater than", needsValue: true },
    { op: "lt", label: "is less than", needsValue: true },
    { op: "is_empty", label: "is empty", needsValue: false },
  ],
  select: [
    { op: "is_any_of", label: "is any of", needsValue: true },
    { op: "is_none_of", label: "is none of", needsValue: true },
    { op: "is_empty", label: "is empty", needsValue: false },
  ],
  checkbox: [
    { op: "is_checked", label: "is checked", needsValue: false },
    { op: "is_not_checked", label: "is not checked", needsValue: false },
  ],
  section: [
    { op: "is_any_of", label: "is any of", needsValue: true },
    { op: "is_none_of", label: "is none of", needsValue: true },
  ],
  cycle: [
    { op: "is_current_cycle", label: "is the current one", needsValue: false },
    { op: "is_any_of", label: "is any of", needsValue: true },
    { op: "is_empty", label: "is empty", needsValue: false },
  ],
  tags: [
    { op: "includes_any", label: "includes any of", needsValue: true },
    { op: "includes_all", label: "includes all of", needsValue: true },
    { op: "includes_none", label: "includes none of", needsValue: true },
    { op: "is_empty", label: "is empty", needsValue: false },
  ],
};

function optionsFor(def: FieldDef, project: ProjectInfo, members: ProjectInfo["members"], tags: Array<{ id: string; name: string }>) {
  switch (def.kind) {
    case "status":
      return project.statuses.map((s) => ({ value: s.id, label: s.name }));
    case "person":
      return members.map((m) => ({ value: m.id, label: m.displayName }));
    case "priority":
      return ["urgent", "high", "medium", "low", "none"].map((p) => ({ value: p, label: p[0].toUpperCase() + p.slice(1) }));
    case "section":
      return project.sections.map((s) => ({ value: s.id, label: s.name }));
    case "cycle":
      return project.cycles.map((c) => ({ value: c.id, label: c.name }));
    case "tags":
      return tags.map((t) => ({ value: t.id, label: t.name }));
    case "select": {
      const id = def.ref.slice(7);
      const f = project.fields.find((x) => x.id === id);
      const opts = ((f?.config as { options?: Array<{ id: string; name: string }> })?.options) ?? [];
      return opts.map((o) => ({ value: o.id, label: o.name }));
    }
    default:
      return [];
  }
}

type Props = {
  project: ProjectInfo;
  spec: ViewSpec;
  setSpec: (updater: (prev: ViewSpec) => ViewSpec) => void;
  onReset: () => void;
  onQuickAdd: () => void;
  onSaveView: () => void;
  onShare: () => void;
  viewOptions?: React.ReactNode;
  canEdit: boolean;
  tags?: Array<{ id: string; name: string }>;
};

export function CommandBar({ project, spec, setSpec, onReset, onQuickAdd, onSaveView, onShare, viewOptions, canEdit, tags = [] }: Props) {
  const { workspace, members } = useWorkspace();
  const defs = React.useMemo(() => fieldDefs(project, workspace.cycleLabel), [project, workspace.cycleLabel]);
  const filters = spec.filters.items.filter((i): i is Filter => i.kind === "filter");
  const groupable = defs.filter((d) => ["status", "person", "priority", "section", "cycle", "select", "date", "checkbox", "tags"].includes(d.kind) && d.ref !== "created_at" && d.ref !== "updated_at" && d.ref !== "start_date");
  const sortable = defs.filter((d) => d.kind !== "tags");
  const isDefault = filters.length === 0 && !spec.groupBy && spec.sorts.length === 1 && spec.sorts[0].field === "manual";

  const updateFilter = (index: number, patch: Partial<Filter>) =>
    setSpec((prev) => ({ ...prev, filters: { ...prev.filters, items: prev.filters.items.map((it, i) => (i === index && it.kind === "filter" ? { ...it, ...patch } : it)) } }));
  const removeFilter = (index: number) => setSpec((prev) => ({ ...prev, filters: { ...prev.filters, items: prev.filters.items.filter((_, i) => i !== index) } }));
  const addFilter = (def: FieldDef) => {
    const first = operatorsByKind[def.kind][0];
    setSpec((prev) => ({ ...prev, filters: { ...prev.filters, items: [...prev.filters.items, { kind: "filter", field: def.ref, op: first.op, value: first.needsValue ? (["status", "person", "priority", "section", "cycle", "select", "tags"].includes(def.kind) ? [] : "") : undefined }] } }));
  };

  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border bg-surface px-3">
      {canEdit ? (
        <Tooltip content="Add task" shortcut="N">
          <Button variant="primary" size="sm" onClick={onQuickAdd}>
            <Add20Regular className="h-4 w-4" /> Add task
          </Button>
        </Tooltip>
      ) : null}
      <Divider vertical className="mx-1" />

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="subtle" size="sm" className={cn(filters.length > 0 && "bg-selected text-brand")}>
            <Filter20Regular className="h-4 w-4" /> Filter{filters.length ? ` (${filters.length})` : ""}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[560px] max-w-[calc(100vw-32px)]">
          <div className="flex flex-col gap-2">
            {filters.length > 1 ? (
              <div className="flex items-center gap-2 type-caption-1 text-fg-secondary">
                Match
                <div className="inline-flex rounded-sm bg-subtle p-0.5">
                  {(["and", "or"] as const).map((op) => (
                    <button key={op} type="button" className={cn("h-6 rounded-xs px-2 type-caption-1", spec.filters.op === op && "bg-surface font-semibold")} onClick={() => setSpec((prev) => ({ ...prev, filters: { ...prev.filters, op } }))}>
                      {op === "and" ? "All" : "Any"}
                    </button>
                  ))}
                </div>
                of these conditions
              </div>
            ) : null}
            {filters.length === 0 ? <p className="type-body-1 text-fg-secondary">No filters. Add one below.</p> : null}
            {spec.filters.items.map((item, index) => {
              if (item.kind !== "filter") return null;
              const def = defs.find((d) => d.ref === item.field) ?? defs[0];
              const ops = operatorsByKind[def.kind];
              const current = ops.find((o) => o.op === item.op) ?? ops[0];
              const opts = optionsFor(def, project, members, tags);
              return (
                <div key={index} className="flex items-center gap-1.5">
                  <select aria-label="Field" value={item.field} onChange={(e) => { const nd = defs.find((d) => d.ref === e.target.value)!; const first = operatorsByKind[nd.kind][0]; updateFilter(index, { field: nd.ref, op: first.op, value: first.needsValue ? (opts.length ? [] : "") : undefined }); }} className="h-7 rounded-sm border border-border-strong bg-surface px-1.5 type-body-1">
                    {defs.map((d) => (
                      <option key={d.ref} value={d.ref}>{d.label}</option>
                    ))}
                  </select>
                  <select aria-label="Operator" value={item.op} onChange={(e) => { const o = ops.find((x) => x.op === e.target.value)!; updateFilter(index, { op: o.op, value: o.needsValue ? (item.value ?? (opts.length ? [] : "")) : undefined }); }} className="h-7 rounded-sm border border-border-strong bg-surface px-1.5 type-body-1">
                    {ops.map((o) => (
                      <option key={o.op} value={o.op}>{o.label}</option>
                    ))}
                  </select>
                  {current.needsValue ? (
                    opts.length ? (
                      <Menu>
                        <MenuTrigger asChild>
                          <Button variant="secondary" size="sm" className="max-w-56 justify-start">
                            <span className="truncate">{Array.isArray(item.value) && item.value.length ? opts.filter((o) => (item.value as string[]).includes(o.value)).map((o) => o.label).join(", ") : "Choose"}</span>
                          </Button>
                        </MenuTrigger>
                        <MenuContent>
                          {opts.map((o) => (
                            <MenuCheckboxItem key={o.value} checked={Array.isArray(item.value) && item.value.includes(o.value)} onCheckedChange={(checked) => { const cur = Array.isArray(item.value) ? (item.value as string[]) : []; updateFilter(index, { value: checked ? [...cur, o.value] : cur.filter((v) => v !== o.value) }); }} onSelect={(e) => e.preventDefault()}>
                              {o.label}
                            </MenuCheckboxItem>
                          ))}
                        </MenuContent>
                      </Menu>
                    ) : def.kind === "date" ? (
                      <Input type="date" aria-label="Value" value={typeof item.value === "string" ? item.value : ""} onChange={(e) => updateFilter(index, { value: e.target.value })} className="h-7 w-40" />
                    ) : (
                      <Input aria-label="Value" type={def.kind === "number" ? "number" : "text"} value={typeof item.value === "string" || typeof item.value === "number" ? String(item.value) : ""} onChange={(e) => updateFilter(index, { value: def.kind === "number" ? Number(e.target.value) : e.target.value })} className="h-7 w-40" placeholder="Value" />
                    )
                  ) : null}
                  <Button variant="subtle" size="icon-sm" aria-label="Remove filter" onClick={() => removeFilter(index)}>
                    <Dismiss20Regular className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
            <div className="flex items-center gap-2 pt-1">
              <Menu>
                <MenuTrigger asChild>
                  <Button variant="subtle" size="sm">
                    <Add20Regular className="h-4 w-4" /> Add filter
                  </Button>
                </MenuTrigger>
                <MenuContent>
                  {defs.map((d) => (
                    <MenuItem key={d.ref} onSelect={() => addFilter(d)}>
                      {d.label}
                    </MenuItem>
                  ))}
                </MenuContent>
              </Menu>
              {filters.length ? (
                <Button variant="subtle" size="sm" className="ml-auto text-fg-secondary" onClick={() => setSpec((prev) => ({ ...prev, filters: { ...prev.filters, items: prev.filters.items.filter((i) => i.kind !== "filter") } }))}>
                  Clear all
                </Button>
              ) : null}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Menu>
        <MenuTrigger asChild>
          <Button variant="subtle" size="sm" className={cn(spec.sorts[0]?.field !== "manual" && "bg-selected text-brand")}>
            <ArrowSort20Regular className="h-4 w-4" /> Sort
          </Button>
        </MenuTrigger>
        <MenuContent className="w-56">
          <MenuLabel>Sort by</MenuLabel>
          <MenuRadioGroup value={String(spec.sorts[0]?.field ?? "manual")} onValueChange={(v) => setSpec((prev) => ({ ...prev, sorts: v === "manual" ? [{ field: "manual", direction: "asc" }] : [{ field: v as FieldRef, direction: prev.sorts[0]?.direction ?? "asc" }] }))}>
            <MenuRadioItem value="manual">Manual order</MenuRadioItem>
            {sortable.map((d) => (
              <MenuRadioItem key={d.ref} value={d.ref}>
                {d.label}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
          <MenuSeparator />
          <MenuRadioGroup value={spec.sorts[0]?.direction ?? "asc"} onValueChange={(v) => setSpec((prev) => ({ ...prev, sorts: prev.sorts.map((s, i) => (i === 0 ? { ...s, direction: v as "asc" | "desc" } : s)) }))}>
            <MenuRadioItem value="asc">Ascending</MenuRadioItem>
            <MenuRadioItem value="desc">Descending</MenuRadioItem>
          </MenuRadioGroup>
        </MenuContent>
      </Menu>

      <Menu>
        <MenuTrigger asChild>
          <Button variant="subtle" size="sm" className={cn(spec.groupBy && "bg-selected text-brand")}>
            <Group20Regular className="h-4 w-4" /> Group{spec.groupBy ? `: ${defs.find((d) => d.ref === spec.groupBy)?.label ?? ""}` : ""}
          </Button>
        </MenuTrigger>
        <MenuContent className="w-56">
          <MenuRadioGroup value={spec.groupBy ?? "none"} onValueChange={(v) => setSpec((prev) => ({ ...prev, groupBy: v === "none" ? undefined : (v as FieldRef) }))}>
            <MenuRadioItem value="none">No grouping</MenuRadioItem>
            {groupable.map((d) => (
              <MenuRadioItem key={d.ref} value={d.ref}>
                {d.label}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuContent>
      </Menu>

      <Menu>
        <MenuTrigger asChild>
          <Button variant="subtle" size="sm">
            <Eye20Regular className="h-4 w-4" /> Fields
          </Button>
        </MenuTrigger>
        <MenuContent className="w-56">
          <MenuLabel>Show fields</MenuLabel>
          {defs.filter((d) => d.ref !== "title").map((d) => (
            <MenuCheckboxItem key={d.ref} checked={spec.visibleFields.includes(d.ref)} onSelect={(e) => e.preventDefault()} onCheckedChange={(checked) => setSpec((prev) => ({ ...prev, visibleFields: checked ? [...prev.visibleFields, d.ref] : prev.visibleFields.filter((f) => f !== d.ref) }))}>
              {d.label}
            </MenuCheckboxItem>
          ))}
          <MenuSeparator />
          <MenuLabel>Subtasks</MenuLabel>
          <MenuRadioGroup value={spec.subtasks} onValueChange={(v) => setSpec((prev) => ({ ...prev, subtasks: v as ViewSpec["subtasks"] }))}>
            <MenuRadioItem value="nested">Nested under parent</MenuRadioItem>
            <MenuRadioItem value="flat">As separate rows</MenuRadioItem>
            <MenuRadioItem value="hidden">Hidden</MenuRadioItem>
          </MenuRadioGroup>
          <MenuSeparator />
          <MenuLabel>Completed tasks</MenuLabel>
          <MenuRadioGroup value={spec.showCompleted} onValueChange={(v) => setSpec((prev) => ({ ...prev, showCompleted: v as ViewSpec["showCompleted"] }))}>
            <MenuRadioItem value="none">Hide</MenuRadioItem>
            <MenuRadioItem value="recent">Show recent (7 days)</MenuRadioItem>
            <MenuRadioItem value="all">Show all</MenuRadioItem>
          </MenuRadioGroup>
        </MenuContent>
      </Menu>

      {viewOptions ? (
        <>
          <Divider vertical className="mx-1" />
          {viewOptions}
        </>
      ) : null}

      <div className="flex-1" />
      {!isDefault ? (
        <Button variant="subtle" size="sm" className="text-fg-secondary" onClick={onReset}>
          Clear
        </Button>
      ) : null}
      <Menu>
        <MenuTrigger asChild>
          <Button variant="subtle" size="icon" aria-label="View options">
            <MoreHorizontal20Regular />
          </Button>
        </MenuTrigger>
        <MenuContent align="end">
          <MenuItem onSelect={onSaveView}>Save as view</MenuItem>
          <MenuItem icon={<Link16Regular />} onSelect={onShare}>
            Copy link to this view
          </MenuItem>
        </MenuContent>
      </Menu>
    </div>
  );
}

export function ShareLinkButton({ onShare }: { onShare: () => void }) {
  const { toast } = useToast();
  return (
    <Button
      variant="subtle"
      size="sm"
      onClick={() => {
        onShare();
        toast({ title: "Link copied", kind: "success" });
      }}
    >
      Share
    </Button>
  );
}
