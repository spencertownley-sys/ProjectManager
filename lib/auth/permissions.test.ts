import { describe, it, expect } from "vitest";
import { can, effectiveProjectRole, type Actor, type ProjectContext } from "./permissions";

const actor = (workspaceRole: Actor["workspaceRole"], scopes?: Actor["scopes"]): Actor => ({
  userId: "u1",
  workspaceId: "w1",
  workspaceRole,
  scopes,
});
const project = (privacy: ProjectContext["privacy"], explicitRole: ProjectContext["explicitRole"] = null, isTeamMember = false): ProjectContext => ({
  projectId: "p1",
  privacy,
  explicitRole,
  isTeamMember,
});

describe("effective project role", () => {
  it("gives owners and admins project owner everywhere", () => {
    expect(effectiveProjectRole(actor("owner"), project("private"))).toBe("owner");
    expect(effectiveProjectRole(actor("admin"), project("private"))).toBe("owner");
  });
  it("implies editor for members on workspace projects and team members on team projects", () => {
    expect(effectiveProjectRole(actor("member"), project("workspace"))).toBe("editor");
    expect(effectiveProjectRole(actor("member"), project("team", null, true))).toBe("editor");
    expect(effectiveProjectRole(actor("member"), project("team", null, false))).toBeNull();
    expect(effectiveProjectRole(actor("member"), project("private"))).toBeNull();
  });
  it("gives guests only explicit roles", () => {
    expect(effectiveProjectRole(actor("guest"), project("workspace"))).toBeNull();
    expect(effectiveProjectRole(actor("guest"), project("workspace", "commenter"))).toBe("commenter");
  });
});

describe("permission matrix (docs/08 section 4)", () => {
  const cases: Array<[Actor["workspaceRole"], ProjectContext, Parameters<typeof can>[1], boolean]> = [
    ["owner", project("workspace"), "workspace.manage_billing", true],
    ["admin", project("workspace"), "workspace.manage_billing", false],
    ["admin", project("workspace"), "workspace.invite", true],
    ["member", project("workspace"), "workspace.invite", false],
    ["member", project("workspace"), "project.create", true],
    ["guest", project("workspace", "commenter"), "project.create", false],
    ["member", project("workspace"), "project.delete", false],
    ["member", project("workspace", "owner"), "project.delete", true],
    ["member", project("workspace"), "task.create", true],
    ["member", project("workspace"), "task.delete", true],
    ["guest", project("workspace", "commenter"), "task.create", false],
    ["guest", project("workspace", "commenter"), "task.update_assigned_status", true],
    ["guest", project("workspace", "commenter"), "comment.create", true],
    ["guest", project("workspace", "viewer"), "comment.create", false],
    ["guest", project("workspace", "viewer"), "project.read", true],
    ["guest", project("workspace", "viewer"), "view.save_personal", true],
    ["member", project("workspace"), "project.manage_views_shared", true],
    ["guest", project("workspace", "commenter"), "project.manage_views_shared", false],
    ["member", project("workspace"), "project.post_status_update", false],
    ["member", project("workspace", "owner"), "project.post_status_update", true],
    ["member", project("workspace"), "project.export", true],
    ["owner", project("workspace"), "workspace.export", true],
    ["admin", project("workspace"), "workspace.export", false],
    ["admin", project("workspace"), "comment.edit_any", true],
    ["member", project("workspace"), "comment.edit_any", false],
  ];
  it.each(cases)("%s on %o may %s: %s", (role, ctx, action, expected) => {
    expect(can(actor(role), action, ctx)).toBe(expected);
  });
  it("allows own comment edits only to the author", () => {
    expect(can(actor("member"), "comment.edit_own", project("workspace"), { ownsResource: true })).toBe(true);
    expect(can(actor("member"), "comment.edit_own", project("workspace"), { ownsResource: false })).toBe(false);
  });
  it("limits API keys by scope", () => {
    expect(can(actor("admin", ["read"]), "project.read", project("workspace"))).toBe(true);
    expect(can(actor("admin", ["read"]), "task.update", project("workspace"))).toBe(false);
    expect(can(actor("admin", ["write"]), "workspace.invite", project("workspace"))).toBe(false);
    expect(can(actor("admin", ["admin"]), "workspace.invite", project("workspace"))).toBe(true);
  });
});
