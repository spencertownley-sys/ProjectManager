import { Inngest, eventType } from "inngest";
import { z } from "zod";

export const taskEventOccurred = eventType("taskparty/task.event", {
  schema: z.object({ eventId: z.number(), workspaceId: z.string() }),
});
export const csvImportRequested = eventType("taskparty/import.csv", {
  schema: z.object({ importId: z.string(), workspaceId: z.string() }),
});
export const webhookDeliveryRequested = eventType("taskparty/webhook.deliver", {
  schema: z.object({ deliveryId: z.number() }),
});

export const inngest = new Inngest({ id: "taskparty" });
