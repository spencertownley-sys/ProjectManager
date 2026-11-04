"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Add20Regular, ArrowUp16Regular, ArrowDown16Regular, Dismiss20Regular } from "@fluentui/react-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { useWorkspace } from "@/lib/client/workspace-context";
import { call } from "@/lib/client/actions";
import { updateWorkflowAction } from "@/lib/actions/projects";
import { paletteColor, type PaletteColor } from "@/lib/validation/common";
import { categoryLabel } from "@/lib/client/grouping";
import { cn } from "@/lib/utils";

export type StatusDraft = { id?: string; name: string; category: "backlog" | "not_started" | "in_progress" | "done"; color: string; wipLimit: number | null };
const categories: StatusDraft["category"][] = ["backlog", "not_started", "in_progress", "done"];

/** Project workflow editor: rename, recolor, categorize, set WIP, reorder, add, and remove statuses (docs/10 section 13). */
export function WorkflowEditor({ projectId, initial, onSaved }: { projectId: string; initial: StatusDraft[]; onSaved?: (next: StatusDraft[]) => void }) {
  const { slug } = useWorkspace();
  const router = useRouter();
  const { toast } = useToast();
  const [draft, setDraft] = React.useState<StatusDraft[]>(initial);
  const [pending, setPending] = React.useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const colors = paletteColor.options;
  const hasDone = draft.some((s) => s.category === "done");
  const valid = draft.length > 0 && hasDone && draft.every((s) => s.name.trim());

  const update = (i: number, patch: Partial<StatusDraft>) => setDraft((d) => d.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, delta: number) =>
    setDraft((d) => {
      const next = [...d];
      const j = i + delta;
      if (j < 0 || j >= next.length) return d;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const remove = (i: number) => {
    const s = draft[i];
    if (s.id && !window.confirm(`Remove ${s.name}? Tasks in it move to the first remaining status.`)) return;
    setDraft((d) => d.filter((_, j) => j !== i));
  };
  const add = () => setDraft((d) => [...d, { name: "", category: "in_progress", color: colors[d.length % colors.length], wipLimit: null }]);

  const save = async () => {
    setPending(true);
    const res = await call(updateWorkflowAction(slug, { projectId, statuses: draft.map((s) => ({ id: s.id, name: s.name.trim(), category: s.category, color: s.color, wipLimit: s.wipLimit })) }));
    setPending(false);
    if (!res.ok) {
      toast({ title: "Could not save the workflow", description: res.error.details?.[0]?.message ?? res.error.message, kind: "danger" });
      return;
    }
    const saved: StatusDraft[] = res.data.map((s) => ({ id: s.id, name: s.name, category: s.category, color: s.color, wipLimit: s.wipLimit }));
    setDraft(saved);
    onSaved?.(saved);
    toast({ title: "Workflow saved", kind: "success" });
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-md border border-border bg-surface" role="table" aria-label="Statuses">
        <div role="row" className="flex min-w-[640px] h-8 items-center gap-2 border-b border-border bg-subtle px-3 type-caption-1-strong text-fg-secondary">
          <span className="w-14" />
          <span className="min-w-0 flex-1" role="columnheader">Status</span>
          <span className="w-32" role="columnheader">Category</span>
          <span className="w-24" role="columnheader">WIP limit</span>
          <span className="w-10" />
        </div>
        {draft.map((s, i) => (
          <div key={s.id ?? `new-${i}`} role="row" className="flex min-w-[640px] h-11 items-center gap-2 border-b border-border px-3 last:border-b-0">
            <span className="flex w-14 items-center gap-0.5">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-fg-tertiary hover:bg-hover hover:text-fg disabled:text-fg-disabled" aria-label={`Move ${s.name || "status"} up`}>
                <ArrowUp16Regular />
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === draft.length - 1} className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-fg-tertiary hover:bg-hover hover:text-fg disabled:text-fg-disabled" aria-label={`Move ${s.name || "status"} down`}>
                <ArrowDown16Regular />
              </button>
            </span>
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <Menu>
                <MenuTrigger asChild>
                  <button type="button" data-color={s.color} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-border hover:bg-hover" aria-label={`Color for ${s.name || "status"}: ${s.color}`}>
                    <span className="h-3 w-3 rounded-full bg-item" />
                  </button>
                </MenuTrigger>
                <MenuContent className="grid w-44 grid-cols-6 gap-1 p-2">
                  {colors.map((c) => (
                    <MenuItem key={c} data-color={c} className={cn("h-6 w-6 justify-center p-0", s.color === c && "ring-2 ring-brand")} onSelect={() => update(i, { color: c as PaletteColor })} aria-label={c}>
                      <span className="h-3 w-3 rounded-full bg-item" />
                    </MenuItem>
                  ))}
                </MenuContent>
              </Menu>
              <input value={s.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Status name" maxLength={60} aria-label={`Name of status ${i + 1}`} className="h-7 min-w-0 flex-1 rounded-sm border border-transparent bg-transparent px-1.5 type-body-1 hover:border-border focus:border-brand focus:bg-surface focus:outline-none" />
              <Badge color={s.color} dot className="hidden sm:inline-flex">
                {s.name || "Status"}
              </Badge>
            </span>
            <span className="w-32">
              <select value={s.category} onChange={(e) => update(i, { category: e.target.value as StatusDraft["category"] })} aria-label={`Category for ${s.name || "status"}`} className="h-7 w-full rounded-sm border border-border-strong bg-surface px-1.5 type-body-1">
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {categoryLabel(c)}
                  </option>
                ))}
              </select>
            </span>
            <span className="w-24">
              <input type="number" min={1} value={s.wipLimit ?? ""} onChange={(e) => update(i, { wipLimit: e.target.value === "" ? null : Math.max(1, Number(e.target.value)) })} placeholder="None" aria-label={`WIP limit for ${s.name || "status"}`} className="h-7 w-20 rounded-sm border border-transparent bg-transparent px-1.5 type-body-1 hover:border-border focus:border-brand focus:bg-surface focus:outline-none" />
            </span>
            <span className="flex w-10 justify-end">
              <button type="button" onClick={() => remove(i)} className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-fg-tertiary hover:bg-hover hover:text-danger" aria-label={`Remove ${s.name || "status"}`}>
                <Dismiss20Regular className="h-4 w-4" />
              </button>
            </span>
          </div>
        ))}
      </div>
      {!hasDone ? <p className="type-caption-1 text-danger">A workflow needs at least one status in the Done category.</p> : null}
      <div className="flex items-center gap-2">
        <Button variant="subtle" size="sm" onClick={add}>
          <Add20Regular className="h-4 w-4" /> Add status
        </Button>
        <div className="flex-1" />
        {dirty ? (
          <Button variant="subtle" size="sm" onClick={() => setDraft(initial)}>
            Discard
          </Button>
        ) : null}
        <Button variant="primary" size="sm" loading={pending} disabled={!dirty || !valid} onClick={save}>
          Save workflow
        </Button>
      </div>
    </div>
  );
}
