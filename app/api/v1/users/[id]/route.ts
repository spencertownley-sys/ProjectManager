import { withApi, requireId } from "@/lib/api/handler";
import { listMembers } from "@/lib/services/workspaces";
import { NotFoundError } from "@/lib/services/context";

export const dynamic = "force-dynamic";

export const GET = withApi(async ({ ctx, params }) => {
  const id = requireId(params.id, "id");
  const member = (await listMembers(ctx)).find((m) => m.id === id);
  if (!member) throw new NotFoundError("User");
  return { id: member.id, displayName: member.displayName, email: member.email, avatarUrl: member.avatarUrl, role: member.role };
});
