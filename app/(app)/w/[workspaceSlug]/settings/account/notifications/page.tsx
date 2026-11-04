import { getCurrentSession } from "@/lib/auth/current";
import { listNotificationPreferences } from "@/lib/services/workspaces";
import { SettingsPage } from "@/components/settings/settings-nav";
import { NotificationMatrix } from "@/components/settings/notification-matrix";

export const dynamic = "force-dynamic";

export default async function NotificationSettingsPage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const session = await getCurrentSession(workspaceSlug);
  const prefs = await listNotificationPreferences(session);
  return (
    <SettingsPage title="Notifications" description="Choose where each kind of notification reaches you in this workspace.">
      <NotificationMatrix initial={prefs} />
    </SettingsPage>
  );
}
