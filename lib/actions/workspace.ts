"use server";

import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/current";
import * as projects from "@/lib/services/projects";
import * as workspaces from "@/lib/services/workspaces";
import * as notifications from "@/lib/services/notifications";
import { run } from "./result";

export async function listProjectsAction(workspaceSlug: string, today: string) {
  return run(async () => {
    const session = await getCurrentSession(z.string().min(1).parse(workspaceSlug));
    return projects.listProjects(session, { today });
  });
}

export async function listMembersAction(workspaceSlug: string) {
  return run(async () => {
    const session = await getCurrentSession(z.string().min(1).parse(workspaceSlug));
    return workspaces.listMembers(session);
  });
}

export async function listNotificationsAction(workspaceSlug: string, filter: "all" | "unread" | "mentions" | "assigned" | "due" | "updates") {
  return run(async () => {
    const session = await getCurrentSession(z.string().min(1).parse(workspaceSlug));
    return notifications.listNotifications(session, filter);
  });
}
