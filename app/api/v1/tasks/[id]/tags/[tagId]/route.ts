import { withApi, requireId } from "@/lib/api/handler";
import { getTaskDetail, setTaskTags } from "@/lib/services/tasks";
import { resolveTaskId, taskResponse } from "@/lib/api/tasks";

export const dynamic = "force-dynamic";

async function change(ctx: Parameters<typeof setTaskTags>[0], idOrKey: string, tagId: string, today: string, add: boolean) {
  const id = await resolveTaskId(ctx, idOrKey);
  const current = (await getTaskDetail(ctx, id, today)).task.tags.map((t) => t.id);
  const next = add ? Array.from(new Set([...current, tagId])) : current.filter((t) => t !== tagId);
  await setTaskTags(ctx, id, next);
  return id;
}

export const PUT = withApi(async ({ ctx, params, today, key, appUrl }) => {
  const id = await change(ctx, params.id, requireId(params.tagId, "tagId"), today, true);
  return taskResponse(ctx, id, today, { appUrl, workspaceSlug: key.workspace.slug });
}, { status: 200 });

export const DELETE = withApi(async ({ ctx, params, today, key, appUrl }) => {
  const id = await change(ctx, params.id, requireId(params.tagId, "tagId"), today, false);
  return taskResponse(ctx, id, today, { appUrl, workspaceSlug: key.workspace.slug });
}, { status: 200 });
