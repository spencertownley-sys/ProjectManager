import { getCurrentSession } from "@/lib/auth/current";
import { SettingsNav, settingsGroups } from "@/components/settings/settings-nav";

export const dynamic = "force-dynamic";

export default async function SettingsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const session = await getCurrentSession(workspaceSlug);
  const canManage = session.actor.workspaceRole === "owner" || session.actor.workspaceRole === "admin";
  return (
    <div className="flex h-full min-h-0">
      <SettingsNav groups={settingsGroups(`/w/${workspaceSlug}/settings`, canManage)} />
      {children}
    </div>
  );
}
