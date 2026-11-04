import { and, eq, isNull, sql } from "drizzle-orm";
import { schema, type Database } from "@/lib/db/client";
import { assertCan, type Actor } from "@/lib/auth/permissions";
import type { WorkspaceRole } from "@/lib/db/schema";
import { NotFoundError, ValidationError, type ServiceContext } from "./context";
import type { InviteMemberInput, ChangeMemberRoleInput, NotificationPreferenceInput, NotificationType, NotificationChannel } from "@/lib/validation/settings";
import { notificationTypes, notificationChannels, defaultNotificationPreference } from "@/lib/validation/settings";

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
  assertCan(ctx.actor, "task.create");
  const [tag] = await ctx.db
    .insert(schema.tags)
    .values({ workspaceId: ctx.actor.workspaceId, name: input.name, color: input.color })
    .onConflictDoUpdate({ target: [schema.tags.workspaceId, schema.tags.name], set: { color: input.color } })
    .returning();
  return tag;
}

export async function updateTag(ctx: ServiceContext, input: { id: string; name?: string; color?: string }) {
  assertCan(ctx.actor, "workspace.manage_libraries");
  const patch: Partial<typeof schema.tags.$inferInsert> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.color !== undefined) patch.color = input.color;
  const [tag] = await ctx.db.update(schema.tags).set(patch).where(and(eq(schema.tags.id, input.id), eq(schema.tags.workspaceId, ctx.actor.workspaceId))).returning();
  if (!tag) throw new NotFoundError("Tag");
  return tag;
}

export async function deleteTag(ctx: ServiceContext, id: string) {
  assertCan(ctx.actor, "workspace.manage_libraries");
  await ctx.db.delete(schema.tags).where(and(eq(schema.tags.id, id), eq(schema.tags.workspaceId, ctx.actor.workspaceId)));
}

/** Tags with how many tasks use them, for the settings page. */
export async function listTagsWithCounts(ctx: ServiceContext) {
  const rows = await ctx.db
    .select({ id: schema.tags.id, name: schema.tags.name, color: schema.tags.color, count: sql<number>`(select count(*) from task_tags tt where tt.tag_id = ${schema.tags.id})` })
    .from(schema.tags)
    .where(eq(schema.tags.workspaceId, ctx.actor.workspaceId))
    .orderBy(schema.tags.name);
  return rows.map((r) => ({ ...r, count: Number(r.count) }));
}

/**
 * The Clerk calls member management needs. Actions pass the Clerk Backend client; tests pass a fake.
 * Clerk owns invitations and roles; the webhook mirrors the result (docs/08 section 3).
 */
export type MembershipDirectory = {
  invite: (input: { organizationId: string; emailAddress: string; role: string; inviterUserId: string }) => Promise<{ id: string }>;
  listInvitations: (organizationId: string) => Promise<Array<{ id: string; emailAddress: string; role: string; createdAt: string }>>;
  revokeInvitation: (input: { organizationId: string; invitationId: string; requestingUserId: string }) => Promise<void>;
  updateRole: (input: { organizationId: string; userId: string; role: string }) => Promise<void>;
  remove: (input: { organizationId: string; userId: string }) => Promise<void>;
};

const clerkRoleFor = (role: WorkspaceRole) => `org:${role}`;

async function clerkIds(ctx: ServiceContext, userId?: string) {
  const [ws] = await ctx.db.select({ clerkOrgId: schema.workspaces.clerkOrgId }).from(schema.workspaces).where(eq(schema.workspaces.id, ctx.actor.workspaceId));
  if (!ws) throw new NotFoundError("Workspace");
  const [me] = await ctx.db.select({ clerkUserId: schema.users.clerkUserId }).from(schema.users).where(eq(schema.users.id, ctx.actor.userId));
  const target = userId ? (await ctx.db.select({ clerkUserId: schema.users.clerkUserId }).from(schema.users).where(eq(schema.users.id, userId)))[0] : null;
  if (userId && !target) throw new NotFoundError("Member");
  return { organizationId: ws.clerkOrgId, meClerkId: me?.clerkUserId ?? "", targetClerkId: target?.clerkUserId ?? null };
}

export async function inviteMember(ctx: ServiceContext, directory: MembershipDirectory, input: InviteMemberInput) {
  assertCan(ctx.actor, "workspace.invite");
  if (input.role === "owner" && ctx.actor.workspaceRole !== "owner") throw new ValidationError("Only an owner can invite another owner");
  if ((input.role === "admin" || input.role === "guest") && !(ctx.actor.workspaceRole === "owner" || ctx.actor.workspaceRole === "admin")) throw new ValidationError("Members can invite members only");
  const [existing] = await ctx.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .innerJoin(schema.workspaceMembers, and(eq(schema.workspaceMembers.userId, schema.users.id), eq(schema.workspaceMembers.workspaceId, ctx.actor.workspaceId)))
    .where(eq(schema.users.email, input.email.toLowerCase()));
  if (existing) throw new ValidationError(`${input.email} is already a member`);
  const { organizationId, meClerkId } = await clerkIds(ctx);
  return directory.invite({ organizationId, emailAddress: input.email.toLowerCase(), role: clerkRoleFor(input.role), inviterUserId: meClerkId });
}

