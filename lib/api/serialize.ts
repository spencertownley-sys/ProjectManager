import type { TaskRow, DependencyRow } from "@/lib/query-engine/types";
import type { ProjectSummary, ProjectDetail } from "@/lib/services/projects";
import type { TaskDetail } from "@/lib/services/tasks";
import type { schema } from "@/lib/db/client";

/** Object shapes of the public API (docs/07 section 4). Keys are camelCase here and become snake_case on the wire. */

export type Links = { appUrl: string; workspaceSlug: string };

export function taskObject(row: TaskRow, links: Links, extra: { description?: unknown; dependencies?: { predecessors: DependencyRow[]; successors: DependencyRow[] } } = {}) {
  return {
    id: row.id,
    key: row.key,
    projectId: row.projectId,
    sectionId: row.sectionId,
    parentId: row.parentId,
    title: row.title,
    ...(extra.description !== undefined ? { description: extra.description } : {}),
    status: { id: row.status.id, name: row.status.name, category: row.status.category, color: row.status.color },
    priority: row.priority,
    assignee: row.assignee ? { id: row.assignee.id, displayName: row.assignee.displayName, avatarUrl: row.assignee.avatarUrl } : null,
    startDate: row.startDate,
    dueDate: row.dueDate,
    dueTime: row.dueTime,
    estimate: row.estimate,
    isMilestone: row.isMilestone,
    cycleId: row.cycleId,
    tags: row.tags.map((t) => ({ id: t.id, name: t.name, color: t.color })),
    customFields: row.customFields,
    ...(extra.dependencies
      ? {
          dependencies: {
            predecessors: extra.dependencies.predecessors.map((d) => ({ dependencyId: d.id, taskId: d.predecessorId, type: d.type, lagDays: d.lagDays })),
            successors: extra.dependencies.successors.map((d) => ({ dependencyId: d.id, taskId: d.successorId, type: d.type, lagDays: d.lagDays })),
          },
        }
      : {}),
    subtaskCount: row.subtaskCount,
    subtaskDoneCount: row.subtaskDoneCount,
    commentCount: row.commentCount,
    attachmentCount: row.attachmentCount,
    blockedByCount: row.blockedByCount,
    version: row.version,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt,
    url: `${links.appUrl}/w/${links.workspaceSlug}/projects/${row.projectKey}/tasks/${row.key}`,
  };
}

export function taskDetailObject(detail: TaskDetail, links: Links, expand: Set<string>) {
  const base = taskObject(detail.task, links, { description: detail.description, dependencies: { predecessors: detail.predecessors, successors: detail.successors } });
  return {
    ...base,
    ...(expand.has("subtasks") ? { subtasks: detail.subtasks.map((s) => taskObject(s, links)) } : {}),
    ...(expand.has("comments") ? { comments: detail.comments.map(commentObject) } : {}),
    ...(expand.has("attachments") ? { attachments: detail.attachments } : {}),
    ...(expand.has("events") ? { events: detail.events.map(eventObject) } : {}),
  };
}

export function commentObject(c: TaskDetail["comments"][number]) {
  return { id: c.id, author: c.author, body: c.body, bodyText: c.bodyText, parentId: c.parentId, reactions: c.reactions, editedAt: c.editedAt, createdAt: c.createdAt };
}

export function eventObject(e: { id: number; type: string; field: string | null; before: unknown; after: unknown; actor: { id: string; displayName: string; avatarUrl: string | null } | null; createdAt: string; taskId?: string; projectId?: string }) {
  return { id: e.id, type: e.type, field: e.field, before: e.before, after: e.after, actor: e.actor, taskId: e.taskId, projectId: e.projectId, createdAt: e.createdAt };
}

export function projectSummaryObject(p: ProjectSummary, links: Links) {
  return {
    id: p.id,
    key: p.key,
    name: p.name,
    color: p.color,
    icon: p.icon,
    privacy: p.privacy,
    teamId: p.teamId,
    ownerId: p.ownerId,
    startDate: p.startDate,
    endDate: p.endDate,
    autoSchedule: p.autoSchedule,
    defaultViewId: p.defaultViewId,
    archivedAt: p.archivedAt,
    taskCount: p.taskCount,
    doneCount: p.doneCount,
    overdueCount: p.overdueCount,
    latestHealth: p.latestHealth,
    url: `${links.appUrl}/w/${links.workspaceSlug}/projects/${p.key}`,
  };
}

export function projectDetailObject(d: ProjectDetail, links: Links, expand: Set<string>) {
  const p = d.project;
  return {
    id: p.id,
    key: p.key,
    name: p.name,
    description: p.description,
    color: p.color,
    icon: p.icon,
    privacy: p.privacy,
    teamId: p.teamId,
    ownerId: p.ownerId,
    startDate: p.startDate,
    endDate: p.endDate,
    autoSchedule: p.autoSchedule,
    defaultViewId: p.defaultViewId,
    archivedAt: p.archivedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    url: `${links.appUrl}/w/${links.workspaceSlug}/projects/${p.key}`,
    ...(expand.has("sections") ? { sections: d.sections.map(sectionObject) } : {}),
    ...(expand.has("statuses") ? { statuses: d.statuses.map(statusObject) } : {}),
    ...(expand.has("fields") ? { fields: d.fields.map(fieldObject) } : {}),
    ...(expand.has("members") ? { members: d.members } : {}),
    ...(expand.has("cycles") ? { cycles: d.cycles.map(cycleObject) } : {}),
    ...(expand.has("views") ? { views: d.views.map(viewObject) } : {}),
  };
}

export function sectionObject(s: typeof schema.sections.$inferSelect) {
  return { id: s.id, projectId: s.projectId, name: s.name, position: s.position, isCollapsed: s.isCollapsed };
}

export function statusObject(s: typeof schema.statuses.$inferSelect) {
  return { id: s.id, name: s.name, category: s.category, color: s.color, position: s.position, wipLimit: s.wipLimit };
}

export function fieldObject(f: typeof schema.fieldDefinitions.$inferSelect) {
  return { id: f.id, projectId: f.projectId, name: f.name, type: f.type, config: f.config, isRequired: f.isRequired, position: f.position };
}

export function cycleObject(c: typeof schema.cycles.$inferSelect) {
  return { id: c.id, projectId: c.projectId, name: c.name, goal: c.goal, startDate: c.startDate, endDate: c.endDate, capacity: c.capacity === null ? null : Number(c.capacity), closedAt: c.closedAt?.toISOString() ?? null };
}

export function viewObject(v: typeof schema.savedViews.$inferSelect) {
  return { id: v.id, projectId: v.projectId, ownerId: v.ownerId, name: v.name, type: v.type, spec: v.spec, isShared: v.isShared, position: v.position };
}

export function tagObject(t: typeof schema.tags.$inferSelect) {
  return { id: t.id, name: t.name, color: t.color };
}

export function parseExpand(raw: string | null): Set<string> {
  return new Set((raw ?? "").split(",").map((s) => s.trim()).filter(Boolean));
}
