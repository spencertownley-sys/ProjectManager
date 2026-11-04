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
import type { StatusDraft } from "./workflow-editor";
import { notificationTypes, notificationChannels, defaultNotificationPreference } from "@/lib/validation/settings";

export type SettingsPreviewPanel = "general" | "members" | "fields" | "workflows" | "tags" | "notifications" | "appearance" | "project";

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
