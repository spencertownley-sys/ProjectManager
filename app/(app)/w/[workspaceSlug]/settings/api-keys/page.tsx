import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/current";
import { listApiKeys } from "@/lib/services/api-keys";
import { SettingsPage } from "@/components/settings/settings-nav";
import { ApiKeysPanel } from "@/components/settings/api-keys-panel";

export const dynamic = "force-dynamic";

export default async function ApiKeysSettingsPage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const session = await getCurrentSession(workspaceSlug);
  if (!(session.actor.workspaceRole === "owner" || session.actor.workspaceRole === "admin")) redirect(`/w/${workspaceSlug}/settings/account/profile`);
  const keys = await listApiKeys(session);
  return (
    <SettingsPage title="API keys" description="Keys for scripts and integrations that call the public REST API on behalf of this workspace.">
      <ApiKeysPanel initial={keys} />
    </SettingsPage>
  );
}
