import { createHmac, randomBytes } from "node:crypto";
import { and, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { schema, type Database } from "@/lib/db/client";
import { assertCan, type Actor } from "@/lib/auth/permissions";
import { type ServiceContext, NotFoundError, ValidationError } from "./context";
import { getTaskDetail } from "./tasks";
import { createNotifications } from "./notifications";
import { taskObject } from "@/lib/api/serialize";
import type { CreateWebhookInput, UpdateWebhookInput } from "@/lib/validation/webhooks";
import { signPayload, RETRY_DELAYS_SECONDS, MAX_ATTEMPTS, DISABLE_AFTER_FAILURES, DELIVERY_TIMEOUT_MS } from "@/lib/webhooks/sign";

/*
  Outbound webhooks (docs/12 section 2). Registration is an admin action; fan out happens from the task event job,
  never from a mutation; delivery runs in the Inngest function `deliver-webhook` which calls `attemptDelivery`.
*/

export const MAX_WEBHOOKS_PER_WORKSPACE = 50;

export type WebhookRecord = {
  id: string;
  url: string;
  events: string[];
  projectId: string | null;
  isEnabled: boolean;
  failureCount: number;
  createdBy: string;
  createdAt: string;
  lastDelivery: { status: string; createdAt: string; responseCode: number | null } | null;
};

export type DeliveryRecord = {
  id: number;
  webhookId: string;
  eventType: string;
  status: "pending" | "delivered" | "failed" | "disabled";
  attempts: number;
  lastResponseCode: number | null;
  lastError: string | null;
  nextAttemptAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  payload: unknown;
};

function toRecord(w: typeof schema.webhooks.$inferSelect, last: WebhookRecord["lastDelivery"] = null): WebhookRecord {
  return { id: w.id, url: w.url, events: w.events, projectId: w.projectId, isEnabled: w.isEnabled, failureCount: w.failureCount, createdBy: w.createdBy, createdAt: w.createdAt.toISOString(), lastDelivery: last };
}

function toDelivery(d: typeof schema.webhookDeliveries.$inferSelect): DeliveryRecord {
  return { id: d.id, webhookId: d.webhookId, eventType: d.eventType, status: d.status, attempts: d.attempts, lastResponseCode: d.lastResponseCode, lastError: d.lastError, nextAttemptAt: d.nextAttemptAt?.toISOString() ?? null, deliveredAt: d.deliveredAt?.toISOString() ?? null, createdAt: d.createdAt.toISOString(), payload: d.payload };
}

/** Per webhook secret: random bytes mixed with the deployment salt so a leaked database alone does not reveal it. */
export function generateWebhookSecret(): string {
  const salt = process.env.WEBHOOK_SIGNING_SALT ?? "dev-salt";
  return `whsec_${createHmac("sha256", salt).update(randomBytes(32)).digest("hex")}`;
}

export async function listWebhooks(ctx: ServiceContext): Promise<WebhookRecord[]> {
  const { db, actor } = ctx;
  assertCan(actor, "workspace.manage_integrations");
  const rows = await db.select().from(schema.webhooks).where(and(eq(schema.webhooks.workspaceId, actor.workspaceId), isNull(schema.webhooks.deletedAt))).orderBy(desc(schema.webhooks.createdAt));
  if (rows.length === 0) return [];
  const latest = await db
    .select({ webhookId: schema.webhookDeliveries.webhookId, status: schema.webhookDeliveries.status, createdAt: schema.webhookDeliveries.createdAt, responseCode: schema.webhookDeliveries.lastResponseCode })
    .from(schema.webhookDeliveries)
    .where(inArray(schema.webhookDeliveries.webhookId, rows.map((r) => r.id)))
    .orderBy(desc(schema.webhookDeliveries.createdAt))
    .limit(rows.length * 5);
  const byHook = new Map<string, WebhookRecord["lastDelivery"]>();
  for (const l of latest) if (!byHook.has(l.webhookId)) byHook.set(l.webhookId, { status: l.status, createdAt: l.createdAt.toISOString(), responseCode: l.responseCode });
  return rows.map((r) => toRecord(r, byHook.get(r.id) ?? null));
}

/** Creates a webhook and returns its secret once. */
export async function createWebhook(ctx: ServiceContext, input: CreateWebhookInput): Promise<{ webhook: WebhookRecord; secret: string }> {
  const { db, actor } = ctx;
  assertCan(actor, "workspace.manage_integrations");
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.webhooks).where(and(eq(schema.webhooks.workspaceId, actor.workspaceId), isNull(schema.webhooks.deletedAt)));
  if (count >= MAX_WEBHOOKS_PER_WORKSPACE) throw new ValidationError(`A workspace can have up to ${MAX_WEBHOOKS_PER_WORKSPACE} webhooks`);
  if (input.projectId) {
    const [p] = await db.select({ id: schema.projects.id }).from(schema.projects).where(and(eq(schema.projects.id, input.projectId), eq(schema.projects.workspaceId, actor.workspaceId), isNull(schema.projects.deletedAt)));
    if (!p) throw new NotFoundError("Project");
  }
  const secret = generateWebhookSecret();
  const [row] = await db.insert(schema.webhooks).values({ workspaceId: actor.workspaceId, projectId: input.projectId, url: input.url, secret, events: input.events, createdBy: actor.userId }).returning();
  console.info("[audit] webhook.created", { workspaceId: actor.workspaceId, actorId: actor.userId, webhookId: row.id });
  return { webhook: toRecord(row), secret };
}

