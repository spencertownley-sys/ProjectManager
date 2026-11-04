"use client";

import { UserProfile } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/auth/clerk-appearance";

/** Clerk's hosted profile, styled with the design tokens. */
export function ProfilePanel() {
  return (
    <div className="[&_.cl-rootBox]:w-full [&_.cl-cardBox]:w-full [&_.cl-cardBox]:max-w-none">
      <UserProfile routing="hash" appearance={clerkAppearance} />
    </div>
  );
}
