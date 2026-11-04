import { ProjectPage } from "@/components/project/project-page";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ workspaceSlug: string; projectKey: string; view: string }> }) {
  const { workspaceSlug, projectKey, view } = await params;
  return <ProjectPage workspaceSlug={workspaceSlug} projectKey={projectKey} view={view} />;
}
