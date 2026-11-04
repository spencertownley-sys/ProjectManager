import { z } from "zod";
import { uuid, isoDate, isoTime, priorityValue, dependencyTypeValue, richText } from "./common";

export const customFieldValues = z.record(z.string().uuid(), z.unknown());

export const createTaskInput = z.object({
  projectId: uuid,
  title: z.string().trim().min(1, "Title is required").max(500),
  sectionId: uuid.nullable().optional(),
  parentId: uuid.nullable().optional(),
  statusId: uuid.optional(),
  assigneeId: uuid.nullable().optional(),
  startDate: isoDate.nullable().optional(),
  dueDate: isoDate.nullable().optional(),
  dueTime: isoTime.nullable().optional(),
  priority: priorityValue.optional(),
  estimate: z.number().min(0).max(100000).nullable().optional(),
  isMilestone: z.boolean().optional(),
  cycleId: uuid.nullable().optional(),
  description: richText.nullable().optional(),
  position: z.number().optional(),
  /** Insert relative to another task in the same section: "before" | "after". */
  placement: z.object({ relativeTo: uuid, where: z.enum(["before", "after"]) }).optional(),
  tagIds: z.array(uuid).max(50).optional(),
  customFields: customFieldValues.optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskInput>;

const updateTaskFields = z.object({
    id: uuid,
    expectedVersion: z.number().int().optional(),
    title: z.string().trim().min(1).max(500).optional(),
    description: richText.nullable().optional(),
    statusId: uuid.optional(),
    assigneeId: uuid.nullable().optional(),
    startDate: isoDate.nullable().optional(),
    dueDate: isoDate.nullable().optional(),
    dueTime: isoTime.nullable().optional(),
    priority: priorityValue.optional(),
    estimate: z.number().min(0).max(100000).nullable().optional(),
    isMilestone: z.boolean().optional(),
    cycleId: uuid.nullable().optional(),
    sectionId: uuid.nullable().optional(),
    parentId: uuid.nullable().optional(),
    customFields: customFieldValues.optional(),
});

export const updateTaskInput = updateTaskFields.refine((v) => !(v.startDate && v.dueDate) || v.startDate <= v.dueDate, {
  message: "Due date must be on or after the start date",
  path: ["dueDate"],
});
export type UpdateTaskInput = z.infer<typeof updateTaskInput>;

export const moveTaskInput = z.object({
  id: uuid,
  projectId: uuid.optional(),
  sectionId: uuid.nullable().optional(),
  /** Neighbor ids in the destination list, used to compute a fractional position. */
  beforeId: uuid.nullable().optional(),
  afterId: uuid.nullable().optional(),
});
export type MoveTaskInput = z.infer<typeof moveTaskInput>;

export const bulkUpdateInput = z.object({
  ids: z.array(uuid).min(1).max(500),
  patch: updateTaskFields.omit({ id: true, expectedVersion: true }).partial(),
});
export type BulkUpdateInput = z.infer<typeof bulkUpdateInput>;

export const addDependencyInput = z.object({
  predecessorId: uuid,
  successorId: uuid,
  type: dependencyTypeValue.default("fs"),
  lagDays: z.number().int().min(-365).max(365).default(0),
});
export type AddDependencyInput = z.infer<typeof addDependencyInput>;

export const addCommentInput = z.object({
  taskId: uuid,
  body: richText,
  bodyText: z.string().trim().min(1).max(20000),
  parentId: uuid.nullable().optional(),
  mentionUserIds: z.array(uuid).max(50).default([]),
});
export type AddCommentInput = z.infer<typeof addCommentInput>;
