"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Add20Regular } from "@fluentui/react-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { useWorkspace } from "@/lib/client/workspace-context";
import { call } from "@/lib/client/actions";
import { createTagSettingsAction, updateTagAction, deleteTagAction } from "@/lib/actions/settings";
import { paletteColor, type PaletteColor } from "@/lib/validation/common";
import { cn } from "@/lib/utils";

export type TagRowItem = { id: string; name: string; color: string; count: number };

export function TagsEditor({ initial }: { initial: TagRowItem[] }) {
  const { slug } = useWorkspace();
  const router = useRouter();
  const { toast } = useToast();
  const [rows, setRows] = React.useState(initial);
  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState<PaletteColor>("blue");
  const [pending, setPending] = React.useState(false);
  const colors = paletteColor.options;

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    const res = await call(createTagSettingsAction(slug, { name: name.trim(), color }));
    setPending(false);
    if (!res.ok) {
      toast({ title: "Could not add the tag", description: res.error.message, kind: "danger" });
      return;
    }
    setRows((r) => (r.some((t) => t.id === res.data.id) ? r.map((t) => (t.id === res.data.id ? { ...t, color } : t)) : [...r, { id: res.data.id, name: res.data.name, color: res.data.color, count: 0 }].sort((a, b) => a.name.localeCompare(b.name))));
    setName("");
    router.refresh();
  };
  const rename = async (t: TagRowItem, next: string) => {
    const v = next.trim();
    if (!v || v === t.name) return;
    setRows((r) => r.map((x) => (x.id === t.id ? { ...x, name: v } : x)));
    const res = await call(updateTagAction(slug, { id: t.id, name: v }));
    if (!res.ok) {
      setRows((r) => r.map((x) => (x.id === t.id ? { ...x, name: t.name } : x)));
      toast({ title: "Could not rename the tag", description: res.error.message, kind: "danger" });
    }
  };
  const recolor = async (t: TagRowItem, c: PaletteColor) => {
    setRows((r) => r.map((x) => (x.id === t.id ? { ...x, color: c } : x)));
    const res = await call(updateTagAction(slug, { id: t.id, color: c }));
    if (!res.ok) toast({ title: "Could not change the color", description: res.error.message, kind: "danger" });
  };
  const remove = async (t: TagRowItem) => {
    if (!window.confirm(`Delete the tag ${t.name}? It is removed from ${t.count} ${t.count === 1 ? "task" : "tasks"}.`)) return;
    const res = await call(deleteTagAction(slug, t.id));
    if (!res.ok) {
      toast({ title: "Could not delete the tag", description: res.error.message, kind: "danger" });
      return;
    }
    setRows((r) => r.filter((x) => x.id !== t.id));
    router.refresh();
  };

  const colorMenu = (current: string, onPick: (c: PaletteColor) => void, label: string) => (
    <Menu>
      <MenuTrigger asChild>
        <button type="button" data-color={current} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-border hover:bg-hover" aria-label={label}>
          <span className="h-3 w-3 rounded-full bg-item" />
        </button>
      </MenuTrigger>
      <MenuContent className="grid w-44 grid-cols-6 gap-1 p-2">
        {colors.map((c) => (
          <MenuItem key={c} data-color={c} className={cn("h-6 w-6 justify-center p-0", current === c && "ring-2 ring-brand")} onSelect={() => onPick(c)} aria-label={c}>
            <span className="h-3 w-3 rounded-full bg-item" />
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={add} className="flex items-center gap-2">
        {colorMenu(color, setColor, `New tag color: ${color}`)}
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New tag" maxLength={40} aria-label="New tag name" className="w-64" />
        <Button type="submit" variant="primary" size="md" loading={pending} disabled={!name.trim()}>
          <Add20Regular className="h-4 w-4" /> Add tag
        </Button>
      </form>
      <div className="overflow-x-auto rounded-md border border-border bg-surface" role="table" aria-label="Tags">
        {rows.length === 0 ? <p className="p-4 type-body-1 text-fg-secondary">No tags yet. Add one above or from any task.</p> : null}
        {rows.map((t) => (
          <div key={t.id} role="row" className="flex min-w-[640px] h-11 items-center gap-3 border-b border-border px-4 last:border-b-0 hover:bg-hover">
            {colorMenu(t.color, (c) => recolor(t, c), `Color for ${t.name}: ${t.color}`)}
            <input
              defaultValue={t.name}
              aria-label={`Tag name ${t.name}`}
              maxLength={40}
              onBlur={(e) => rename(t, e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              className="h-7 min-w-0 flex-1 rounded-sm border border-transparent bg-transparent px-1.5 type-body-1 hover:border-border focus:border-brand focus:bg-surface focus:outline-none"
            />
            <Badge color={t.color}>{t.name}</Badge>
            <span className="w-20 text-right type-caption-1 text-fg-secondary">{t.count} {t.count === 1 ? "task" : "tasks"}</span>
            <Button variant="subtle" size="sm" className="text-fg-secondary" onClick={() => remove(t)} aria-label={`Delete ${t.name}`}>
              Delete
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