export async function listPendingInvitations(ctx: ServiceContext, directory: MembershipDirectory) {
  assertCan(ctx.actor, "workspace.view_settings");
  const { organizationId } = await clerkIds(ctx);
  const rows = await directory.listInvitations(organizationId);
  return rows.map((r) => ({ ...r, role: mapClerkRole(r.role) }));
}

export async function revokeInvitation(ctx: ServiceContext, directory: MembershipDirectory, invitationId: string) {
  assertCan(ctx.actor, "workspace.invite");
  const { organizationId, meClerkId } = await clerkIds(ctx);
  await directory.revokeInvitation({ organizationId, invitationId, requestingUserId: meClerkId });
}

export async function changeMemberRole(ctx: ServiceContext, directory: MembershipDirectory, input: ChangeMemberRoleInput) {
  assertCan(ctx.actor, "workspace.view_settings");
  if (input.role === "owner" && ctx.actor.workspaceRole !== "owner") throw new ValidationError("Only an owner can promote to owner");
  const [target] = await ctx.db.select().from(schema.workspaceMembers).where(and(eq(schema.workspaceMembers.workspaceId, ctx.actor.workspaceId), eq(schema.workspaceMembers.userId, input.userId)));
  if (!target) throw new NotFoundError("Member");
  if (target.role === "owner" && ctx.actor.workspaceRole !== "owner") throw new ValidationError("Only an owner can change another owner");
  if (target.role === "owner" && input.role !== "owner") {
    const [{ owners }] = await ctx.db.select({ owners: sql<number>`count(*)` }).from(schema.workspaceMembers).where(and(eq(schema.workspaceMembers.workspaceId, ctx.actor.workspaceId), eq(schema.workspaceMembers.role, "owner")));
    if (Number(owners) <= 1) throw new ValidationError("The workspace needs at least one owner");
  }
  const { organizationId, targetClerkId } = await clerkIds(ctx, input.userId);
  await directory.updateRole({ organizationId, userId: targetClerkId!, role: clerkRoleFor(input.role) });
  // Mirror immediately so the settings page reflects the change before the webhook lands.
  await ctx.db.update(schema.workspaceMembers).set({ role: input.role }).where(and(eq(schema.workspaceMembers.workspaceId, ctx.actor.workspaceId), eq(schema.workspaceMembers.userId, input.userId)));
}

export async function removeMember(ctx: ServiceContext, directory: MembershipDirectory, userId: string) {
  assertCan(ctx.actor, "workspace.view_settings");
  if (userId === ctx.actor.userId) throw new ValidationError("You cannot remove yourself. Ask another owner.");
  const [target] = await ctx.db.select().from(schema.workspaceMembers).where(and(eq(schema.workspaceMembers.workspaceId, ctx.actor.workspaceId), eq(schema.workspaceMembers.userId, userId)));
  if (!target) throw new NotFoundError("Member");
  if (target.role === "owner" && ctx.actor.workspaceRole !== "owner") throw new ValidationError("Only an owner can remove an owner");
  const { organizationId, targetClerkId } = await clerkIds(ctx, userId);
  await directory.remove({ organizationId, userId: targetClerkId! });
  await ctx.db.delete(schema.workspaceMembers).where(and(eq(schema.workspaceMembers.workspaceId, ctx.actor.workspaceId), eq(schema.workspaceMembers.userId, userId)));
}

export async function updateMemberCapacity(ctx: ServiceContext, userId: string, weeklyCapacityHours: number) {
  assertCan(ctx.actor, "workspace.view_settings");
  await ctx.db.update(schema.workspaceMembers).set({ weeklyCapacityHours: String(weeklyCapacityHours) }).where(and(eq(schema.workspaceMembers.workspaceId, ctx.actor.workspaceId), eq(schema.workspaceMembers.userId, userId)));
}

/** The signed in user's notification matrix with defaults filled in. */
export async function listNotificationPreferences(ctx: ServiceContext): Promise<Array<{ type: NotificationType; channel: NotificationChannel; enabled: boolean }>> {
  const rows = await ctx.db.select().from(schema.notificationPreferences).where(and(eq(schema.notificationPreferences.userId, ctx.actor.userId), eq(schema.notificationPreferences.workspaceId, ctx.actor.workspaceId)));
  const byKey = new Map(rows.map((r) => [`${r.type}:${r.channel}`, r.enabled]));
  const out: Array<{ type: NotificationType; channel: NotificationChannel; enabled: boolean }> = [];
  for (const type of notificationTypes) for (const channel of notificationChannels) out.push({ type, channel, enabled: byKey.get(`${type}:${channel}`) ?? defaultNotificationPreference(type, channel) });
  return out;
}

export async function setNotificationPreference(ctx: ServiceContext, input: NotificationPreferenceInput) {
  await ctx.db
    .insert(schema.notificationPreferences)
    .values({ userId: ctx.actor.userId, workspaceId: ctx.actor.workspaceId, type: input.type, channel: input.channel, enabled: input.enabled })
    .onConflictDoUpdate({ target: [schema.notificationPreferences.userId, schema.notificationPreferences.workspaceId, schema.notificationPreferences.type, schema.notificationPreferences.channel], set: { enabled: input.enabled } });
}
