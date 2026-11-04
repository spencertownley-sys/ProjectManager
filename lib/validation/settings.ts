import { z } from "zod";
import { uuid, paletteColor } from "./common";

export const workspaceSettingsInput = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  estimateUnit: z.enum(["points", "hours"]).optional(),
  allowMultipleAssignees: z.boolean().optional(),
  cycleLabel: z.string().trim().min(1).max(30).optional(),
  weekStartsOn: z.number().int().min(0).max(6).optional(),
});
export type WorkspaceSettingsInput = z.infer<typeof workspaceSettingsInput>;

export const workspaceRoleValue = z.enum(["owner", "admin", "member", "guest"]);

export const inviteMemberInput = z.object({
  email: z.string().trim().email().max(254),
  role: workspaceRoleValue.default("member"),
});
export type InviteMemberInput = z.infer<typeof inviteMemberInput>;

export const changeMemberRoleInput = z.object({ userId: uuid, role: workspaceRoleValue });
export type ChangeMemberRoleInput = z.infer<typeof changeMemberRoleInput>;

export const fieldTypeValue = z.enum(["text", "long_text", "number", "currency", "percent", "date", "single_select", "multi_select", "person", "checkbox", "url", "email", "phone", "formula", "rollup", "relation"]);
export type FieldTypeValue = z.infer<typeof fieldTypeValue>;

export const fieldOption = z.object({ id: z.string().min(1).max(40), name: z.string().trim().min(1).max(60), color: paletteColor.optional() });

export const fieldConfig = z
  .object({
    options: z.array(fieldOption).max(100).optional(),
    currency: z.string().length(3).optional(),
    precision: z.number().int().min(0).max(6).optional(),
    formula: z.string().max(500).optional(),
    rollup: z.object({ source: z.literal("subtasks"), field: z.string(), fn: z.enum(["sum", "average", "min", "max", "count"]) }).optional(),
    relation: z.object({ projectId: uuid.nullable(), multiple: z.boolean() }).optional(),
  })
  .passthrough();

export const createFieldInput = z.object({
  /** Null for the workspace library, a project id for a project field. */
  projectId: uuid.nullable().default(null),
  name: z.string().trim().min(1).max(60),
  type: fieldTypeValue,
  config: fieldConfig.default({}),
  isRequired: z.boolean().default(false),
});
export type CreateFieldInput = z.infer<typeof createFieldInput>;

export const updateFieldInput = z.object({
  id: uuid,
  name: z.string().trim().min(1).max(60).optional(),
  config: fieldConfig.optional(),
  isRequired: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
});
export type UpdateFieldInput = z.infer<typeof updateFieldInput>;

export const projectFieldLinkInput = z.object({ projectId: uuid, fieldId: uuid });

export const tagInput = z.object({ name: z.string().trim().min(1).max(40), color: paletteColor });
export const updateTagInput = z.object({ id: uuid, name: z.string().trim().min(1).max(40).optional(), color: paletteColor.optional() });

export const notificationTypes = ["assigned", "mention", "comment", "update", "due_soon", "status_update", "dependency_unblocked"] as const;
export type NotificationType = (typeof notificationTypes)[number];
export const notificationChannels = ["in_app", "email", "chat"] as const;
export type NotificationChannel = (typeof notificationChannels)[number];

export const notificationPreferenceInput = z.object({ type: z.enum(notificationTypes), channel: z.enum(notificationChannels), enabled: z.boolean() });
export type NotificationPreferenceInput = z.infer<typeof notificationPreferenceInput>;

/** Defaults when no preference row exists (docs/06 section 3): in app on, email on for assignment and mention, chat off. */
export function defaultNotificationPreference(type: NotificationType, channel: NotificationChannel): boolean {
  if (channel === "in_app") return true;
  if (channel === "email") return type === "assigned" || type === "mention";
  return false;
}
