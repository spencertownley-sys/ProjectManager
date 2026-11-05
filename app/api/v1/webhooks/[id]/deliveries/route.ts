import { withApi, requireId } from "@/lib/api/handler";
import { listDeliveries } from "@/lib/services/webhooks";
import { parseLimit } from "@/lib/api/shape";

export const dynamic = "force-dynamic";

/** Newest first; pass `cursor` as the smallest delivery id seen to page further back. */
export const GET = withApi(async ({ ctx, params, query }) => {
  const before = Number(query.get("cursor") ?? 0) || null;
  const result = await listDeliveries(ctx, requireId(params.id, "id"), { limit: parseLimit(query.get("limit")), before });
  const last = result.data[result.data.length - 1];
  return { data: result.data, nextCursor: result.hasMore && last ? String(last.id) : null };
});
