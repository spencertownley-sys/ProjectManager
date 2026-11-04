import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/current";
import { listTagsWithCounts } from "@/lib/services/workspaces";
import { SettingsPage } from "@/components/settings/settings-nav";
import { TagsEditor } from "@/components/settings/tags-editor";

export const dynamic = "force-dynamic";

export default async function TagsSettingsPage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const session = await getCurrentSession(workspaceSlug);
  if (!(session.actor.workspaceRole === "owner" || session.actor.workspaceRole === "admin")) redirect(`/w/${workspaceSlug}/settings/account/profile`);
  const tags = await listTagsWithCounts(session);
  return (
    <SettingsPage title="Tags" description="Tags are shared across every project in the workspace.">
      <TagsEditor initial={tags} />
    </SettingsPage>
  );
}
