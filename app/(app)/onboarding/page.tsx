import { CreateOrganization } from "@clerk/nextjs";

export const dynamic = "force-dynamic";

export default function OnboardingPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4">
      <div className="mb-6 text-center">
        <p className="type-caption-1-strong text-fg-tertiary">Step 1 of 3</p>
        <h1 className="type-title-2 text-fg">Create your workspace</h1>
        <p className="type-body-1 text-fg-secondary">A workspace holds your team, projects, and tasks. You can invite people next.</p>
      </div>
      <CreateOrganization afterCreateOrganizationUrl="/app" skipInvitationScreen={false} />
    </div>
  );
}
