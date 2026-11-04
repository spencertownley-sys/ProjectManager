import { notFound, redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/current";
import { getProjectByKey, type ProjectDetail } from "@/lib/services/projects";
import { queryProjectTasks } from "@/lib/services/tasks";
import { NotFoundError } from "@/lib/services/context";
import { ForbiddenError } from "@/lib/auth/permissions";
import { viewSpec, defaultViewSpec, type ViewSpec } from "@/lib/validation/view-spec";
import { viewMeta } from "@/components/views/view-registry";
import { ProjectWorkspace } from "./project-workspace";
import type { ProjectInfo } from "@/components/views/types";
import type { ViewType } from "@/lib/db/schema";

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function ProjectPage({ workspaceSlug, projectKey, view, savedViewId }: { workspaceSlug: string; projectKey: string; view?: string; savedViewId?: string }) {
  const session = await getCurrentSession(workspaceSlug);
  let detail;
  try {
    detail = await getProjectByKey(session, projectKey);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) notFound();
    throw error;
  }
  const today = todayIso();
  const base = `/w/${workspaceSlug}/projects/${detail.project.key}`;

  let viewType: ViewType;
  let spec: ViewSpec = defaultViewSpec();
  if (savedViewId) {
    const saved = detail.views.find((v) => v.id === savedViewId);
    if (!saved) notFound();
    viewType = saved.type;
    spec = viewSpec.parse(saved.spec);
  } else if (view && view in viewMeta) {
    viewType = view as ViewType;
    if (viewMeta[viewType].phase === 2) redirect(`${base}/list`);
  } else {
    const def = detail.project.defaultViewId ? detail.views.find((v) => v.id === detail.project.defaultViewId) : null;
    if (def && def.name !== "Default") redirect(`${base}/views/${def.id}`);
    redirect(`${base}/${def?.type ?? "list"}`);
  }

  const data = await queryProjectTasks(session, detail.project.id, spec, today);

  const info = toProjectInfo(detail);

  return <ProjectWorkspace project={info} viewType={viewType} savedViewId={savedViewId ?? null} initialData={data} initialSpec={spec} />;
}

/** Maps a ProjectDetail from the service into the client ProjectInfo contract. */
export function toProjectInfo(detail: ProjectDetail): ProjectInfo {
  return {
    id: detail.project.id,
    key: detail.project.key,
    name: detail.project.name,
    color: detail.project.color,
    icon: detail.project.icon,
    privacy: detail.project.privacy,
    ownerId: detail.project.ownerId,
    startDate: detail.project.startDate,
    endDate: detail.project.endDate,
    autoSchedule: detail.project.autoSchedule,
    defaultViewId: detail.project.defaultViewId,
    archivedAt: detail.project.archivedAt?.toISOString() ?? null,
    statuses: detail.statuses.map((s) => ({ id: s.id, name: s.name, category: s.category, color: s.color, position: s.position, wipLimit: s.wipLimit })),
    sections: detail.sections.map((s) => ({ id: s.id, name: s.name, position: s.position, isCollapsed: s.isCollapsed })),
    fields: detail.fields.map((f) => ({ id: f.id, name: f.name, type: f.type, config: f.config, position: f.position, isRequired: f.isRequired })),
    cycles: detail.cycles.map((c) => ({ id: c.id, name: c.name, goal: c.goal, startDate: c.startDate, endDate: c.endDate, capacity: c.capacity === null ? null : Number(c.capacity), closedAt: c.closedAt?.toISOString() ?? null })),
    views: detail.views.map((v) => ({ id: v.id, name: v.name, type: v.type, spec: viewSpec.parse(v.spec), isShared: v.isShared, ownerId: v.ownerId, position: v.position })),
    members: detail.members.map((m) => ({ id: m.id, displayName: m.displayName, avatarUrl: m.avatarUrl, email: m.email })),
    baselines: detail.baselines,
    role: detail.role,
  };
}
