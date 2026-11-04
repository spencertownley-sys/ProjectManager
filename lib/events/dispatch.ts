/*
  After a transaction commits, services call `dispatchAfterCommit` to hand event ids to the
  background job runner. When Inngest is not configured (local development without the dev
  server), the send fails quietly and the event rows remain the durable record for replay.
*/
import { inngest, taskEventOccurred } from "@/inngest/client";

export async function dispatchAfterCommit(eventIds: number[], workspaceId: string): Promise<void> {
  if (eventIds.length === 0) return;
  if (!process.env.INNGEST_EVENT_KEY && process.env.NODE_ENV === "production") return;
  try {
    await inngest.send(eventIds.map((id) => taskEventOccurred.create({ eventId: id, workspaceId })));
  } catch (error) {
    console.warn("[events] dispatch failed; events remain in task_events for replay", (error as Error).message);
  }
}