export async function updateWebhook(ctx: ServiceContext, input: UpdateWebhookInput): Promise<WebhookRecord> {
  const { db, actor } = ctx;
  assertCan(actor, "workspace.manage_integrations");
  const { id, ...patch } = input;
  const set: Partial<typeof schema.webhooks.$inferInsert> = {};
  if (patch.url !== undefined) set.url = patch.url;
  if (patch.events !== undefined) set.events = patch.events;
  if (patch.projectId !== undefined) set.projectId = patch.projectId;
  if (patch.isEnabled !== undefined) {
    set.isEnabled = patch.isEnabled;
    if (patch.isEnabled) set.failureCount = 0;
  }
  const [row] = await db
    .update(schema.webhooks)
    .set(set)
    .where(and(eq(schema.webhooks.id, id), eq(schema.webhooks.workspaceId, actor.workspaceId), isNull(schema.webhooks.deletedAt)))
    .returning();
  if (!row) throw new NotFoundError("Webhook");
  console.info("[audit] webhook.updated", { workspaceId: actor.workspaceId, actorId: actor.userId, webhookId: row.id });
  return toRecord(row);
}

export async function deleteWebhook(ctx: ServiceContext, id: string): Promise<void> {
  const { db, actor } = ctx;
  assertCan(actor, "workspace.manage_integrations");
  const [row] = await db
    .update(schema.webhooks)
    .set({ deletedAt: sql`now()`, isEnabled: false })
    .where(and(eq(schema.webhooks.id, id), eq(schema.webhooks.workspaceId, actor.workspaceId), isNull(schema.webhooks.deletedAt)))
    .returning();
  if (!row) throw new NotFoundError("Webhook");
  console.info("[audit] webhook.deleted", { workspaceId: actor.workspaceId, actorId: actor.userId, webhookId: row.id });
}

async function ownedWebhook(ctx: ServiceContext, id: string) {
  const [row] = await ctx.db.select().from(schema.webhooks).where(and(eq(schema.webhooks.id, id), eq(schema.webhooks.workspaceId, ctx.actor.workspaceId), isNull(schema.webhooks.deletedAt)));
  if (!row) throw new NotFoundError("Webhook");
  return row;
}

export async function listDeliveries(ctx: ServiceContext, webhookId: string, options: { limit?: number; before?: number | null } = {}): Promise<{ data: DeliveryRecord[]; hasMore: boolean }> {
  const { db, actor } = ctx;
  assertCan(actor, "workspace.manage_integrations");
  await ownedWebhook(ctx, webhookId);
  const limit = Math.min(200, Math.max(1, options.limit ?? 50));
  const rows = await db
    .select()
    .from(schema.webhookDeliveries)
    .where(and(eq(schema.webhookDeliveries.webhookId, webhookId), ...(options.before ? [lt(schema.webhookDeliveries.id, options.before)] : [])))
    .orderBy(desc(schema.webhookDeliveries.id))
    .limit(limit + 1);
  return { data: rows.slice(0, limit).map(toDelivery), hasMore: rows.length > limit };
}

/** Queues a copy of a past delivery and asks Inngest to send it. */
export async function replayDelivery(ctx: ServiceContext, webhookId: string, deliveryId: number): Promise<DeliveryRecord> {
  const { db, actor } = ctx;
  assertCan(actor, "workspace.manage_integrations");
  await ownedWebhook(ctx, webhookId);
  const [original] = await db.select().from(schema.webhookDeliveries).where(and(eq(schema.webhookDeliveries.id, deliveryId), eq(schema.webhookDeliveries.webhookId, webhookId)));
  if (!original) throw new NotFoundError("Delivery");
  const [copy] = await db.insert(schema.webhookDeliveries).values({ webhookId, eventType: original.eventType, payload: original.payload, status: "pending", nextAttemptAt: sql`now()` }).returning();
  const { dispatchWebhookDeliveries } = await import("@/lib/events/dispatch");
  await dispatchWebhookDeliveries([copy.id]);
  return toDelivery(copy);
}

