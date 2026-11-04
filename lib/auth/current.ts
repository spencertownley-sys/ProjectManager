import { auth, currentUser, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/lib/db/client";
import type { Actor } from "./permissions";
import { resolveActor, upsertUser, upsertWorkspace, upsertMembership, listUserWorkspaces } from "@/lib/services/workspaces";
import type { ServiceContext } from "@/lib/services/context";

export type CurrentSession = ServiceContext & {
  user: { id: string; displayName: string; email: string; avatarUrl: string | null; clerkUserId: string };
  workspace: { id: string; slug: string; name: string; logoUrl: string | null; clerkOrgId: string; estimateUnit: "points" | "hours"; cycleLabel: string; weekStartsOn: number };
};

/** Mirrors the signed-in Clerk user when the webhook has not delivered it yet (first request, local dev). */
async function syncUserFromClerk(clerkUserId: string) {
  const cu = await currentUser();
  if (!cu || cu.id !== clerkUserId) return null;
  const primary = cu.emailAddresses.find((e) => e.id === cu.primaryEmailAddressId) ?? cu.emailAddresses[0];
  const name = [cu.firstName, cu.lastName].filter(Boolean).join(" ").trim() || cu.username || primary?.emailAddress.split("@")[0] || "Member";
  return upsertUser(getDb(), { clerkUserId, email: primary?.emailAddress ?? "", displayName: name, avatarUrl: cu.imageUrl ?? null });
}

async function syncOrgFromClerk(clerkOrgId: string, clerkUserId: string, orgRole: string | null | undefined) {
  const client = await clerkClient();
  const org = await client.organizations.getOrganization({ organizationId: clerkOrgId });
  const db = getDb();
  await upsertWorkspace(db, { clerkOrgId: org.id, slug: org.slug ?? org.id.replace("org_", "").toLowerCase(), name: org.name, logoUrl: org.imageUrl ?? null });
  await upsertMembership(db, org.id, clerkUserId, orgRole ?? "org:member");
}

/**
 * Resolves the current actor for a workspace slug. Redirects to sign-in when signed out and to the
 * workspace picker when the user is not a member. Cached per request.
 */
export const getCurrentSession = cache(async (workspaceSlug: string): Promise<CurrentSession> => {
  const { userId: clerkUserId, orgId, orgRole } = await auth();
  if (!clerkUserId) redirect("/sign-in");
  const db = getDb();

  let resolved = await resolveActor(db, clerkUserId, workspaceSlug);
  if (!resolved) {
    await syncUserFromClerk(clerkUserId);
    if (orgId) await syncOrgFromClerk(orgId, clerkUserId, orgRole);
    resolved = await resolveActor(db, clerkUserId, workspaceSlug);
  }
  if (!resolved) redirect("/app");

  const { actor, workspace, user } = resolved;
  return {
    db,
    actor,
    user: { id: user.id, displayName: user.displayName, email: user.email, avatarUrl: user.avatarUrl, clerkUserId: user.clerkUserId },
    workspace: { id: workspace.id, slug: workspace.slug, name: workspace.name, logoUrl: workspace.logoUrl, clerkOrgId: workspace.clerkOrgId, estimateUnit: workspace.estimateUnit, cycleLabel: workspace.cycleLabel, weekStartsOn: workspace.weekStartsOn },
  };
});

/** Lists the workspaces of the signed-in user, syncing the user row if needed. */
export async function getUserWorkspaces() {
  const { userId: clerkUserId, orgId, orgRole } = await auth();
  if (!clerkUserId) redirect("/sign-in");
  const db = getDb();
  let list = await listUserWorkspaces(db, clerkUserId);
  if (list.length === 0) {
    await syncUserFromClerk(clerkUserId);
    if (orgId) {
      await syncOrgFromClerk(orgId, clerkUserId, orgRole);
      list = await listUserWorkspaces(db, clerkUserId);
    }
  }
  return list;
}

export function actorFromSession(session: CurrentSession): Actor {
  return session.actor;
}
