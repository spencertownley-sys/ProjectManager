import { withApi, requireId } from "@/lib/api/handler";
import { updateSection, deleteSection } from "@/lib/services/projects";
import { updateSectionInput } from "@/lib/validation/project";
import { sectionObject } from "@/lib/api/serialize";

export const dynamic = "force-dynamic";

export const PATCH = withApi(async ({ ctx, params, body }) => {
  const section = await updateSection(ctx, updateSectionInput.parse({ ...(await body()), id: requireId(params.id, "id") }));
  return sectionObject(section);
});

export const DELETE = withApi(async ({ ctx, params }) => {
  await deleteSection(ctx, requireId(params.id, "id"));
  return null;
});
