import { withApi } from "@/lib/api/handler";
import { queryMyWork } from "@/lib/services/tasks";
import { paginate, parseLimit, parseFieldList, selectFields } from "@/lib/api/shape";
import { taskObject } from "@/lib/api/serialize";
import { specFromQuery } from "@/lib/api/tasks";

export const dynamic = "force-dynamic";

/** Every task the key can see across the workspace; the same filters as the project list. */
export const GET = withApi(async ({ ctx, query, today, key, appUrl }) => {
  const spec = specFromQuery(query);
  const result = await queryMyWork(ctx, spec, today, "created");
  const links = { appUrl, workspaceSlug: key.workspace.slug };
  const fields = parseFieldList(query.get("fields"));
  const page = paginate(result.rows.map((r) => selectFields(taskObject(r, links), fields)), parseLimit(query.get("limit")), query.get("cursor"));
  return { ...page, total: result.total, truncated: result.truncated };
});
