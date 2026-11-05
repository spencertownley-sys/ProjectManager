import { withApi, requireId } from "@/lib/api/handler";
import { queryProjectTasks, createTask } from "@/lib/services/tasks";
import { getProject } from "@/lib/services/projects";
import { createTaskInput } from "@/lib/validation/task";
import { viewSpec, defaultViewSpec } from "@/lib/validation/view-spec";
import { paginate, parseLimit, parseFieldList, selectFields } from "@/lib/api/shape";
import { taskObject } from "@/lib/api/serialize";
import { specFromQuery, taskResponse } from "@/lib/api/tasks";
import { NotFoundError } from "@/lib/services/context";

export const dynamic = "force-dynamic";

export const GET = withApi(async ({ ctx, params, query, today, key, appUrl }) => {
  const projectId = requireId(params.id, "id");
  let base = defaultViewSpec();
  const viewId = query.get("view_id");
  if (viewId) {
    const detail = await getProject(ctx, projectId);
    const view = detail.views.find((v) => v.id === viewId);
    if (!view) throw new NotFoundError("View");
    base = viewSpec.parse(view.spec);
  }
  const spec = specFromQuery(query, base);
  const result = await queryProjectTasks(ctx, projectId, spec, today);
  const links = { appUrl, workspaceSlug: key.workspace.slug };
  const fields = parseFieldList(query.get("fields"));
  const page = paginate(result.rows.map((r) => selectFields(taskObject(r, links), fields)), parseLimit(query.get("limit")), query.get("cursor"));
  return { ...page, total: result.total, truncated: result.truncated };
});

export const POST = withApi(async ({ ctx, params, body, today, key, appUrl }) => {
  const task = await createTask(ctx, createTaskInput.parse({ ...(await body()), projectId: requireId(params.id, "id") }));
  return taskResponse(ctx, task.id, today, { appUrl, workspaceSlug: key.workspace.slug });
});
