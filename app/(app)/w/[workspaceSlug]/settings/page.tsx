import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/current";

export const dynamic = "force-dynamic";

export default async function SettingsIndex({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const session = await getCurrentSession(workspaceSlug);
  const canManage = session.actor.workspaceRole === "owner" || session.actor.workspaceRole === "admin";
  redirect(`/w/${workspaceSlug}/settings/${canManage ? "general" : "account/profile"}`);
}
