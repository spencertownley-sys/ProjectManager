import { eq, and, inArray, isNull, ne } from "drizzle-orm";
import { inngest, taskEventOccurred, csvImportRequested, webhookDeliveryRequested } from "./client";
import { runImportBatch, failImport, IMPORT_BATCH_SIZE } from "@/lib/services/imports";
import { fanOutTaskEvent, attemptDelivery, pruneDeliveries, duePendingDeliveries } from "@/lib/services/webhooks";
import { dispatchWebhookDeliveries } from "@/lib/events/dispatch";
import { MAX_ATTEMPTS } from "@/lib/webhooks/sign";
import { getDb, schema } from "@/lib/db/client";
import { createNotifications } from "@/lib/services/notifications";

/**
 * Turns task events into notifications. Automations and webhook delivery attach here in phase 2.
 * Rules: assignment notifies the assignee; mentions notify the mentioned users; comments notify
 * followers other than the author; completing a predecessor notifies assignees of unblocked successors.
 */
export const processTaskEvent = inngest.createFunction(
  { id: "process-task-event", retries: 3, triggers: [taskEventOccurred] },
  async ({ event, step }) => {
    const { eventId } = event.data;
    const db = getDb();
    const row = await step.run("load-event", async () => {
      const [e] = await db.select().from(schema.taskEvents).where(eq(schema.taskEvents.id, eventId));
      return e ?? null;
    });
    if (!row) return { skipped: "missing event" };

    // Outbound webhooks subscribed to this event type get one delivery each (docs/12 section 2).
    await step.run("fan-out-webhooks", async () => {
      // Reloaded here because step outputs are JSON (dates become strings).
      const [fresh] = await db.select().from(schema.taskEvents).where(eq(schema.taskEvents.id, eventId));
      if (!fresh) return 0;
      const [ws] = await db.select({ slug: schema.workspaces.slug }).from(schema.workspaces).where(eq(schema.workspaces.id, fresh.workspaceId));
      const ids = await fanOutTaskEvent(db, fresh, { appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000", workspaceSlug: ws?.slug ?? "" });
      await dispatchWebhookDeliveries(ids);
      return ids.length;
    });

    const recipients: Array<{ userId: string; type: string; payload?: Record<string, unknown> }> = [];
    const [task] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, row.taskId));
    if (!task) return { skipped: "missing task" };

    switch (row.type) {
      case "task.assigned": {
        const assignee = row.after as string | null;
        if (assignee && assignee !== row.actorId) recipients.push({ userId: assignee, type: "assigned" });
        break;
      }
      case "comment.created": {
        const after = (row.after ?? {}) as { mentions?: string[]; excerpt?: string; commentId?: string };
        const followers = await db.select({ userId: schema.taskFollowers.userId }).from(schema.taskFollowers).where(eq(schema.taskFollowers.taskId, task.id));
        const mentioned = new Set(after.mentions ?? []);
        for (const m of mentioned) if (m !== row.actorId) recipients.push({ userId: m, type: "mention", payload: { excerpt: after.excerpt, commentId: after.commentId } });
        for (const f of followers) if (f.userId !== row.actorId && !mentioned.has(f.userId)) recipients.push({ userId: f.userId, type: "comment", payload: { excerpt: after.excerpt, commentId: after.commentId } });
        break;
      }
      case "task.completed": {
        const successors = await db
          .select({ id: schema.tasks.id, assigneeId: schema.tasks.assigneeId, predecessorId: schema.taskDependencies.predecessorId })
          .from(schema.taskDependencies)
          .innerJoin(schema.tasks, eq(schema.tasks.id, schema.taskDependencies.successorId))
          .where(and(eq(schema.taskDependencies.predecessorId, task.id), isNull(schema.tasks.completedAt)));
        for (const s of successors) {
          if (!s.assigneeId) continue;
          const remaining = await db
            .select({ id: schema.taskDependencies.id })
            .from(schema.taskDependencies)
            .innerJoin(schema.tasks, eq(schema.tasks.id, schema.taskDependencies.predecessorId))
            .where(and(eq(schema.taskDependencies.successorId, s.id), isNull(schema.tasks.completedAt), ne(schema.tasks.id, task.id)));
          if (remaining.length === 0) recipients.push({ userId: s.assigneeId, type: "dependency_unblocked", payload: { unblockedTaskId: s.id } });
        }
        break;
      }
      case "task.status_changed":
      case "task.dates_changed": {
        const followers = await db.select({ userId: schema.taskFollowers.userId }).from(schema.taskFollowers).where(eq(schema.taskFollowers.taskId, task.id));
        for (const f of followers) if (f.userId !== row.actorId && f.userId !== task.assigneeId) recipients.push({ userId: f.userId, type: "update", payload: { field: row.field, before: row.before, after: row.after } });
        break;
      }
      default:
        break;
    }

    if (recipients.length === 0) return { notified: 0 };

    // Respect in-app preferences; absence of a row means enabled.
    const prefs = await db
      .select()
      .from(schema.notificationPreferences)
      .where(and(eq(schema.notificationPreferences.workspaceId, row.workspaceId), eq(schema.notificationPreferences.channel, "in_app"), inArray(schema.notificationPreferences.userId, recipients.map((r) => r.userId))));
    const disabled = new Set(prefs.filter((p) => !p.enabled).map((p) => `${p.userId}:${p.type}`));
    const rows = recipients
      .filter((r) => !disabled.has(`${r.userId}:${r.type}`))
      .map((r) => ({ workspaceId: row.workspaceId, userId: r.userId, type: r.type, taskId: task.id, projectId: task.projectId, actorId: row.actorId, payload: { ...r.payload, eventType: row.type, taskTitle: task.title } }));
    await step.run("write-notifications", () => createNotifications({ db }, rows));
    return { notified: rows.length };
  },
);

