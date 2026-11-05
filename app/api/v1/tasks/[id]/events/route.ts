import { withApi } from "@/lib/api/handler";
import { getTaskDetail } from "@/lib/services/tasks";
import { eventObject } from "@/lib/api/serialize";

export const dynamic = "force-dynamic";

export const GET = withApi(async ({ ctx, params, today }) => {
  const detail = await getTaskDetail(ctx, params.id, today);
  return { data: detail.events.map(eventObject), nextCursor: null };
});
