import { ClerkProvider } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/auth/clerk-appearance";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider appearance={clerkAppearance}>
      <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4">
        <a href="/" className="mb-8 flex items-center gap-2 text-fg no-underline">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-sm bg-brand type-caption-1-strong text-fg-on-brand">
            TP
          </span>
          <span className="type-subtitle-2">TaskParty</span>
        </a>
        {children}
        <p className="mt-8 type-caption-1 text-fg-tertiary">
          Free while in beta. Early adopters keep a reduced price.
        </p>
      </div>
    </ClerkProvider>
  );
}