export type WebhookPayload = {
  id: string;
  type: string;
  createdAt: string;
  workspaceId: string;
  projectId: string | null;
  actor: { type: "user" | "automation" | "system"; id: string | null; displayName: string | null };
  data: Record<string, unknown>;
};

/**
 * Finds the webhooks subscribed to a task event and queues one delivery per webhook. Returns the delivery ids so the
 * caller can hand them to Inngest. Called from the task event job, so this runs after the commit.
 */
export async function fanOutTaskEvent(db: Database, event: typeof schema.taskEvents.$inferSelect, links: { appUrl: string; workspaceSlug: string }): Promise<number[]> {
  const hooks = await db
    .select()
    .from(schema.webhooks)
    .where(and(eq(schema.webhooks.workspaceId, event.workspaceId), eq(schema.webhooks.isEnabled, true), isNull(schema.webhooks.deletedAt), or(isNull(schema.webhooks.projectId), eq(schema.webhooks.projectId, event.projectId)), sql`${event.type} = any(${schema.webhooks.events})`));
  if (hooks.length === 0) return [];
  const [actorRow] = event.actorId ? await db.select({ id: schema.users.id, displayName: schema.users.displayName }).from(schema.users).where(eq(schema.users.id, event.actorId)) : [];
  const actor: Actor = { userId: event.actorId ?? hooks[0].createdBy, workspaceId: event.workspaceId, workspaceRole: "admin" };
  let task: Record<string, unknown> | null = null;
  try {
    const detail = await getTaskDetail({ db, actor }, event.taskId, new Date().toISOString().slice(0, 10));
    task = taskObject(detail.task, links, { description: detail.description }) as unknown as Record<string, unknown>;
  } catch {
    task = { id: event.taskId, deleted: true };
  }
  const payload: WebhookPayload = {
    id: `evt_${event.id}`,
    type: event.type,
    createdAt: event.createdAt.toISOString(),
    workspaceId: event.workspaceId,
    projectId: event.projectId,
    actor: event.automationId ? { type: "automation", id: event.automationId, displayName: null } : actorRow ? { type: "user", id: actorRow.id, displayName: actorRow.displayName } : { type: "system", id: null, displayName: null },
    data: { task, ...(event.field ? { changes: { [event.field]: { before: event.before, after: event.after } } } : event.after !== null && event.after !== undefined ? { detail: event.after } : {}) },
  };
  const rows = await db
    .insert(schema.webhookDeliveries)
    .values(hooks.map((h) => ({ webhookId: h.id, eventType: event.type, payload, status: "pending" as const, nextAttemptAt: new Date() })))
    .returning({ id: schema.webhookDeliveries.id });
  return rows.map((r) => r.id);
}

export type AttemptResult = { status: "delivered" | "retry" | "failed" | "skipped"; retryInSeconds?: number; responseCode?: number | null };
export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ status: number; text: () => Promise<string> }>;

/**
 * One delivery attempt: signs and posts the payload with a 10 second timeout. Success is any 2xx. Failures schedule
 * the next attempt per the retry table; after the last attempt the delivery fails. Twenty consecutive failed
 * deliveries disable the webhook and notify the admins.
 */
