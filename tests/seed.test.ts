import { describe, it, expect, beforeAll, vi } from "vitest";
import { count, eq, like } from "drizzle-orm";
import { createTestDb } from "./helpers/pglite";
import { schema, type Database } from "@/lib/db/client";
import { seedReference, seedBeta, resetReference, referenceExists, rosterWithEmails, defaultBetaRoster, rng } from "@/lib/dev/seed";
import { upsertUser, resolveActor } from "@/lib/services/workspaces";
import { queryProjectTasks } from "@/lib/services/tasks";
import { defaultViewSpec } from "@/lib/validation/view-spec";

vi.mock("@/lib/events/dispatch", () => ({ dispatchAfterCommit: vi.fn(async () => undefined), dispatchImport: vi.fn(async () => undefined), dispatchWebhookDeliveries: vi.fn(async () => undefined) }));

async function total(db: Database, table: typeof schema.tasks | typeof schema.taskEvents | typeof schema.taskDependencies | typeof schema.projects | typeof schema.users | typeof schema.workspaces) {
  const [row] = await db.select({ n: count() }).from(table);
  return Number(row.n);
}

describe("seed builders on PGlite", () => {
  let db: Database;
  beforeAll(async () => {
    ({ db } = await createTestDb());
  });

  it("random numbers are reproducible", () => {
    const a = rng(3);
    const b = rng(3);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("writes a scaled reference dataset with the expected shape, then resets it", async () => {
    const summary = await seedReference(db, { scale: 0.01, today: new Date("2026-11-05T00:00:00Z") });
    expect(summary).toMatchObject({ workspaces: 3, users: 6, projects: 3, tasks: 100 + 3 + 3, dependencies: 20, fields: 3, events: 1000 });
    expect(await total(db, schema.tasks)).toBe(summary.tasks);
    expect(await total(db, schema.taskEvents)).toBe(summary.events);
    expect(await total(db, schema.taskDependencies)).toBe(summary.dependencies);
    expect(await referenceExists(db)).toBe(true);
    // The big project is readable through the query engine with numbers assigned explicitly.
    const [ws] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.slug, "seed-1"));
    const [big] = await db.select().from(schema.projects).where(eq(schema.projects.key, "P1"));
    expect(big.nextTaskNumber).toBe(101);
    const [owner] = await db.select({ userId: schema.workspaceMembers.userId }).from(schema.workspaceMembers).where(eq(schema.workspaceMembers.workspaceId, ws.id)).limit(1);
    const res = await queryProjectTasks({ db, actor: { userId: owner.userId, workspaceId: ws.id, workspaceRole: "owner" } }, big.id, { ...defaultViewSpec(), showCompleted: "all", subtasks: "flat" }, "2026-11-05");
    expect(res.rows.length).toBe(100);
    expect(res.rows.some((r) => Object.keys(r.customFields).length > 0)).toBe(true);
    expect(res.rows.some((r) => r.tags.length > 0)).toBe(true);
    expect(res.rows.some((r) => r.blockedByCount > 0)).toBe(true);
    await resetReference(db);
    expect(await referenceExists(db)).toBe(false);
    expect(await total(db, schema.tasks)).toBe(0);
    expect(await total(db, schema.users)).toBe(0);
  });

  it("seeds the beta workspace once and links placeholder members by email on sign in", async () => {
    const roster = rosterWithEmails({ spencer: "owner@example.com", Jenny: "Jenny@Example.com" });
    expect(roster[0].email).toBe("owner@example.com");
    expect(roster[1].email).toBe("jenny@example.com");
    expect(roster[2].email).toBe(defaultBetaRoster[2].email);
    const first = await seedBeta(db, { roster, today: "2026-11-05" });
    expect(first).toMatchObject({ slug: "taskparty", members: 10, created: true });
    const again = await seedBeta(db, { roster, today: "2026-11-05" });
    expect(again).toMatchObject({ members: 10, created: false, projectId: first.projectId });
    expect(await total(db, schema.projects)).toBe(1);
    const [pending] = await db.select({ n: count() }).from(schema.users).where(like(schema.users.clerkUserId, "pending:%"));
    expect(Number(pending.n)).toBe(10);
    const [events] = await db.select({ n: count() }).from(schema.taskEvents);
    expect(Number(events.n)).toBeGreaterThanOrEqual(5);

    // Spencer signs in with Clerk: the placeholder row is claimed, the membership and ownership stay.
    const linked = await upsertUser(db, { clerkUserId: "user_clerk_spencer", email: "owner@example.com", displayName: "Spencer Townley", avatarUrl: "https://img.example/s.png" });
    expect(linked.clerkUserId).toBe("user_clerk_spencer");
    const resolved = await resolveActor(db, "user_clerk_spencer", "taskparty");
    expect(resolved?.actor.workspaceRole).toBe("owner");
    const [pendingAfter] = await db.select({ n: count() }).from(schema.users).where(like(schema.users.clerkUserId, "pending:%"));
    expect(Number(pendingAfter.n)).toBe(9);
    // A new address that matches nobody is inserted as usual.
    const fresh = await upsertUser(db, { clerkUserId: "user_clerk_new", email: "new@example.com", displayName: "New", avatarUrl: null });
    expect(fresh.clerkUserId).toBe("user_clerk_new");
  });
});
