"use server";

import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/current";
import * as projects from "@/lib/services/projects";
import { run } from "./result";

export async function listStatusUpdatesAction(workspaceSlug: string, projectId: string) {
  return run(async () => {
    const session = await getCurrentSession(z.string().min(1).parse(workspaceSlug));
    const rows = await projects.listStatusUpdates(session, z.string().uuid().parse(projectId));
    return rows.map((r) => ({
      id: r.update.id,
      health: r.update.health,
      title: r.update.title,
      createdAt: r.update.createdAt.toISOString(),
      author: { displayName: r.author.displayName, avatarUrl: r.author.avatarUrl },
      metrics: (r.update.metrics as Record<string, number> | null) ?? null,
    }));
  });
}
