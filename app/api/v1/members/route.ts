import { withApi } from "@/lib/api/handler";
import { listMembers } from "@/lib/services/workspaces";
import { paginate, parseLimit } from "@/lib/api/shape";

export const dynamic = "force-dynamic";

export const GET = withApi(async ({ ctx, query }) => {
  const members = await listMembers(ctx);
  return paginate(members.map((m) => ({ id: m.id, displayName: m.displayName, email: m.email, avatarUrl: m.avatarUrl, role: m.role, weeklyCapacityHours: Number(m.weeklyCapacityHours), joinedAt: m.joinedAt })), parseLimit(query.get("limit")), query.get("cursor"));
});
