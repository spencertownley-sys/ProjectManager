import { z } from "zod";
import { withApi, requireId } from "@/lib/api/handler";
import { listStatusUpdates, postStatusUpdate } from "@/lib/services/projects";
import { healthValue } from "@/lib/validation/common";

export const dynamic = "force-dynamic";

const input = z.object({ health: healthValue, title: z.string().trim().min(1).max(200), body: z.unknown().optional() });

export const GET = withApi(async ({ ctx, params }) => {
  return { data: await listStatusUpdates(ctx, requireId(params.id, "id")), nextCursor: null };
});

export const POST = withApi(async ({ ctx, params, body, today }) => {
  const parsed = input.parse(await body());
  return postStatusUpdate(ctx, { projectId: requireId(params.id, "id"), ...parsed }, today);
});
