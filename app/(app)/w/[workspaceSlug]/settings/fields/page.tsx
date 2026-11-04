import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/current";
import { listLibraryFields } from "@/lib/services/fields";
import { SettingsPage } from "@/components/settings/settings-nav";
import { FieldsLibrary } from "@/components/settings/fields-library";

export const dynamic = "force-dynamic";

export default async function FieldsSettingsPage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const session = await getCurrentSession(workspaceSlug);
  if (!(session.actor.workspaceRole === "owner" || session.actor.workspaceRole === "admin")) redirect(`/w/${workspaceSlug}/settings/account/profile`);
  const fields = await listLibraryFields(session);
  return (
    <SettingsPage title="Fields library" description="Custom fields any project can adopt. Project owners add project only fields from the project settings.">
      <FieldsLibrary initial={fields.map((f) => ({ id: f.id, name: f.name, type: f.type, config: f.config, isRequired: f.isRequired, position: f.position }))} projectId={null} />
    </SettingsPage>
  );
}
