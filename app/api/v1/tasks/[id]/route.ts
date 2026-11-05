import { withApi } from "@/lib/api/handler";
import { getTaskDetail, updateTask, deleteTask } from "@/lib/services/tasks";
import { updateTaskInput } from "@/lib/validation/task";
import { taskDetailObject, parseExpand } from "@/lib/api/serialize";
import { resolveTaskId, taskResponse } from "@/lib/api/tasks";
import { ApiError } from "@/lib/api/errors";
import { ConflictError } from "@/lib/services/context";

export const dynamic = "force-dynamic";

export const GET = withApi(async ({ ctx, params, query, today, key, appUrl }) => {
  const detail = await getTaskDetail(ctx, params.id, today);
  return taskDetailObject(detail, { appUrl, workspaceSlug: key.workspace.slug }, parseExpand(query.get("expand")));
});

export const PATCH = withApi(async ({ ctx, params, body, req, today, key, appUrl }) => {
  const id = await resolveTaskId(ctx, params.id);
  const links = { appUrl, workspaceSlug: key.workspace.slug };
  const ifMatch = req.headers.get("if-match");
  const expectedVersion = ifMatch ? Number(ifMatch.replace(/"/g, "")) : undefined;
  try {
    await updateTask(ctx, updateTaskInput.parse({ ...(await body()), id, ...(expectedVersion !== undefined && Number.isFinite(expectedVersion) ? { expectedVersion } : {}) }));
  } catch (error) {
    if (error instanceof ConflictError) throw new ApiError("conflict", error.message, [], {}, await taskResponse(ctx, id, today, links));
    throw error;
  }
  return taskResponse(ctx, id, today, links);
});

export const DELETE = withApi(async ({ ctx, params }) => {
  await deleteTask(ctx, await resolveTaskId(ctx, params.id));
  return null;
});
