import { getCurrentSession, getUserWorkspaces } from "@/lib/auth/current";
import { listProjects } from "@/lib/services/projects";
import { listMembers } from "@/lib/services/workspaces";
import { unreadCount } from "@/lib/services/notifications";
import { AppProviders } from "@/components/providers";
import { AppShell } from "@/components/shell/app-shell";

export const dynamic = "force-dynamic";

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const session = await getCurrentSession(workspaceSlug);
  const today = todayIso();
  const [projects, members, unread, workspaces] = await Promise.all([
    listProjects(session, { today, includeArchived: true }),
    listMembers(session),
    unreadCount(session),
    getUserWorkspaces(),
  ]);

  return (
    <AppProviders
      workspace={{
        slug: session.workspace.slug,
        workspace: session.workspace,
        user: session.user,
        role: session.actor.workspaceRole,
        members: members.filter((m) => m.role !== "guest" || session.actor.workspaceRole !== "guest").map((m) => ({ id: m.id, displayName: m.displayName, avatarUrl: m.avatarUrl, email: m.email })),
        today,
      }}
    >
      <AppShell
        data={{
          projects: projects.map((p) => ({ id: p.id, key: p.key, name: p.name, color: p.color, icon: p.icon, archivedAt: p.archivedAt })),
          workspaces: workspaces.map((w) => ({ id: w.id, slug: w.slug, name: w.name, logoUrl: w.logoUrl })),
          unreadCount: unread,
        }}
      >
        {children}
      </AppShell>
    </AppProviders>
  );
}
