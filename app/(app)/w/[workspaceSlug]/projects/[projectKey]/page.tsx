import { ProjectPage } from "@/components/project/project-page";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ workspaceSlug: string; projectKey: string }> }) {
  const { workspaceSlug, projectKey } = await params;
  return <ProjectPage workspaceSlug={workspaceSlug} projectKey={projectKey} />;
}
