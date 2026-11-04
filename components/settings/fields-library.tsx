"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Add20Regular, Dismiss20Regular } from "@fluentui/react-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { useWorkspace } from "@/lib/client/workspace-context";
import { call } from "@/lib/client/actions";
import { createFieldAction, updateFieldAction, deleteFieldAction } from "@/lib/actions/settings";
import { fieldTypeValue, type FieldTypeValue } from "@/lib/validation/settings";
import { paletteColor } from "@/lib/validation/common";
import { cn } from "@/lib/utils";

export type FieldRow = { id: string; name: string; type: string; config: unknown; isRequired: boolean; position: number; projectId?: string | null };
type Option = { id: string; name: string; color?: string };

export const fieldTypeLabels: Record<FieldTypeValue, string> = {
  text: "Text",
  long_text: "Long text",
  number: "Number",
  currency: "Currency",
  percent: "Percent",
  date: "Date",
  single_select: "Single select",
  multi_select: "Multi select",
  person: "Person",
  checkbox: "Checkbox",
  url: "URL",
  email: "Email",
  phone: "Phone",
  formula: "Formula",
  rollup: "Roll-up",
  relation: "Relation",
};

const creatableTypes = fieldTypeValue.options.filter((t) => !["formula", "rollup", "relation"].includes(t));

export function fieldSummary(f: FieldRow): string {
  const config = (f.config ?? {}) as { options?: Option[]; currency?: string; precision?: number };
  if (f.type === "single_select" || f.type === "multi_select") return `${config.options?.length ?? 0} options`;
  if (f.type === "currency") return config.currency ?? "USD";
  if (f.type === "number" || f.type === "percent") return `${config.precision ?? 0} decimals`;
  return "";
}

