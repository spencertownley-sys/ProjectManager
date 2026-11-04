import { notFound } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/current";
import { getProjectByKey } from "@/lib/services/projects";
import { queryProjectTasks } from "@/lib/services/tasks";
import { listCycles } from "@/lib/services/cycles";
import { NotFoundError } from "@/lib/services/context";
import { ForbiddenError } from "@/lib/auth/permissions";
import { defaultViewSpec } from "@/lib/validation/view-spec";
import { toProjectInfo } from "@/components/project/project-page";
import { CyclesPage } from "@/components/cycles/cycles-page";

export const dynamic = "force-dynamic";

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function CyclesRoute({ params }: { params: Promise<{ workspaceSlug: string; projectKey: string }> }) {
  const { workspaceSlug, projectKey } = await params;
  const session = await getCurrentSession(workspaceSlug);
  let detail;
  try {
    detail = await getProjectByKey(session, projectKey);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) notFound();
    throw error;
  }
  const today = todayIso();
  const [cycles, tasks] = await Promise.all([
    listCycles(session, detail.project.id),
    queryProjectTasks(session, detail.project.id, { ...defaultViewSpec(), showCompleted: "all", subtasks: "flat", sorts: [{ field: "manual", direction: "asc" }] }, today),
  ]);
  return <CyclesPage project={toProjectInfo(detail)} cycles={cycles} initialData={{ rows: tasks.rows, total: tasks.total, truncated: tasks.truncated, dependencies: tasks.dependencies }} />;
}
