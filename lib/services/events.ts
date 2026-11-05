import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { schema } from "@/lib/db/client";
import { type ServiceContext, visibleProjectIds } from "./context";

/** Workspace wide event stream for polling integrations (docs/07, GET /events). Scoped to readable projects. */
export async function listWorkspaceEvents(ctx: ServiceContext, options: { since: number; limit: number; types?: string[]; projectId?: string | null }) {
  const { db, actor } = ctx;
  const visible = await visibleProjectIds(db, actor);
  const projects = options.projectId ? visible.filter((id) => id === options.projectId) : visible;
  if (projects.length === 0) return { events: [], nextSince: options.since, hasMore: false };
  const rows = await db
    .select({ id: schema.taskEvents.id, type: schema.taskEvents.type, field: schema.taskEvents.field, before: schema.taskEvents.before, after: schema.taskEvents.after, taskId: schema.taskEvents.taskId, projectId: schema.taskEvents.projectId, actorId: schema.taskEvents.actorId, actorName: schema.users.displayName, actorAvatar: schema.users.avatarUrl, createdAt: schema.taskEvents.createdAt })
    .from(schema.taskEvents)
    .leftJoin(schema.users, eq(schema.users.id, schema.taskEvents.actorId))
    .where(and(eq(schema.taskEvents.workspaceId, actor.workspaceId), gt(schema.taskEvents.id, options.since), inArray(schema.taskEvents.projectId, projects), ...(options.types?.length ? [inArray(schema.taskEvents.type, options.types)] : [])))
    .orderBy(asc(schema.taskEvents.id))
    .limit(options.limit + 1);
  const page = rows.slice(0, options.limit);
  return {
    events: page.map((r) => ({ id: r.id, type: r.type, field: r.field, before: r.before, after: r.after, taskId: r.taskId, projectId: r.projectId, actor: r.actorId ? { id: r.actorId, displayName: r.actorName ?? "", avatarUrl: r.actorAvatar ?? null } : null, createdAt: r.createdAt.toISOString() })),
    nextSince: page.length ? page[page.length - 1].id : options.since,
    hasMore: rows.length > options.limit,
  };
}
