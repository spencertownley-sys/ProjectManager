import { withApi, requireId } from "@/lib/api/handler";
import { getProject } from "@/lib/services/projects";
import { saveView } from "@/lib/services/views";
import { savedViewInput } from "@/lib/validation/view-spec";
import { viewObject } from "@/lib/api/serialize";

export const dynamic = "force-dynamic";

export const GET = withApi(async ({ ctx, params }) => {
  const detail = await getProject(ctx, requireId(params.id, "id"));
  return { data: detail.views.map(viewObject), nextCursor: null };
});

export const POST = withApi(async ({ ctx, params, body }) => {
  const view = await saveView(ctx, savedViewInput.parse({ ...(await body()), projectId: requireId(params.id, "id") }));
  return viewObject(view);
});
