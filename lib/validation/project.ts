import { z } from "zod";
import { uuid, isoDate, paletteColor, statusCategoryValue } from "./common";

export const projectKey = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9]{1,5}$/, "Use 2 to 6 letters or digits, starting with a letter");

export const createProjectInput = z.object({
  name: z.string().trim().min(1).max(120),
  key: projectKey.optional(),
  teamId: uuid.nullable().optional(),
  color: paletteColor.default("blue"),
  icon: z.string().max(40).nullable().optional(),
  privacy: z.enum(["workspace", "team", "private"]).default("workspace"),
  ownerId: uuid.optional(),
  startDate: isoDate.nullable().optional(),
  endDate: isoDate.nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  templateId: z.string().optional(),
  workflowTemplate: z.enum(["simple", "kanban", "scrum", "shape_up", "phase_gate", "triage"]).default("simple"),
});
export type CreateProjectInput = z.infer<typeof createProjectInput>;

export const updateProjectInput = z.object({
  id: uuid,
  name: z.string().trim().min(1).max(120).optional(),
  color: paletteColor.optional(),
  icon: z.string().max(40).nullable().optional(),
  privacy: z.enum(["workspace", "team", "private"]).optional(),
  ownerId: uuid.nullable().optional(),
  startDate: isoDate.nullable().optional(),
  endDate: isoDate.nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  autoSchedule: z.boolean().optional(),
  defaultViewId: uuid.nullable().optional(),
});
export type UpdateProjectInput = z.infer<typeof updateProjectInput>;

export const createSectionInput = z.object({
  projectId: uuid,
  name: z.string().trim().min(1).max(120),
  afterSectionId: uuid.nullable().optional(),
});
export const updateSectionInput = z.object({
  id: uuid,
  name: z.string().trim().min(1).max(120).optional(),
  isCollapsed: z.boolean().optional(),
});
export const reorderSectionsInput = z.object({ projectId: uuid, orderedIds: z.array(uuid).min(1) });

export const statusInput = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1).max(60),
  category: statusCategoryValue,
  color: paletteColor,
  wipLimit: z.number().int().positive().nullable().optional(),
});
export const updateWorkflowInput = z.object({
  projectId: uuid,
  statuses: z.array(statusInput).min(1).max(30),
});

export const createCycleInput = z.object({
  projectId: uuid,
  name: z.string().trim().min(1).max(80),
  goal: z.string().max(2000).nullable().optional(),
  startDate: isoDate,
  endDate: isoDate,
  capacity: z.number().min(0).nullable().optional(),
});
