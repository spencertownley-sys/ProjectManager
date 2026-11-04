import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { schema } from "@/lib/db/client";
import { type ServiceContext, authorizeProject, NotFoundError } from "./context";
import { computeBurndown, computeVelocity, type CycleRef, type CycleTask, type CycleEvent, type Burndown, type VelocityPoint } from "@/lib/client/cycles";

/** Cycle data for the Cycles page (docs/10 section 16). Burndown and velocity derive from task events. */

export type CycleSummary = CycleRef & { committed: number; completed: number; count: number; doneCount: number };

function toRef(c: typeof schema.cycles.$inferSelect): CycleRef {
  return { id: c.id, name: c.name, goal: c.goal, startDate: c.startDate, endDate: c.endDate, capacity: c.capacity === null ? null : Number(c.capacity), closedAt: c.closedAt?.toISOString() ?? null };
}

async function loadTasks(ctx: ServiceContext, projectId: string): Promise<CycleTask[]> {
  const rows = await ctx.db
    .select({ id: schema.tasks.id, estimate: schema.tasks.estimate, cycleId: schema.tasks.cycleId, completedAt: schema.tasks.completedAt, createdAt: schema.tasks.createdAt })
    .from(schema.tasks)
    .where(and(eq(schema.tasks.projectId, projectId), isNull(schema.tasks.deletedAt)));
  return rows.map((r) => ({ id: r.id, estimate: r.estimate === null ? null : Number(r.estimate), cycleId: r.cycleId, completedAt: r.completedAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString() }));
}

async function loadEvents(ctx: ServiceContext, projectId: string, taskIds?: string[]): Promise<CycleEvent[]> {
  const rows = await ctx.db
    .select({ taskId: schema.taskEvents.taskId, type: schema.taskEvents.type, field: schema.taskEvents.field, before: schema.taskEvents.before, after: schema.taskEvents.after, createdAt: schema.taskEvents.createdAt })
    .from(schema.taskEvents)
    .where(
      and(
        eq(schema.taskEvents.projectId, projectId),
        or(inArray(schema.taskEvents.type, ["task.completed", "task.reopened", "task.created"]), and(eq(schema.taskEvents.type, "task.updated"), inArray(schema.taskEvents.field, ["cycle", "estimate"]))),
        ...(taskIds ? [inArray(schema.taskEvents.taskId, taskIds)] : []),
      ),
    )
    .orderBy(asc(schema.taskEvents.createdAt));
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

/** Every cycle of a project with its committed and completed weight. */
export async function listCycles(ctx: ServiceContext, projectId: string): Promise<CycleSummary[]> {
  const { db, actor } = ctx;
  await authorizeProject(db, actor, projectId, "project.read");
  const [cycles, tasks] = await Promise.all([db.select().from(schema.cycles).where(eq(schema.cycles.projectId, projectId)).orderBy(asc(schema.cycles.startDate)), loadTasks(ctx, projectId)]);
  return cycles.map((c) => {
    const mine = tasks.filter((t) => t.cycleId === c.id);
    const unit = mine.some((t) => (t.estimate ?? 0) > 0) ? "estimate" : "tasks";
    const w = (t: CycleTask) => (unit === "tasks" ? 1 : (t.estimate ?? 0));
    return { ...toRef(c), committed: mine.reduce((n, t) => n + w(t), 0), completed: mine.filter((t) => t.completedAt).reduce((n, t) => n + w(t), 0), count: mine.length, doneCount: mine.filter((t) => t.completedAt).length };
  });
}

export async function cycleBurndown(ctx: ServiceContext, cycleId: string, today: string): Promise<Burndown> {
  const { db, actor } = ctx;
  const [cycle] = await db.select().from(schema.cycles).where(eq(schema.cycles.id, cycleId));
  if (!cycle) throw new NotFoundError("Cycle");
  await authorizeProject(db, actor, cycle.projectId, "project.read");
  const tasks = await loadTasks(ctx, cycle.projectId);
  const events = await loadEvents(ctx, cycle.projectId);
  return computeBurndown(toRef(cycle), tasks, events, today);
}

export async function projectVelocity(ctx: ServiceContext, projectId: string): Promise<{ unit: Burndown["unit"]; points: VelocityPoint[] }> {
  const { db, actor } = ctx;
  await authorizeProject(db, actor, projectId, "project.read");
  const [cycles, tasks] = await Promise.all([db.select().from(schema.cycles).where(eq(schema.cycles.projectId, projectId)), loadTasks(ctx, projectId)]);
  const events = await loadEvents(ctx, projectId);
  return computeVelocity(cycles.map(toRef), tasks, events);
}

export async function updateCycle(ctx: ServiceContext, input: { id: string; name?: string; goal?: string | null; startDate?: string; endDate?: string; capacity?: number | null }) {
  const { db, actor } = ctx;
  const [cycle] = await db.select().from(schema.cycles).where(eq(schema.cycles.id, input.id));
  if (!cycle) throw new NotFoundError("Cycle");
  await authorizeProject(db, actor, cycle.projectId, "project.manage_cycles");
  const patch: Partial<typeof schema.cycles.$inferInsert> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.goal !== undefined) patch.goal = input.goal;
  if (input.startDate !== undefined) patch.startDate = input.startDate;
  if (input.endDate !== undefined) patch.endDate = input.endDate;
  if (input.capacity !== undefined) patch.capacity = input.capacity === null ? null : String(input.capacity);
  const [next] = await db.update(schema.cycles).set(patch).where(eq(schema.cycles.id, input.id)).returning();
  return toRef(next);
}

/** Moves tasks into or out of a cycle in one go (backlog planning), recording the change per task. */
export async function planTasks(ctx: ServiceContext, input: { projectId: string; taskIds: string[]; cycleId: string | null }): Promise<number> {
  const { db, actor } = ctx;
  await authorizeProject(db, actor, input.projectId, "task.update");
  if (input.taskIds.length === 0) return 0;
  const { emitTaskEvents } = await import("@/lib/events/emit");
  const { dispatchAfterCommit } = await import("@/lib/events/dispatch");
  const result = await db.transaction(async (tx) => {
    const rows = await tx.select({ id: schema.tasks.id, cycleId: schema.tasks.cycleId }).from(schema.tasks).where(and(eq(schema.tasks.projectId, input.projectId), inArray(schema.tasks.id, input.taskIds), isNull(schema.tasks.deletedAt)));
    const changed = rows.filter((r) => r.cycleId !== input.cycleId);
    if (changed.length === 0) return { count: 0, eventIds: [] as number[] };
    await tx.update(schema.tasks).set({ cycleId: input.cycleId, version: sql`${schema.tasks.version} + 1`, updatedAt: sql`now()` }).where(inArray(schema.tasks.id, changed.map((r) => r.id)));
    const eventIds = await emitTaskEvents(tx, changed.map((r) => ({ workspaceId: actor.workspaceId, projectId: input.projectId, taskId: r.id, actorId: actor.userId, type: "task.updated" as const, field: "cycle", before: r.cycleId, after: input.cycleId })));
    return { count: changed.length, eventIds };
  });
  await dispatchAfterCommit(result.eventIds, actor.workspaceId);
  return result.count;
}
