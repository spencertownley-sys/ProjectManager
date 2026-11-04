import { getCurrentSession } from "@/lib/auth/current";
import { listProjects } from "@/lib/services/projects";
import { PageHeader } from "@/components/shell/page-header";
import { ProjectsTable } from "@/components/project/projects-table";

export const dynamic = "force-dynamic";

export default async function ProjectsPage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const session = await getCurrentSession(workspaceSlug);
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const projects = await listProjects(session, { today, includeArchived: true });
  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Projects" subtitle={`${projects.filter((p) => !p.archivedAt).length} active`} />
      <ProjectsTable projects={projects} members={session.user ? [] : []} />
    </div>
  );
}