export async function attemptDelivery(db: Database, deliveryId: number, fetchImpl: FetchLike = fetch as unknown as FetchLike, now = new Date()): Promise<AttemptResult> {
  const [delivery] = await db.select().from(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.id, deliveryId));
  if (!delivery || delivery.status === "delivered") return { status: "skipped" };
  const [hook] = await db.select().from(schema.webhooks).where(eq(schema.webhooks.id, delivery.webhookId));
  if (!hook || !hook.isEnabled || hook.deletedAt) {
    await db.update(schema.webhookDeliveries).set({ status: "disabled" }).where(eq(schema.webhookDeliveries.id, deliveryId));
    return { status: "skipped" };
  }
  const payload = delivery.payload as WebhookPayload;
  const body = JSON.stringify(toWire(payload));
  const timestamp = String(Math.floor(now.getTime() / 1000));
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "user-agent": "TaskParty-Webhooks/1.0",
    "x-taskparty-event": delivery.eventType,
    "x-taskparty-delivery": String(delivery.id),
    "x-taskparty-timestamp": timestamp,
    "x-taskparty-signature": signPayload(hook.secret, timestamp, body),
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
  let responseCode: number | null = null;
  let error: string | null = null;
  try {
    const res = await fetchImpl(hook.url, { method: "POST", headers, body, signal: controller.signal });
    responseCode = res.status;
    if (res.status < 200 || res.status >= 300) error = `HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 500)}`;
  } catch (e) {
    error = (e as Error).name === "AbortError" ? "Timed out after 10 seconds" : (e as Error).message.slice(0, 500);
  } finally {
    clearTimeout(timer);
  }
  const attempts = delivery.attempts + 1;
  if (!error) {
    await db.update(schema.webhookDeliveries).set({ status: "delivered", attempts, lastResponseCode: responseCode, lastError: null, deliveredAt: now, nextAttemptAt: null }).where(eq(schema.webhookDeliveries.id, deliveryId));
    await db.update(schema.webhooks).set({ failureCount: 0 }).where(eq(schema.webhooks.id, hook.id));
    return { status: "delivered", responseCode };
  }
  if (attempts < MAX_ATTEMPTS) {
    const retryInSeconds = RETRY_DELAYS_SECONDS[attempts - 1];
    await db.update(schema.webhookDeliveries).set({ status: "pending", attempts, lastResponseCode: responseCode, lastError: error, nextAttemptAt: new Date(now.getTime() + retryInSeconds * 1000) }).where(eq(schema.webhookDeliveries.id, deliveryId));
    return { status: "retry", retryInSeconds, responseCode };
  }
  await db.update(schema.webhookDeliveries).set({ status: "failed", attempts, lastResponseCode: responseCode, lastError: error, nextAttemptAt: null }).where(eq(schema.webhookDeliveries.id, deliveryId));
  const [updated] = await db.update(schema.webhooks).set({ failureCount: sql`${schema.webhooks.failureCount} + 1` }).where(eq(schema.webhooks.id, hook.id)).returning({ failureCount: schema.webhooks.failureCount });
  if (updated.failureCount >= DISABLE_AFTER_FAILURES) await disableWebhook(db, hook);
  return { status: "failed", responseCode };
}

async function disableWebhook(db: Database, hook: typeof schema.webhooks.$inferSelect) {
  await db.update(schema.webhooks).set({ isEnabled: false }).where(eq(schema.webhooks.id, hook.id));
  await db.update(schema.webhookDeliveries).set({ status: "disabled" }).where(and(eq(schema.webhookDeliveries.webhookId, hook.id), eq(schema.webhookDeliveries.status, "pending")));
  const admins = await db.select({ userId: schema.workspaceMembers.userId }).from(schema.workspaceMembers).where(and(eq(schema.workspaceMembers.workspaceId, hook.workspaceId), inArray(schema.workspaceMembers.role, ["owner", "admin"])));
  await createNotifications({ db }, admins.map((a) => ({ workspaceId: hook.workspaceId, userId: a.userId, type: "webhook_disabled", projectId: hook.projectId, payload: { webhookId: hook.id, url: hook.url } })));
  console.warn("[webhooks] disabled after repeated failures", { webhookId: hook.id, workspaceId: hook.workspaceId });
}

/** Keeps the delivery log to 30 days (docs/12 section 2.4). */
export async function pruneDeliveries(db: Database, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  const rows = await db.delete(schema.webhookDeliveries).where(and(lt(schema.webhookDeliveries.createdAt, cutoff), or(eq(schema.webhookDeliveries.status, "delivered"), eq(schema.webhookDeliveries.status, "failed"), eq(schema.webhookDeliveries.status, "disabled")))).returning({ id: schema.webhookDeliveries.id });
  return rows.length;
}

/** Deliveries still pending whose time has come (a safety net for jobs lost before Inngest picked them up). */
export async function duePendingDeliveries(db: Database, now = new Date(), limit = 200): Promise<number[]> {
  const rows = await db
    .select({ id: schema.webhookDeliveries.id })
    .from(schema.webhookDeliveries)
    .where(and(eq(schema.webhookDeliveries.status, "pending"), lt(schema.webhookDeliveries.nextAttemptAt, new Date(now.getTime() - 15 * 60_000)), gt(schema.webhookDeliveries.createdAt, new Date(now.getTime() - 3 * 24 * 3600 * 1000))))
    .limit(limit);
  return rows.map((r) => r.id);
}

function toWire(payload: WebhookPayload) {
  // Same conversion as the REST API so receivers see one format.
  const { toSnake } = snakeModule;
  return toSnake(payload);
}

// Lazy require keeps lib/api/shape free of a circular import at module load.
import * as snakeModule from "@/lib/api/shape";
