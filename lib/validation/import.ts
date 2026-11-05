import { z } from "zod";
import { uuid } from "./common";

/** CSV import (docs/16 step 1.17): which CSV column feeds which task field. */

export const importTargets = ["skip", "title", "description", "section", "status", "assignee", "startDate", "dueDate", "priority", "estimate", "tags", "milestone", "parent"] as const;
export type ImportTarget = (typeof importTargets)[number];

/** Built in targets plus `field:<uuid>` for custom fields of the project. */
export const importTarget = z.string().refine((v) => (importTargets as readonly string[]).includes(v) || /^field:[0-9a-f-]{36}$/i.test(v), "Unknown import target");

export const importMapping = z
  .array(z.object({ column: z.number().int().min(0).max(199), target: importTarget }))
  .max(200)
  .refine((m) => m.filter((c) => c.target === "title").length === 1, "Map exactly one column to the title");
export type ImportMapping = z.infer<typeof importMapping>;

export const createImportInput = z.object({
  projectId: uuid,
  fileName: z.string().trim().min(1).max(200),
  mapping: importMapping,
  /** Data rows only; the header row is not sent. */
  rows: z.array(z.array(z.string().max(10_000)).max(200)).min(1).max(5000),
});
export type CreateImportInput = z.infer<typeof createImportInput>;

export const importErrorEntry = z.object({ row: z.number().int(), message: z.string() });
export type ImportError = z.infer<typeof importErrorEntry>;
