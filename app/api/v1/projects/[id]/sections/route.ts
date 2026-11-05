import { withApi, requireId } from "@/lib/api/handler";
import { getProject, createSection } from "@/lib/services/projects";
import { createSectionInput } from "@/lib/validation/project";
import { sectionObject } from "@/lib/api/serialize";

export const dynamic = "force-dynamic";

export const GET = withApi(async ({ ctx, params }) => {
  const detail = await getProject(ctx, requireId(params.id, "id"));
  return { data: detail.sections.map(sectionObject), nextCursor: null };
});

export const POST = withApi(async ({ ctx, params, body }) => {
  const section = await createSection(ctx, createSectionInput.parse({ ...(await body()), projectId: requireId(params.id, "id") }));
  return sectionObject(section);
});
