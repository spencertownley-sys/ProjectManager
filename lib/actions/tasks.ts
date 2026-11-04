"use server";

import { getCurrentSession } from "@/lib/auth/current";
import * as tasks from "@/lib/services/tasks";
import { createTaskInput, updateTaskInput, moveTaskInput, bulkUpdateInput, addDependencyInput, addCommentInput } from "@/lib/validation/task";
import { viewSpec, type ViewSpecInput } from "@/lib/validation/view-spec";
import { run } from "./result";
import { z } from "zod";

const slug = z.string().min(1);

export async function createTaskAction(workspaceSlug: string, input: unknown) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    return tasks.createTask(session, createTaskInput.parse(input));
  });
}

export async function updateTaskAction(workspaceSlug: string, input: unknown) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    return tasks.updateTask(session, updateTaskInput.parse(input));
  });
}

export async function setTaskCompletedAction(workspaceSlug: string, id: string, completed: boolean) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    return tasks.setTaskCompleted(session, z.string().uuid().parse(id), completed);
  });
}

export async function moveTaskAction(workspaceSlug: string, input: unknown) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    return tasks.moveTask(session, moveTaskInput.parse(input));
  });
}

export async function deleteTaskAction(workspaceSlug: string, id: string) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    await tasks.deleteTask(session, z.string().uuid().parse(id));
    return { id };
  });
}

export async function restoreTaskAction(workspaceSlug: string, id: string) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    return tasks.restoreTask(session, z.string().uuid().parse(id));
  });
}

export async function bulkUpdateTasksAction(workspaceSlug: string, input: unknown) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    return { count: await tasks.bulkUpdateTasks(session, bulkUpdateInput.parse(input)) };
  });
}

export async function queryProjectTasksAction(workspaceSlug: string, projectId: string, spec: ViewSpecInput, today: string) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    return tasks.queryProjectTasks(session, z.string().uuid().parse(projectId), viewSpec.parse(spec), z.string().parse(today));
  });
}

export async function queryMyWorkAction(workspaceSlug: string, spec: ViewSpecInput, today: string, mode: "assigned" | "created" | "following") {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    return tasks.queryMyWork(session, viewSpec.parse(spec), z.string().parse(today), mode);
  });
}

export async function getTaskDetailAction(workspaceSlug: string, idOrKey: string, today: string) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    return tasks.getTaskDetail(session, z.string().min(1).parse(idOrKey), today);
  });
}

export async function addDependencyAction(workspaceSlug: string, input: unknown) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    return tasks.addDependency(session, addDependencyInput.parse(input));
  });
}

export async function removeDependencyAction(workspaceSlug: string, dependencyId: string) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    await tasks.removeDependency(session, z.string().uuid().parse(dependencyId));
    return { id: dependencyId };
  });
}

export async function addCommentAction(workspaceSlug: string, input: unknown) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    return tasks.addComment(session, addCommentInput.parse(input));
  });
}

export async function editCommentAction(workspaceSlug: string, input: { id: string; body: unknown; bodyText: string }) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    return tasks.editComment(session, { id: z.string().uuid().parse(input.id), body: input.body, bodyText: z.string().min(1).parse(input.bodyText) });
  });
}

export async function deleteCommentAction(workspaceSlug: string, id: string) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    await tasks.deleteComment(session, z.string().uuid().parse(id));
    return { id };
  });
}

export async function toggleReactionAction(workspaceSlug: string, input: { commentId: string; emoji: string }) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    return { added: await tasks.toggleReaction(session, { commentId: z.string().uuid().parse(input.commentId), emoji: z.string().min(1).max(8).parse(input.emoji) }) };
  });
}

export async function setTaskTagsAction(workspaceSlug: string, taskId: string, tagIds: string[]) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    await tasks.setTaskTags(session, z.string().uuid().parse(taskId), z.array(z.string().uuid()).parse(tagIds));
    return { taskId };
  });
}

export async function toggleFollowAction(workspaceSlug: string, taskId: string) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    return { following: await tasks.toggleFollow(session, z.string().uuid().parse(taskId)) };
  });
}
