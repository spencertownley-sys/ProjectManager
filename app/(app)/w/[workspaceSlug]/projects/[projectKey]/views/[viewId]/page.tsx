import { ProjectPage } from "@/components/project/project-page";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ workspaceSlug: string; projectKey: string; viewId: string }> }) {
  const { workspaceSlug, projectKey, viewId } = await params;
  return <ProjectPage workspaceSlug={workspaceSlug} projectKey={projectKey} savedViewId={viewId} />;
}
