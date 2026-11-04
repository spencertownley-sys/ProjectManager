import { and, eq, isNull, sql } from "drizzle-orm";
import { schema } from "@/lib/db/client";
import { assertCan } from "@/lib/auth/permissions";
import { viewSpec, type SavedViewInput, type ViewSpec } from "@/lib/validation/view-spec";
import { type ServiceContext, authorizeProject, NotFoundError } from "./context";

export async function saveView(ctx: ServiceContext, input: SavedViewInput) {
  const { db, actor } = ctx;
  if (input.projectId) {
    const pctx = await authorizeProject(db, actor, input.projectId, "project.read");
    assertCan(actor, input.isShared ? "project.manage_views_shared" : "view.save_personal", pctx);
  }
  const [row] = await db
    .insert(schema.savedViews)
    .values({ workspaceId: actor.workspaceId, projectId: input.projectId, ownerId: actor.userId, name: input.name, type: input.type, spec: input.spec, isShared: input.isShared, position: 100 })
    .returning();
  return row;
}

export async function updateView(ctx: ServiceContext, input: { id: string; name?: string; spec?: ViewSpec; isShared?: boolean; position?: number; type?: SavedViewInput["type"] }) {
  const { db, actor } = ctx;
  const [view] = await db.select().from(schema.savedViews).where(and(eq(schema.savedViews.id, input.id), isNull(schema.savedViews.deletedAt)));
  if (!view || view.workspaceId !== actor.workspaceId) throw new NotFoundError("View");
  if (view.projectId) {
    const pctx = await authorizeProject(db, actor, view.projectId, "project.read");
    if (view.isShared || input.isShared) assertCan(actor, "project.manage_views_shared", pctx);
    else if (view.ownerId !== actor.userId) assertCan(actor, "project.manage_views_shared", pctx);
  }
  const { id, ...patch } = input;
  const [updated] = await db
    .update(schema.savedViews)
    .set({ ...patch, spec: patch.spec ? viewSpec.parse(patch.spec) : undefined, updatedAt: sql`now()` })
    .where(eq(schema.savedViews.id, id))
    .returning();
  return updated;
}

export async function deleteView(ctx: ServiceContext, id: string) {
  const { db, actor } = ctx;
  const [view] = await db.select().from(schema.savedViews).where(and(eq(schema.savedViews.id, id), isNull(schema.savedViews.deletedAt)));
  if (!view || view.workspaceId !== actor.workspaceId) throw new NotFoundError("View");
  if (view.projectId) {
    const pctx = await authorizeProject(db, actor, view.projectId, "project.read");
    if (view.isShared || view.ownerId !== actor.userId) assertCan(actor, "project.manage_views_shared", pctx);
  }
  await db.update(schema.savedViews).set({ deletedAt: sql`now()` }).where(eq(schema.savedViews.id, id));
}

export async function setDefaultView(ctx: ServiceContext, projectId: string, viewId: string | null) {
  const { db, actor } = ctx;
  await authorizeProject(db, actor, projectId, "project.update");
  await db.update(schema.projects).set({ defaultViewId: viewId }).where(eq(schema.projects.id, projectId));
}
