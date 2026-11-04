import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/current";
import { listMembers } from "@/lib/services/workspaces";
import { SettingsPage } from "@/components/settings/settings-nav";
import { MembersTable } from "@/components/settings/members-table";

export const dynamic = "force-dynamic";

export default async function MembersSettingsPage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const session = await getCurrentSession(workspaceSlug);
  if (!(session.actor.workspaceRole === "owner" || session.actor.workspaceRole === "admin")) redirect(`/w/${workspaceSlug}/settings/account/profile`);
  const members = await listMembers(session);
  return (
    <SettingsPage title="Members" description="Who is in this workspace and what they can do. Invitations are sent by email.">
      <MembersTable members={members.map((m) => ({ id: m.id, displayName: m.displayName, email: m.email, avatarUrl: m.avatarUrl, role: m.role, weeklyCapacityHours: Number(m.weeklyCapacityHours), joinedAt: m.joinedAt.toISOString() }))} myRole={session.actor.workspaceRole} myId={session.actor.userId} />
    </SettingsPage>
  );
}
