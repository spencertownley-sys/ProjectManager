import { withApi } from "@/lib/api/handler";
import { listProjects, createProject, getProject } from "@/lib/services/projects";
import { createProjectInput } from "@/lib/validation/project";
import { paginate, parseLimit } from "@/lib/api/shape";
import { projectSummaryObject, projectDetailObject } from "@/lib/api/serialize";

export const dynamic = "force-dynamic";

export const GET = withApi(async ({ ctx, query, today, key, appUrl }) => {
  const links = { appUrl, workspaceSlug: key.workspace.slug };
  let projects = await listProjects(ctx, { today, includeArchived: query.get("archived") === "true" });
  const teamId = query.get("team_id");
  if (teamId) projects = projects.filter((p) => p.teamId === teamId);
  const privacy = query.get("privacy");
  if (privacy) projects = projects.filter((p) => p.privacy === privacy);
  return paginate(projects.map((p) => projectSummaryObject(p, links)), parseLimit(query.get("limit")), query.get("cursor"));
});

export const POST = withApi(async ({ ctx, body, today, key, appUrl }) => {
  const input = createProjectInput.parse(await body());
  const created = await createProject(ctx, input, today);
  return projectDetailObject(await getProject(ctx, created.id), { appUrl, workspaceSlug: key.workspace.slug }, new Set(["sections", "statuses"]));
});
