/*
  After a transaction commits, services call `dispatchAfterCommit` to hand event ids to the
  background job runner. When Inngest is not configured (local development without the dev
  server), the send fails quietly and the event rows remain the durable record for replay.
*/
import { inngest, taskEventOccurred, csvImportRequested, webhookDeliveryRequested } from "@/inngest/client";

export async function dispatchAfterCommit(eventIds: number[], workspaceId: string): Promise<void> {
  if (eventIds.length === 0) return;
  if (!process.env.INNGEST_EVENT_KEY && process.env.NODE_ENV === "production") return;
  try {
    await inngest.send(eventIds.map((id) => taskEventOccurred.create({ eventId: id, workspaceId })));
  } catch (error) {
    console.warn("[events] dispatch failed; events remain in task_events for replay", (error as Error).message);
  }
}

/** Starts the CSV import job for a stored import row. Same quiet failure rules as task events. */
export async function dispatchImport(importId: string, workspaceId: string): Promise<void> {
  if (!process.env.INNGEST_EVENT_KEY && process.env.NODE_ENV === "production") return;
  try {
    await inngest.send(csvImportRequested.create({ importId, workspaceId }));
  } catch (error) {
    console.warn("[imports] dispatch failed; the import stays pending", (error as Error).message);
  }
}

/** Hands queued webhook deliveries to the delivery function. The rows stay pending for the catch up cron if this fails. */
export async function dispatchWebhookDeliveries(deliveryIds: number[]): Promise<void> {
  if (deliveryIds.length === 0) return;
  if (!process.env.INNGEST_EVENT_KEY && process.env.NODE_ENV === "production") return;
  try {
    await inngest.send(deliveryIds.map((deliveryId) => webhookDeliveryRequested.create({ deliveryId })));
  } catch (error) {
    console.warn("[webhooks] dispatch failed; deliveries stay pending", (error as Error).message);
  }
}