/** Workspace library or project fields: list, create, edit, delete (docs/10 section 13). */
export function FieldsLibrary({ initial, projectId, title, emptyText, extraActions }: { initial: FieldRow[]; projectId: string | null; title?: string; emptyText?: string; extraActions?: (field: FieldRow) => React.ReactNode }) {
  const { slug } = useWorkspace();
  const router = useRouter();
  const { toast } = useToast();
  const [rows, setRows] = React.useState(initial);
  const [editing, setEditing] = React.useState<FieldRow | "new" | null>(null);

  const remove = async (f: FieldRow) => {
    if (!window.confirm(`Delete the field ${f.name}? Values stay in the database but stop showing.`)) return;
    const res = await call(deleteFieldAction(slug, f.id));
    if (!res.ok) {
      toast({ title: "Could not delete the field", description: res.error.message, kind: "danger" });
      return;
    }
    setRows((r) => r.filter((x) => x.id !== f.id));
    toast({ title: `${f.name} deleted`, kind: "info" });
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {title ? <h2 className="type-subtitle-2">{title}</h2> : null}
        <div className="flex-1" />
        <Button variant="primary" size="sm" onClick={() => setEditing("new")}>
          <Add20Regular className="h-4 w-4" /> Add field
        </Button>
      </div>
      <div className="overflow-x-auto rounded-md border border-border bg-surface" role="table" aria-label={title ?? "Fields"}>
        <div role="row" className="flex min-w-[640px] h-8 items-center gap-3 border-b border-border bg-subtle px-4 type-caption-1-strong text-fg-secondary">
          <span className="min-w-0 flex-1" role="columnheader">Field</span>
          <span className="w-28" role="columnheader">Type</span>
          <span className="w-28" role="columnheader">Details</span>
          <span className="w-20" role="columnheader">Required</span>
          <span className="w-16" />
        </div>
        {rows.length === 0 ? <p className="p-4 type-body-1 text-fg-secondary">{emptyText ?? "No custom fields yet. Add one to use it in every project."}</p> : null}
        {rows.map((f) => (
          <div key={f.id} role="row" className="flex min-w-[640px] h-11 items-center gap-3 border-b border-border px-4 last:border-b-0 hover:bg-hover">
            <span className="min-w-0 flex-1" role="cell">
              <button type="button" className="max-w-full truncate text-left type-body-1-strong hover:underline" onClick={() => setEditing(f)}>
                {f.name}
              </button>
            </span>
            <span className="w-28" role="cell">
              <Badge>{fieldTypeLabels[f.type as FieldTypeValue] ?? f.type}</Badge>
            </span>
            <span className="w-28 truncate type-caption-1 text-fg-secondary" role="cell">
              {fieldSummary(f)}
            </span>
            <span className="w-20 type-caption-1 text-fg-secondary" role="cell">
              {f.isRequired ? "Yes" : ""}
            </span>
            <span className="flex w-16 justify-end" role="cell">
              <Menu>
                <MenuTrigger asChild>
                  <Button variant="subtle" size="sm" aria-label={`Actions for ${f.name}`}>
                    More
                  </Button>
                </MenuTrigger>
                <MenuContent align="end">
                  <MenuItem onSelect={() => setEditing(f)}>Edit field</MenuItem>
                  {extraActions?.(f)}
                  <MenuSeparator />
                  <MenuItem destructive onSelect={() => remove(f)}>
                    Delete field
                  </MenuItem>
                </MenuContent>
              </Menu>
            </span>
          </div>
        ))}
      </div>
      {editing ? (
        <FieldDialog
          field={editing === "new" ? null : editing}
          projectId={projectId}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setRows((r) => (r.some((x) => x.id === saved.id) ? r.map((x) => (x.id === saved.id ? saved : x)) : [...r, saved]));
            setEditing(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

export function FieldDialog({ field, projectId, onClose, onSaved }: { field: FieldRow | null; projectId: string | null; onClose: () => void; onSaved: (f: FieldRow) => void }) {
  const { slug } = useWorkspace();
  const { toast } = useToast();
  const config = (field?.config ?? {}) as { options?: Option[]; currency?: string; precision?: number };
  const [name, setName] = React.useState(field?.name ?? "");
  const [type, setType] = React.useState<FieldTypeValue>((field?.type as FieldTypeValue) ?? "text");
  const [required, setRequired] = React.useState(field?.isRequired ?? false);
  const [options, setOptions] = React.useState<Option[]>(config.options ?? []);
  const [currency, setCurrency] = React.useState(config.currency ?? "USD");
  const [precision, setPrecision] = React.useState(config.precision ?? (field?.type === "currency" ? 2 : 0));
  const [pending, setPending] = React.useState(false);
  const isSelect = type === "single_select" || type === "multi_select";
  const colors = paletteColor.options;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextConfig: Record<string, unknown> = {};
    if (isSelect) nextConfig.options = options.filter((o) => o.name.trim()).map((o) => ({ ...o, name: o.name.trim() }));
    if (type === "currency") {
      nextConfig.currency = currency.toUpperCase();
      nextConfig.precision = precision;
    }
    if (type === "number" || type === "percent") nextConfig.precision = precision;
    setPending(true);
    const res = field ? await call(updateFieldAction(slug, { id: field.id, name: name.trim(), config: nextConfig, isRequired: required })) : await call(createFieldAction(slug, { projectId, name: name.trim(), type, config: nextConfig, isRequired: required }));
    setPending(false);
    if (!res.ok) {
      toast({ title: field ? "Could not save the field" : "Could not create the field", description: res.error.details?.[0]?.message ?? res.error.message, kind: "danger" });
      return;
    }
    toast({ title: field ? `${name.trim()} saved` : `${name.trim()} added`, kind: "success" });
    onSaved({ id: res.data.id, name: res.data.name, type: res.data.type, config: res.data.config, isRequired: res.data.isRequired, position: res.data.position, projectId: res.data.projectId });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={field ? "Edit field" : "New field"}
        description={field ? "The type cannot change once values exist." : projectId ? "This field belongs to this project only." : "Library fields can be adopted by any project."}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="field-form" loading={pending} disabled={!name.trim() || (isSelect && !options.some((o) => o.name.trim()))}>
              {field ? "Save" : "Add field"}
            </Button>
          </>
        }
      >
        <form id="field-form" onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Name">
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Budget" required />
          </Field>
          <Field label="Type">
            <select aria-label="Type" value={type} disabled={Boolean(field)} onChange={(e) => setType(e.target.value as FieldTypeValue)} className="h-8 w-full rounded-sm border border-border-strong bg-surface px-2 type-body-1 disabled:bg-subtle disabled:text-fg-disabled">
              {creatableTypes.map((t) => (
                <option key={t} value={t}>
                  {fieldTypeLabels[t]}
                </option>
              ))}
            </select>
          </Field>
          {isSelect ? (
            <Field label="Options">
              <div className="flex flex-col gap-1.5">
                {options.map((o, i) => (
                  <div key={o.id} className="flex items-center gap-1.5">
                    <Menu>
                      <MenuTrigger asChild>
                        <button type="button" data-color={o.color ?? "gray"} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-border hover:bg-hover" aria-label={`Color for ${o.name || "option"}: ${o.color ?? "gray"}`}>
                          <span className="h-3 w-3 rounded-full bg-item" />
                        </button>
                      </MenuTrigger>
                      <MenuContent className="grid w-44 grid-cols-6 gap-1 p-2">
                        {colors.map((c) => (
                          <MenuItem key={c} data-color={c} className={cn("h-6 w-6 justify-center p-0", o.color === c && "ring-2 ring-brand")} onSelect={() => setOptions((list) => list.map((x, j) => (j === i ? { ...x, color: c } : x)))} aria-label={c}>
                            <span className="h-3 w-3 rounded-full bg-item" />
                          </MenuItem>
                        ))}
                      </MenuContent>
                    </Menu>
                    <Input value={o.name} onChange={(e) => setOptions((list) => list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder={`Option ${i + 1}`} maxLength={60} aria-label={`Option ${i + 1}`} />
                    <Button variant="subtle" size="icon-sm" aria-label={`Remove option ${i + 1}`} onClick={() => setOptions((list) => list.filter((_, j) => j !== i))}>
                      <Dismiss20Regular className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button variant="subtle" size="sm" className="self-start" onClick={() => setOptions((list) => [...list, { id: `opt_${Math.random().toString(36).slice(2, 8)}`, name: "", color: colors[list.length % colors.length] }])}>
                  <Add20Regular className="h-4 w-4" /> Add option
                </Button>
              </div>
            </Field>
          ) : null}
          {type === "currency" ? (
            <Field label="Currency code" hint="Three letters, for example USD or EUR.">
              <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))} maxLength={3} className="w-24" />
            </Field>
          ) : null}
          {type === "currency" || type === "number" || type === "percent" ? (
            <Field label="Decimal places">
              <Input type="number" min={0} max={6} value={precision} onChange={(e) => setPrecision(Math.max(0, Math.min(6, Number(e.target.value))))} className="w-24" />
            </Field>
          ) : null}
          <label className="flex items-center justify-between gap-4">
            <span>
              <span className="block type-body-1-strong">Required</span>
              <span className="block type-caption-1 text-fg-secondary">Forms and the task pane ask for a value.</span>
            </span>
            <Switch checked={required} onCheckedChange={setRequired} aria-label="Required" />
          </label>
        </form>
      </DialogContent>
    </Dialog>
  );
}
