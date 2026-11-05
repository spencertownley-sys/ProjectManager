import { withApi, requireId } from "@/lib/api/handler";
import { getTaskDetail, addDependency, removeDependency } from "@/lib/services/tasks";
import { addDependencyInput } from "@/lib/validation/task";
import { resolveTaskId } from "@/lib/api/tasks";

export const dynamic = "force-dynamic";

export const GET = withApi(async ({ ctx, params, today }) => {
  const detail = await getTaskDetail(ctx, params.id, today);
  return {
    predecessors: detail.predecessors.map((d) => ({ dependencyId: d.id, taskId: d.predecessorId, key: d.task.key, title: d.task.title, type: d.type, lagDays: d.lagDays })),
    successors: detail.successors.map((d) => ({ dependencyId: d.id, taskId: d.successorId, key: d.task.key, title: d.task.title, type: d.type, lagDays: d.lagDays })),
  };
});

/** Body: predecessor_id, type, lag_days. The path task is the successor. */
export const POST = withApi(async ({ ctx, params, body }) => {
  const successorId = await resolveTaskId(ctx, params.id);
  const dep = await addDependency(ctx, addDependencyInput.parse({ ...(await body()), successorId }));
  return { dependencyId: dep.id, predecessorId: dep.predecessorId, successorId: dep.successorId, type: dep.type, lagDays: dep.lagDays };
});

export const DELETE = withApi(async ({ ctx, query, body }) => {
  const raw = await body();
  const id = requireId(query.get("dependency_id") ?? (typeof raw.dependencyId === "string" ? raw.dependencyId : null), "dependency_id");
  await removeDependency(ctx, id);
  return null;
});
