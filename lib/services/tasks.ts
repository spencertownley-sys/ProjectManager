import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { schema, type DbOrTx } from "@/lib/db/client";
import { assertCan } from "@/lib/auth/permissions";
import { emitTaskEvents } from "@/lib/events/emit";
import { dispatchAfterCommit } from "@/lib/events/dispatch";
import type { TaskEventInput } from "@/lib/events/types";
import { runTaskQuery, loadDependencies } from "@/lib/query-engine/run";
import type { QueryContext } from "@/lib/query-engine/build";
import type { TaskRow, QueryResult, DependencyRow } from "@/lib/query-engine/types";
import type { ViewSpec } from "@/lib/validation/view-spec";
import type {
  CreateTaskInput,
  UpdateTaskInput,
  MoveTaskInput,
  BulkUpdateInput,
  AddDependencyInput,
  AddCommentInput,
} from "@/lib/validation/task";
import {
  type ServiceContext,
  authorizeProject,
  loadProjectContext,
  positionBetween,
  NotFoundError,
  ValidationError,
  ConflictError,
  visibleProjectIds,
} from "./context";

type TaskRecord = typeof schema.tasks.$inferSelect;

async function loadTask(db: DbOrTx, id: string): Promise<TaskRecord> {
  const [task] = await db.select().from(schema.tasks).where(and(eq(schema.tasks.id, id), isNull(schema.tasks.deletedAt)));
  if (!task) throw new NotFoundError("Task");
  return task;
}

async function statusCategory(db: DbOrTx, statusId: string) {
  const [s] = await db.select({ category: schema.statuses.category, workflowId: schema.statuses.workflowId }).from(schema.statuses).where(eq(schema.statuses.id, statusId));
  if (!s) throw new ValidationError("Unknown status", [{ path: "statusId", message: "Unknown status" }]);
  return s;
}

async function defaultStatusForProject(db: DbOrTx, projectId: string): Promise<string> {
  const [project] = await db.select({ workflowId: schema.projects.workflowId }).from(schema.projects).where(eq(schema.projects.id, projectId));
  if (!project) throw new NotFoundError("Project");
  const [first] = await db
    .select({ id: schema.statuses.id })
    .from(schema.statuses)
    .where(eq(schema.statuses.workflowId, project.workflowId))
    .orderBy(asc(schema.statuses.position))
    .limit(1);
  if (!first) throw new ValidationError("The project has no statuses");
  return first.id;
}

