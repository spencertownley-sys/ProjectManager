import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { schema, type Database } from "@/lib/db/client";
import type { Actor } from "@/lib/auth/permissions";
import { type ServiceContext, authorizeProject, NotFoundError } from "./context";
import { createTask, setTaskTags } from "./tasks";
import type { CreateImportInput, ImportError, ImportMapping } from "@/lib/validation/import";
import { coerceRow, type ImportContext } from "@/lib/client/csv";

/*
  CSV import (docs/16 step 1.17). `createImport` stores the upload and asks Inngest to run it; `runImportBatch` is
  what the job calls per batch. Tasks are created through `createTask`, so every row is authorized and emits events.
*/

export type ImportRecord = {
  id: string;
  projectId: string;
  fileName: string;
  status: "pending" | "running" | "completed" | "failed";
  totalRows: number;
  processedRows: number;
  createdCount: number;
  errorCount: number;
  errors: ImportError[];
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
};

export const IMPORT_BATCH_SIZE = 100;
const MAX_RECORDED_ERRORS = 100;

function toRecord(r: typeof schema.imports.$inferSelect): ImportRecord {
  return {
    id: r.id,
    projectId: r.projectId,
    fileName: r.fileName,
    status: r.status,
    totalRows: r.totalRows,
    processedRows: r.processedRows,
    createdCount: r.createdCount,
    errorCount: r.errorCount,
    errors: (r.errors as ImportError[]) ?? [],
    startedAt: r.startedAt?.toISOString() ?? null,
    finishedAt: r.finishedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function createImport(ctx: ServiceContext, input: CreateImportInput): Promise<ImportRecord> {
  const { db, actor } = ctx;
  await authorizeProject(db, actor, input.projectId, "task.create");
  const [row] = await db
    .insert(schema.imports)
    .values({ workspaceId: actor.workspaceId, projectId: input.projectId, createdBy: actor.userId, fileName: input.fileName, mapping: input.mapping, rows: input.rows, totalRows: input.rows.length })
    .returning();
  const { dispatchImport } = await import("@/lib/events/dispatch");
  await dispatchImport(row.id, actor.workspaceId);
  return toRecord(row);
}

export async function getImport(ctx: ServiceContext, id: string): Promise<ImportRecord> {
  const { db, actor } = ctx;
  const [row] = await db.select().from(schema.imports).where(and(eq(schema.imports.id, id), eq(schema.imports.workspaceId, actor.workspaceId)));
  if (!row) throw new NotFoundError("Import");
  await authorizeProject(db, actor, row.projectId, "project.read");
  return toRecord(row);
}

export async function listImports(ctx: ServiceContext, projectId: string): Promise<ImportRecord[]> {
  const { db, actor } = ctx;
  await authorizeProject(db, actor, projectId, "project.read");
  const rows = await db.select().from(schema.imports).where(eq(schema.imports.projectId, projectId)).orderBy(desc(schema.imports.createdAt)).limit(20);
  return rows.map(toRecord);
}

/** Builds the name lookup context the coercion step shares with the preview. */
async function loadImportContext(db: Database, projectId: string): Promise<ImportContext & { workflowId: string }> {
  const [project] = await db.select({ workflowId: schema.projects.workflowId, workspaceId: schema.projects.workspaceId }).from(schema.projects).where(eq(schema.projects.id, projectId));
  if (!project) throw new NotFoundError("Project");
  const [statuses, sections, fieldRows, members] = await Promise.all([
    db.select({ id: schema.statuses.id, name: schema.statuses.name }).from(schema.statuses).where(eq(schema.statuses.workflowId, project.workflowId)).orderBy(asc(schema.statuses.position)),
    db.select({ id: schema.sections.id, name: schema.sections.name }).from(schema.sections).where(and(eq(schema.sections.projectId, projectId), isNull(schema.sections.deletedAt))).orderBy(asc(schema.sections.position)),
    db
      .select({ id: schema.fieldDefinitions.id, name: schema.fieldDefinitions.name, type: schema.fieldDefinitions.type, config: schema.fieldDefinitions.config })
      .from(schema.projectFields)
      .innerJoin(schema.fieldDefinitions, eq(schema.fieldDefinitions.id, schema.projectFields.fieldId))
      .where(eq(schema.projectFields.projectId, projectId)),
    db
      .select({ id: schema.users.id, displayName: schema.users.displayName, email: schema.users.email })
      .from(schema.workspaceMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.workspaceMembers.userId))
      .where(eq(schema.workspaceMembers.workspaceId, project.workspaceId)),
  ]);
  return { statuses, sections, fields: fieldRows, members, workflowId: project.workflowId };
}

async function actorForImport(db: Database, row: typeof schema.imports.$inferSelect): Promise<Actor> {
  const [m] = await db.select({ role: schema.workspaceMembers.role }).from(schema.workspaceMembers).where(and(eq(schema.workspaceMembers.workspaceId, row.workspaceId), eq(schema.workspaceMembers.userId, row.createdBy)));
  if (!m) throw new NotFoundError("Import owner membership");
  return { userId: row.createdBy, workspaceId: row.workspaceId, workspaceRole: m.role };
}

/**
 * Processes the next batch of rows for an import and records progress. Returns whether rows remain. The job
 * calls this repeatedly; rows are processed in file order so a parent row precedes its children.
 */
export async function runImportBatch(db: Database, importId: string, batchSize = IMPORT_BATCH_SIZE): Promise<{ done: boolean; processed: number }> {
  const [row] = await db.select().from(schema.imports).where(eq(schema.imports.id, importId));
  if (!row) throw new NotFoundError("Import");
  if (row.status === "completed" || row.status === "failed") return { done: true, processed: row.processedRows };
  const actor = await actorForImport(db, row);
  const ctx: ServiceContext = { db, actor };
  const mapping = row.mapping as ImportMapping;
  const rows = row.rows as string[][];
  if (row.status === "pending") await db.update(schema.imports).set({ status: "running", startedAt: sql`now()` }).where(eq(schema.imports.id, importId));

  const lookup = await loadImportContext(db, row.projectId);
  const titleToId = new Map<string, string>();
  const earlier = await db.select({ id: schema.tasks.id, title: schema.tasks.title }).from(schema.tasks).where(and(eq(schema.tasks.projectId, row.projectId), isNull(schema.tasks.deletedAt), isNull(schema.tasks.parentId)));
  for (const t of earlier) titleToId.set(t.title.trim().toLowerCase(), t.id);
  const tagIds = new Map<string, string>();
  const existingTags = await db.select().from(schema.tags).where(eq(schema.tags.workspaceId, row.workspaceId));
  for (const t of existingTags) tagIds.set(t.name.toLowerCase(), t.id);

  const start = row.processedRows;
  const end = Math.min(rows.length, start + batchSize);
  let created = 0;
  const errors: ImportError[] = [];
  const colors = ["blue", "teal", "green", "purple", "orange", "berry", "navy", "lime"];
  for (let i = start; i < end; i += 1) {
    const coerced = coerceRow(rows[i], mapping, lookup);
    if (coerced.errors.length) {
      errors.push({ row: i + 1, message: coerced.errors.map((e) => e.message).join("; ") });
      continue;
    }
    try {
      let sectionId = coerced.sectionId;
      if (!sectionId && coerced.newSection) {
        const [section] = await db.insert(schema.sections).values({ projectId: row.projectId, name: coerced.newSection, position: (lookup.sections.length + 1) * 1024 }).returning();
        lookup.sections.push({ id: section.id, name: section.name });
        sectionId = section.id;
      }
      let parentId: string | null = null;
      if (coerced.parentTitle) {
        parentId = titleToId.get(coerced.parentTitle.toLowerCase()) ?? null;
        if (!parentId) {
          errors.push({ row: i + 1, message: `Parent task "${coerced.parentTitle}" was not found above this row` });
          continue;
        }
      }
      const task = await createTask(ctx, {
        projectId: row.projectId,
        title: coerced.title,
        sectionId: parentId ? undefined : sectionId,
        parentId,
        statusId: coerced.statusId ?? undefined,
        assigneeId: coerced.assigneeId,
        startDate: coerced.startDate,
        dueDate: coerced.dueDate,
        priority: coerced.priority ?? undefined,
        estimate: coerced.estimate,
        isMilestone: coerced.isMilestone,
        description: coerced.description ? { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: coerced.description }] }] } : null,
        customFields: Object.keys(coerced.customFields).length ? coerced.customFields : undefined,
      });
      if (!parentId) titleToId.set(coerced.title.trim().toLowerCase(), task.id);
      if (coerced.tags.length) {
        const ids: string[] = [];
        for (const name of coerced.tags) {
          let id = tagIds.get(name.toLowerCase());
          if (!id) {
            const [tag] = await db.insert(schema.tags).values({ workspaceId: row.workspaceId, name, color: colors[tagIds.size % colors.length] }).onConflictDoNothing().returning();
            if (tag) id = tag.id;
            else {
              const [found] = await db.select().from(schema.tags).where(and(eq(schema.tags.workspaceId, row.workspaceId), eq(schema.tags.name, name)));
              id = found?.id;
            }
            if (id) tagIds.set(name.toLowerCase(), id);
          }
          if (id) ids.push(id);
        }
        if (ids.length) await setTaskTags(ctx, task.id, ids);
      }
      created += 1;
    } catch (error) {
      errors.push({ row: i + 1, message: (error as Error).message });
    }
  }
  const done = end >= rows.length;
  const recorded = ((row.errors as ImportError[]) ?? []).concat(errors).slice(0, MAX_RECORDED_ERRORS);
  await db
    .update(schema.imports)
    .set({
      processedRows: end,
      createdCount: row.createdCount + created,
      errorCount: row.errorCount + errors.length,
      errors: recorded,
      status: done ? "completed" : "running",
      finishedAt: done ? sql`now()` : null,
      // The rows are not needed once every batch has run.
      ...(done ? { rows: [] } : {}),
    })
    .where(eq(schema.imports.id, importId));
  return { done, processed: end };
}

export async function failImport(db: Database, importId: string, message: string): Promise<void> {
  await db.update(schema.imports).set({ status: "failed", finishedAt: sql`now()`, errors: sql`${JSON.stringify([{ row: 0, message }])}::jsonb` }).where(eq(schema.imports.id, importId));
}
