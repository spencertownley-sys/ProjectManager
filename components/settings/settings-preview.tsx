"use client";

import * as React from "react";
import { SettingsNav, SettingsPage, settingsGroups } from "./settings-nav";
import { GeneralForm } from "./general-form";
import { MembersTable, type MemberRow } from "./members-table";
import { FieldsLibrary, type FieldRow } from "./fields-library";
import { TagsEditor } from "./tags-editor";
import { NotificationMatrix } from "./notification-matrix";
import { AppearanceSettings } from "./appearance-settings";
import { WorkflowsLibrary } from "./workflows-library";
import { ProjectSettings } from "./project-settings";
import { ApiKeysPanel } from "./api-keys-panel";
import { WebhooksPanel } from "./webhooks-panel";
import type { StatusDraft } from "./workflow-editor";
import { notificationTypes, notificationChannels, defaultNotificationPreference } from "@/lib/validation/settings";

export type SettingsPreviewPanel = "general" | "members" | "fields" | "workflows" | "tags" | "notifications" | "appearance" | "project" | "api-keys" | "webhooks";

/** Dev preview of the settings screens with fixture data; mutations fail with a toast. */
export function SettingsPreview({ panel, members, fields, statuses, project }: { panel: SettingsPreviewPanel; members: MemberRow[]; fields: FieldRow[]; statuses: StatusDraft[]; project: { id: string; key: string; name: string; color: string; autoSchedule: boolean } }) {
  const base = "/w/taskparty/settings";
  const current = panel === "notifications" || panel === "appearance" ? `${base}/account/${panel}` : `${base}/${panel}`;
  const prefs = notificationTypes.flatMap((type) => notificationChannels.map((channel) => ({ type, channel, enabled: defaultNotificationPreference(type, channel) })));
  if (panel === "project") {
    return <ProjectSettings project={project} statuses={statuses} attached={fields.slice(0, 2).map((f) => ({ ...f, projectId: project.id }))} library={fields.slice(2)} />;
  }
  return (
    <div className="flex h-full min-h-0">
      <SettingsNav groups={settingsGroups(base, true)} currentPath={current} />
      {panel === "general" ? (
        <SettingsPage title="General" description="Workspace name and the defaults every project inherits.">
          <GeneralForm initial={{ name: "TaskParty", slug: "taskparty", logoUrl: null, estimateUnit: "points", allowMultipleAssignees: false, cycleLabel: "Cycle", weekStartsOn: 1 }} />
        </SettingsPage>
      ) : null}
      {panel === "members" ? (
        <SettingsPage title="Members" description="Who is in this workspace and what they can do. Invitations are sent by email.">
          <MembersTable members={members} myRole="owner" myId={members[0]?.id ?? ""} staticInvitations={[{ id: "inv-1", emailAddress: "sam@example.com", role: "member", createdAt: "2026-11-02T09:00:00Z" }]} />
        </SettingsPage>
      ) : null}
      {panel === "fields" ? (
        <SettingsPage title="Fields library" description="Custom fields any project can adopt. Project owners add project only fields from the project settings.">
          <FieldsLibrary initial={fields} projectId={null} />
        </SettingsPage>
      ) : null}
      {panel === "workflows" ? (
        <SettingsPage title="Workflows library" description="The status sets new projects start from. Each project edits its own workflow from Workflow and fields in the project menu.">
          <WorkflowsLibrary base="/w/taskparty" projects={[{ id: project.id, key: project.key, name: project.name, color: project.color }]} />
        </SettingsPage>
      ) : null}
      {panel === "tags" ? (
        <SettingsPage title="Tags" description="Tags are shared across every project in the workspace.">
          <TagsEditor initial={[{ id: "tag-email", name: "Email", color: "teal", count: 7 }, { id: "tag-web", name: "Web", color: "purple", count: 4 }]} />
        </SettingsPage>
      ) : null}
      {panel === "api-keys" ? (
        <SettingsPage title="API keys" description="Keys for scripts and integrations that call the public REST API on behalf of this workspace.">
          <ApiKeysPanel
            initial={[
              { id: "key-1", name: "CI pipeline", keyPrefix: "tp_live_a1b2", scopes: ["read", "write"], createdBy: "u-spencer", createdByName: "Spencer Townley", lastUsedAt: "2026-11-04T08:12:00Z", expiresAt: null, revokedAt: null, createdAt: "2026-10-20T09:00:00Z" },
              { id: "key-2", name: "Looker dashboard", keyPrefix: "tp_live_c3d4", scopes: ["read"], createdBy: "u-jenny", createdByName: "Jenny Park", lastUsedAt: null, expiresAt: "2027-01-01T00:00:00Z", revokedAt: null, createdAt: "2026-11-01T15:30:00Z" },
              { id: "key-3", name: "Old Zapier", keyPrefix: "tp_live_e5f6", scopes: ["write"], createdBy: "u-spencer", createdByName: "Spencer Townley", lastUsedAt: "2026-09-02T10:00:00Z", expiresAt: null, revokedAt: "2026-10-01T10:00:00Z", createdAt: "2026-08-01T10:00:00Z" },
            ]}
          />
        </SettingsPage>
      ) : null}
      {panel === "webhooks" ? (
        <SettingsPage title="Webhooks" description="Send signed events to other systems when work changes.">
          <WebhooksPanel
            projects={[{ id: project.id, key: project.key, name: project.name, color: project.color }]}
            initial={[
              { id: "wh-1", url: "https://hooks.example.com/taskparty", events: ["task.created", "task.status_changed", "task.completed", "comment.created"], projectId: null, isEnabled: true, failureCount: 0, createdBy: "u-spencer", createdAt: "2026-10-12T09:00:00Z", lastDelivery: { status: "delivered", createdAt: "2026-11-04T07:50:00Z", responseCode: 200 } },
              { id: "wh-2", url: "https://api.partner.example/v2/events", events: ["task.completed"], projectId: project.id, isEnabled: true, failureCount: 3, createdBy: "u-jenny", createdAt: "2026-11-01T11:00:00Z", lastDelivery: { status: "failed", createdAt: "2026-11-03T16:20:00Z", responseCode: 503 } },
              { id: "wh-3", url: "https://old.example.com/hook", events: ["task.created"], projectId: null, isEnabled: false, failureCount: 20, createdBy: "u-spencer", createdAt: "2026-08-01T10:00:00Z", lastDelivery: { status: "disabled", createdAt: "2026-10-20T10:00:00Z", responseCode: null } },
            ]}
            staticDeliveries={[
              { id: 42, webhookId: "wh-1", eventType: "task.status_changed", status: "delivered", attempts: 1, lastResponseCode: 200, lastError: null, nextAttemptAt: null, deliveredAt: "2026-11-04T07:50:01Z", createdAt: "2026-11-04T07:50:00Z", payload: { id: "evt_912", type: "task.status_changed", project_id: project.id, data: { task: { key: "MKT-8", title: "Landing page build" }, changes: { status: { before: "Approved", after: "In progress" } } } } },
              { id: 41, webhookId: "wh-1", eventType: "comment.created", status: "failed", attempts: 6, lastResponseCode: 503, lastError: "HTTP 503: upstream unavailable", nextAttemptAt: null, deliveredAt: null, createdAt: "2026-11-02T13:10:00Z", payload: { id: "evt_880", type: "comment.created" } },
              { id: 40, webhookId: "wh-1", eventType: "task.created", status: "pending", attempts: 2, lastResponseCode: 500, lastError: "HTTP 500: ", nextAttemptAt: "2026-11-04T08:30:00Z", deliveredAt: null, createdAt: "2026-11-04T07:00:00Z", payload: { id: "evt_901", type: "task.created" } },
            ]}
          />
        </SettingsPage>
      ) : null}
      {panel === "notifications" ? (
        <SettingsPage title="Notifications" description="Choose where each kind of notification reaches you in this workspace.">
          <NotificationMatrix initial={prefs} />
        </SettingsPage>
      ) : null}
      {panel === "appearance" ? (
        <SettingsPage title="Appearance" description="These settings apply to this browser.">
          <AppearanceSettings />
        </SettingsPage>
      ) : null}
    </div>
  );
}
