import { z } from "zod";
import { uuid } from "./common";

/** Outbound webhook event catalog (docs/12 section 2.2). */
export const webhookEventTypes = [
  "task.created",
  "task.updated",
  "task.status_changed",
  "task.assigned",
  "task.dates_changed",
  "task.completed",
  "task.reopened",
  "task.moved",
  "task.deleted",
  "task.restored",
  "comment.created",
  "comment.edited",
  "attachment.added",
  "dependency.added",
  "dependency.removed",
  "subtask.added",
  "tag.added",
  "tag.removed",
  "field.changed",
  "project.created",
  "project.updated",
  "project.archived",
  "section.created",
  "section.updated",
  "cycle.started",
  "cycle.closed",
  "status_update.posted",
  "form.submitted",
  "member.added",
  "member.removed",
  "automation.failed",
] as const;
export type WebhookEventType = (typeof webhookEventTypes)[number];

export const webhookEventGroups: Array<{ label: string; types: WebhookEventType[] }> = [
  { label: "Tasks", types: ["task.created", "task.updated", "task.status_changed", "task.assigned", "task.dates_changed", "task.completed", "task.reopened", "task.moved", "task.deleted", "task.restored", "subtask.added", "tag.added", "tag.removed", "field.changed"] },
  { label: "Collaboration", types: ["comment.created", "comment.edited", "attachment.added", "dependency.added", "dependency.removed"] },
  { label: "Projects", types: ["project.created", "project.updated", "project.archived", "section.created", "section.updated", "cycle.started", "cycle.closed", "status_update.posted"] },
  { label: "Workspace", types: ["form.submitted", "member.added", "member.removed", "automation.failed"] },
];

const httpsUrl = z
  .string()
  .trim()
  .url()
  .max(2000)
  .refine((u) => u.startsWith("https://") || (process.env.NODE_ENV !== "production" && u.startsWith("http://")), "Webhook URLs must use https");

export const createWebhookInput = z.object({
  url: httpsUrl,
  events: z.array(z.enum(webhookEventTypes)).min(1).max(webhookEventTypes.length),
  projectId: uuid.nullable().default(null),
});
export type CreateWebhookInput = z.infer<typeof createWebhookInput>;

export const updateWebhookInput = z.object({
  id: uuid,
  url: httpsUrl.optional(),
  events: z.array(z.enum(webhookEventTypes)).min(1).optional(),
  projectId: uuid.nullable().optional(),
  isEnabled: z.boolean().optional(),
});
export type UpdateWebhookInput = z.infer<typeof updateWebhookInput>;
