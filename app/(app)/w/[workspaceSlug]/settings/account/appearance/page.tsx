import { SettingsPage } from "@/components/settings/settings-nav";
import { AppearanceSettings } from "@/components/settings/appearance-settings";

export const dynamic = "force-dynamic";

export default async function AppearanceSettingsPage() {
  return (
    <SettingsPage title="Appearance" description="These settings apply to this browser.">
      <AppearanceSettings />
    </SettingsPage>
  );
}
