import { z } from "zod";

export const uuid = z.string().uuid();
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
export const isoTime = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Expected HH:MM");
export const paletteColor = z.enum([
  "blue",
  "teal",
  "green",
  "lime",
  "yellow",
  "orange",
  "red",
  "berry",
  "purple",
  "navy",
  "gray",
  "brown",
]);
export type PaletteColor = z.infer<typeof paletteColor>;
export const priorityValue = z.enum(["none", "low", "medium", "high", "urgent"]);
export const statusCategoryValue = z.enum(["backlog", "not_started", "in_progress", "done"]);
export const dependencyTypeValue = z.enum(["fs", "ss", "ff", "sf"]);
export const viewTypeValue = z.enum(["list", "board", "table", "gantt", "timeline", "calendar", "workload", "dashboard"]);
export const healthValue = z.enum(["on_track", "at_risk", "off_track", "on_hold", "complete"]);

/** Rich text documents are stored as Tiptap JSON. Validation is structural only. */
export const richText = z.object({ type: z.literal("doc"), content: z.array(z.unknown()).optional() }).passthrough();
export type RichText = z.infer<typeof richText>;
