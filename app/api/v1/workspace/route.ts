import { withApi } from "@/lib/api/handler";
import { getWorkspace } from "@/lib/services/workspaces";

export const dynamic = "force-dynamic";

export const GET = withApi(async ({ ctx }) => {
  const ws = await getWorkspace(ctx);
  return { id: ws.id, slug: ws.slug, name: ws.name, logoUrl: ws.logoUrl, estimateUnit: ws.estimateUnit, cycleLabel: ws.cycleLabel, weekStartsOn: ws.weekStartsOn, createdAt: ws.createdAt };
});
