import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/current";
import { getWorkspace } from "@/lib/services/workspaces";
import { SettingsPage } from "@/components/settings/settings-nav";
import { GeneralForm } from "@/components/settings/general-form";

export const dynamic = "force-dynamic";

export default async function GeneralSettingsPage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const session = await getCurrentSession(workspaceSlug);
  if (!(session.actor.workspaceRole === "owner" || session.actor.workspaceRole === "admin")) redirect(`/w/${workspaceSlug}/settings/account/profile`);
  const ws = await getWorkspace(session);
  return (
    <SettingsPage title="General" description="Workspace name and the defaults every project inherits.">
      <GeneralForm initial={{ name: ws.name, slug: ws.slug, logoUrl: ws.logoUrl, estimateUnit: ws.estimateUnit, allowMultipleAssignees: ws.allowMultipleAssignees, cycleLabel: ws.cycleLabel, weekStartsOn: ws.weekStartsOn }} />
    </SettingsPage>
  );
}
