import { withApi, requireId } from "@/lib/api/handler";
import { archiveProject, getProject } from "@/lib/services/projects";
import { projectDetailObject } from "@/lib/api/serialize";

export const dynamic = "force-dynamic";

export const POST = withApi(async ({ ctx, params, key, appUrl }) => {
  const id = requireId(params.id, "id");
  await archiveProject(ctx, id, false);
  return projectDetailObject(await getProject(ctx, id), { appUrl, workspaceSlug: key.workspace.slug }, new Set());
}, { status: 200 });
