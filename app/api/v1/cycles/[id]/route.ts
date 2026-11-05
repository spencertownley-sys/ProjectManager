import { z } from "zod";
import { withApi, requireId } from "@/lib/api/handler";
import { closeCycle } from "@/lib/services/projects";
import { updateCycle } from "@/lib/services/cycles";
import { isoDate } from "@/lib/validation/common";

export const dynamic = "force-dynamic";

const patch = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  goal: z.string().max(2000).nullable().optional(),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  capacity: z.number().min(0).nullable().optional(),
  closed: z.boolean().optional(),
  moveIncompleteTo: z.enum(["backlog", "next"]).default("backlog"),
});

export const PATCH = withApi(async ({ ctx, params, body }) => {
  const id = requireId(params.id, "id");
  const input = patch.parse(await body());
  const { closed, moveIncompleteTo, ...fields } = input;
  let result = await updateCycle(ctx, { id, ...fields });
  if (closed) result = await closeCycle(ctx, id, moveIncompleteTo).then(() => updateCycle(ctx, { id }));
  return result;
});
