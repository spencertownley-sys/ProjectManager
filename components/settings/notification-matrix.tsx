"use client";

import * as React from "react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { useWorkspace } from "@/lib/client/workspace-context";
import { call } from "@/lib/client/actions";
import { setNotificationPreferenceAction } from "@/lib/actions/settings";
import { notificationTypes, type NotificationType, type NotificationChannel } from "@/lib/validation/settings";

export type Preference = { type: NotificationType; channel: NotificationChannel; enabled: boolean };

const typeMeta: Record<NotificationType, { label: string; description: string }> = {
  assigned: { label: "Assigned to me", description: "Someone assigns you a task" },
  mention: { label: "Mentions", description: "Someone mentions you in a comment" },
  comment: { label: "Comments", description: "New comments on tasks you follow" },
  update: { label: "Updates", description: "Status or dates change on tasks you follow" },
  due_soon: { label: "Due soon", description: "A task of yours is due within 48 hours" },
  status_update: { label: "Status updates", description: "A project you are in posts a status update" },
  dependency_unblocked: { label: "Unblocked", description: "A task of yours is no longer blocked" },
};
const channels: Array<{ value: NotificationChannel; label: string; disabled?: boolean }> = [
  { value: "in_app", label: "In app" },
  { value: "email", label: "Email" },
  { value: "chat", label: "Chat", disabled: true },
];

export function NotificationMatrix({ initial }: { initial: Preference[] }) {
  const { slug } = useWorkspace();
  const { toast } = useToast();
  const [prefs, setPrefs] = React.useState(initial);
  const get = (type: NotificationType, channel: NotificationChannel) => prefs.find((p) => p.type === type && p.channel === channel)?.enabled ?? false;
  const toggle = async (type: NotificationType, channel: NotificationChannel, enabled: boolean) => {
    setPrefs((p) => p.map((x) => (x.type === type && x.channel === channel ? { ...x, enabled } : x)));
    const res = await call(setNotificationPreferenceAction(slug, { type, channel, enabled }));
    if (!res.ok) {
      setPrefs((p) => p.map((x) => (x.type === type && x.channel === channel ? { ...x, enabled: !enabled } : x)));
      toast({ title: "Could not save the preference", description: res.error.message, kind: "danger" });
    }
  };
  return (
    <div className="overflow-x-auto rounded-md border border-border bg-surface" role="table" aria-label="Notification preferences">
      <div role="row" className="flex min-w-[640px] h-9 items-center gap-3 border-b border-border bg-subtle px-4 type-caption-1-strong text-fg-secondary">
        <span className="min-w-0 flex-1" role="columnheader">Notification</span>
        {channels.map((c) => (
          <span key={c.value} className="w-20 text-center" role="columnheader">
            {c.label}
          </span>
        ))}
      </div>
      {notificationTypes.map((type) => (
        <div key={type} role="row" className="flex min-w-[640px] min-h-12 items-center gap-3 border-b border-border px-4 last:border-b-0">
          <span className="min-w-0 flex-1" role="cell">
            <span className="block type-body-1-strong">{typeMeta[type].label}</span>
            <span className="block type-caption-1 text-fg-secondary">{typeMeta[type].description}</span>
          </span>
          {channels.map((c) => (
            <span key={c.value} className="flex w-20 justify-center" role="cell">
              <Switch checked={get(type, c.value)} disabled={c.disabled} onCheckedChange={(v) => toggle(type, c.value, v)} aria-label={`${typeMeta[type].label} by ${c.label.toLowerCase()}`} />
            </span>
          ))}
        </div>
      ))}
      <p className="px-4 py-2 type-caption-1 text-fg-tertiary">Chat delivery arrives with the Microsoft Teams and Slack connectors.</p>
    </div>
  );
}
