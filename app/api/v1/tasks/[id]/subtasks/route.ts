import { withApi } from "@/lib/api/handler";
import { getTaskDetail, createTask } from "@/lib/services/tasks";
import { createTaskInput } from "@/lib/validation/task";
import { taskObject } from "@/lib/api/serialize";
import { resolveTaskId, taskResponse } from "@/lib/api/tasks";

export const dynamic = "force-dynamic";

export const GET = withApi(async ({ ctx, params, today, key, appUrl }) => {
  const detail = await getTaskDetail(ctx, params.id, today);
  return { data: detail.subtasks.map((s) => taskObject(s, { appUrl, workspaceSlug: key.workspace.slug })), nextCursor: null };
});

export const POST = withApi(async ({ ctx, params, body, today, key, appUrl }) => {
  const parentId = await resolveTaskId(ctx, params.id);
  const parent = await getTaskDetail(ctx, parentId, today);
  const task = await createTask(ctx, createTaskInput.parse({ ...(await body()), projectId: parent.task.projectId, parentId }));
  return taskResponse(ctx, task.id, today, { appUrl, workspaceSlug: key.workspace.slug });
});
