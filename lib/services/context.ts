import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { schema, type Database, type DbOrTx } from "@/lib/db/client";
import { assertCan, type Action, type Actor, type ProjectContext } from "@/lib/auth/permissions";

export type ServiceContext = {
  db: Database;
  actor: Actor;
};

export class NotFoundError extends Error {
  readonly code = "not_found" as const;
  constructor(what: string) {
    super(`${what} was not found`);
  }
}

export class ValidationError extends Error {
  readonly code = "validation_failed" as const;
  constructor(
    message: string,
    readonly details: Array<{ path: string; message: string }> = [],
  ) {
    super(message);
  }
}

export class ConflictError extends Error {
  readonly code = "conflict" as const;
  constructor(message: string) {
    super(message);
  }
}

/** Loads what the permission matrix needs to know about a project for this actor. */
export async function loadProjectContext(db: DbOrTx, actor: Actor, projectId: string): Promise<ProjectContext> {
  const [project] = await db
    .select({ id: schema.projects.id, privacy: schema.projects.privacy, teamId: schema.projects.teamId, workspaceId: schema.projects.workspaceId })
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), isNull(schema.projects.deletedAt)));
  if (!project || project.workspaceId !== actor.workspaceId) throw new NotFoundError("Project");

  const [membership] = await db
    .select({ role: schema.projectMembers.role })
    .from(schema.projectMembers)
    .where(and(eq(schema.projectMembers.projectId, projectId), eq(schema.projectMembers.userId, actor.userId)));

  let isTeamMember = false;
  if (project.teamId) {
    const [tm] = await db
      .select({ userId: schema.teamMembers.userId })
      .from(schema.teamMembers)
      .where(and(eq(schema.teamMembers.teamId, project.teamId), eq(schema.teamMembers.userId, actor.userId)));
    isTeamMember = Boolean(tm);
  }
  return { projectId, privacy: project.privacy, explicitRole: membership?.role ?? null, isTeamMember };
}

export async function authorizeProject(db: DbOrTx, actor: Actor, projectId: string, action: Action): Promise<ProjectContext> {
  const ctx = await loadProjectContext(db, actor, projectId);
  assertCan(actor, action, ctx);
  return ctx;
}

/** Ids of every project in the workspace the actor may read. Used for cross-project views. */
export async function visibleProjectIds(db: DbOrTx, actor: Actor): Promise<string[]> {
  if (actor.workspaceRole === "owner" || actor.workspaceRole === "admin") {
    const rows = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.workspaceId, actor.workspaceId), isNull(schema.projects.deletedAt)));
    return rows.map((r) => r.id);
  }
  const explicit = db
    .select({ id: schema.projectMembers.projectId })
    .from(schema.projectMembers)
    .where(eq(schema.projectMembers.userId, actor.userId));
  const teamIds = db
    .select({ id: schema.teamMembers.teamId })
    .from(schema.teamMembers)
    .where(eq(schema.teamMembers.userId, actor.userId));
  const conditions = [inArray(schema.projects.id, explicit)];
  if (actor.workspaceRole !== "guest") {
    conditions.push(eq(schema.projects.privacy, "workspace"));
    conditions.push(and(eq(schema.projects.privacy, "team"), inArray(schema.projects.teamId, teamIds))!);
  }
  const rows = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(and(eq(schema.projects.workspaceId, actor.workspaceId), isNull(schema.projects.deletedAt), or(...conditions)));
  return rows.map((r) => r.id);
}

/** Fractional ordering: a position strictly between two neighbors. */
export function positionBetween(before: number | null | undefined, after: number | null | undefined): number {
  if (before == null && after == null) return 1024;
  if (before == null) return (after as number) - 1024;
  if (after == null) return before + 1024;
  return (before + after) / 2;
}

export const nowSql = sql`now()`;
