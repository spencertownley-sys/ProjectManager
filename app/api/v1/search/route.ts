import { withApi } from "@/lib/api/handler";
import { searchWorkspace } from "@/lib/services/search";
import { searchInput } from "@/lib/validation/search";

export const dynamic = "force-dynamic";

export const GET = withApi(async ({ ctx, query }) => {
  const input = searchInput.parse({
    q: query.get("q") ?? "",
    projectId: query.get("project_id") ?? undefined,
    assigneeId: query.get("assignee_id") ?? undefined,
    statusCategory: query.get("status_category") ?? undefined,
    from: query.get("from") ?? undefined,
    to: query.get("to") ?? undefined,
    hasAttachment: query.get("has_attachment") === "true" ? true : undefined,
    limit: Number(query.get("limit") ?? 50) || 50,
  });
  return searchWorkspace(ctx, input);
});
