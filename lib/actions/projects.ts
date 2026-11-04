"use server";

import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/current";
import * as projects from "@/lib/services/projects";
import * as views from "@/lib/services/views";
import * as workspaces from "@/lib/services/workspaces";
import { createProjectInput, updateProjectInput, createSectionInput, updateSectionInput, reorderSectionsInput, updateWorkflowInput, createCycleInput, saveAsTemplateInput } from "@/lib/validation/project";
import { savedViewInput, viewSpec } from "@/lib/validation/view-spec";
import { paletteColor, healthValue } from "@/lib/validation/common";
import { run } from "./result";

const slug = z.string().min(1);

export async function createProjectAction(workspaceSlug: string, input: unknown, today: string) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    return projects.createProject(session, createProjectInput.parse(input), today);
  });
}

export async function updateProjectAction(workspaceSlug: string, input: unknown) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    return projects.updateProject(session, updateProjectInput.parse(input));
  });
}

export async function archiveProjectAction(workspaceSlug: string, id: string, archived: boolean) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    return projects.archiveProject(session, z.string().uuid().parse(id), archived);
  });
}

export async function deleteProjectAction(workspaceSlug: string, id: string) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    await projects.deleteProject(session, z.string().uuid().parse(id));
    return { id };
  });
}

export async function createSectionAction(workspaceSlug: string, input: unknown) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    return projects.createSection(session, createSectionInput.parse(input));
  });
}

export async function updateSectionAction(workspaceSlug: string, input: unknown) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    return projects.updateSection(session, updateSectionInput.parse(input));
  });
}

export async function deleteSectionAction(workspaceSlug: string, id: string) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    await projects.deleteSection(session, z.string().uuid().parse(id));
    return { id };
  });
}

export async function reorderSectionsAction(workspaceSlug: string, input: unknown) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    await projects.reorderSections(session, reorderSectionsInput.parse(input));
    return { ok: true };
  });
}

export async function updateWorkflowAction(workspaceSlug: string, input: unknown) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    return projects.updateWorkflow(session, updateWorkflowInput.parse(input));
  });
}

export async function createCycleAction(workspaceSlug: string, input: unknown) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    return projects.createCycle(session, createCycleInput.parse(input));
  });
}

export async function closeCycleAction(workspaceSlug: string, cycleId: string, moveIncompleteTo: "backlog" | "next") {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    await projects.closeCycle(session, z.string().uuid().parse(cycleId), moveIncompleteTo);
    return { cycleId };
  });
}

export async function postStatusUpdateAction(workspaceSlug: string, input: unknown, today: string) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    const parsed = z.object({ projectId: z.string().uuid(), health: healthValue, title: z.string().trim().min(1).max(200), body: z.unknown().optional() }).parse(input);
    return projects.postStatusUpdate(session, parsed, today);
  });
}

export async function saveViewAction(workspaceSlug: string, input: unknown) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    return views.saveView(session, savedViewInput.parse(input));
  });
}

export async function updateViewAction(workspaceSlug: string, input: unknown) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    const parsed = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(80).optional(), spec: viewSpec.optional(), isShared: z.boolean().optional(), position: z.number().int().optional() }).parse(input);
    return views.updateView(session, parsed);
  });
}

export async function deleteViewAction(workspaceSlug: string, id: string) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    await views.deleteView(session, z.string().uuid().parse(id));
    return { id };
  });
}

export async function setDefaultViewAction(workspaceSlug: string, projectId: string, viewId: string | null) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    await views.setDefaultView(session, z.string().uuid().parse(projectId), viewId ? z.string().uuid().parse(viewId) : null);
    return { projectId };
  });
}

export async function createTagAction(workspaceSlug: string, input: unknown) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    const parsed = z.object({ name: z.string().trim().min(1).max(40), color: paletteColor }).parse(input);
    return workspaces.createTag(session, parsed);
  });
}

export async function saveBaselineAction(workspaceSlug: string, input: { projectId: string; name: string }) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    return projects.saveBaseline(session, { projectId: z.string().uuid().parse(input.projectId), name: z.string().max(80).parse(input.name) });
  });
}

export async function getBaselineAction(workspaceSlug: string, baselineId: string) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    return projects.getBaselineTasks(session, z.string().uuid().parse(baselineId));
  });
}

export async function deleteBaselineAction(workspaceSlug: string, baselineId: string) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    await projects.deleteBaseline(session, z.string().uuid().parse(baselineId));
    return { id: baselineId };
  });
}

export async function saveProjectAsTemplateAction(workspaceSlug: string, input: unknown) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    return projects.saveProjectAsTemplate(session, saveAsTemplateInput.parse(input));
  });
}

export async function listWorkspaceTemplatesAction(workspaceSlug: string) {
  return run(async () => {
    const session = await getCurrentSession(slug.parse(workspaceSlug));
    return projects.listWorkspaceTemplates(session);
  });
}
