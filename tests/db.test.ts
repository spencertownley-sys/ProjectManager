import { describe, it, expect, beforeAll } from "vitest";
import { createTestDb } from "./helpers/pglite";
import type { Database } from "@/lib/db/client";
import { schema } from "@/lib/db/client";
import { eq } from "drizzle-orm";

describe("schema migration on PGlite", () => {
  let db: Database;
  beforeAll(async () => {
    ({ db } = await createTestDb());
  });

  it("applies and assigns sequential task numbers", async () => {
    const [user] = await db
      .insert(schema.users)
      .values({ clerkUserId: "user_1", email: "a@example.com", displayName: "Ada" })
      .returning();
    const [ws] = await db
      .insert(schema.workspaces)
      .values({ clerkOrgId: "org_1", slug: "acme", name: "Acme" })
      .returning();
    const [wf] = await db.insert(schema.workflows).values({ workspaceId: ws.id, name: "Simple" }).returning();
    const [todo] = await db
      .insert(schema.statuses)
      .values({ workflowId: wf.id, name: "To do", category: "not_started", color: "gray", position: 0 })
      .returning();
    const [project] = await db
      .insert(schema.projects)
      .values({ workspaceId: ws.id, workflowId: wf.id, key: "ACM", name: "Launch" })
      .returning();
    const inserted = await db
      .insert(schema.tasks)
      .values([
        { workspaceId: ws.id, projectId: project.id, title: "One", statusId: todo.id, createdBy: user.id },
        { workspaceId: ws.id, projectId: project.id, title: "Two", statusId: todo.id, createdBy: user.id },
      ])
      .returning();
    expect(inserted.map((t) => t.number).sort()).toEqual([1, 2]);
    const [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, project.id));
    expect(p.nextTaskNumber).toBe(3);
  });

  it("rejects circular dependencies", async () => {
    const [project] = await db.select().from(schema.projects).limit(1);
    const rows = await db.select().from(schema.tasks).where(eq(schema.tasks.projectId, project.id));
    const [a, b] = rows;
    await db.insert(schema.taskDependencies).values({ predecessorId: a.id, successorId: b.id });
    let message = "";
    try {
      await db.insert(schema.taskDependencies).values({ predecessorId: b.id, successorId: a.id });
    } catch (error) {
      const err = error as Error & { cause?: Error };
      message = `${err.message} ${err.cause?.message ?? ""}`;
    }
    expect(message).toMatch(/dependency_cycle/);
  });
});
