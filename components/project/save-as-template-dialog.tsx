"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useWorkspace } from "@/lib/client/workspace-context";
import { call } from "@/lib/client/actions";
import { saveProjectAsTemplateAction } from "@/lib/actions/projects";

/** Project menu, "Save as template" (docs/10 section 12): copies the structure and tasks into a workspace template. */
export function SaveAsTemplateDialog({ open, onOpenChange, project }: { open: boolean; onOpenChange: (open: boolean) => void; project: { id: string; name: string } }) {
  const { slug } = useWorkspace();
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = React.useState(`${project.name} template`);
  const [description, setDescription] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    const res = await call(saveProjectAsTemplateAction(slug, { projectId: project.id, name: name.trim(), description: description.trim() || null }));
    setPending(false);
    if (!res.ok) {
      toast({ title: "Could not save the template", description: res.error.details?.[0]?.message ?? res.error.message, kind: "danger" });
      return;
    }
    toast({ title: `${name.trim()} saved`, description: "It is listed under My templates.", kind: "success", action: { label: "Open templates", onClick: () => router.push(`/w/${slug}/templates`) } });
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <DialogContent
          title="Save as template"
          description="Copies the workflow, sections, fields, shared views, and task titles. Dates, assignees, and comments are left out."
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" form="save-template" loading={pending} disabled={!name.trim()}>
                Save template
              </Button>
            </>
          }
        >
          <form id="save-template" onSubmit={submit} className="flex flex-col gap-4">
            <Field label="Template name">
              <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
            </Field>
            <Field label="Description" hint="Optional. Shown on the template card.">
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={2} placeholder="When to use this template" />
            </Field>
          </form>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
