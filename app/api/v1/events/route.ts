import { withApi } from "@/lib/api/handler";
import { listWorkspaceEvents } from "@/lib/services/events";
import { parseLimit } from "@/lib/api/shape";

export const dynamic = "force-dynamic";

/** Polling stream: pass `since` (the last id seen) to get what happened after it, oldest first. */
export const GET = withApi(async ({ ctx, query }) => {
  const since = Number(query.get("since") ?? 0) || 0;
  const types = (query.get("type") ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  const result = await listWorkspaceEvents(ctx, { since, limit: parseLimit(query.get("limit"), 100, 500), types, projectId: query.get("project_id") });
  return { data: result.events, nextSince: result.nextSince, hasMore: result.hasMore };
});
