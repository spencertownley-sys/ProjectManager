import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/current";
import { listWebhooks } from "@/lib/services/webhooks";
import { listProjects } from "@/lib/services/projects";
import { SettingsPage } from "@/components/settings/settings-nav";
import { WebhooksPanel } from "@/components/settings/webhooks-panel";

export const dynamic = "force-dynamic";

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function WebhooksSettingsPage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const session = await getCurrentSession(workspaceSlug);
  if (!(session.actor.workspaceRole === "owner" || session.actor.workspaceRole === "admin")) redirect(`/w/${workspaceSlug}/settings/account/profile`);
  const [hooks, projects] = await Promise.all([listWebhooks(session), listProjects(session, { today: todayIso() })]);
  return (
    <SettingsPage title="Webhooks" description="Send signed events to other systems when work changes.">
      <WebhooksPanel initial={hooks} projects={projects.map((p) => ({ id: p.id, key: p.key, name: p.name, color: p.color }))} />
    </SettingsPage>
  );
}
