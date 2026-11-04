import { and, desc, eq, isNull, sql, inArray } from "drizzle-orm";
import { schema } from "@/lib/db/client";
import type { ServiceContext } from "./context";

export async function listNotifications(ctx: ServiceContext, filter: "all" | "unread" | "mentions" | "assigned" | "due" | "updates" = "all") {
  const { db, actor } = ctx;
  const conditions = [eq(schema.notifications.userId, actor.userId), eq(schema.notifications.workspaceId, actor.workspaceId), isNull(schema.notifications.archivedAt), sql`(${schema.notifications.snoozedUntil} is null or ${schema.notifications.snoozedUntil} <= now())`];
  if (filter === "unread") conditions.push(isNull(schema.notifications.readAt));
  if (filter === "mentions") conditions.push(eq(schema.notifications.type, "mention"));
  if (filter === "assigned") conditions.push(eq(schema.notifications.type, "assigned"));
  if (filter === "due") conditions.push(eq(schema.notifications.type, "due_soon"));
  if (filter === "updates") conditions.push(inArray(schema.notifications.type, ["comment", "status_update", "dependency_unblocked"]));
  const rows = await db
    .select({
      n: schema.notifications,
      actor: { id: schema.users.id, displayName: schema.users.displayName, avatarUrl: schema.users.avatarUrl },
      task: { id: schema.tasks.id, title: schema.tasks.title, number: schema.tasks.number },
      project: { id: schema.projects.id, key: schema.projects.key, name: schema.projects.name, color: schema.projects.color },
    })
    .from(schema.notifications)
    .leftJoin(schema.users, eq(schema.users.id, schema.notifications.actorId))
    .leftJoin(schema.tasks, eq(schema.tasks.id, schema.notifications.taskId))
    .leftJoin(schema.projects, eq(schema.projects.id, schema.notifications.projectId))
    .where(and(...conditions))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(200);
  return rows.map((r) => ({
    id: r.n.id,
    type: r.n.type,
    payload: r.n.payload as Record<string, unknown>,
    readAt: r.n.readAt?.toISOString() ?? null,
    createdAt: r.n.createdAt.toISOString(),
    actor: r.actor?.id ? r.actor : null,
    task: r.task?.id ? { ...r.task, key: r.project ? `${r.project.key}-${r.task.number}` : "" } : null,
    project: r.project?.id ? r.project : null,
  }));
}

export async function unreadCount(ctx: ServiceContext): Promise<number> {
  const { db, actor } = ctx;
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.userId, actor.userId), eq(schema.notifications.workspaceId, actor.workspaceId), isNull(schema.notifications.readAt), isNull(schema.notifications.archivedAt)));
  return Number(row?.count ?? 0);
}

export async function markNotifications(ctx: ServiceContext, input: { ids?: string[]; all?: boolean; action: "read" | "unread" | "archive" | "snooze"; snoozeUntil?: string }) {
  const { db, actor } = ctx;
  const where = input.all
    ? and(eq(schema.notifications.userId, actor.userId), eq(schema.notifications.workspaceId, actor.workspaceId), isNull(schema.notifications.archivedAt))
    : and(eq(schema.notifications.userId, actor.userId), inArray(schema.notifications.id, input.ids ?? []));
  const patch =
    input.action === "read"
      ? { readAt: sql`coalesce(${schema.notifications.readAt}, now())` }
      : input.action === "unread"
        ? { readAt: null }
        : input.action === "archive"
          ? { archivedAt: sql`now()`, readAt: sql`coalesce(${schema.notifications.readAt}, now())` }
          : { snoozedUntil: input.snoozeUntil ? new Date(input.snoozeUntil) : null };
  await db.update(schema.notifications).set(patch).where(where);
}

/** Creates notifications for recipients; used by the Inngest event processor. */
export async function createNotifications(ctx: Pick<ServiceContext, "db">, rows: Array<{ workspaceId: string; userId: string; type: string; taskId?: string | null; projectId?: string | null; actorId?: string | null; payload?: Record<string, unknown> }>) {
  if (rows.length === 0) return;
  await ctx.db.insert(schema.notifications).values(rows.map((r) => ({ ...r, payload: r.payload ?? {} })));
}
