import { getCurrentSession } from "@/lib/auth/current";
import { listProjects } from "@/lib/services/projects";
import { SearchPage } from "@/components/search/search-page";

export const dynamic = "force-dynamic";

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function SearchRoute({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const session = await getCurrentSession(workspaceSlug);
  const projects = await listProjects(session, { today: todayIso(), includeArchived: true });
  return <SearchPage projects={projects.map((p) => ({ id: p.id, key: p.key, name: p.name, color: p.color }))} />;
}
