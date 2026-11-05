import { withApi, requireId } from "@/lib/api/handler";
import { restoreTask } from "@/lib/services/tasks";
import { taskResponse } from "@/lib/api/tasks";

export const dynamic = "force-dynamic";

export const POST = withApi(async ({ ctx, params, today, key, appUrl }) => {
  const id = requireId(params.id, "id");
  await restoreTask(ctx, id);
  return taskResponse(ctx, id, today, { appUrl, workspaceSlug: key.workspace.slug });
}, { status: 200 });
