import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { schema } from "@/lib/db/client";
import { assertCan } from "@/lib/auth/permissions";
import { type ServiceContext, authorizeProject, NotFoundError, ValidationError } from "./context";
import type { CreateFieldInput, UpdateFieldInput } from "@/lib/validation/settings";

/** Custom field definitions: the workspace library (project_id null) and per project fields (docs/06). */

export type FieldDefinitionRow = typeof schema.fieldDefinitions.$inferSelect;

async function authorizeField(ctx: ServiceContext, projectId: string | null) {
  if (projectId) await authorizeProject(ctx.db, ctx.actor, projectId, "project.update");
  else assertCan(ctx.actor, "workspace.manage_libraries");
}

export async function listLibraryFields(ctx: ServiceContext): Promise<FieldDefinitionRow[]> {
  const { db, actor } = ctx;
  return db
    .select()
    .from(schema.fieldDefinitions)
    .where(and(eq(schema.fieldDefinitions.workspaceId, actor.workspaceId), isNull(schema.fieldDefinitions.projectId), isNull(schema.fieldDefinitions.deletedAt)))
    .orderBy(asc(schema.fieldDefinitions.position), asc(schema.fieldDefinitions.name));
}

/** Fields a project shows, in project order, plus the library fields it could adopt. */
export async function listProjectFields(ctx: ServiceContext, projectId: string): Promise<{ attached: Array<FieldDefinitionRow & { position: number }>; library: FieldDefinitionRow[] }> {
  const { db, actor } = ctx;
  await authorizeProject(db, actor, projectId, "project.read");
  const attachedRows = await db
    .select({ field: schema.fieldDefinitions, position: schema.projectFields.position })
    .from(schema.projectFields)
    .innerJoin(schema.fieldDefinitions, eq(schema.fieldDefinitions.id, schema.projectFields.fieldId))
    .where(and(eq(schema.projectFields.projectId, projectId), isNull(schema.fieldDefinitions.deletedAt)))
    .orderBy(asc(schema.projectFields.position));
  const attached = attachedRows.map((r) => ({ ...r.field, position: r.position }));
  const ids = new Set(attached.map((f) => f.id));
  const library = (await listLibraryFields(ctx)).filter((f) => !ids.has(f.id));
  return { attached, library };
}

export async function createField(ctx: ServiceContext, input: CreateFieldInput): Promise<FieldDefinitionRow> {
  const { db, actor } = ctx;
  await authorizeField(ctx, input.projectId);
  if ((input.type === "single_select" || input.type === "multi_select") && !(input.config.options?.length ?? 0)) throw new ValidationError("Add at least one option", [{ path: "config.options", message: "Add at least one option" }]);
  return db.transaction(async (tx) => {
    const [{ next }] = await tx
      .select({ next: sql<number>`coalesce(max(${schema.fieldDefinitions.position}), -1) + 1` })
      .from(schema.fieldDefinitions)
      .where(and(eq(schema.fieldDefinitions.workspaceId, actor.workspaceId), input.projectId ? eq(schema.fieldDefinitions.projectId, input.projectId) : isNull(schema.fieldDefinitions.projectId)));
    const [field] = await tx
      .insert(schema.fieldDefinitions)
      .values({ workspaceId: actor.workspaceId, projectId: input.projectId, name: input.name, type: input.type, config: input.config, isRequired: input.isRequired, position: Number(next) })
      .returning();
    if (input.projectId) {
      const [{ nextPos }] = await tx.select({ nextPos: sql<number>`coalesce(max(${schema.projectFields.position}), -1) + 1` }).from(schema.projectFields).where(eq(schema.projectFields.projectId, input.projectId));
      await tx.insert(schema.projectFields).values({ projectId: input.projectId, fieldId: field.id, position: Number(nextPos) });
    }
    return field;
  });
}

export async function updateField(ctx: ServiceContext, input: UpdateFieldInput): Promise<FieldDefinitionRow> {
  const { db, actor } = ctx;
  const [existing] = await db.select().from(schema.fieldDefinitions).where(and(eq(schema.fieldDefinitions.id, input.id), eq(schema.fieldDefinitions.workspaceId, actor.workspaceId), isNull(schema.fieldDefinitions.deletedAt)));
  if (!existing) throw new NotFoundError("Field");
  await authorizeField(ctx, existing.projectId);
  const patch: Partial<typeof schema.fieldDefinitions.$inferInsert> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.config !== undefined) patch.config = input.config;
  if (input.isRequired !== undefined) patch.isRequired = input.isRequired;
  if (input.position !== undefined) patch.position = input.position;
  const [field] = await db.update(schema.fieldDefinitions).set(patch).where(eq(schema.fieldDefinitions.id, input.id)).returning();
  return field;
}

/** Soft deletes a field; values stay for restore. */
export async function deleteField(ctx: ServiceContext, id: string): Promise<void> {
  const { db, actor } = ctx;
  const [existing] = await db.select().from(schema.fieldDefinitions).where(and(eq(schema.fieldDefinitions.id, id), eq(schema.fieldDefinitions.workspaceId, actor.workspaceId), isNull(schema.fieldDefinitions.deletedAt)));
  if (!existing) throw new NotFoundError("Field");
  await authorizeField(ctx, existing.projectId);
  await db.update(schema.fieldDefinitions).set({ deletedAt: sql`now()` }).where(eq(schema.fieldDefinitions.id, id));
}

/** Adopts a library field into a project (or reorders it when already attached). */
export async function attachField(ctx: ServiceContext, projectId: string, fieldId: string): Promise<void> {
  const { db, actor } = ctx;
  await authorizeProject(db, actor, projectId, "project.update");
  const [field] = await db.select().from(schema.fieldDefinitions).where(and(eq(schema.fieldDefinitions.id, fieldId), eq(schema.fieldDefinitions.workspaceId, actor.workspaceId), isNull(schema.fieldDefinitions.deletedAt)));
  if (!field) throw new NotFoundError("Field");
  if (field.projectId && field.projectId !== projectId) throw new ValidationError("That field belongs to another project");
  const [{ nextPos }] = await db.select({ nextPos: sql<number>`coalesce(max(${schema.projectFields.position}), -1) + 1` }).from(schema.projectFields).where(eq(schema.projectFields.projectId, projectId));
  await db.insert(schema.projectFields).values({ projectId, fieldId, position: Number(nextPos) }).onConflictDoNothing();
}

export async function detachField(ctx: ServiceContext, projectId: string, fieldId: string): Promise<void> {
  const { db, actor } = ctx;
  await authorizeProject(db, actor, projectId, "project.update");
  await db.delete(schema.projectFields).where(and(eq(schema.projectFields.projectId, projectId), eq(schema.projectFields.fieldId, fieldId)));
}

export async function reorderProjectFields(ctx: ServiceContext, projectId: string, orderedIds: string[]): Promise<void> {
  const { db, actor } = ctx;
  await authorizeProject(db, actor, projectId, "project.update");
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i += 1) {
      await tx.update(schema.projectFields).set({ position: i }).where(and(eq(schema.projectFields.projectId, projectId), eq(schema.projectFields.fieldId, orderedIds[i])));
    }
  });
}
