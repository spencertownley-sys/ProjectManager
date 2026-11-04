/*
  Single source of truth for authorization. Mirrors docs/08-auth-and-permissions.md section 4.
  Services call `assertCan(actor, action, resource)` before reading or writing.
*/
import type { WorkspaceRole, ProjectRole } from "@/lib/db/schema";

export type Actor = {
  userId: string;
  workspaceId: string;
  workspaceRole: WorkspaceRole;
  /** Present for API keys; limits what the synthetic admin actor may do. */
  scopes?: ReadonlyArray<"read" | "write" | "admin">;
};

export type ProjectContext = {
  projectId: string;
  privacy: "workspace" | "team" | "private";
  /** Explicit project_members row for this actor, if any. */
  explicitRole: ProjectRole | null;
  /** Whether the actor belongs to the project's team (only relevant for team privacy). */
  isTeamMember: boolean;
};

export type Action =
  | "workspace.view_settings"
  | "workspace.manage_billing"
  | "workspace.invite"
  | "workspace.export"
  | "workspace.manage_integrations"
  | "workspace.manage_libraries"
  | "team.create"
  | "project.create"
  | "project.read"
  | "project.update"
  | "project.delete"
  | "project.manage_members"
  | "project.manage_views_shared"
  | "project.post_status_update"
  | "project.manage_cycles"
  | "project.manage_automations"
  | "project.export"
  | "task.create"
  | "task.update"
  | "task.update_assigned_status"
  | "task.delete"
  | "comment.create"
  | "comment.edit_own"
  | "comment.edit_any"
  | "attachment.create"
  | "view.save_personal";

export class ForbiddenError extends Error {
  readonly code = "forbidden" as const;
  constructor(action: Action) {
    super(`Not allowed: ${action}`);
  }
}

/** Resolves the effective project role for an actor, including implied roles. */
export function effectiveProjectRole(actor: Actor, project: ProjectContext | null): ProjectRole | null {
  if (actor.workspaceRole === "owner" || actor.workspaceRole === "admin") return "owner";
  if (!project) return null;
  if (project.explicitRole) return project.explicitRole;
  if (actor.workspaceRole === "guest") return null;
  if (project.privacy === "workspace") return "editor";
  if (project.privacy === "team") return project.isTeamMember ? "editor" : null;
  return null;
}

const roleRank: Record<ProjectRole, number> = { viewer: 0, commenter: 1, editor: 2, owner: 3 };

function atLeast(role: ProjectRole | null, minimum: ProjectRole): boolean {
  return role !== null && roleRank[role] >= roleRank[minimum];
}

function scopeAllows(actor: Actor, action: Action): boolean {
  if (!actor.scopes) return true;
  const reads: Action[] = ["project.read", "project.export", "workspace.view_settings"];
  if (reads.includes(action)) return actor.scopes.includes("read") || actor.scopes.includes("admin");
  const admin: Action[] = [
    "workspace.manage_billing",
    "workspace.invite",
    "workspace.export",
    "workspace.manage_integrations",
    "workspace.manage_libraries",
  ];
  if (admin.includes(action)) return actor.scopes.includes("admin");
  return actor.scopes.includes("write") || actor.scopes.includes("admin");
}

/**
 * Returns whether an actor may perform an action. `project` is required for project and task actions.
 * `ownsResource` is used for own-comment edits.
 */
export function can(
  actor: Actor,
  action: Action,
  project: ProjectContext | null = null,
  options: { ownsResource?: boolean } = {},
): boolean {
  if (!scopeAllows(actor, action)) return false;
  const ws = actor.workspaceRole;
  const role = effectiveProjectRole(actor, project);

  switch (action) {
    case "workspace.view_settings":
    case "workspace.invite":
    case "workspace.manage_integrations":
    case "workspace.manage_libraries":
      return ws === "owner" || ws === "admin";
    case "workspace.manage_billing":
    case "workspace.export":
      return ws === "owner";
    case "team.create":
    case "project.create":
      return ws === "owner" || ws === "admin" || ws === "member";
    case "project.read":
      return atLeast(role, "viewer");
    case "project.update":
    case "project.delete":
    case "project.manage_members":
    case "project.post_status_update":
    case "project.manage_automations":
      return atLeast(role, "owner");
    case "project.manage_views_shared":
    case "project.manage_cycles":
    case "project.export":
    case "task.create":
    case "task.update":
    case "task.delete":
      return atLeast(role, "editor");
    case "task.update_assigned_status":
      return atLeast(role, "commenter");
    case "comment.create":
    case "attachment.create":
      return atLeast(role, "commenter");
    case "comment.edit_own":
      return atLeast(role, "commenter") && options.ownsResource === true;
    case "comment.edit_any":
      return ws === "owner" || ws === "admin";
    case "view.save_personal":
      return atLeast(role, "viewer");
    default:
      return false;
  }
}

export function assertCan(
  actor: Actor,
  action: Action,
  project: ProjectContext | null = null,
  options: { ownsResource?: boolean } = {},
): void {
  if (!can(actor, action, project, options)) throw new ForbiddenError(action);
}
