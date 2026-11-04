import { SettingsPage } from "@/components/settings/settings-nav";
import { ProfilePanel } from "@/components/settings/profile-panel";

export const dynamic = "force-dynamic";

export default async function ProfileSettingsPage() {
  return (
    <SettingsPage title="Profile" description="Your name, email, password, and sign in methods are managed by Clerk.">
      <ProfilePanel />
    </SettingsPage>
  );
}
