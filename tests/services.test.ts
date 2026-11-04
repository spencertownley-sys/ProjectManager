import { describe, it, expect, beforeAll, vi } from "vitest";
import { createTestDb } from "./helpers/pglite";
import type { Database } from "@/lib/db/client";
import { schema } from "@/lib/db/client";
import type { Actor } from "@/lib/auth/permissions";
import { upsertUser, upsertWorkspace, upsertMembership, resolveActor } from "@/lib/services/workspaces";
import { createProject, getProject, createSection, saveBaseline, getBaselineTasks, deleteBaseline } from "@/lib/services/projects";
import { createTask, updateTask, moveTask, queryProjectTasks, addDependency, addComment, getTaskDetail, queryMyWork, deleteTask } from "@/lib/services/tasks";
import { saveView } from "@/lib/services/views";
import { createNotifications, listNotifications, markNotifications, unreadCount } from "@/lib/services/notifications";
import { defaultViewSpec } from "@/lib/validation/view-spec";
import { eq } from "drizzle-orm";

vi.mock("@/lib/events/dispatch", () => ({ dispatchAfterCommit: vi.fn(async () => undefined) }));

const today = "2026-11-03";

describe("services on PGlite", () => {
  let db: Database;
  let owner: Actor;
  let member: Actor;
  let projectId: string;
  let statuses: Array<{ id: string; category: string; name: string }>;
  let sections: Array<{ id: string; name: string }>;

  beforeAll(async () => {
    ({ db } = await createTestDb());
    await upsertUser(db, { clerkUserId: "user_owner", email: "spencer@example.com", displayName: "Spencer Townley", avatarUrl: null });
    await upsertUser(db, { clerkUserId: "user_member", email: "jenny@example.com", displayName: "Jenny", avatarUrl: null });
    await upsertWorkspace(db, { clerkOrgId: "org_tp", slug: "taskparty", name: "TaskParty", logoUrl: null });
    await upsertMembership(db, "org_tp", "user_owner", "org:owner");
    await upsertMembership(db, "org_tp", "user_member", "org:member");
    owner = (await resolveActor(db, "user_owner", "taskparty"))!.actor;
    member = (await resolveActor(db, "user_member", "taskparty"))!.actor;
    expect(owner.workspaceRole).toBe("owner");
    expect(member.workspaceRole).toBe("member");
  });

  it("creates a project from a template with sections, statuses, and a default view", async () => {
    const project = await createProject({ db, actor: owner }, { name: "Launch Plan", color: "blue", privacy: "workspace", workflowTemplate: "simple", templateId: "campaign" }, today);
    projectId = project.id;
    expect(project.key).toBe("LP");
    const detail = await getProject({ db, actor: member }, projectId);
    expect(detail.sections.map((s) => s.name)).toEqual(["Planning", "Production", "Launch", "Wrap-up"]);
    expect(detail.statuses.length).toBe(6);
    expect(detail.views[0]?.type).toBe("calendar");
    expect(detail.role).toBe("editor");
    statuses = detail.statuses;
    sections = detail.sections;
    const seeded = await queryProjectTasks({ db, actor: member }, projectId, defaultViewSpec(), today);
    expect(seeded.rows.length).toBe(4);
    expect(seeded.rows.find((r) => r.isMilestone)?.title).toBe("Launch day");
  });

  it("creates, updates, completes, and records events for a task", async () => {
    const ctx = { db, actor: member };
    const task = await createTask(ctx, { projectId, title: "Write the brief", sectionId: sections[0].id, dueDate: "2026-11-10", priority: "high" });
    expect(task.number).toBeGreaterThan(0);
    const done = statuses.find((s) => s.category === "done")!;
    const updated = await updateTask(ctx, { id: task.id, statusId: done.id, assigneeId: member.userId });
    expect(updated.completedAt).not.toBeNull();
    expect(updated.version).toBe(2);
    const events = await db.select().from(schema.taskEvents).where(eq(schema.taskEvents.taskId, task.id));
    const types = events.map((e) => e.type).sort();
    expect(types).toEqual(["task.assigned", "task.completed", "task.created", "task.status_changed"]);
    await expect(updateTask(ctx, { id: task.id, expectedVersion: 1, title: "Stale" })).rejects.toThrow(/changed/);
  });

  it("moves tasks between sections with fractional positions", async () => {
    const ctx = { db, actor: member };
    const a = await createTask(ctx, { projectId, title: "A", sectionId: sections[1].id });
    const b = await createTask(ctx, { projectId, title: "B", sectionId: sections[1].id });
    const c = await createTask(ctx, { projectId, title: "C", sectionId: sections[1].id });
    expect(a.position < b.position && b.position < c.position).toBe(true);
    const moved = await moveTask(ctx, { id: c.id, sectionId: sections[1].id, beforeId: a.id, afterId: b.id });
    expect(moved.position).toBeGreaterThan(a.position);
    expect(moved.position).toBeLessThan(b.position);
    const res = await queryProjectTasks(ctx, projectId, { ...defaultViewSpec(), filters: { kind: "group", op: "and", items: [{ kind: "filter", field: "section", op: "is", value: sections[1].id }] } }, today);
    expect(res.rows.map((r) => r.title)).toEqual(["Creative concepts", "A", "C", "B"]);
  });

  it("filters by assignee, due date, and status category", async () => {
    const ctx = { db, actor: member };
    const overdue = await createTask(ctx, { projectId, title: "Overdue thing", dueDate: "2026-10-01", assigneeId: member.userId });
    void overdue;
    const res = await queryProjectTasks(ctx, projectId, { ...defaultViewSpec(), showCompleted: "none", filters: { kind: "group", op: "and", items: [{ kind: "filter", field: "assignee", op: "is_me" }, { kind: "filter", field: "due_date", op: "is_overdue" }] } }, today);
    expect(res.rows.map((r) => r.title)).toEqual(["Overdue thing"]);
    const mine = await queryMyWork(ctx, defaultViewSpec(), today);
    expect(mine.rows.some((r) => r.title === "Overdue thing")).toBe(true);
  });

  it("adds dependencies and rejects loops with a readable message", async () => {
    const ctx = { db, actor: member };
    const first = await createTask(ctx, { projectId, title: "Design", startDate: "2026-11-05", dueDate: "2026-11-08" });
    const second = await createTask(ctx, { projectId, title: "Build", startDate: "2026-11-09", dueDate: "2026-11-15" });
    await addDependency(ctx, { predecessorId: first.id, successorId: second.id, type: "fs", lagDays: 0 });
    await expect(addDependency(ctx, { predecessorId: second.id, successorId: first.id, type: "fs", lagDays: 0 })).rejects.toThrow(/loop/);
    const detail = await getTaskDetail(ctx, second.id, today);
    expect(detail.predecessors[0]?.task.title).toBe("Design");
    expect(detail.task.blockedByCount).toBe(1);
  });

  it("supports comments, subtasks, and detail loading by key", async () => {
    const ctx = { db, actor: member };
    const parent = await createTask(ctx, { projectId, title: "Parent" });
    await createTask(ctx, { projectId, title: "Child", parentId: parent.id });
    await addComment(ctx, { taskId: parent.id, body: { type: "doc", content: [] }, bodyText: "Looks good", mentionUserIds: [] });
    const detail = await getTaskDetail(ctx, `LP-${parent.number}`, today);
    expect(detail.subtasks.map((s) => s.title)).toEqual(["Child"]);
    expect(detail.comments[0]?.bodyText).toBe("Looks good");
    expect(detail.task.subtaskCount).toBe(1);
    expect(detail.isFollowing).toBe(true);
  });

  it("enforces authorization", async () => {
    const guestUser = await upsertUser(db, { clerkUserId: "user_guest", email: "g@example.com", displayName: "Guest", avatarUrl: null });
    await upsertMembership(db, "org_tp", "user_guest", "org:guest");
    const guest = (await resolveActor(db, "user_guest", "taskparty"))!.actor;
    await expect(createTask({ db, actor: guest }, { projectId, title: "Nope" })).rejects.toThrow(/not found|Not allowed/i);
    await db.insert(schema.projectMembers).values({ projectId, userId: guestUser.id, role: "commenter" });
    await expect(createTask({ db, actor: guest }, { projectId, title: "Still no" })).rejects.toThrow(/Not allowed/);
    const res = await queryProjectTasks({ db, actor: guest }, projectId, defaultViewSpec(), today);
    expect(res.rows.length).toBeGreaterThan(0);
    await expect(saveView({ db, actor: guest }, { projectId, name: "Shared", type: "list", spec: defaultViewSpec(), isShared: true })).rejects.toThrow(/Not allowed/);
    const personal = await saveView({ db, actor: guest }, { projectId, name: "Mine", type: "board", spec: defaultViewSpec(), isShared: false });
    expect(personal.isShared).toBe(false);
  });

  it("soft deletes and hides deleted tasks", async () => {
    const ctx = { db, actor: member };
    const t = await createTask(ctx, { projectId, title: "Temporary" });
    await deleteTask(ctx, t.id);
    const res = await queryProjectTasks(ctx, projectId, defaultViewSpec(), today);
    expect(res.rows.some((r) => r.id === t.id)).toBe(false);
    const section = await createSection(ctx, { projectId, name: "Extra" });
    expect(section.position).toBeGreaterThan(0);
  });

  it("saves and reads a baseline of task dates, and lists it on the project", async () => {
    const ctx = { db, actor: member };
    const task = await createTask(ctx, { projectId, title: "Baseline me", sectionId: sections[0].id, startDate: "2026-11-20", dueDate: "2026-11-24" });
    const baseline = await saveBaseline(ctx, { projectId, name: "Plan v1" });
    expect(baseline.taskCount).toBeGreaterThan(0);
    const detail = await getProject(ctx, projectId);
    expect(detail.baselines.map((b) => b.name)).toContain("Plan v1");
    const loaded = await getBaselineTasks(ctx, baseline.id);
    expect(loaded.tasks[task.id]).toEqual({ startDate: "2026-11-20", dueDate: "2026-11-24" });
    await updateTask(ctx, { id: task.id, dueDate: "2026-11-30" });
    expect((await getBaselineTasks(ctx, baseline.id)).tasks[task.id]?.dueDate).toBe("2026-11-24");
    await expect(saveBaseline(ctx, { projectId, name: "  " })).rejects.toThrow();
    await deleteBaseline(ctx, baseline.id);
    expect((await getProject(ctx, projectId)).baselines.find((b) => b.id === baseline.id)).toBeUndefined();
  });

  it("lists, reads, snoozes, and archives notifications for the inbox", async () => {
    const ctx = { db, actor: member };
    const task = await createTask({ db, actor: owner }, { projectId, title: "Notify me", sectionId: sections[0].id });
    await createNotifications({ db }, [
      { workspaceId: member.workspaceId, userId: member.userId, type: "assigned", taskId: task.id, projectId, actorId: owner.userId },
      { workspaceId: member.workspaceId, userId: member.userId, type: "mention", taskId: task.id, projectId, actorId: owner.userId, payload: { excerpt: "Can you look?" } },
      { workspaceId: member.workspaceId, userId: owner.userId, type: "comment", taskId: task.id, projectId, actorId: member.userId },
    ]);
    const all = await listNotifications(ctx);
    expect(all.map((n) => n.type).sort()).toEqual(["assigned", "mention"]);
    expect(all[0].task?.key).toBe(`LP-${task.number}`);
    expect(all[0].actor?.displayName).toBe("Spencer Townley");
    expect(await listNotifications(ctx, "mentions")).toHaveLength(1);
    expect(await unreadCount(ctx)).toBe(2);
    const mention = all.find((n) => n.type === "mention")!;
    await markNotifications(ctx, { ids: [mention.id], action: "read" });
    expect(await unreadCount(ctx)).toBe(1);
    await markNotifications(ctx, { all: true, onlyRead: true, action: "archive" });
    expect((await listNotifications(ctx)).map((n) => n.type)).toEqual(["assigned"]);
    const assigned = (await listNotifications(ctx))[0];
    await markNotifications(ctx, { ids: [assigned.id], action: "snooze", snoozeUntil: new Date(Date.now() + 3_600_000).toISOString() });
    expect(await listNotifications(ctx)).toHaveLength(0);
    await markNotifications(ctx, { ids: [assigned.id], action: "snooze" });
    expect(await listNotifications(ctx)).toHaveLength(1);
    // Another member's notification is untouched.
    expect(await unreadCount({ db, actor: owner })).toBe(1);
  });
});
