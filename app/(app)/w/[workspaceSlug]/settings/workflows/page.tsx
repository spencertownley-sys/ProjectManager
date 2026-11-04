import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/current";
import { listProjects } from "@/lib/services/projects";
import { SettingsPage } from "@/components/settings/settings-nav";
import { WorkflowsLibrary } from "@/components/settings/workflows-library";

export const dynamic = "force-dynamic";

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function WorkflowsSettingsPage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const session = await getCurrentSession(workspaceSlug);
  if (!(session.actor.workspaceRole === "owner" || session.actor.workspaceRole === "admin")) redirect(`/w/${workspaceSlug}/settings/account/profile`);
  const projects = await listProjects(session, { today: todayIso() });
  return (
    <SettingsPage title="Workflows library" description="The status sets new projects start from. Each project edits its own workflow from Workflow and fields in the project menu.">
      <WorkflowsLibrary projects={projects.map((p) => ({ id: p.id, key: p.key, name: p.name, color: p.color }))} />
    </SettingsPage>
  );
}
