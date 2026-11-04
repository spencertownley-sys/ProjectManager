import type { DbOrTx } from "@/lib/db/client";
import { schema } from "@/lib/db/client";
import type { TaskEventInput } from "./types";

/**
 * Writes task events inside the caller's transaction. Side effects (notifications, automations,
 * webhooks) are produced later by Inngest functions that read these rows, never here.
 */
export async function emitTaskEvents(tx: DbOrTx, events: TaskEventInput[]): Promise<number[]> {
  if (events.length === 0) return [];
  const rows = await tx
    .insert(schema.taskEvents)
    .values(
      events.map((e) => ({
        workspaceId: e.workspaceId,
        projectId: e.projectId,
        taskId: e.taskId,
        actorId: e.actorId,
        automationId: e.automationId ?? null,
        type: e.type,
        field: e.field ?? null,
        before: e.before === undefined ? null : e.before,
        after: e.after === undefined ? null : e.after,
      })),
    )
    .returning({ id: schema.taskEvents.id });
  return rows.map((r) => r.id);
}
