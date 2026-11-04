import { notFound, redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/current";
import { getProjectByKey } from "@/lib/services/projects";
import { listProjectFields } from "@/lib/services/fields";
import { NotFoundError } from "@/lib/services/context";
import { ForbiddenError } from "@/lib/auth/permissions";
import { ProjectSettings } from "@/components/settings/project-settings";

export const dynamic = "force-dynamic";

export default async function ProjectSettingsPage({ params }: { params: Promise<{ workspaceSlug: string; projectKey: string }> }) {
  const { workspaceSlug, projectKey } = await params;
  const session = await getCurrentSession(workspaceSlug);
  let detail;
  try {
    detail = await getProjectByKey(session, projectKey);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) notFound();
    throw error;
  }
  if (detail.role !== "owner") redirect(`/w/${workspaceSlug}/projects/${detail.project.key}`);
  const fields = await listProjectFields(session, detail.project.id);
  return (
    <ProjectSettings
      project={{ id: detail.project.id, key: detail.project.key, name: detail.project.name, color: detail.project.color, autoSchedule: detail.project.autoSchedule }}
      statuses={detail.statuses.map((s) => ({ id: s.id, name: s.name, category: s.category, color: s.color, wipLimit: s.wipLimit }))}
      attached={fields.attached.map((f) => ({ id: f.id, name: f.name, type: f.type, config: f.config, isRequired: f.isRequired, position: f.position, projectId: f.projectId }))}
      library={fields.library.map((f) => ({ id: f.id, name: f.name, type: f.type, config: f.config, isRequired: f.isRequired, position: f.position, projectId: f.projectId }))}
    />
  );
}
