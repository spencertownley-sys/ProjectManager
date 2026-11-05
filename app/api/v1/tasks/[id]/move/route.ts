import { withApi } from "@/lib/api/handler";
import { moveTask } from "@/lib/services/tasks";
import { moveTaskInput } from "@/lib/validation/task";
import { resolveTaskId, taskResponse } from "@/lib/api/tasks";

export const dynamic = "force-dynamic";

export const POST = withApi(async ({ ctx, params, body, today, key, appUrl }) => {
  const id = await resolveTaskId(ctx, params.id);
  await moveTask(ctx, moveTaskInput.parse({ ...(await body()), id }));
  return taskResponse(ctx, id, today, { appUrl, workspaceSlug: key.workspace.slug });
}, { status: 200 });
