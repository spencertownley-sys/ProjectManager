"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { useWorkspace } from "@/lib/client/workspace-context";
import { call } from "@/lib/client/actions";
import { updateWorkspaceSettingsAction } from "@/lib/actions/settings";
import { cn } from "@/lib/utils";

export type GeneralSettings = { name: string; slug: string; logoUrl: string | null; estimateUnit: "points" | "hours"; allowMultipleAssignees: boolean; cycleLabel: string; weekStartsOn: number };

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function GeneralForm({ initial, onSaved }: { initial: GeneralSettings; onSaved?: (next: GeneralSettings) => void }) {
  const { slug } = useWorkspace();
  const router = useRouter();
  const { toast } = useToast();
  const [draft, setDraft] = React.useState(initial);
  const [pending, setPending] = React.useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    const res = await call(updateWorkspaceSettingsAction(slug, { name: draft.name, estimateUnit: draft.estimateUnit, allowMultipleAssignees: draft.allowMultipleAssignees, cycleLabel: draft.cycleLabel, weekStartsOn: draft.weekStartsOn }));
    setPending(false);
    if (!res.ok) {
      toast({ title: "Could not save the settings", description: res.error.message, kind: "danger" });
      return;
    }
    toast({ title: "Settings saved", kind: "success" });
    onSaved?.(draft);
    router.refresh();
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-5">
      <section className="flex flex-col gap-4 rounded-md border border-border bg-surface p-4">
        <Field label="Workspace name">
          <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={80} required />
        </Field>
        <Field label="URL" hint="The slug comes from your organization in Clerk and changes there.">
          <Input value={`taskparty.app/w/${draft.slug}`} readOnly />
        </Field>
        <Field label="Logo" hint="The logo comes from your organization in Clerk.">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-sm border border-border bg-subtle type-body-1-strong">{draft.logoUrl ? <img src={draft.logoUrl} alt="" className="h-full w-full rounded-sm object-cover" /> : draft.name.slice(0, 2).toUpperCase()}</span>
            <span className="type-caption-1 text-fg-tertiary">Change it in the organization profile.</span>
          </div>
        </Field>
      </section>
      <section className="flex flex-col gap-4 rounded-md border border-border bg-surface p-4">
        <h2 className="type-subtitle-2">Planning defaults</h2>
        <Field label="Estimate unit" hint="Used by estimates, workload, and burndowns.">
          <div className="inline-flex rounded-sm bg-subtle p-0.5" role="radiogroup" aria-label="Estimate unit">
            {(["points", "hours"] as const).map((u) => (
              <button key={u} type="button" role="radio" aria-checked={draft.estimateUnit === u} onClick={() => setDraft({ ...draft, estimateUnit: u })} className={cn("h-7 rounded-xs px-3 type-body-1 text-fg-secondary", draft.estimateUnit === u && "bg-surface font-semibold text-fg shadow-menu")}>
                {u === "points" ? "Points" : "Hours"}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Cycle label" hint="What your team calls an iteration: Cycle, Sprint, or Iteration.">
          <Input value={draft.cycleLabel} onChange={(e) => setDraft({ ...draft, cycleLabel: e.target.value })} maxLength={30} className="w-56" required />
        </Field>
        <Field label="Week starts on">
          <select aria-label="Week starts on" value={draft.weekStartsOn} onChange={(e) => setDraft({ ...draft, weekStartsOn: Number(e.target.value) })} className="h-8 w-56 rounded-sm border border-border-strong bg-surface px-2 type-body-1">
            {weekdays.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex items-center justify-between gap-4">
          <span>
            <span className="block type-body-1-strong">Multiple assignees</span>
            <span className="block type-caption-1 text-fg-secondary">Let a task have more than one assignee. Off keeps one owner per task.</span>
          </span>
          <Switch checked={draft.allowMultipleAssignees} onCheckedChange={(v) => setDraft({ ...draft, allowMultipleAssignees: v })} aria-label="Multiple assignees" />
        </label>
      </section>
      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" loading={pending} disabled={!dirty}>
          Save changes
        </Button>
        {dirty ? (
          <Button type="button" variant="subtle" onClick={() => setDraft(initial)}>
            Discard
          </Button>
        ) : null}
      </div>
    </form>
  );
}
