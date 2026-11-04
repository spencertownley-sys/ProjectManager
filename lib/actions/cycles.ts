"use server";

import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/current";
import * as cycles from "@/lib/services/cycles";
import { run } from "./result";
import { uuid, isoDate } from "@/lib/validation/common";

const slug = z.string().min(1);

export async function listCyclesAction(workspaceSlug: string, projectId: string) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    return cycles.listCycles(session, uuid.parse(projectId));
  });
}

export async function cycleBurndownAction(workspaceSlug: string, cycleId: string, today: string) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    return cycles.cycleBurndown(session, uuid.parse(cycleId), isoDate.parse(today));
  });
}

export async function projectVelocityAction(workspaceSlug: string, projectId: string) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    return cycles.projectVelocity(session, uuid.parse(projectId));
  });
}

const updateCycleInput = z.object({ id: uuid, name: z.string().trim().min(1).max(80).optional(), goal: z.string().max(2000).nullable().optional(), startDate: isoDate.optional(), endDate: isoDate.optional(), capacity: z.number().min(0).nullable().optional() });

export async function updateCycleAction(workspaceSlug: string, input: unknown) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    return cycles.updateCycle(session, updateCycleInput.parse(input));
  });
}

export async function planTasksAction(workspaceSlug: string, input: unknown) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    const parsed = z.object({ projectId: uuid, taskIds: z.array(uuid).min(1).max(500), cycleId: uuid.nullable() }).parse(input);
    return { count: await cycles.planTasks(session, parsed) };
  });
}