/**
 * Runs a CSV import in batches (docs/16 step 1.17). Each batch is a durable step, so a retry resumes from the
 * recorded progress instead of creating duplicate tasks.
 */
export const importCsv = inngest.createFunction(
  { id: "import-csv", retries: 2, triggers: [csvImportRequested], onFailure: async ({ event }) => failImport(getDb(), event.data.event.data.importId, "The import stopped after repeated errors") },
  async ({ event, step }) => {
    const { importId } = event.data;
    const db = getDb();
    for (let batch = 0; batch < 1000; batch += 1) {
      const result = await step.run(`batch-${batch}`, () => runImportBatch(db, importId, IMPORT_BATCH_SIZE));
      if (result.done) return { processed: result.processed };
    }
    return { processed: "limit" };
  },
);

/**
 * Delivers one webhook payload with the documented retry schedule (docs/12 section 2.4). Each attempt is a durable
 * step and the waits between attempts are durable sleeps, so a redeploy does not lose or duplicate a delivery.
 */
export const deliverWebhook = inngest.createFunction(
  { id: "deliver-webhook", retries: 0, triggers: [webhookDeliveryRequested] },
  async ({ event, step }) => {
    const { deliveryId } = event.data;
    const db = getDb();
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const result = await step.run(`attempt-${attempt + 1}`, () => attemptDelivery(db, deliveryId));
      if (result.status !== "retry" || !result.retryInSeconds) return result;
      await step.sleep(`wait-${attempt + 1}`, `${result.retryInSeconds}s`);
    }
    return { status: "failed" };
  },
);

/** Daily housekeeping: drop deliveries older than 30 days and re-queue pending ones Inngest never picked up. */
export const webhookHousekeeping = inngest.createFunction(
  { id: "webhook-housekeeping", retries: 1, triggers: [{ cron: "15 3 * * *" }] },
  async ({ step }) => {
    const db = getDb();
    const pruned = await step.run("prune", () => pruneDeliveries(db));
    const due = await step.run("find-due", () => duePendingDeliveries(db));
    await step.run("requeue", () => dispatchWebhookDeliveries(due));
    return { pruned, requeued: due.length };
  },
);

export const functions = [processTaskEvent, importCsv, deliverWebhook, webhookHousekeeping];
