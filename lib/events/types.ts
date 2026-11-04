export const taskEventTypes = [
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
] as const;
export type TaskEventType = (typeof taskEventTypes)[number];

export type TaskEventInput = {
  workspaceId: string;
  projectId: string;
  taskId: string;
  actorId: string | null;
  automationId?: string | null;
  type: TaskEventType;
  field?: string | null;
  before?: unknown;
  after?: unknown;
};
