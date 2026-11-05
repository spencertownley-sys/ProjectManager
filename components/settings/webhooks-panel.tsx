"use client";

import * as React from "react";
import { Add20Regular, Copy16Regular, Checkmark16Regular } from "@fluentui/react-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { useWorkspace } from "@/lib/client/workspace-context";
import { call } from "@/lib/client/actions";
import { createWebhookAction, updateWebhookAction, deleteWebhookAction, listDeliveriesAction, replayDeliveryAction } from "@/lib/actions/webhooks";
import type { WebhookRecord, DeliveryRecord } from "@/lib/services/webhooks";
import { webhookEventGroups, type WebhookEventType } from "@/lib/validation/webhooks";
import { formatRelativeTime } from "@/lib/client/dates";
import { cn } from "@/lib/utils";

export type WebhookProjectOption = { id: string; key: string; name: string; color: string };

const statusColor: Record<string, string> = { delivered: "green", pending: "blue", failed: "red", disabled: "gray" };

/** Outbound webhooks (docs/12 section 2): registration, enable switch, delivery log, and replay. */
export function WebhooksPanel({ initial, projects, staticDeliveries }: { initial: WebhookRecord[]; projects: WebhookProjectOption[]; staticDeliveries?: DeliveryRecord[] }) {
  const { slug } = useWorkspace();
  const { toast } = useToast();
  const [hooks, setHooks] = React.useState(initial);
  const [open, setOpen] = React.useState(false);
  const [issued, setIssued] = React.useState<{ webhook: WebhookRecord; secret: string } | null>(null);
  const [logFor, setLogFor] = React.useState<WebhookRecord | null>(null);

  const toggle = async (h: WebhookRecord, enabled: boolean) => {
    setHooks((list) => list.map((x) => (x.id === h.id ? { ...x, isEnabled: enabled, failureCount: enabled ? 0 : x.failureCount } : x)));
    const res = await call(updateWebhookAction(slug, { id: h.id, isEnabled: enabled }));
    if (!res.ok) {
      setHooks((list) => list.map((x) => (x.id === h.id ? h : x)));
      toast({ title: enabled ? "Could not enable the webhook" : "Could not pause the webhook", description: res.error.message, kind: "danger" });
    }
  };
  const remove = async (h: WebhookRecord) => {
    if (!window.confirm(`Delete the webhook for ${h.url}? Pending deliveries are dropped.`)) return;
    const res = await call(deleteWebhookAction(slug, h.id));
    if (!res.ok) {
      toast({ title: "Could not delete the webhook", description: res.error.message, kind: "danger" });
      return;
    }
    setHooks((list) => list.filter((x) => x.id !== h.id));
    toast({ title: "Webhook deleted", kind: "success" });
  };
  const projectName = (id: string | null) => (id ? (projects.find((p) => p.id === id)?.name ?? "One project") : "Whole workspace");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <p className="max-w-xl type-body-1 text-fg-secondary">
          Each event is sent as a signed POST. Verify <code className="rounded-xs bg-subtle px-1 font-mono type-caption-1">X-TaskParty-Signature</code> with the secret and reject timestamps older than five minutes. Failed deliveries retry six times over a day; after 20 failures in a row the webhook pauses.
        </p>
        <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
          <Add20Regular className="h-4 w-4" /> Add webhook
        </Button>
      </div>
      {hooks.length === 0 ? (
        <EmptyState title="No webhooks yet" description="Add a URL to receive task, project, and comment events as they happen." />
      ) : (
        <div className="rounded-md border border-border bg-surface" role="list" aria-label="Webhooks">
          {hooks.map((h) => (
            <div key={h.id} role="listitem" className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
              <Switch checked={h.isEnabled} onCheckedChange={(v) => toggle(h, v)} aria-label={`Enable webhook ${h.url}`} />
              <div className="min-w-48 flex-1">
                <p className="break-all font-mono type-body-1 text-fg">{h.url}</p>
                <p className="type-caption-1 text-fg-secondary">
                  {projectName(h.projectId)}. {h.events.length} {h.events.length === 1 ? "event" : "events"}.{" "}
                  {h.lastDelivery ? `Last delivery ${h.lastDelivery.status} ${formatRelativeTime(h.lastDelivery.createdAt)}${h.lastDelivery.responseCode ? ` (${h.lastDelivery.responseCode})` : ""}.` : "No deliveries yet."}
                </p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                {!h.isEnabled ? <Badge color="gray">Paused</Badge> : h.failureCount > 0 ? <Badge color="orange">{h.failureCount} failing</Badge> : <Badge color="green" dot>Active</Badge>}
                <Button variant="subtle" size="sm" onClick={() => setLogFor(h)}>
                  Deliveries
                </Button>
                <Button variant="subtle" size="sm" onClick={() => remove(h)}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <CreateWebhookDialog
        open={open}
        onOpenChange={setOpen}
        projects={projects}
        onCreated={(r) => {
          setHooks((list) => [r.webhook, ...list]);
          setIssued(r);
        }}
      />
      {issued ? <SecretDialog issued={issued} onClose={() => setIssued(null)} /> : null}
      {logFor ? <DeliveriesDialog webhook={logFor} onClose={() => setLogFor(null)} staticDeliveries={staticDeliveries} /> : null}
    </div>
  );
}

function CreateWebhookDialog({ open, onOpenChange, projects, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; projects: WebhookProjectOption[]; onCreated: (r: { webhook: WebhookRecord; secret: string }) => void }) {
  const { slug } = useWorkspace();
  const { toast } = useToast();
  const [url, setUrl] = React.useState("");
  const [projectId, setProjectId] = React.useState<string>("");
  const [events, setEvents] = React.useState<WebhookEventType[]>(["task.created", "task.status_changed", "task.completed", "comment.created"]);
  const [pending, setPending] = React.useState(false);
  const toggleType = (t: WebhookEventType) => setEvents((list) => (list.includes(t) ? list.filter((x) => x !== t) : [...list, t]));
  const toggleGroup = (types: WebhookEventType[]) => setEvents((list) => (types.every((t) => list.includes(t)) ? list.filter((x) => !types.includes(x)) : Array.from(new Set([...list, ...types]))));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    const res = await call(createWebhookAction(slug, { url: url.trim(), events, projectId: projectId || null }));
    setPending(false);
    if (!res.ok) {
      toast({ title: "Could not add the webhook", description: res.error.details?.[0]?.message ?? res.error.message, kind: "danger" });
      return;
    }
    onCreated(res.data);
    onOpenChange(false);
    setUrl("");
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <DialogContent
          title="Add webhook"
          description="The signing secret is shown once after you add it."
          size="md"
          footer={
            <>
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" form="add-webhook" loading={pending} disabled={!url.trim() || events.length === 0}>
                Add webhook
              </Button>
            </>
          }
        >
          <form id="add-webhook" onSubmit={submit} className="flex flex-col gap-4">
            <Field label="Endpoint URL" hint="https only. TaskParty POSTs JSON to this address.">
              <Input autoFocus type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/taskparty" required className="font-mono" />
            </Field>
            <Field label="Scope">
              <select aria-label="Scope" value={projectId} onChange={(e) => setProjectId(e.target.value)} className="h-8 w-full rounded-sm border border-border-strong bg-surface px-2 type-body-1">
                <option value="">Whole workspace</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.key})
                  </option>
                ))}
              </select>
            </Field>
            <fieldset>
              <legend className="mb-1 type-caption-1-strong text-fg">
                Events <span className="font-normal text-fg-tertiary">({events.length} selected)</span>
              </legend>
              <div className="grid max-h-64 gap-3 overflow-y-auto rounded-md border border-border p-3 sm:grid-cols-2">
                {webhookEventGroups.map((g) => (
                  <div key={g.label}>
                    <label className="flex cursor-pointer items-center gap-2 type-body-1-strong">
                      <Checkbox checked={g.types.every((t) => events.includes(t))} onCheckedChange={() => toggleGroup(g.types)} aria-label={`All ${g.label.toLowerCase()} events`} /> {g.label}
                    </label>
                    <div className="mt-1 flex flex-col gap-0.5 pl-6">
                      {g.types.map((t) => (
                        <label key={t} className={cn("flex cursor-pointer items-center gap-2 font-mono type-caption-1", events.includes(t) ? "text-fg" : "text-fg-secondary")}>
                          <Checkbox checked={events.includes(t)} onCheckedChange={() => toggleType(t)} aria-label={t} /> {t}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </fieldset>
          </form>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function SecretDialog({ issued, onClose }: { issued: { webhook: WebhookRecord; secret: string }; onClose: () => void }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(issued.secret);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Webhook added" description="Copy the signing secret now. It is not shown again." size="sm" footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
        <p className="mb-2 truncate font-mono type-caption-1 text-fg-secondary">{issued.webhook.url}</p>
        <div className="flex items-center gap-2 rounded-sm border border-border bg-subtle px-3 py-2">
          <code className="min-w-0 flex-1 break-all font-mono type-body-1" aria-label="Signing secret">
            {issued.secret}
          </code>
          <Button variant="secondary" size="sm" onClick={copy} aria-label="Copy secret">
            {copied ? <Checkmark16Regular /> : <Copy16Regular />} {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <p className="mt-3 type-caption-1 text-fg-secondary">Signature: v1=HMAC SHA-256 of &quot;timestamp.body&quot; with this secret, sent in X-TaskParty-Signature.</p>
      </DialogContent>
    </Dialog>
  );
}

function DeliveriesDialog({ webhook, onClose, staticDeliveries }: { webhook: WebhookRecord; onClose: () => void; staticDeliveries?: DeliveryRecord[] }) {
  const { slug } = useWorkspace();
  const { toast } = useToast();
  const [rows, setRows] = React.useState<DeliveryRecord[] | null>(staticDeliveries ?? null);
  const [error, setError] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<number | null>(null);
  const webhookId = webhook.id;
  const isStatic = Boolean(staticDeliveries);
  React.useEffect(() => {
    if (isStatic) return;
    let cancelled = false;
    call(listDeliveriesAction(slug, webhookId)).then((res) => {
      if (cancelled) return;
      if (res.ok) setRows(res.data.data);
      else setError(res.error.message);
    });
    return () => {
      cancelled = true;
    };
  }, [slug, webhookId, isStatic]);
  const replay = async (d: DeliveryRecord) => {
    const res = await call(replayDeliveryAction(slug, webhookId, d.id));
    if (!res.ok) {
      toast({ title: "Could not replay the delivery", description: res.error.message, kind: "danger" });
      return;
    }
    setRows((list) => [res.data, ...(list ?? [])]);
    toast({ title: "Delivery queued", description: `${d.eventType} is being sent again.`, kind: "success" });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Deliveries" description={webhook.url} size="lg" footer={<Button variant="primary" onClick={onClose}>Close</Button>}>
        {error ? <p className="type-body-1 text-danger">{error}</p> : null}
        {rows === null && !error ? <div className="h-24 animate-pulse rounded-sm bg-hover" /> : null}
        {rows && rows.length === 0 ? <p className="py-6 type-body-1 text-fg-secondary">Nothing has been delivered yet.</p> : null}
        {rows && rows.length ? (
          <div className="max-h-[55vh] overflow-y-auto rounded-md border border-border">
            <table className="w-full border-collapse type-body-1" aria-label="Delivery log">
              <thead className="sticky top-0 bg-subtle">
                <tr className="text-left type-caption-1-strong text-fg-secondary">
                  <th className="border-b border-border px-3 py-2">When</th>
                  <th className="border-b border-border px-3 py-2">Event</th>
                  <th className="border-b border-border px-3 py-2">Status</th>
                  <th className="border-b border-border px-3 py-2">Attempts</th>
                  <th className="border-b border-border px-3 py-2">Response</th>
                  <th className="border-b border-border px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <React.Fragment key={d.id}>
                    <tr className="border-b border-border">
                      <td className="px-3 py-1.5 whitespace-nowrap text-fg-secondary">{formatRelativeTime(d.createdAt)}</td>
                      <td className="px-3 py-1.5 font-mono type-caption-1">{d.eventType}</td>
                      <td className="px-3 py-1.5">
                        <Badge color={statusColor[d.status] ?? "gray"} dot>
                          {d.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-1.5 text-fg-secondary">{d.attempts}</td>
                      <td className="max-w-64 truncate px-3 py-1.5 type-caption-1 text-fg-secondary" title={d.lastError ?? ""}>
                        {d.lastResponseCode ?? ""} {d.lastError ?? ""}
                      </td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">
                        <Button variant="subtle" size="sm" onClick={() => setExpanded((e) => (e === d.id ? null : d.id))} aria-expanded={expanded === d.id}>
                          {expanded === d.id ? "Hide" : "Payload"}
                        </Button>
                        <Button variant="subtle" size="sm" onClick={() => replay(d)} aria-label={`Replay delivery ${d.id}`}>
                          Replay
                        </Button>
                      </td>
                    </tr>
                    {expanded === d.id ? (
                      <tr className="border-b border-border bg-subtle">
                        <td colSpan={6} className="px-3 py-2">
                          <pre className="max-h-48 overflow-auto font-mono type-caption-1 text-fg">{JSON.stringify(d.payload, null, 2)}</pre>
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
