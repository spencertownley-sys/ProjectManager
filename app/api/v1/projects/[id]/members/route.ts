import { withApi, requireId } from "@/lib/api/handler";
import { getProject } from "@/lib/services/projects";

export const dynamic = "force-dynamic";

export const GET = withApi(async ({ ctx, params }) => {
  const detail = await getProject(ctx, requireId(params.id, "id"));
  return { data: detail.members, nextCursor: null };
});
