import { withApi, requireId } from "@/lib/api/handler";
import { getProject, updateWorkflow } from "@/lib/services/projects";
import { updateWorkflowInput } from "@/lib/validation/project";
import { statusObject } from "@/lib/api/serialize";

export const dynamic = "force-dynamic";

export const GET = withApi(async ({ ctx, params }) => {
  const detail = await getProject(ctx, requireId(params.id, "id"));
  return { workflowId: detail.project.workflowId, statuses: detail.statuses.map(statusObject) };
});

export const PATCH = withApi(async ({ ctx, params, body }) => {
  const projectId = requireId(params.id, "id");
  await updateWorkflow(ctx, updateWorkflowInput.parse({ ...(await body()), projectId }));
  const detail = await getProject(ctx, projectId);
  return { workflowId: detail.project.workflowId, statuses: detail.statuses.map(statusObject) };
});
