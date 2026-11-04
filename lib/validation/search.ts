import { z } from "zod";
import { uuid, isoDate, statusCategoryValue } from "./common";

/** Search request (docs/10 section 11): a query plus the left column filters. */
export const searchInput = z.object({
  q: z.string().trim().min(1).max(200),
  projectId: uuid.optional(),
  assigneeId: z.union([uuid, z.literal("me"), z.literal("unassigned")]).optional(),
  statusCategory: statusCategoryValue.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  hasAttachment: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).default(50),
});
export type SearchInput = z.infer<typeof searchInput>;

/** Snippets wrap hits in these markers so the client can render highlights without HTML. */
export const HIGHLIGHT_START = "[[";
export const HIGHLIGHT_END = "]]";
