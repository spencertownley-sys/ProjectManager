import { getCurrentSession } from "@/lib/auth/current";
import { listWorkspaceTemplates } from "@/lib/services/projects";
import { TemplatesGallery } from "@/components/templates/templates-gallery";

export const dynamic = "force-dynamic";

export default async function TemplatesRoute({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const session = await getCurrentSession(workspaceSlug);
  const templates = await listWorkspaceTemplates(session);
  return <TemplatesGallery workspaceTemplates={templates} />;
}
