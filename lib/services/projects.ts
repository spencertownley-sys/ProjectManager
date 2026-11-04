import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { z } from "zod";
import { schema, type DbOrTx } from "@/lib/db/client";
import { assertCan } from "@/lib/auth/permissions";
import { workflowTemplates } from "@/lib/templates/workflows";
import { findProjectTemplate } from "@/lib/templates/projects";
import { defaultViewSpec } from "@/lib/validation/view-spec";
import type { CreateProjectInput, UpdateProjectInput, createSectionInput, updateSectionInput, reorderSectionsInput, updateWorkflowInput, createCycleInput } from "@/lib/validation/project";
import { emitTaskEvents } from "@/lib/events/emit";
import { type ServiceContext, authorizeProject, visibleProjectIds, NotFoundError, ValidationError, positionBetween } from "./context";

export type ProjectSummary = {
  id: string;
  key: string;
  name: string;
  color: string;
  icon: string | null;
  privacy: "workspace" | "team" | "private";
  teamId: string | null;
  ownerId: string | null;
  startDate: string | null;
  endDate: string | null;
  archivedAt: string | null;
  defaultViewId: string | null;
  autoSchedule: boolean;
  workflowId: string;
  taskCount: number;
  doneCount: number;
  overdueCount: number;
  latestHealth: string | null;
  latestUpdateAt: string | null;
};

function keyFromName(name: string): string {
  const letters = name.replace(/[^A-Za-z0-9 ]/g, "").trim().split(/\s+/);
  let key = letters.length >= 2 ? letters.map((w) => w[0]).join("") : (letters[0] ?? "PRJ").slice(0, 3);
  key = key.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z]/.test(key)) key = "P" + key;
  return key.slice(0, 6).padEnd(2, "X");
}

