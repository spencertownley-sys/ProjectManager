import { withApi, requireId } from "@/lib/api/handler";
import { getProject, createCycle } from "@/lib/services/projects";
import { listCycles } from "@/lib/services/cycles";
import { createCycleInput } from "@/lib/validation/project";
import { cycleObject } from "@/lib/api/serialize";

export const dynamic = "force-dynamic";

export const GET = withApi(async ({ ctx, params }) => {
  const projectId = requireId(params.id, "id");
  await getProject(ctx, projectId);
  const cycles = await listCycles(ctx, projectId);
  return { data: cycles.map((c) => ({ ...c, projectId })), nextCursor: null };
});

export const POST = withApi(async ({ ctx, params, body }) => {
  const cycle = await createCycle(ctx, createCycleInput.parse({ ...(await body()), projectId: requireId(params.id, "id") }));
  return cycleObject(cycle);
});
