import { and, eq, isNull } from "drizzle-orm";
import { schema, type Database } from "@/lib/db/client";
import { assertCan, type Actor } from "@/lib/auth/permissions";
import type { WorkspaceRole } from "@/lib/db/schema";
import { NotFoundError, type ServiceContext } from "./context";

export type ClerkIdentity = {
  clerkUserId: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
};

export type ClerkOrganization = {
  clerkOrgId: string;
  slug: string;
  name: string;
  logoUrl: string | null;
};

export function mapClerkRole(role: string | null | undefined): WorkspaceRole {
  switch (role) {
    case "org:owner":
      return "owner";
    case "org:admin":
      return "admin";
    case "org:guest":
      return "guest";
    default:
      return "member";
  }
}

/** Upserts the Clerk user mirror. Called from the Clerk webhook and from the first request of a session. */
export async function upsertUser(db: Database, identity: ClerkIdentity) {
  const [user] = await db
    .insert(schema.users)
    .values({ clerkUserId: identity.clerkUserId, email: identity.email, displayName: identity.displayName, avatarUrl: identity.avatarUrl })
    .onConflictDoUpdate({
      target: schema.users.clerkUserId,
      set: { email: identity.email, displayName: identity.displayName, avatarUrl: identity.avatarUrl },
    })
    .returning();
  return user;
}

/** Upserts the Clerk organization mirror. */
export async function upsertWorkspace(db: Database, org: ClerkOrganization) {
  const [workspace] = await db
    .insert(schema.workspaces)
    .values({ clerkOrgId: org.clerkOrgId, slug: org.slug, name: org.name, logoUrl: org.logoUrl })
    .onConflictDoUpdate({ target: schema.workspaces.clerkOrgId, set: { slug: org.slug, name: org.name, logoUrl: org.logoUrl, deletedAt: null } })
    .returning();
  return workspace;
}

export async function upsertMembership(db: Database, clerkOrgId: string, clerkUserId: string, clerkRole: string | null | undefined) {
  const [workspace] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.clerkOrgId, clerkOrgId));
  const [user] = await db.select().from(schema.users).where(eq(schema.users.clerkUserId, clerkUserId));
  if (!workspace || !user) return null;
  const role = mapClerkRole(clerkRole);
  await db
    .insert(schema.workspaceMembers)
    .values({ workspaceId: workspace.id, userId: user.id, role })
    .onConflictDoUpdate({ target: [schema.workspaceMembers.workspaceId, schema.workspaceMembers.userId], set: { role } });
  return { workspace, user, role };
}

export async function removeMembership(db: Database, clerkOrgId: string, clerkUserId: string) {
  const [workspace] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.clerkOrgId, clerkOrgId));
  const [user] = await db.select().from(schema.users).where(eq(schema.users.clerkUserId, clerkUserId));
  if (!workspace || !user) return;
  await db.delete(schema.workspaceMembers).where(and(eq(schema.workspaceMembers.workspaceId, workspace.id), eq(schema.workspaceMembers.userId, user.id)));
}

/** Resolves the actor for a Clerk user inside a workspace. Returns null when the user is not a member. */
export async function resolveActor(db: Database, clerkUserId: string, workspaceSlugOrOrgId: string): Promise<{ actor: Actor; workspace: typeof schema.workspaces.$inferSelect; user: typeof schema.users.$inferSelect } | null> {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.clerkUserId, clerkUserId));
  if (!user) return null;
  const rows = await db
    .select({ workspace: schema.workspaces, role: schema.workspaceMembers.role })
    .from(schema.workspaces)
    .innerJoin(schema.workspaceMembers, and(eq(schema.workspaceMembers.workspaceId, schema.workspaces.id), eq(schema.workspaceMembers.userId, user.id)))
    .where(
      and(
        isNull(schema.workspaces.deletedAt),
        workspaceSlugOrOrgId.startsWith("org_") ? eq(schema.workspaces.clerkOrgId, workspaceSlugOrOrgId) : eq(schema.workspaces.slug, workspaceSlugOrOrgId),
      ),
    );
  const row = rows[0];
  if (!row) return null;
  return { actor: { userId: user.id, workspaceId: row.workspace.id, workspaceRole: row.role }, workspace: row.workspace, user };
}

export async function listUserWorkspaces(db: Database, clerkUserId: string) {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.clerkUserId, clerkUserId));
  if (!user) return [];
  return db
    .select({ id: schema.workspaces.id, slug: schema.workspaces.slug, name: schema.workspaces.name, logoUrl: schema.workspaces.logoUrl, clerkOrgId: schema.workspaces.clerkOrgId, role: schema.workspaceMembers.role })
    .from(schema.workspaces)
    .innerJoin(schema.workspaceMembers, and(eq(schema.workspaceMembers.workspaceId, schema.workspaces.id), eq(schema.workspaceMembers.userId, user.id)))
    .where(isNull(schema.workspaces.deletedAt))
    .orderBy(schema.workspaces.name);
}

export async function listMembers(ctx: ServiceContext) {
  const { db, actor } = ctx;
  return db
    .select({
      id: schema.users.id,
      displayName: schema.users.displayName,
      email: schema.users.email,
      avatarUrl: schema.users.avatarUrl,
      role: schema.workspaceMembers.role,
      weeklyCapacityHours: schema.workspaceMembers.weeklyCapacityHours,
      joinedAt: schema.workspaceMembers.joinedAt,
    })
    .from(schema.workspaceMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.workspaceMembers.userId))
    .where(eq(schema.workspaceMembers.workspaceId, actor.workspaceId))
    .orderBy(schema.users.displayName);
}

export async function getWorkspace(ctx: ServiceContext) {
  const [ws] = await ctx.db.select().from(schema.workspaces).where(eq(schema.workspaces.id, ctx.actor.workspaceId));
  if (!ws) throw new NotFoundError("Workspace");
  return ws;
}

export async function updateWorkspaceSettings(ctx: ServiceContext, patch: Partial<Pick<typeof schema.workspaces.$inferInsert, "name" | "estimateUnit" | "allowMultipleAssignees" | "cycleLabel" | "weekStartsOn">>) {
  assertCan(ctx.actor, "workspace.view_settings");
  const [ws] = await ctx.db.update(schema.workspaces).set(patch).where(eq(schema.workspaces.id, ctx.actor.workspaceId)).returning();
  return ws;
}

export async function listTags(ctx: ServiceContext) {
  return ctx.db.select().from(schema.tags).where(eq(schema.tags.workspaceId, ctx.actor.workspaceId)).orderBy(schema.tags.name);
}

export async function createTag(ctx: ServiceContext, input: { name: string; color: string }) {
  const [tag] = await ctx.db
    .insert(schema.tags)
    .values({ workspaceId: ctx.actor.workspaceId, name: input.name, color: input.color })
    .onConflictDoUpdate({ target: [schema.tags.workspaceId, schema.tags.name], set: { color: input.color } })
    .returning();
  return tag;
}