async function uniqueKey(db: DbOrTx, workspaceId: string, base: string): Promise<string> {
  const existing = await db.select({ key: schema.projects.key }).from(schema.projects).where(eq(schema.projects.workspaceId, workspaceId));
  const taken = new Set(existing.map((e) => e.key));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i += 1) {
    const candidate = `${base.slice(0, 5)}${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new ValidationError("Could not find a free project key");
}

export async function listProjects(ctx: ServiceContext, options: { includeArchived?: boolean; today: string }): Promise<ProjectSummary[]> {
  const { db, actor } = ctx;
  const ids = await visibleProjectIds(db, actor);
  if (ids.length === 0) return [];
  const rows = await db.execute(sql`
    select p.id, p.key, p.name, p.color, p.icon, p.privacy, p.team_id, p.owner_id,
      p.start_date::text as start_date, p.end_date::text as end_date, p.archived_at::text as archived_at,
      p.default_view_id, p.auto_schedule, p.workflow_id,
      (select count(*) from tasks t where t.project_id = p.id and t.deleted_at is null and t.parent_id is null) as task_count,
      (select count(*) from tasks t where t.project_id = p.id and t.deleted_at is null and t.parent_id is null and t.completed_at is not null) as done_count,
      (select count(*) from tasks t where t.project_id = p.id and t.deleted_at is null and t.completed_at is null and t.due_date < ${options.today}::date) as overdue_count,
      (select su.health::text from status_updates su where su.project_id = p.id order by su.created_at desc limit 1) as latest_health,
      (select su.created_at::text from status_updates su where su.project_id = p.id order by su.created_at desc limit 1) as latest_update_at
    from projects p
    where p.id in (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)}) and p.deleted_at is null and p.is_template = false
      ${options.includeArchived ? sql`` : sql`and p.archived_at is null`}
    order by p.name
  `);
  const raw = (Array.isArray(rows) ? rows : (rows as { rows: unknown[] }).rows) as Array<Record<string, unknown>>;
  return raw.map((r) => ({
    id: String(r.id),
    key: String(r.key),
    name: String(r.name),
    color: String(r.color),
    icon: (r.icon as string | null) ?? null,
    privacy: r.privacy as ProjectSummary["privacy"],
    teamId: (r.team_id as string | null) ?? null,
    ownerId: (r.owner_id as string | null) ?? null,
    startDate: (r.start_date as string | null) ?? null,
    endDate: (r.end_date as string | null) ?? null,
    archivedAt: (r.archived_at as string | null) ?? null,
    defaultViewId: (r.default_view_id as string | null) ?? null,
    autoSchedule: Boolean(r.auto_schedule),
    workflowId: String(r.workflow_id),
    taskCount: Number(r.task_count),
    doneCount: Number(r.done_count),
    overdueCount: Number(r.overdue_count),
    latestHealth: (r.latest_health as string | null) ?? null,
    latestUpdateAt: (r.latest_update_at as string | null) ?? null,
  }));
}

export type ProjectDetail = {
  project: typeof schema.projects.$inferSelect;
  sections: Array<typeof schema.sections.$inferSelect>;
  statuses: Array<typeof schema.statuses.$inferSelect>;
  fields: Array<typeof schema.fieldDefinitions.$inferSelect>;
  cycles: Array<typeof schema.cycles.$inferSelect>;
  views: Array<typeof schema.savedViews.$inferSelect>;
  members: Array<{ id: string; displayName: string; avatarUrl: string | null; email: string; role: string }>;
  baselines: Array<{ id: string; name: string; createdAt: string }>;
  role: "owner" | "editor" | "commenter" | "viewer" | null;
};

export async function getProjectByKey(ctx: ServiceContext, key: string): Promise<ProjectDetail> {
  const { db, actor } = ctx;
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.workspaceId, actor.workspaceId), eq(schema.projects.key, key.toUpperCase()), isNull(schema.projects.deletedAt)));
  if (!project) throw new NotFoundError("Project");
  return getProject(ctx, project.id);
}

export async function getProject(ctx: ServiceContext, projectId: string): Promise<ProjectDetail> {
  const { db, actor } = ctx;
  const pctx = await authorizeProject(db, actor, projectId, "project.read");
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
  if (!project) throw new NotFoundError("Project");
  const [sections, statuses, projectFieldRows, cycles, views, baselineRows] = await Promise.all([
    db.select().from(schema.sections).where(and(eq(schema.sections.projectId, projectId), isNull(schema.sections.deletedAt))).orderBy(asc(schema.sections.position)),
    db.select().from(schema.statuses).where(eq(schema.statuses.workflowId, project.workflowId)).orderBy(asc(schema.statuses.position)),
    db
      .select({ field: schema.fieldDefinitions, position: schema.projectFields.position })
      .from(schema.projectFields)
      .innerJoin(schema.fieldDefinitions, eq(schema.fieldDefinitions.id, schema.projectFields.fieldId))
      .where(and(eq(schema.projectFields.projectId, projectId), isNull(schema.fieldDefinitions.deletedAt)))
      .orderBy(asc(schema.projectFields.position)),
    db.select().from(schema.cycles).where(eq(schema.cycles.projectId, projectId)).orderBy(desc(schema.cycles.startDate)),
    db
      .select()
      .from(schema.savedViews)
      .where(and(eq(schema.savedViews.projectId, projectId), isNull(schema.savedViews.deletedAt), sql`(${schema.savedViews.isShared} = true or ${schema.savedViews.ownerId} = ${actor.userId}::uuid)`))
      .orderBy(asc(schema.savedViews.position), asc(schema.savedViews.createdAt)),
    db.select({ id: schema.baselines.id, name: schema.baselines.name, createdAt: schema.baselines.createdAt }).from(schema.baselines).where(eq(schema.baselines.projectId, projectId)).orderBy(desc(schema.baselines.createdAt)),
  ]);
  const memberRows = await db
    .select({ id: schema.users.id, displayName: schema.users.displayName, avatarUrl: schema.users.avatarUrl, email: schema.users.email, role: schema.workspaceMembers.role })
    .from(schema.workspaceMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.workspaceMembers.userId))
    .where(eq(schema.workspaceMembers.workspaceId, actor.workspaceId))
    .orderBy(asc(schema.users.displayName));
  const { effectiveProjectRole } = await import("@/lib/auth/permissions");
  return {
    project,
    sections,
    statuses,
    fields: projectFieldRows.map((r) => r.field),
    cycles,
    views,
    members: memberRows.filter((m) => m.role !== "guest" || pctx.explicitRole !== null),
    baselines: baselineRows.map((b) => ({ id: b.id, name: b.name, createdAt: b.createdAt.toISOString() })),
    role: effectiveProjectRole(actor, pctx),
  };
}

export async function createProject(ctx: ServiceContext, input: CreateProjectInput, today: string) {
  const { db, actor } = ctx;
  assertCan(actor, "project.create");
  const template = findProjectTemplate(input.templateId);
  const workflowKey = input.templateId ? template.workflow : input.workflowTemplate;
  const workflowTemplate = workflowTemplates[workflowKey];

  return db.transaction(async (tx) => {
    const [workflow] = await tx.insert(schema.workflows).values({ workspaceId: actor.workspaceId, name: workflowTemplate.name }).returning();
    const statusRows = await tx
      .insert(schema.statuses)
      .values(workflowTemplate.statuses.map((s, i) => ({ workflowId: workflow.id, name: s.name, category: s.category, color: s.color, position: i, wipLimit: s.wipLimit ?? null })))
      .returning();

    const key = await uniqueKey(tx, actor.workspaceId, input.key ?? keyFromName(input.name));
    const [project] = await tx
      .insert(schema.projects)
      .values({
        workspaceId: actor.workspaceId,
        teamId: input.teamId ?? null,
        workflowId: workflow.id,
        key,
        name: input.name,
        description: input.description ?? null,
        color: input.color,
        icon: input.icon ?? null,
        privacy: input.privacy,
        ownerId: input.ownerId ?? actor.userId,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
      })
      .returning();

    await tx.insert(schema.projectMembers).values({ projectId: project.id, userId: actor.userId, role: "owner" }).onConflictDoNothing();

    const sectionNames = input.templateId ? template.sections : ["To do", "In progress", "Done"];
    const sectionRows = await tx
      .insert(schema.sections)
      .values(sectionNames.map((name, i) => ({ projectId: project.id, name, position: (i + 1) * 1024 })))
      .returning();

    const [defaultView] = await tx
      .insert(schema.savedViews)
      .values({ workspaceId: actor.workspaceId, projectId: project.id, ownerId: actor.userId, name: "Default", type: input.templateId ? template.defaultView : "list", spec: defaultViewSpec(), isShared: true, position: 0 })
      .returning();
    await tx.update(schema.projects).set({ defaultViewId: defaultView.id }).where(eq(schema.projects.id, project.id));

    if (input.templateId && template.tasks.length) {
      const first = statusRows[0];
      const base = new Date(today + "T00:00:00Z");
      const offset = (days: number | undefined) => {
        if (days === undefined) return null;
        const d = new Date(base);
        d.setUTCDate(d.getUTCDate() + days);
        return d.toISOString().slice(0, 10);
      };
      const inserted = await tx
        .insert(schema.tasks)
        .values(
          template.tasks.map((t, i) => ({
            workspaceId: actor.workspaceId,
            projectId: project.id,
            sectionId: sectionRows[t.section]?.id ?? sectionRows[0].id,
            title: t.title,
            statusId: first.id,
            startDate: t.milestone ? offset(t.dueOffset) : offset(t.startOffset),
            dueDate: offset(t.dueOffset),
            isMilestone: t.milestone ?? false,
            estimate: t.estimate == null ? null : String(t.estimate),
            position: (i + 1) * 1024,
            createdBy: actor.userId,
          })),
        )
        .returning();
      await emitTaskEvents(
        tx,
        inserted.map((t) => ({ workspaceId: actor.workspaceId, projectId: project.id, taskId: t.id, actorId: actor.userId, type: "task.created" as const, after: { title: t.title } })),
      );
    }
    return { ...project, defaultViewId: defaultView.id };
  });
}

export async function updateProject(ctx: ServiceContext, input: UpdateProjectInput) {
  const { db, actor } = ctx;
  await authorizeProject(db, actor, input.id, "project.update");
  const { id, ...patch } = input;
  const [project] = await db.update(schema.projects).set(patch).where(eq(schema.projects.id, id)).returning();
  return project;
}

export async function archiveProject(ctx: ServiceContext, id: string, archived: boolean) {
  const { db, actor } = ctx;
  await authorizeProject(db, actor, id, "project.update");
  const [project] = await db.update(schema.projects).set({ archivedAt: archived ? sql`now()` : null }).where(eq(schema.projects.id, id)).returning();
  return project;
}

export async function deleteProject(ctx: ServiceContext, id: string) {
  const { db, actor } = ctx;
  await authorizeProject(db, actor, id, "project.delete");
  await db.update(schema.projects).set({ deletedAt: sql`now()` }).where(eq(schema.projects.id, id));
}

export async function createSection(ctx: ServiceContext, input: z.infer<typeof createSectionInput>) {
  const { db, actor } = ctx;
  await authorizeProject(db, actor, input.projectId, "task.update");
  const existing = await db.select().from(schema.sections).where(and(eq(schema.sections.projectId, input.projectId), isNull(schema.sections.deletedAt))).orderBy(asc(schema.sections.position));
  let position = (existing.at(-1)?.position ?? 0) + 1024;
  if (input.afterSectionId) {
    const idx = existing.findIndex((s) => s.id === input.afterSectionId);
    if (idx >= 0) position = positionBetween(existing[idx].position, existing[idx + 1]?.position ?? null);
  }
  const [section] = await db.insert(schema.sections).values({ projectId: input.projectId, name: input.name, position }).returning();
  return section;
}

export async function updateSection(ctx: ServiceContext, input: z.infer<typeof updateSectionInput>) {
  const { db, actor } = ctx;
  const [section] = await db.select().from(schema.sections).where(eq(schema.sections.id, input.id));
  if (!section) throw new NotFoundError("Section");
  await authorizeProject(db, actor, section.projectId, "task.update");
  const { id, ...patch } = input;
  const [updated] = await db.update(schema.sections).set(patch).where(eq(schema.sections.id, id)).returning();
  return updated;
}

export async function deleteSection(ctx: ServiceContext, id: string) {
  const { db, actor } = ctx;
  const [section] = await db.select().from(schema.sections).where(eq(schema.sections.id, id));
  if (!section) throw new NotFoundError("Section");
  await authorizeProject(db, actor, section.projectId, "task.update");
  await db.transaction(async (tx) => {
    await tx.update(schema.tasks).set({ sectionId: null }).where(eq(schema.tasks.sectionId, id));
    await tx.update(schema.sections).set({ deletedAt: sql`now()` }).where(eq(schema.sections.id, id));
  });
}

export async function reorderSections(ctx: ServiceContext, input: z.infer<typeof reorderSectionsInput>) {
  const { db, actor } = ctx;
  await authorizeProject(db, actor, input.projectId, "task.update");
  await db.transaction(async (tx) => {
    for (let i = 0; i < input.orderedIds.length; i += 1) {
      await tx.update(schema.sections).set({ position: (i + 1) * 1024 }).where(and(eq(schema.sections.id, input.orderedIds[i]), eq(schema.sections.projectId, input.projectId)));
    }
  });
}

export async function updateWorkflow(ctx: ServiceContext, input: z.infer<typeof updateWorkflowInput>) {
  const { db, actor } = ctx;
  await authorizeProject(db, actor, input.projectId, "project.update");
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, input.projectId));
  if (!project) throw new NotFoundError("Project");
  if (!input.statuses.some((s) => s.category === "done")) throw new ValidationError("A workflow needs at least one Done status");
  return db.transaction(async (tx) => {
    const existing = await tx.select().from(schema.statuses).where(eq(schema.statuses.workflowId, project.workflowId));
    const keep = new Set(input.statuses.map((s) => s.id).filter(Boolean) as string[]);
    const removed = existing.filter((s) => !keep.has(s.id));
    const fallback = input.statuses.find((s) => s.id && keep.has(s.id)) ?? null;
    for (let i = 0; i < input.statuses.length; i += 1) {
      const s = input.statuses[i];
      if (s.id) {
        await tx.update(schema.statuses).set({ name: s.name, category: s.category, color: s.color, position: i, wipLimit: s.wipLimit ?? null }).where(eq(schema.statuses.id, s.id));
      } else {
        const [created] = await tx.insert(schema.statuses).values({ workflowId: project.workflowId, name: s.name, category: s.category, color: s.color, position: i, wipLimit: s.wipLimit ?? null }).returning();
        if (!fallback) input.statuses[i] = { ...s, id: created.id };
      }
    }
    if (removed.length) {
      const target = (input.statuses.find((s) => s.id)?.id ?? null) as string | null;
      if (target) await tx.update(schema.tasks).set({ statusId: target }).where(inArray(schema.tasks.statusId, removed.map((r) => r.id)));
      await tx.delete(schema.statuses).where(inArray(schema.statuses.id, removed.map((r) => r.id)));
    }
    return tx.select().from(schema.statuses).where(eq(schema.statuses.workflowId, project.workflowId)).orderBy(asc(schema.statuses.position));
  });
}

export async function createCycle(ctx: ServiceContext, input: z.infer<typeof createCycleInput>) {
  const { db, actor } = ctx;
  await authorizeProject(db, actor, input.projectId, "project.manage_cycles");
  if (input.endDate < input.startDate) throw new ValidationError("The cycle must end after it starts", [{ path: "endDate", message: "Must be after the start date" }]);
  const [cycle] = await db.insert(schema.cycles).values({ ...input, capacity: input.capacity == null ? null : String(input.capacity) }).returning();
  return cycle;
}

export async function closeCycle(ctx: ServiceContext, cycleId: string, moveIncompleteTo: "backlog" | "next") {
  const { db, actor } = ctx;
  const [cycle] = await db.select().from(schema.cycles).where(eq(schema.cycles.id, cycleId));
  if (!cycle) throw new NotFoundError("Cycle");
  await authorizeProject(db, actor, cycle.projectId, "project.manage_cycles");
  await db.transaction(async (tx) => {
    const [next] = await tx
      .select()
      .from(schema.cycles)
      .where(and(eq(schema.cycles.projectId, cycle.projectId), isNull(schema.cycles.closedAt), sql`${schema.cycles.startDate} > ${cycle.endDate}`))
      .orderBy(asc(schema.cycles.startDate))
      .limit(1);
    await tx
      .update(schema.tasks)
      .set({ cycleId: moveIncompleteTo === "next" && next ? next.id : null })
      .where(and(eq(schema.tasks.cycleId, cycleId), isNull(schema.tasks.completedAt), isNull(schema.tasks.deletedAt)));
    await tx.update(schema.cycles).set({ closedAt: sql`now()` }).where(eq(schema.cycles.id, cycleId));
  });
}

export async function postStatusUpdate(ctx: ServiceContext, input: { projectId: string; health: "on_track" | "at_risk" | "off_track" | "on_hold" | "complete"; title: string; body?: unknown }, today: string) {
  const { db, actor } = ctx;
  await authorizeProject(db, actor, input.projectId, "project.post_status_update");
  const metricsRes = await db.execute(sql`
    select
      (select count(*) from tasks t where t.project_id = ${input.projectId}::uuid and t.deleted_at is null and t.completed_at >= (${today}::date - interval '7 days')) as completed_week,
      (select count(*) from tasks t where t.project_id = ${input.projectId}::uuid and t.deleted_at is null and t.completed_at is null and t.due_date < ${today}::date) as overdue,
      (select count(*) from tasks t where t.project_id = ${input.projectId}::uuid and t.deleted_at is null and t.is_milestone and t.completed_at is null and t.due_date between ${today}::date and (${today}::date + interval '30 days')) as upcoming_milestones,
      (select count(*) from tasks t where t.project_id = ${input.projectId}::uuid and t.deleted_at is null and t.parent_id is null) as total,
      (select count(*) from tasks t where t.project_id = ${input.projectId}::uuid and t.deleted_at is null and t.parent_id is null and t.completed_at is not null) as done
  `);
  const m = ((Array.isArray(metricsRes) ? metricsRes : (metricsRes as { rows: unknown[] }).rows) as Array<Record<string, unknown>>)[0] ?? {};
  const metrics = { completedWeek: Number(m.completed_week ?? 0), overdue: Number(m.overdue ?? 0), upcomingMilestones: Number(m.upcoming_milestones ?? 0), total: Number(m.total ?? 0), done: Number(m.done ?? 0) };
  const [update] = await db.insert(schema.statusUpdates).values({ projectId: input.projectId, authorId: actor.userId, health: input.health, title: input.title, body: input.body ?? null, metrics }).returning();
  return update;
}

export async function listStatusUpdates(ctx: ServiceContext, projectId: string) {
  const { db, actor } = ctx;
  await authorizeProject(db, actor, projectId, "project.read");
  return db
    .select({ update: schema.statusUpdates, author: { id: schema.users.id, displayName: schema.users.displayName, avatarUrl: schema.users.avatarUrl } })
    .from(schema.statusUpdates)
    .innerJoin(schema.users, eq(schema.users.id, schema.statusUpdates.authorId))
    .where(eq(schema.statusUpdates.projectId, projectId))
    .orderBy(desc(schema.statusUpdates.createdAt))
    .limit(50);
}

/** Snapshots every task's dates so the Gantt can compare the plan against them (docs/11 section 5, FR-PLAN-03). */
export async function saveBaseline(ctx: ServiceContext, input: { projectId: string; name: string }) {
  const { db, actor } = ctx;
  await authorizeProject(db, actor, input.projectId, "task.update");
  const name = input.name.trim();
  if (!name) throw new ValidationError("Give the baseline a name");
  return db.transaction(async (tx) => {
    const [baseline] = await tx.insert(schema.baselines).values({ projectId: input.projectId, name, createdBy: actor.userId }).returning();
    const taskRows = await tx
      .select({ id: schema.tasks.id, startDate: schema.tasks.startDate, dueDate: schema.tasks.dueDate })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, input.projectId), isNull(schema.tasks.deletedAt)));
    if (taskRows.length) await tx.insert(schema.baselineTasks).values(taskRows.map((t) => ({ baselineId: baseline.id, taskId: t.id, startDate: t.startDate, dueDate: t.dueDate })));
    return { id: baseline.id, name: baseline.name, createdAt: baseline.createdAt.toISOString(), taskCount: taskRows.length };
  });
}

export type BaselineTasks = Record<string, { startDate: string | null; dueDate: string | null }>;

/** The dates a baseline captured, keyed by task id. */
export async function getBaselineTasks(ctx: ServiceContext, baselineId: string): Promise<{ id: string; name: string; createdAt: string; tasks: BaselineTasks }> {
  const { db, actor } = ctx;
  const [baseline] = await db.select().from(schema.baselines).where(eq(schema.baselines.id, baselineId));
  if (!baseline) throw new NotFoundError("Baseline");
  await authorizeProject(db, actor, baseline.projectId, "project.read");
  const rows = await db.select().from(schema.baselineTasks).where(eq(schema.baselineTasks.baselineId, baselineId));
  const tasks: BaselineTasks = {};
  for (const r of rows) tasks[r.taskId] = { startDate: r.startDate, dueDate: r.dueDate };
  return { id: baseline.id, name: baseline.name, createdAt: baseline.createdAt.toISOString(), tasks };
}

export async function deleteBaseline(ctx: ServiceContext, baselineId: string) {
  const { db, actor } = ctx;
  const [baseline] = await db.select().from(schema.baselines).where(eq(schema.baselines.id, baselineId));
  if (!baseline) throw new NotFoundError("Baseline");
  await authorizeProject(db, actor, baseline.projectId, "task.update");
  await db.delete(schema.baselines).where(eq(schema.baselines.id, baselineId));
}
