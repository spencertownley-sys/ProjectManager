import { getCurrentSession } from "@/lib/auth/current";
import { listNotifications } from "@/lib/services/notifications";
import { InboxView } from "@/components/inbox/inbox-view";

export const dynamic = "force-dynamic";

export default async function InboxPage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const session = await getCurrentSession(workspaceSlug);
  const items = await listNotifications(session, "all");
  return <InboxView initialItems={items} />;
}
