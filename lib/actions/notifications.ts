"use server";

import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/current";
import * as notifications from "@/lib/services/notifications";
import { run } from "./result";

export async function markNotificationsAction(workspaceSlug: string, input: unknown) {
  return run(async () => {
    const session = await getCurrentSession(z.string().min(1).parse(workspaceSlug));
    const parsed = z.object({ ids: z.array(z.string().uuid()).optional(), all: z.boolean().optional(), action: z.enum(["read", "unread", "archive", "snooze"]), snoozeUntil: z.string().optional() }).parse(input);
    await notifications.markNotifications(session, parsed);
    return { ok: true };
  });
}
