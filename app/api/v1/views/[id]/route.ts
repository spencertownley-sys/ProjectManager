import { z } from "zod";
import { withApi, requireId } from "@/lib/api/handler";
import { updateView, deleteView } from "@/lib/services/views";
import { viewSpec } from "@/lib/validation/view-spec";
import { viewTypeValue } from "@/lib/validation/common";
import { viewObject } from "@/lib/api/serialize";

export const dynamic = "force-dynamic";

const patch = z.object({ name: z.string().trim().min(1).max(80).optional(), spec: viewSpec.optional(), isShared: z.boolean().optional(), position: z.number().int().optional(), type: viewTypeValue.optional() });

export const PATCH = withApi(async ({ ctx, params, body }) => {
  const view = await updateView(ctx, { id: requireId(params.id, "id"), ...patch.parse(await body()) });
  return viewObject(view);
});

export const DELETE = withApi(async ({ ctx, params }) => {
  await deleteView(ctx, requireId(params.id, "id"));
  return null;
});
