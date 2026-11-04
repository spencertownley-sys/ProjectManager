"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useWorkspace } from "@/lib/client/workspace-context";
import { createProjectAction } from "@/lib/actions/projects";
import { projectTemplates } from "@/lib/templates/projects";
import { paletteColor } from "@/lib/validation/common";
import { cn } from "@/lib/utils";

const colors = paletteColor.options;

export function NewProjectDialog({ open, onOpenChange, templateId }: { open: boolean; onOpenChange: (open: boolean) => void; templateId?: string }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <NewProjectForm onOpenChange={onOpenChange} initialTemplate={templateId} /> : null}
    </Dialog>
  );
}

function NewProjectForm({ onOpenChange, initialTemplate }: { onOpenChange: (open: boolean) => void; initialTemplate?: string }) {
  const router = useRouter();
  const { slug, today } = useWorkspace();
  const { toast } = useToast();
  const [name, setName] = React.useState("");
  const [key, setKey] = React.useState("");
  const [color, setColor] = React.useState<(typeof colors)[number]>("blue");
  const [privacy, setPrivacy] = React.useState<"workspace" | "private">("workspace");
  const [templateId, setTemplateId] = React.useState(initialTemplate ?? "simple");
  const [description, setDescription] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await createProjectAction(slug, { name, key: key || undefined, color, privacy, templateId, description: description || undefined }, today);
    setPending(false);
    if (!res.ok) {
      setError(res.error.details?.[0]?.message ?? res.error.message);
      return;
    }
    toast({ title: `${res.data.name} created`, kind: "success" });
    onOpenChange(false);
    setName("");
    setKey("");
    setDescription("");
    router.push(`/w/${slug}/projects/${res.data.key}`);
    router.refresh();
  };

  return (
    <DialogContent
        title="New project"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" form="new-project" type="submit" loading={pending} disabled={!name.trim()}>
              Create project
            </Button>
          </>
        }
      >
        <form id="new-project" onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <Field label="Name">
              <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Marketing launch" required maxLength={120} />
            </Field>
            <Field label="Key" hint="Used in task ids">
              <Input value={key} onChange={(e) => setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))} placeholder="Auto" className="font-mono uppercase" />
            </Field>
          </div>
          <Field label="Template">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {projectTemplates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTemplateId(t.id)}
                  className={cn("flex flex-col items-start gap-0.5 rounded-sm border border-border bg-surface p-2 text-left hover:bg-hover", templateId === t.id && "border-brand bg-selected")}
                  aria-pressed={templateId === t.id}
                >
                  <span className="type-body-1-strong">{t.name}</span>
                  <span className="type-caption-1 text-fg-secondary">{t.category}</span>
                </button>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Color">
              <div className="flex flex-wrap gap-1.5">
                {colors.map((c) => (
                  <button
                    key={c}
                    type="button"
                    data-color={c}
                    aria-label={c}
                    aria-pressed={color === c}
                    onClick={() => setColor(c)}
                    className={cn("h-6 w-6 rounded-full bg-item ring-offset-2 ring-offset-surface-raised", color === c && "ring-2 ring-brand")}
                  />
                ))}
              </div>
            </Field>
            <Field label="Privacy">
              <div className="inline-flex rounded-sm bg-subtle p-0.5">
                {(["workspace", "private"] as const).map((p) => (
                  <button key={p} type="button" onClick={() => setPrivacy(p)} className={cn("h-7 rounded-xs px-3 type-body-1", privacy === p && "bg-surface font-semibold")} aria-pressed={privacy === p}>
                    {p === "workspace" ? "Workspace" : "Private"}
                  </button>
                ))}
              </div>
            </Field>
          </div>
          <Field label="Description" hint="Optional">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="What this project is for" />
          </Field>
          {error ? <p className="type-body-1 text-danger">{error}</p> : null}
        </form>
    </DialogContent>
  );
}
