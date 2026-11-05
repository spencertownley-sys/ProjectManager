"use client";

import * as React from "react";
import { Add20Regular, Copy16Regular, Checkmark16Regular } from "@fluentui/react-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useWorkspace } from "@/lib/client/workspace-context";
import { call } from "@/lib/client/actions";
import { createApiKeyAction, revokeApiKeyAction } from "@/lib/actions/api-keys";
import type { ApiKeyRecord, ApiScope } from "@/lib/services/api-keys";
import { formatDateShort, formatRelativeTime } from "@/lib/client/dates";

const scopeHelp: Record<ApiScope, string> = { read: "Read projects, tasks, comments, and people", write: "Create and change tasks, projects, and comments", admin: "Manage webhooks, fields, and other workspace settings" };

/** API keys (docs/08 section 5.2): keys are shown once; the prefix identifies them afterwards. */
export function ApiKeysPanel({ initial }: { initial: ApiKeyRecord[] }) {
  const { slug } = useWorkspace();
  const { toast } = useToast();
  const [keys, setKeys] = React.useState(initial);
  const [open, setOpen] = React.useState(false);
  const [issued, setIssued] = React.useState<{ key: string; record: ApiKeyRecord } | null>(null);
  const active = keys.filter((k) => !k.revokedAt);
  const revoked = keys.filter((k) => k.revokedAt);

  const revoke = async (k: ApiKeyRecord) => {
    if (!window.confirm(`Revoke ${k.name} (${k.keyPrefix})? Integrations using it stop working right away.`)) return;
    const res = await call(revokeApiKeyAction(slug, k.id));
    if (!res.ok) {
      toast({ title: "Could not revoke the key", description: res.error.message, kind: "danger" });
      return;
    }
    setKeys((list) => list.map((x) => (x.id === k.id ? res.data : x)));
    toast({ title: `${k.name} revoked`, kind: "success" });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <p className="max-w-xl type-body-1 text-fg-secondary">
          Send a key as a bearer token to the REST API under <code className="rounded-xs bg-subtle px-1 font-mono type-caption-1">/api/v1</code>. The OpenAPI reference is served at <code className="rounded-xs bg-subtle px-1 font-mono type-caption-1">/api/v1/openapi.json</code>.
        </p>
        <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
          <Add20Regular className="h-4 w-4" /> Create key
        </Button>
      </div>
      {active.length === 0 ? (
        <EmptyState title="No API keys yet" description="Create a key for a script, a dashboard, or an integration. Each key belongs to this workspace and is limited by its scopes." />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border bg-surface" role="table" aria-label="API keys">
          <div role="row" className="flex h-8 min-w-[600px] items-center gap-3 border-b border-border bg-subtle px-4 type-caption-1-strong text-fg-secondary">
            <span role="columnheader" className="min-w-0 flex-1">Name</span>
            <span role="columnheader" className="w-28">Key</span>
            <span role="columnheader" className="w-36">Scopes</span>
            <span role="columnheader" className="w-20">Last used</span>
            <span role="columnheader" className="w-20">Created</span>
            <span role="columnheader" className="w-16" />
          </div>
          {active.map((k) => (
            <div key={k.id} role="row" className="flex h-12 min-w-[600px] items-center gap-3 border-b border-border px-4 last:border-b-0">
              <span role="cell" className="min-w-0 flex-1">
                <span className="block truncate type-body-1-strong">{k.name}</span>
                <span className="block truncate type-caption-1 text-fg-secondary">
                  {k.createdByName ? `Created by ${k.createdByName}` : "Created"}
                  {k.expiresAt ? `, expires ${formatDateShort(k.expiresAt.slice(0, 10))}` : ""}
                </span>
              </span>
              <span role="cell" className="w-28 font-mono type-caption-1 text-fg-secondary">{k.keyPrefix}...</span>
              <span role="cell" className="flex w-36 gap-1">
                {k.scopes.map((s) => (
                  <Badge key={s} color="gray">{s}</Badge>
                ))}
              </span>
              <span role="cell" className="w-20 type-caption-1 text-fg-secondary">{k.lastUsedAt ? formatRelativeTime(k.lastUsedAt) : "Never"}</span>
              <span role="cell" className="w-20 type-caption-1 text-fg-secondary">{formatDateShort(k.createdAt.slice(0, 10))}</span>
              <span role="cell" className="w-16 text-right">
                <Button variant="subtle" size="sm" onClick={() => revoke(k)}>
                  Revoke
                </Button>
              </span>
            </div>
          ))}
        </div>
      )}
      {revoked.length ? (
        <p className="type-caption-1 text-fg-tertiary">
          {revoked.length} revoked {revoked.length === 1 ? "key" : "keys"}: {revoked.map((k) => `${k.name} (${k.keyPrefix})`).join(", ")}
        </p>
      ) : null}
      <CreateKeyDialog
        open={open}
        onOpenChange={setOpen}
        onCreated={(result) => {
          setKeys((list) => [result.record, ...list]);
          setIssued(result);
        }}
      />
      {issued ? <IssuedKeyDialog issued={issued} onClose={() => setIssued(null)} /> : null}
    </div>
  );
}

function CreateKeyDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (r: { key: string; record: ApiKeyRecord }) => void }) {
  const { slug } = useWorkspace();
  const { toast } = useToast();
  const [name, setName] = React.useState("");
  const [scopes, setScopes] = React.useState<ApiScope[]>(["read", "write"]);
  const [expires, setExpires] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    const res = await call(createApiKeyAction(slug, { name: name.trim(), scopes, expiresAt: expires ? new Date(expires + "T00:00:00Z").toISOString() : null }));
    setPending(false);
    if (!res.ok) {
      toast({ title: "Could not create the key", description: res.error.details?.[0]?.message ?? res.error.message, kind: "danger" });
      return;
    }
    onCreated(res.data);
    onOpenChange(false);
    setName("");
    setExpires("");
  };
  const toggle = (s: ApiScope) => setScopes((list) => (list.includes(s) ? list.filter((x) => x !== s) : [...list, s]));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <DialogContent
          title="Create API key"
          description="The key is shown once after you create it."
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" form="create-key" loading={pending} disabled={!name.trim() || scopes.length === 0}>
                Create key
              </Button>
            </>
          }
        >
          <form id="create-key" onSubmit={submit} className="flex flex-col gap-4">
            <Field label="Name" hint="Where the key is used, for example CI or Zapier.">
              <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
            </Field>
            <fieldset>
              <legend className="mb-1 type-caption-1-strong text-fg">Scopes</legend>
              <div className="flex flex-col gap-1">
                {(["read", "write", "admin"] as ApiScope[]).map((s) => (
                  <label key={s} className="flex cursor-pointer items-start gap-2 rounded-sm px-1 py-1 hover:bg-hover">
                    <Checkbox checked={scopes.includes(s)} onCheckedChange={() => toggle(s)} aria-label={s} className="mt-0.5" />
                    <span>
                      <span className="block type-body-1-strong">{s}</span>
                      <span className="block type-caption-1 text-fg-secondary">{scopeHelp[s]}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label="Expires" hint="Optional. Leave empty for a key that lasts until revoked.">
              <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} className="w-44" />
            </Field>
          </form>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function IssuedKeyDialog({ issued, onClose }: { issued: { key: string; record: ApiKeyRecord }; onClose: () => void }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(issued.key);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`${issued.record.name} created`}
        description="Copy the key now. It is not shown again; create a new key if you lose it."
        size="sm"
        footer={
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        }
      >
        <div className="flex items-center gap-2 rounded-sm border border-border bg-subtle px-3 py-2">
          <code className="min-w-0 flex-1 break-all font-mono type-body-1" aria-label="API key">
            {issued.key}
          </code>
          <Button variant="secondary" size="sm" onClick={copy} aria-label="Copy key">
            {copied ? <Checkmark16Regular /> : <Copy16Regular />} {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <p className="mt-3 type-caption-1 text-fg-secondary">Try it: curl -H &quot;Authorization: Bearer {issued.record.keyPrefix}...&quot; /api/v1/workspace</p>
      </DialogContent>
    </Dialog>
  );
}