async function lastPosition(db: DbOrTx, projectId: string, sectionId: string | null, parentId: string | null): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${schema.tasks.position}), 0)` })
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.projectId, projectId),
        sectionId ? eq(schema.tasks.sectionId, sectionId) : isNull(schema.tasks.sectionId),
        parentId ? eq(schema.tasks.parentId, parentId) : isNull(schema.tasks.parentId),
        isNull(schema.tasks.deletedAt),
      ),
    );
  return Number(row?.max ?? 0) + 1024;
}

async function writeCustomFields(tx: DbOrTx, taskId: string, values: Record<string, unknown>, events: TaskEventInput[], base: Omit<TaskEventInput, "type" | "field" | "before" | "after">) {
  const fieldIds = Object.keys(values);
  if (fieldIds.length === 0) return;
  const defs = await tx.select().from(schema.fieldDefinitions).where(inArray(schema.fieldDefinitions.id, fieldIds));
  const existing = await tx.select().from(schema.taskFieldValues).where(and(eq(schema.taskFieldValues.taskId, taskId), inArray(schema.taskFieldValues.fieldId, fieldIds)));
  const prior = new Map(existing.map((e) => [e.fieldId, e]));
  for (const def of defs) {
    const raw = values[def.id];
    const row = { taskId, fieldId: def.id, valueText: null as string | null, valueNumber: null as string | null, valueDate: null as string | null, valueBool: null as boolean | null, valueJson: null as unknown };
    switch (def.type) {
      case "text":
      case "long_text":
      case "url":
      case "email":
      case "phone":
        row.valueText = raw == null ? null : String(raw);
        break;
      case "number":
      case "currency":
      case "percent":
        row.valueNumber = raw == null || raw === "" ? null : String(Number(raw));
        break;
      case "date":
        row.valueDate = raw == null || raw === "" ? null : String(raw);
        break;
      case "checkbox":
        row.valueBool = Boolean(raw);
        break;
      case "single_select":
      case "multi_select":
      case "person":
      case "relation":
        row.valueJson = raw == null ? null : Array.isArray(raw) ? raw : [raw];
        break;
      default:
        row.valueJson = raw ?? null;
    }
    await tx
      .insert(schema.taskFieldValues)
      .values(row)
      .onConflictDoUpdate({ target: [schema.taskFieldValues.taskId, schema.taskFieldValues.fieldId], set: { ...row, updatedAt: sql`now()` } });
    const before = prior.get(def.id);
    events.push({ ...base, type: "field.changed", field: `custom:${def.id}`, before: before ? before.valueText ?? before.valueNumber ?? before.valueDate ?? before.valueBool ?? before.valueJson : null, after: raw ?? null });
  }
}

export async function createTask(ctx: ServiceContext, input: CreateTaskInput): Promise<TaskRecord> {
  const { db, actor } = ctx;
  await authorizeProject(db, actor, input.projectId, "task.create");

  const result = await db.transaction(async (tx) => {
    const [project] = await tx.select().from(schema.projects).where(eq(schema.projects.id, input.projectId));
    if (!project) throw new NotFoundError("Project");

    const statusId = input.statusId ?? (await defaultStatusForProject(tx, input.projectId));
    const { category } = await statusCategory(tx, statusId);

    let sectionId = input.sectionId ?? null;
    const parentId = input.parentId ?? null;
    if (parentId) {
      const parent = await loadTask(tx, parentId);
      if (parent.projectId !== input.projectId) throw new ValidationError("Subtasks belong to the parent's project");
      sectionId = parent.sectionId;
    }
    if (sectionId) {
      const [s] = await tx.select({ id: schema.sections.id }).from(schema.sections).where(and(eq(schema.sections.id, sectionId), eq(schema.sections.projectId, input.projectId)));
      if (!s) throw new ValidationError("Unknown section", [{ path: "sectionId", message: "Unknown section" }]);
    }

    let position = input.position;
    if (position === undefined && input.placement) {
      const anchor = await loadTask(tx, input.placement.relativeTo);
      const neighbors = await tx
        .select({ position: schema.tasks.position })
        .from(schema.tasks)
        .where(
          and(
            eq(schema.tasks.projectId, input.projectId),
            anchor.sectionId ? eq(schema.tasks.sectionId, anchor.sectionId) : isNull(schema.tasks.sectionId),
            isNull(schema.tasks.deletedAt),
            isNull(schema.tasks.parentId),
            input.placement.where === "after" ? sql`${schema.tasks.position} > ${anchor.position}` : sql`${schema.tasks.position} < ${anchor.position}`,
          ),
        )
        .orderBy(input.placement.where === "after" ? asc(schema.tasks.position) : desc(schema.tasks.position))
        .limit(1);
      const neighbor = neighbors[0]?.position ?? null;
      position = input.placement.where === "after" ? positionBetween(anchor.position, neighbor) : positionBetween(neighbor, anchor.position);
      sectionId = anchor.sectionId;
    }
    if (position === undefined) position = await lastPosition(tx, input.projectId, sectionId, parentId);

    const [task] = await tx
      .insert(schema.tasks)
      .values({
        workspaceId: actor.workspaceId,
        projectId: input.projectId,
        sectionId,
        parentId,
        cycleId: input.cycleId ?? null,
        title: input.title,
        description: input.description ?? null,
        descriptionText: input.description ? extractText(input.description) : null,
        statusId,
        priority: input.priority ?? "none",
        assigneeId: input.assigneeId ?? null,
        startDate: input.startDate ?? null,
        dueDate: input.dueDate ?? null,
        dueTime: input.dueTime ?? null,
        estimate: input.estimate == null ? null : String(input.estimate),
        isMilestone: input.isMilestone ?? false,
        position,
        createdBy: actor.userId,
        completedAt: category === "done" ? new Date() : null,
        completedBy: category === "done" ? actor.userId : null,
      })
      .returning();

    const base = { workspaceId: actor.workspaceId, projectId: task.projectId, taskId: task.id, actorId: actor.userId };
    const events: TaskEventInput[] = [{ ...base, type: "task.created", after: { title: task.title } }];
    if (parentId) events.push({ ...base, taskId: parentId, type: "subtask.added", after: { taskId: task.id, title: task.title } });
    if (task.assigneeId) events.push({ ...base, type: "task.assigned", field: "assignee", before: null, after: task.assigneeId });

    if (input.tagIds?.length) {
      await tx.insert(schema.taskTags).values(input.tagIds.map((tagId) => ({ taskId: task.id, tagId }))).onConflictDoNothing();
    }
    if (input.customFields) await writeCustomFields(tx, task.id, input.customFields, events, base);
    await tx.insert(schema.taskFollowers).values({ taskId: task.id, userId: actor.userId }).onConflictDoNothing();

    const eventIds = await emitTaskEvents(tx, events);
    return { task, eventIds };
  });

  await dispatchAfterCommit(result.eventIds, actor.workspaceId);
  return result.task;
}

export async function updateTask(ctx: ServiceContext, input: UpdateTaskInput): Promise<TaskRecord> {
  const { db, actor } = ctx;
  const existing = await loadTask(db, input.id);
  const pctx = await loadProjectContext(db, actor, existing.projectId);

  // Commenters may change status on tasks assigned to them; anything else needs editor.
  const onlyStatus = Object.keys(input).every((k) => ["id", "expectedVersion", "statusId"].includes(k));
  if (onlyStatus && existing.assigneeId === actor.userId) assertCan(actor, "task.update_assigned_status", pctx);
  else assertCan(actor, "task.update", pctx);

  if (input.expectedVersion !== undefined && input.expectedVersion !== existing.version) {
    throw new ConflictError("The task changed since you loaded it");
  }

  const result = await db.transaction(async (tx) => {
    const patch: Partial<TaskRecord> = {};
    const base = { workspaceId: actor.workspaceId, projectId: existing.projectId, taskId: existing.id, actorId: actor.userId };
    const events: TaskEventInput[] = [];

    if (input.title !== undefined && input.title !== existing.title) {
      patch.title = input.title;
      events.push({ ...base, type: "task.updated", field: "title", before: existing.title, after: input.title });
    }
    if (input.description !== undefined) {
      patch.description = input.description;
      patch.descriptionText = input.description ? extractText(input.description) : null;
      events.push({ ...base, type: "task.updated", field: "description" });
    }
    if (input.statusId !== undefined && input.statusId !== existing.statusId) {
      const next = await statusCategory(tx, input.statusId);
      const prev = await statusCategory(tx, existing.statusId);
      if (next.workflowId !== prev.workflowId) throw new ValidationError("Status belongs to another workflow", [{ path: "statusId", message: "Invalid status" }]);
      patch.statusId = input.statusId;
      events.push({ ...base, type: "task.status_changed", field: "status", before: existing.statusId, after: input.statusId });
      if (next.category === "done" && prev.category !== "done") {
        patch.completedAt = new Date();
        patch.completedBy = actor.userId;
        events.push({ ...base, type: "task.completed" });
      } else if (next.category !== "done" && prev.category === "done") {
        patch.completedAt = null;
        patch.completedBy = null;
        events.push({ ...base, type: "task.reopened" });
      }
    }
    if (input.assigneeId !== undefined && input.assigneeId !== existing.assigneeId) {
      patch.assigneeId = input.assigneeId;
      events.push({ ...base, type: "task.assigned", field: "assignee", before: existing.assigneeId, after: input.assigneeId });
      if (input.assigneeId) await tx.insert(schema.taskFollowers).values({ taskId: existing.id, userId: input.assigneeId }).onConflictDoNothing();
    }
    const dateChanged =
      (input.startDate !== undefined && input.startDate !== existing.startDate) ||
      (input.dueDate !== undefined && input.dueDate !== existing.dueDate) ||
      (input.dueTime !== undefined && input.dueTime !== existing.dueTime);
    if (dateChanged) {
      if (input.startDate !== undefined) patch.startDate = input.startDate;
      if (input.dueDate !== undefined) patch.dueDate = input.dueDate;
      if (input.dueTime !== undefined) patch.dueTime = input.dueTime;
      const start = patch.startDate ?? existing.startDate;
      const due = patch.dueDate ?? existing.dueDate;
      if (start && due && start > due) throw new ValidationError("Due date must be on or after the start date", [{ path: "dueDate", message: "Due date must be on or after the start date" }]);
      events.push({ ...base, type: "task.dates_changed", field: "dates", before: { startDate: existing.startDate, dueDate: existing.dueDate }, after: { startDate: start, dueDate: due } });
    }
    if (input.priority !== undefined && input.priority !== existing.priority) {
      patch.priority = input.priority;
      events.push({ ...base, type: "task.updated", field: "priority", before: existing.priority, after: input.priority });
    }
    if (input.estimate !== undefined) {
      const next = input.estimate == null ? null : String(input.estimate);
      if (next !== existing.estimate) {
        patch.estimate = next;
        events.push({ ...base, type: "task.updated", field: "estimate", before: existing.estimate, after: next });
      }
    }
    if (input.isMilestone !== undefined && input.isMilestone !== existing.isMilestone) {
      patch.isMilestone = input.isMilestone;
      if (input.isMilestone) patch.startDate = patch.dueDate ?? existing.dueDate;
      events.push({ ...base, type: "task.updated", field: "is_milestone", before: existing.isMilestone, after: input.isMilestone });
    }
    if (input.cycleId !== undefined && input.cycleId !== existing.cycleId) {
      patch.cycleId = input.cycleId;
      events.push({ ...base, type: "task.updated", field: "cycle", before: existing.cycleId, after: input.cycleId });
    }
    if (input.sectionId !== undefined && input.sectionId !== existing.sectionId) {
      patch.sectionId = input.sectionId;
      patch.position = await lastPosition(tx, existing.projectId, input.sectionId, existing.parentId);
      events.push({ ...base, type: "task.moved", field: "section", before: existing.sectionId, after: input.sectionId });
    }
    if (input.parentId !== undefined && input.parentId !== existing.parentId) {
      if (input.parentId === existing.id) throw new ValidationError("A task cannot be its own parent");
      if (input.parentId) {
        const parent = await loadTask(tx, input.parentId);
        if (parent.projectId !== existing.projectId) throw new ValidationError("The parent must be in the same project");
        patch.sectionId = parent.sectionId;
      }
      patch.parentId = input.parentId;
      events.push({ ...base, type: "task.moved", field: "parent", before: existing.parentId, after: input.parentId });
    }

    if (input.customFields) await writeCustomFields(tx, existing.id, input.customFields, events, base);

    let task = existing;
    if (Object.keys(patch).length > 0) {
      [task] = await tx
        .update(schema.tasks)
        .set({ ...patch, version: sql`${schema.tasks.version} + 1`, updatedAt: sql`now()` })
        .where(eq(schema.tasks.id, existing.id))
        .returning();
    }
    const eventIds = await emitTaskEvents(tx, events);
    return { task, eventIds };
  });

  await dispatchAfterCommit(result.eventIds, actor.workspaceId);
  return result.task;
}

/** Marks a task done (first status in the done category) or reopens it (first status outside done). */
export async function setTaskCompleted(ctx: ServiceContext, id: string, completed: boolean): Promise<TaskRecord> {
  const existing = await loadTask(ctx.db, id);
  const [project] = await ctx.db.select({ workflowId: schema.projects.workflowId }).from(schema.projects).where(eq(schema.projects.id, existing.projectId));
  if (!project) throw new NotFoundError("Project");
  const statusRows = await ctx.db.select().from(schema.statuses).where(eq(schema.statuses.workflowId, project.workflowId)).orderBy(asc(schema.statuses.position));
  const target = completed ? statusRows.find((s) => s.category === "done") : statusRows.find((s) => s.category !== "done");
  if (!target) throw new ValidationError("The workflow has no matching status");
  return updateTask(ctx, { id, statusId: target.id });
}

export async function moveTask(ctx: ServiceContext, input: MoveTaskInput): Promise<TaskRecord> {
  const { db, actor } = ctx;
  const existing = await loadTask(db, input.id);
  await authorizeProject(db, actor, existing.projectId, "task.update");
  const targetProjectId = input.projectId ?? existing.projectId;
  if (targetProjectId !== existing.projectId) await authorizeProject(db, actor, targetProjectId, "task.create");

  const result = await db.transaction(async (tx) => {
    const sectionId = input.sectionId === undefined ? existing.sectionId : input.sectionId;
    const before = input.beforeId ? await loadTask(tx, input.beforeId) : null;
    const after = input.afterId ? await loadTask(tx, input.afterId) : null;
    const position = before || after ? positionBetween(before?.position ?? null, after?.position ?? null) : await lastPosition(tx, targetProjectId, sectionId, existing.parentId);

    const patch: Partial<TaskRecord> = { sectionId, position };
    const base = { workspaceId: actor.workspaceId, projectId: existing.projectId, taskId: existing.id, actorId: actor.userId };
    const events: TaskEventInput[] = [];
    if (targetProjectId !== existing.projectId) {
      patch.projectId = targetProjectId;
      patch.number = 0; // trigger reassigns a number in the new project
      patch.statusId = await defaultStatusForProject(tx, targetProjectId);
      patch.cycleId = null;
      events.push({ ...base, type: "task.moved", field: "project", before: existing.projectId, after: targetProjectId });
    } else if (sectionId !== existing.sectionId) {
      events.push({ ...base, type: "task.moved", field: "section", before: existing.sectionId, after: sectionId });
    }
    const [task] = await tx
      .update(schema.tasks)
      .set({ ...patch, version: sql`${schema.tasks.version} + 1`, updatedAt: sql`now()` })
      .where(eq(schema.tasks.id, existing.id))
      .returning();
    if (patch.projectId) {
      await tx.update(schema.tasks).set({ projectId: patch.projectId, sectionId: null }).where(eq(schema.tasks.parentId, existing.id));
    }
    const eventIds = await emitTaskEvents(tx, events);
    return { task, eventIds };
  });
  await dispatchAfterCommit(result.eventIds, actor.workspaceId);
  return result.task;
}

export async function deleteTask(ctx: ServiceContext, id: string): Promise<void> {
  const { db, actor } = ctx;
  const existing = await loadTask(db, id);
  await authorizeProject(db, actor, existing.projectId, "task.delete");
  const eventIds = await db.transaction(async (tx) => {
    await tx.update(schema.tasks).set({ deletedAt: sql`now()`, version: sql`${schema.tasks.version} + 1` }).where(eq(schema.tasks.id, id));
    await tx.update(schema.tasks).set({ deletedAt: sql`now()` }).where(and(eq(schema.tasks.parentId, id), isNull(schema.tasks.deletedAt)));
    return emitTaskEvents(tx, [{ workspaceId: actor.workspaceId, projectId: existing.projectId, taskId: id, actorId: actor.userId, type: "task.deleted" }]);
  });
  await dispatchAfterCommit(eventIds, actor.workspaceId);
}

export async function restoreTask(ctx: ServiceContext, id: string): Promise<TaskRecord> {
  const { db, actor } = ctx;
  const [existing] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id));
  if (!existing) throw new NotFoundError("Task");
  await authorizeProject(db, actor, existing.projectId, "task.update");
  const result = await db.transaction(async (tx) => {
    const [task] = await tx.update(schema.tasks).set({ deletedAt: null, version: sql`${schema.tasks.version} + 1` }).where(eq(schema.tasks.id, id)).returning();
    await tx.update(schema.tasks).set({ deletedAt: null }).where(eq(schema.tasks.parentId, id));
    const eventIds = await emitTaskEvents(tx, [{ workspaceId: actor.workspaceId, projectId: existing.projectId, taskId: id, actorId: actor.userId, type: "task.restored" }]);
    return { task, eventIds };
  });
  await dispatchAfterCommit(result.eventIds, actor.workspaceId);
  return result.task;
}

export async function bulkUpdateTasks(ctx: ServiceContext, input: BulkUpdateInput): Promise<number> {
  let count = 0;
  for (const id of input.ids) {
    await updateTask(ctx, { id, ...input.patch });
    count += 1;
  }
  return count;
}

export async function queryProjectTasks(ctx: ServiceContext, projectId: string, spec: ViewSpec, today: string): Promise<QueryResult & { dependencies: DependencyRow[] }> {
  const { db, actor } = ctx;
  await authorizeProject(db, actor, projectId, "project.read");
  const [activeCycle] = await db
    .select({ id: schema.cycles.id })
    .from(schema.cycles)
    .where(and(eq(schema.cycles.projectId, projectId), isNull(schema.cycles.closedAt), sql`${schema.cycles.startDate} <= ${today}::date`, sql`${schema.cycles.endDate} >= ${today}::date`))
    .limit(1);
  const qctx: QueryContext = { userId: actor.userId, today, currentCycleId: activeCycle?.id ?? null };
  const result = await runTaskQuery(db, { kind: "project", projectId }, spec, qctx);
  const dependencies = await loadDependencies(db, projectId);
  return { ...result, dependencies };
}

export async function queryMyWork(ctx: ServiceContext, spec: ViewSpec, today: string, mode: "assigned" | "created" | "following" = "assigned"): Promise<QueryResult> {
  const { db, actor } = ctx;
  const ids = await visibleProjectIds(db, actor);
  const qctx: QueryContext = { userId: actor.userId, today };
  if (mode === "assigned") return runTaskQuery(db, { kind: "assignee", workspaceId: actor.workspaceId, userId: actor.userId, visibleProjectIds: ids }, spec, qctx);
  const extra = mode === "created" ? { kind: "filter" as const, field: "created_by" as const, op: "is_me" as const } : null;
  const merged: ViewSpec = extra ? { ...spec, filters: { kind: "group", op: "and", items: [spec.filters, extra] } } : spec;
  if (mode === "following") {
    const followed = await db.select({ taskId: schema.taskFollowers.taskId }).from(schema.taskFollowers).where(eq(schema.taskFollowers.userId, actor.userId));
    const followIds = followed.map((f) => f.taskId);
    const res = await runTaskQuery(db, { kind: "workspace", workspaceId: actor.workspaceId, visibleProjectIds: ids }, merged, qctx);
    const set = new Set(followIds);
    const rows = res.rows.filter((r) => set.has(r.id));
    return { rows, total: rows.length, truncated: res.truncated };
  }
  return runTaskQuery(db, { kind: "workspace", workspaceId: actor.workspaceId, visibleProjectIds: ids }, merged, qctx);
}

export type TaskDetail = {
  task: TaskRow;
  description: unknown;
  subtasks: TaskRow[];
  predecessors: Array<DependencyRow & { task: TaskRow }>;
  successors: Array<DependencyRow & { task: TaskRow }>;
  comments: Array<{ id: string; author: { id: string; displayName: string; avatarUrl: string | null }; body: unknown; bodyText: string; parentId: string | null; editedAt: string | null; createdAt: string; reactions: Array<{ emoji: string; userIds: string[] }> }>;
  attachments: Array<{ id: string; name: string; mimeType: string | null; sizeBytes: number | null; url: string | null; storagePath: string | null; createdAt: string }>;
  events: Array<{ id: number; type: string; field: string | null; before: unknown; after: unknown; actor: { id: string; displayName: string; avatarUrl: string | null } | null; createdAt: string }>;
  followers: string[];
  isFollowing: boolean;
  project: {
    id: string;
    key: string;
    name: string;
    color: string;
    statuses: Array<{ id: string; name: string; category: "backlog" | "not_started" | "in_progress" | "done"; color: string; position: number; wipLimit: number | null }>;
    sections: Array<{ id: string; name: string; position: number }>;
    fields: Array<{ id: string; name: string; type: string; config: unknown; position: number }>;
    cycles: Array<{ id: string; name: string; startDate: string; endDate: string; closedAt: string | null }>;
  };
};

export async function getTaskDetail(ctx: ServiceContext, idOrKey: string, today: string): Promise<TaskDetail> {
  const { db, actor } = ctx;
  let id = idOrKey;
  const keyMatch = /^([A-Z][A-Z0-9]{1,5})-(\d+)$/i.exec(idOrKey);
  if (keyMatch) {
    const [row] = await db
      .select({ id: schema.tasks.id })
      .from(schema.tasks)
      .innerJoin(schema.projects, eq(schema.projects.id, schema.tasks.projectId))
      .where(and(eq(schema.projects.workspaceId, actor.workspaceId), eq(schema.projects.key, keyMatch[1].toUpperCase()), eq(schema.tasks.number, Number(keyMatch[2])), isNull(schema.tasks.deletedAt)));
    if (!row) throw new NotFoundError("Task");
    id = row.id;
  }
  const record = await loadTask(db, id);
  await authorizeProject(db, actor, record.projectId, "project.read");
  const qctx: QueryContext = { userId: actor.userId, today };
  const visible = await visibleProjectIds(db, actor);
  const flatAll: ViewSpec = {
    filters: { kind: "group", op: "and", items: [] },
    sorts: [{ field: "manual", direction: "asc" }],
    subtasks: "flat",
    showCompleted: "all",
    visibleFields: [],
    columnWidths: {},
    options: {},
  };

  const main = await runTaskQuery(db, { kind: "ids", ids: [id], visibleProjectIds: visible }, flatAll, qctx, 1);
  const task = main.rows[0];
  if (!task) throw new NotFoundError("Task");

  const subtasksRes = await runTaskQuery(
    db,
    { kind: "project", projectId: record.projectId },
    { ...flatAll, filters: { kind: "group", op: "and", items: [{ kind: "filter", field: "parent", op: "is", value: id }] } },
    qctx,
  );

  const deps = await db
    .select()
    .from(schema.taskDependencies)
    .where(sql`${schema.taskDependencies.predecessorId} = ${id}::uuid or ${schema.taskDependencies.successorId} = ${id}::uuid`);
  const otherIds = Array.from(new Set(deps.flatMap((d) => [d.predecessorId, d.successorId]).filter((x) => x !== id)));
  const depRows = new Map<string, TaskRow>();
  if (otherIds.length) {
    const res = await runTaskQuery(db, { kind: "ids", ids: otherIds, visibleProjectIds: visible }, flatAll, qctx);
    for (const r of res.rows) depRows.set(r.id, r);
  }
  const predecessors = deps
    .filter((d) => d.successorId === id && depRows.has(d.predecessorId))
    .map((d) => ({ id: d.id, predecessorId: d.predecessorId, successorId: d.successorId, type: d.type, lagDays: d.lagDays, task: depRows.get(d.predecessorId)! }));
  const successors = deps
    .filter((d) => d.predecessorId === id && depRows.has(d.successorId))
    .map((d) => ({ id: d.id, predecessorId: d.predecessorId, successorId: d.successorId, type: d.type, lagDays: d.lagDays, task: depRows.get(d.successorId)! }));

  const commentRows = await db
    .select({ c: schema.comments, author: { id: schema.users.id, displayName: schema.users.displayName, avatarUrl: schema.users.avatarUrl } })
    .from(schema.comments)
    .innerJoin(schema.users, eq(schema.users.id, schema.comments.authorId))
    .where(and(eq(schema.comments.taskId, id), isNull(schema.comments.deletedAt)))
    .orderBy(asc(schema.comments.createdAt));
  const reactionRows = commentRows.length
    ? await db.select().from(schema.commentReactions).where(inArray(schema.commentReactions.commentId, commentRows.map((r) => r.c.id)))
    : [];
  const comments = commentRows.map(({ c, author }) => {
    const map = new Map<string, string[]>();
    for (const r of reactionRows.filter((x) => x.commentId === c.id)) map.set(r.emoji, [...(map.get(r.emoji) ?? []), r.userId]);
    return { id: c.id, author, body: c.body, bodyText: c.bodyText, parentId: c.parentId, editedAt: c.editedAt?.toISOString() ?? null, createdAt: c.createdAt.toISOString(), reactions: Array.from(map, ([emoji, userIds]) => ({ emoji, userIds })) };
  });

  const attachmentRows = await db.select().from(schema.attachments).where(and(eq(schema.attachments.taskId, id), isNull(schema.attachments.deletedAt))).orderBy(desc(schema.attachments.createdAt));
  const attachments = attachmentRows.map((a) => ({ id: a.id, name: a.name, mimeType: a.mimeType, sizeBytes: a.sizeBytes, url: a.url, storagePath: a.storagePath, createdAt: a.createdAt.toISOString() }));

  const eventRows = await db
    .select({ e: schema.taskEvents, actor: { id: schema.users.id, displayName: schema.users.displayName, avatarUrl: schema.users.avatarUrl } })
    .from(schema.taskEvents)
    .leftJoin(schema.users, eq(schema.users.id, schema.taskEvents.actorId))
    .where(eq(schema.taskEvents.taskId, id))
    .orderBy(desc(schema.taskEvents.createdAt))
    .limit(200);
  const events = eventRows.map(({ e, actor: a }) => ({ id: e.id, type: e.type, field: e.field, before: e.before, after: e.after, actor: a && a.id ? a : null, createdAt: e.createdAt.toISOString() }));

  const followerRows = await db.select({ userId: schema.taskFollowers.userId }).from(schema.taskFollowers).where(eq(schema.taskFollowers.taskId, id));
  const followers = followerRows.map((f) => f.userId);

  const [projectRow] = await db.select().from(schema.projects).where(eq(schema.projects.id, record.projectId));
  const [statusRows, sectionRows, fieldRows, cycleRows] = await Promise.all([
    db.select().from(schema.statuses).where(eq(schema.statuses.workflowId, projectRow.workflowId)).orderBy(asc(schema.statuses.position)),
    db.select().from(schema.sections).where(and(eq(schema.sections.projectId, record.projectId), isNull(schema.sections.deletedAt))).orderBy(asc(schema.sections.position)),
    db
      .select({ field: schema.fieldDefinitions, position: schema.projectFields.position })
      .from(schema.projectFields)
      .innerJoin(schema.fieldDefinitions, eq(schema.fieldDefinitions.id, schema.projectFields.fieldId))
      .where(and(eq(schema.projectFields.projectId, record.projectId), isNull(schema.fieldDefinitions.deletedAt)))
      .orderBy(asc(schema.projectFields.position)),
    db.select().from(schema.cycles).where(eq(schema.cycles.projectId, record.projectId)).orderBy(desc(schema.cycles.startDate)),
  ]);
  const project = {
    id: projectRow.id,
    key: projectRow.key,
    name: projectRow.name,
    color: projectRow.color,
    statuses: statusRows.map((s) => ({ id: s.id, name: s.name, category: s.category, color: s.color, position: s.position, wipLimit: s.wipLimit })),
    sections: sectionRows.map((s) => ({ id: s.id, name: s.name, position: s.position })),
    fields: fieldRows.map((r) => ({ id: r.field.id, name: r.field.name, type: r.field.type, config: r.field.config, position: r.position })),
    cycles: cycleRows.map((c) => ({ id: c.id, name: c.name, startDate: c.startDate, endDate: c.endDate, closedAt: c.closedAt?.toISOString() ?? null })),
  };

  return { task, description: record.description, subtasks: subtasksRes.rows, predecessors, successors, comments, attachments, events, followers, isFollowing: followers.includes(actor.userId), project };
}

export async function addDependency(ctx: ServiceContext, input: AddDependencyInput): Promise<DependencyRow> {
  const { db, actor } = ctx;
  const successor = await loadTask(db, input.successorId);
  const predecessor = await loadTask(db, input.predecessorId);
  await authorizeProject(db, actor, successor.projectId, "task.update");
  if (predecessor.projectId !== successor.projectId) await authorizeProject(db, actor, predecessor.projectId, "project.read");
  if (predecessor.id === successor.id) throw new ValidationError("A task cannot depend on itself");
  const result = await db.transaction(async (tx) => {
    let row: typeof schema.taskDependencies.$inferSelect;
    try {
      [row] = await tx.insert(schema.taskDependencies).values({ predecessorId: input.predecessorId, successorId: input.successorId, type: input.type, lagDays: input.lagDays }).returning();
    } catch (error) {
      const message = `${(error as Error).message} ${((error as Error & { cause?: Error }).cause?.message) ?? ""}`;
      if (message.includes("dependency_cycle")) throw new ValidationError(`This would create a loop: ${predecessor.title} depends on ${successor.title}`);
      if (message.includes("unique")) throw new ConflictError("That dependency already exists");
      throw error;
    }
    const eventIds = await emitTaskEvents(tx, [
      { workspaceId: actor.workspaceId, projectId: successor.projectId, taskId: successor.id, actorId: actor.userId, type: "dependency.added", field: "blocked_by", after: { taskId: predecessor.id, type: input.type, lagDays: input.lagDays } },
      { workspaceId: actor.workspaceId, projectId: predecessor.projectId, taskId: predecessor.id, actorId: actor.userId, type: "dependency.added", field: "blocking", after: { taskId: successor.id, type: input.type, lagDays: input.lagDays } },
    ]);
    return { row, eventIds };
  });
  await dispatchAfterCommit(result.eventIds, actor.workspaceId);
  return { id: result.row.id, predecessorId: result.row.predecessorId, successorId: result.row.successorId, type: result.row.type, lagDays: result.row.lagDays };
}

export async function removeDependency(ctx: ServiceContext, dependencyId: string): Promise<void> {
  const { db, actor } = ctx;
  const [dep] = await db.select().from(schema.taskDependencies).where(eq(schema.taskDependencies.id, dependencyId));
  if (!dep) throw new NotFoundError("Dependency");
  const successor = await loadTask(db, dep.successorId);
  await authorizeProject(db, actor, successor.projectId, "task.update");
  const eventIds = await db.transaction(async (tx) => {
    await tx.delete(schema.taskDependencies).where(eq(schema.taskDependencies.id, dependencyId));
    return emitTaskEvents(tx, [
      { workspaceId: actor.workspaceId, projectId: successor.projectId, taskId: dep.successorId, actorId: actor.userId, type: "dependency.removed", field: "blocked_by", before: { taskId: dep.predecessorId } },
    ]);
  });
  await dispatchAfterCommit(eventIds, actor.workspaceId);
}

export async function addComment(ctx: ServiceContext, input: AddCommentInput) {
  const { db, actor } = ctx;
  const task = await loadTask(db, input.taskId);
  await authorizeProject(db, actor, task.projectId, "comment.create");
  const result = await db.transaction(async (tx) => {
    const [comment] = await tx.insert(schema.comments).values({ taskId: task.id, authorId: actor.userId, body: input.body, bodyText: input.bodyText, parentId: input.parentId ?? null }).returning();
    await tx.insert(schema.taskFollowers).values({ taskId: task.id, userId: actor.userId }).onConflictDoNothing();
    const eventIds = await emitTaskEvents(tx, [
      { workspaceId: actor.workspaceId, projectId: task.projectId, taskId: task.id, actorId: actor.userId, type: "comment.created", after: { commentId: comment.id, mentions: input.mentionUserIds, excerpt: input.bodyText.slice(0, 200) } },
    ]);
    return { comment, eventIds };
  });
  await dispatchAfterCommit(result.eventIds, actor.workspaceId);
  return result.comment;
}

export async function editComment(ctx: ServiceContext, input: { id: string; body: unknown; bodyText: string }) {
  const { db, actor } = ctx;
  const [comment] = await db.select().from(schema.comments).where(and(eq(schema.comments.id, input.id), isNull(schema.comments.deletedAt)));
  if (!comment) throw new NotFoundError("Comment");
  const task = await loadTask(db, comment.taskId);
  const pctx = await loadProjectContext(db, actor, task.projectId);
  if (comment.authorId === actor.userId) assertCan(actor, "comment.edit_own", pctx, { ownsResource: true });
  else assertCan(actor, "comment.edit_any", pctx);
  const result = await db.transaction(async (tx) => {
    const [updated] = await tx.update(schema.comments).set({ body: input.body, bodyText: input.bodyText, editedAt: sql`now()` }).where(eq(schema.comments.id, input.id)).returning();
    const eventIds = await emitTaskEvents(tx, [{ workspaceId: actor.workspaceId, projectId: task.projectId, taskId: task.id, actorId: actor.userId, type: "comment.edited", after: { commentId: input.id } }]);
    return { updated, eventIds };
  });
  await dispatchAfterCommit(result.eventIds, actor.workspaceId);
  return result.updated;
}

export async function deleteComment(ctx: ServiceContext, id: string): Promise<void> {
  const { db, actor } = ctx;
  const [comment] = await db.select().from(schema.comments).where(and(eq(schema.comments.id, id), isNull(schema.comments.deletedAt)));
  if (!comment) throw new NotFoundError("Comment");
  const task = await loadTask(db, comment.taskId);
  const pctx = await loadProjectContext(db, actor, task.projectId);
  if (comment.authorId === actor.userId) assertCan(actor, "comment.edit_own", pctx, { ownsResource: true });
  else assertCan(actor, "comment.edit_any", pctx);
  await db.update(schema.comments).set({ deletedAt: sql`now()` }).where(eq(schema.comments.id, id));
}

export async function toggleReaction(ctx: ServiceContext, input: { commentId: string; emoji: string }): Promise<boolean> {
  const { db, actor } = ctx;
  const [comment] = await db.select().from(schema.comments).where(eq(schema.comments.id, input.commentId));
  if (!comment) throw new NotFoundError("Comment");
  const task = await loadTask(db, comment.taskId);
  await authorizeProject(db, actor, task.projectId, "comment.create");
  const deleted = await db
    .delete(schema.commentReactions)
    .where(and(eq(schema.commentReactions.commentId, input.commentId), eq(schema.commentReactions.userId, actor.userId), eq(schema.commentReactions.emoji, input.emoji)))
    .returning();
  if (deleted.length) return false;
  await db.insert(schema.commentReactions).values({ commentId: input.commentId, userId: actor.userId, emoji: input.emoji });
  return true;
}

export async function setTaskTags(ctx: ServiceContext, taskId: string, tagIds: string[]): Promise<void> {
  const { db, actor } = ctx;
  const task = await loadTask(db, taskId);
  await authorizeProject(db, actor, task.projectId, "task.update");
  const eventIds = await db.transaction(async (tx) => {
    const current = await tx.select({ tagId: schema.taskTags.tagId }).from(schema.taskTags).where(eq(schema.taskTags.taskId, taskId));
    const currentIds = new Set(current.map((c) => c.tagId));
    const nextIds = new Set(tagIds);
    const added = tagIds.filter((t) => !currentIds.has(t));
    const removed = [...currentIds].filter((t) => !nextIds.has(t));
    if (removed.length) await tx.delete(schema.taskTags).where(and(eq(schema.taskTags.taskId, taskId), inArray(schema.taskTags.tagId, removed)));
    if (added.length) await tx.insert(schema.taskTags).values(added.map((tagId) => ({ taskId, tagId }))).onConflictDoNothing();
    const base = { workspaceId: actor.workspaceId, projectId: task.projectId, taskId, actorId: actor.userId };
    return emitTaskEvents(tx, [
      ...added.map((tagId) => ({ ...base, type: "tag.added" as const, after: tagId })),
      ...removed.map((tagId) => ({ ...base, type: "tag.removed" as const, before: tagId })),
    ]);
  });
  await dispatchAfterCommit(eventIds, actor.workspaceId);
}

export async function toggleFollow(ctx: ServiceContext, taskId: string): Promise<boolean> {
  const { db, actor } = ctx;
  const task = await loadTask(db, taskId);
  await authorizeProject(db, actor, task.projectId, "project.read");
  const deleted = await db.delete(schema.taskFollowers).where(and(eq(schema.taskFollowers.taskId, taskId), eq(schema.taskFollowers.userId, actor.userId))).returning();
  if (deleted.length) return false;
  await db.insert(schema.taskFollowers).values({ taskId, userId: actor.userId });
  return true;
}

/** Plain-text projection of a Tiptap document, used for search and excerpts. */
export function extractText(doc: unknown): string {
  const parts: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as { text?: string; content?: unknown[]; type?: string };
    if (typeof n.text === "string") parts.push(n.text);
    if (Array.isArray(n.content)) {
      n.content.forEach(walk);
      if (n.type === "paragraph" || n.type === "heading" || n.type === "listItem") parts.push("\n");
    }
  };
  walk(doc);
  return parts.join("").replace(/\n{2,}/g, "\n").trim();
}
