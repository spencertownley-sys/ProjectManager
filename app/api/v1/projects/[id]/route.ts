import { withApi, requireId } from "@/lib/api/handler";
import { getProject, updateProject, deleteProject } from "@/lib/services/projects";
import { updateProjectInput } from "@/lib/validation/project";
import { projectDetailObject, parseExpand } from "@/lib/api/serialize";

export const dynamic = "force-dynamic";

export const GET = withApi(async ({ ctx, params, query, key, appUrl }) => {
  const detail = await getProject(ctx, requireId(params.id, "id"));
  return projectDetailObject(detail, { appUrl, workspaceSlug: key.workspace.slug }, parseExpand(query.get("expand")));
});

export const PATCH = withApi(async ({ ctx, params, body, key, appUrl }) => {
  const id = requireId(params.id, "id");
  await updateProject(ctx, updateProjectInput.parse({ ...(await body()), id }));
  return projectDetailObject(await getProject(ctx, id), { appUrl, workspaceSlug: key.workspace.slug }, new Set());
});

export const DELETE = withApi(async ({ ctx, params }) => {
  await deleteProject(ctx, requireId(params.id, "id"));
  return null;
});
