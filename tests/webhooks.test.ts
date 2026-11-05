import { describe, it, expect, beforeAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./helpers/pglite";
import { schema, type Database } from "@/lib/db/client";
import type { Actor } from "@/lib/auth/permissions";
import { upsertUser, upsertWorkspace, upsertMembership, resolveActor } from "@/lib/services/workspaces";
import { createProject } from "@/lib/services/projects";
import { createTask, updateTask } from "@/lib/services/tasks";
import { listNotifications } from "@/lib/services/notifications";
import { createWebhook, listWebhooks, updateWebhook, deleteWebhook, fanOutTaskEvent, attemptDelivery, listDeliveries, replayDelivery, pruneDeliveries, duePendingDeliveries, type FetchLike } from "@/lib/services/webhooks";
import { verifySignature, DISABLE_AFTER_FAILURES } from "@/lib/webhooks/sign";

vi.mock("@/lib/events/dispatch", () => ({ dispatchAfterCommit: vi.fn(async () => undefined), dispatchImport: vi.fn(async () => undefined), dispatchWebhookDeliveries: vi.fn(async () => undefined) }));

const links = { appUrl: "http://localhost:3000", workspaceSlug: "hooks" };

describe("outbound webhooks on PGlite", () => {
  let db: Database;
  let owner: Actor;
  let projectId: string;
  let webhookId: string;
  let secret: string;
  let taskId: string;

  beforeAll(async () => {
    ({ db } = await createTestDb());
    await upsertUser(db, { clerkUserId: "user_hooks", email: "hooks@example.com", displayName: "Hook Owner", avatarUrl: null });
    await upsertUser(db, { clerkUserId: "user_hooks_member", email: "member@example.com", displayName: "Member", avatarUrl: null });
    await upsertWorkspace(db, { clerkOrgId: "org_hooks", slug: "hooks", name: "Hooks", logoUrl: null });
    await upsertMembership(db, "org_hooks", "user_hooks", "org:owner");
    await upsertMembership(db, "org_hooks", "user_hooks_member", "org:member");
    owner = (await resolveActor(db, "user_hooks", "hooks"))!.actor;
    projectId = (await createProject({ db, actor: owner }, { name: "Hooked", key: "HK", color: "blue", privacy: "workspace", workflowTemplate: "simple" }, "2026-11-05")).id;
  });

  it("registers webhooks for admins only and returns the secret once", async () => {
    const created = await createWebhook({ db, actor: owner }, { url: "https://example.com/hook", events: ["task.created", "task.status_changed"], projectId: null });
    webhookId = created.webhook.id;
    secret = created.secret;
    expect(secret).toMatch(/^whsec_[0-9a-f]{64}$/);
    const list = await listWebhooks({ db, actor: owner });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ url: "https://example.com/hook", isEnabled: true, failureCount: 0, lastDelivery: null });
    expect(JSON.stringify(list[0])).not.toContain(secret);
    const member = (await resolveActor(db, "user_hooks_member", "hooks"))!.actor;
    await expect(createWebhook({ db, actor: member }, { url: "https://example.com/x", events: ["task.created"], projectId: null })).rejects.toThrow();
    await expect(createWebhook({ db, actor: owner }, { url: "https://example.com/x", events: ["task.created"], projectId: "00000000-0000-0000-0000-000000000000" })).rejects.toThrow(/not found/);
  });

  it("fans out subscribed task events into signed deliveries", async () => {
    const task = await createTask({ db, actor: owner }, { projectId, title: "Hooked task" });
    taskId = task.id;
    const events = await db.select().from(schema.taskEvents).where(eq(schema.taskEvents.taskId, task.id));
    const created = events.find((e) => e.type === "task.created")!;
    const ids = await fanOutTaskEvent(db, created, links);
    expect(ids).toHaveLength(1);
    const posts: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
    const okFetch: FetchLike = async (url, init) => {
      posts.push({ url, headers: init.headers, body: init.body });
      return { status: 200, text: async () => "ok" };
    };
    const now = new Date("2026-11-05T12:00:00Z");
    const result = await attemptDelivery(db, ids[0], okFetch, now);
    expect(result).toEqual({ status: "delivered", responseCode: 200 });
    expect(posts).toHaveLength(1);
    const { headers, body } = posts[0];
    expect(headers["x-taskparty-event"]).toBe("task.created");
    expect(headers["x-taskparty-delivery"]).toBe(String(ids[0]));
    expect(verifySignature(secret, headers["x-taskparty-timestamp"], body, headers["x-taskparty-signature"], now.getTime())).toBe(true);
    const payload = JSON.parse(body);
    expect(payload).toMatchObject({ id: `evt_${created.id}`, type: "task.created", project_id: projectId, actor: { type: "user", display_name: "Hook Owner" } });
    expect(payload.data.task).toMatchObject({ id: task.id, key: "HK-1", title: "Hooked task", url: expect.stringContaining("/w/hooks/projects/HK/tasks/HK-1") });
    const { data } = await listDeliveries({ db, actor: owner }, webhookId);
    expect(data[0]).toMatchObject({ status: "delivered", attempts: 1, lastResponseCode: 200 });
    expect((await listWebhooks({ db, actor: owner }))[0].lastDelivery?.status).toBe("delivered");

    // Unsubscribed types and other projects produce nothing.
    const assigned = { ...created, id: created.id + 1000, type: "task.assigned" };
    expect(await fanOutTaskEvent(db, assigned, links)).toEqual([]);
  });

  it("retries on failure with the documented schedule and records the error", async () => {
    const done = (await db.select().from(schema.statuses)).find((s) => s.category === "done")!;
    await updateTask({ db, actor: owner }, { id: taskId, statusId: done.id });
    const events = await db.select().from(schema.taskEvents).where(eq(schema.taskEvents.taskId, taskId));
    const changed = events.find((e) => e.type === "task.status_changed")!;
    const [id] = await fanOutTaskEvent(db, changed, links);
    const failing: FetchLike = async () => ({ status: 503, text: async () => "down" });
    const now = new Date("2026-11-05T12:00:00Z");
    const first = await attemptDelivery(db, id, failing, now);
    expect(first).toEqual({ status: "retry", retryInSeconds: 60, responseCode: 503 });
    let [row] = await db.select().from(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.id, id));
    expect(row).toMatchObject({ status: "pending", attempts: 1, lastResponseCode: 503, lastError: "HTTP 503: down" });
    expect(row.nextAttemptAt?.toISOString()).toBe("2026-11-05T12:01:00.000Z");
    const throwing: FetchLike = async () => {
      throw new Error("connect ECONNREFUSED");
    };
    expect((await attemptDelivery(db, id, throwing, now)).retryInSeconds).toBe(300);
    for (let i = 0; i < 3; i += 1) await attemptDelivery(db, id, failing, now);
    const last = await attemptDelivery(db, id, failing, now);
    expect(last.status).toBe("failed");
    [row] = await db.select().from(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.id, id));
    expect(row).toMatchObject({ status: "failed", attempts: 6 });
    expect((await listWebhooks({ db, actor: owner }))[0].failureCount).toBe(1);
    // A later success resets the streak.
    const [again] = await fanOutTaskEvent(db, changed, links);
    await attemptDelivery(db, again, async () => ({ status: 204, text: async () => "" }), now);
    expect((await listWebhooks({ db, actor: owner }))[0].failureCount).toBe(0);
  });

  it("disables the webhook after twenty failed deliveries and notifies admins", async () => {
    const events = await db.select().from(schema.taskEvents).where(eq(schema.taskEvents.taskId, taskId));
    const created = events.find((e) => e.type === "task.created")!;
    const failing: FetchLike = async () => ({ status: 500, text: async () => "" });
    for (let i = 0; i < DISABLE_AFTER_FAILURES; i += 1) {
      const [id] = await fanOutTaskEvent(db, created, links);
      for (let a = 0; a < 6; a += 1) await attemptDelivery(db, id, failing);
    }
    const [hook] = await listWebhooks({ db, actor: owner });
    expect(hook.isEnabled).toBe(false);
    expect(hook.failureCount).toBe(DISABLE_AFTER_FAILURES);
    const inbox = await listNotifications({ db, actor: owner }, "all");
    expect(inbox.some((n) => n.type === "webhook_disabled")).toBe(true);
    // Disabled hooks receive nothing and skip queued deliveries.
    expect(await fanOutTaskEvent(db, created, links)).toEqual([]);
    const enabled = await updateWebhook({ db, actor: owner }, { id: webhookId, isEnabled: true });
    expect(enabled).toMatchObject({ isEnabled: true, failureCount: 0 });
  });

  it("replays, lists with paging, prunes old rows, and finds overdue pending deliveries", async () => {
    const { data: page } = await listDeliveries({ db, actor: owner }, webhookId, { limit: 2 });
    expect(page).toHaveLength(2);
    const replayed = await replayDelivery({ db, actor: owner }, webhookId, page[0].id);
    expect(replayed).toMatchObject({ status: "pending", attempts: 0, eventType: page[0].eventType });
    const older = await listDeliveries({ db, actor: owner }, webhookId, { limit: 2, before: page[1].id });
    expect(older.data.every((d) => d.id < page[1].id)).toBe(true);
    await db.update(schema.webhookDeliveries).set({ createdAt: new Date("2026-09-01T00:00:00Z") }).where(eq(schema.webhookDeliveries.id, page[1].id));
    expect(await pruneDeliveries(db, new Date("2026-11-05T00:00:00Z"))).toBeGreaterThanOrEqual(1);
    await db.update(schema.webhookDeliveries).set({ nextAttemptAt: new Date("2026-11-05T00:00:00Z") }).where(eq(schema.webhookDeliveries.id, replayed.id));
    expect(await duePendingDeliveries(db, new Date("2026-11-05T01:00:00Z"))).toContain(replayed.id);
    await deleteWebhook({ db, actor: owner }, webhookId);
    expect(await listWebhooks({ db, actor: owner })).toHaveLength(0);
    await expect(listDeliveries({ db, actor: owner }, webhookId)).rejects.toThrow(/not found/);
  });
});
