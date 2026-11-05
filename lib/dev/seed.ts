import { eq, inArray, like } from "drizzle-orm";
import { schema, type Database } from "@/lib/db/client";
import type { Actor } from "@/lib/auth/permissions";
import { upsertUser, upsertWorkspace, upsertMembership, PLACEHOLDER_USER_PREFIX } from "@/lib/services/workspaces";
import { createProject } from "@/lib/services/projects";
import { createTask } from "@/lib/services/tasks";
import { workflowTemplates } from "@/lib/templates/workflows";

/*
  Seed builders (docs/06 section 8). `seedReference` writes the performance dataset straight through Drizzle in
  batches because 100,000 rows through the service layer would take too long; nothing it writes needs
  notifications or webhooks. `seedBeta` creates the first real workspace through the services so the starter
  project emits events like any other.
*/

/** Users seeded before they sign in carry this prefix; `upsertUser` links the Clerk account by email on first sign in. */
export const PLACEHOLDER_PREFIX = PLACEHOLDER_USER_PREFIX;
export const REFERENCE_ORG_PREFIX = "seed:org-";

export type SeedLog = (message: string) => void;

export const referenceCounts = { workspaces: 3, users: 50, projects: 20, bigProjectTasks: 10_000, smallProjectTasks: 50, dependencies: 2_000, fields: 30, events: 100_000 };

export type ReferenceSummary = { workspaces: number; users: number; projects: number; tasks: number; dependencies: number; fields: number; events: number };

const firstNames = ["Ava", "Noah", "Mia", "Liam", "Zoe", "Ethan", "Isla", "Lucas", "Maya", "Owen", "Nora", "Eli", "Ruby", "Leo", "Iris", "Max", "Lena", "Kai", "Tess", "Finn"];
const lastNames = ["Patel", "Nguyen", "Garcia", "Kim", "Okafor", "Rossi", "Mendez", "Park", "Reed", "Alvarez", "Silva", "Chen", "Dubois", "Haddad", "Ibrahim", "Novak", "Sato", "Walsh", "Berg", "Costa"];
const verbs = ["Draft", "Review", "Ship", "Plan", "Test", "Design", "Write", "Fix", "Migrate", "Audit", "Launch", "Measure", "Schedule", "Approve", "Prepare"];
const nouns = ["landing page", "budget", "campaign brief", "API docs", "onboarding flow", "quarterly report", "vendor contract", "release notes", "retro notes", "pricing page", "search index", "mobile layout", "data export", "roadmap", "customer interviews", "support macros"];
const priorities = ["none", "low", "medium", "high", "urgent"] as const;
const colors = ["blue", "teal", "green", "lime", "yellow", "orange", "red", "berry", "purple", "navy", "gray", "brown"];

/** Deterministic pseudo random numbers so a seed run is reproducible. */
export function rng(seed = 42) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function dateOffset(base: Date, days: number): string {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function inBatches<T>(rows: T[], size: number, write: (batch: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await write(rows.slice(i, i + size));
}

/** Removes a previous reference dataset (workspaces cascade to everything else; users are removed by prefix). */
export async function resetReference(db: Database): Promise<void> {
  await db.delete(schema.workspaces).where(like(schema.workspaces.clerkOrgId, `${REFERENCE_ORG_PREFIX}%`));
  await db.delete(schema.users).where(like(schema.users.clerkUserId, "seed:user-%"));
}

export async function referenceExists(db: Database): Promise<boolean> {
  const rows = await db.select({ id: schema.workspaces.id }).from(schema.workspaces).where(like(schema.workspaces.clerkOrgId, `${REFERENCE_ORG_PREFIX}%`)).limit(1);
  return rows.length > 0;
}

/**
 * The reference dataset. `scale` shrinks every count proportionally (the tests use 0.01); counts never drop below
 * what the structure needs (one workspace, a few users, a project per workspace).
 */
export async function seedReference(db: Database, options: { scale?: number; log?: SeedLog; today?: Date } = {}): Promise<ReferenceSummary> {
  const scale = options.scale ?? 1;
  const log = options.log ?? (() => undefined);
  const today = options.today ?? new Date();
  const random = rng(7);
  const n = (count: number, min = 1) => Math.max(min, Math.round(count * scale));
  const counts = {
    workspaces: referenceCounts.workspaces,
    users: n(referenceCounts.users, 6),
    projects: n(referenceCounts.projects, 3),
    bigTasks: n(referenceCounts.bigProjectTasks, 20),
    smallTasks: n(referenceCounts.smallProjectTasks, 3),
    dependencies: n(referenceCounts.dependencies, 2),
    fields: n(referenceCounts.fields, 3),
    events: n(referenceCounts.events, 50),
  };

  // Users and workspaces.
  const userRows = await db
    .insert(schema.users)
    .values(
      Array.from({ length: counts.users }, (_, i) => ({
        clerkUserId: `seed:user-${i + 1}`,
        email: `seed-user-${i + 1}@example.com`,
        displayName: `${firstNames[i % firstNames.length]} ${lastNames[Math.floor(i / firstNames.length) % lastNames.length]}`,
        avatarUrl: null,
      })),
    )
    .returning({ id: schema.users.id });
  const userIds = userRows.map((u) => u.id);
  log(`users: ${userIds.length}`);

  const workspaceRows = await db
    .insert(schema.workspaces)
    .values(Array.from({ length: counts.workspaces }, (_, i) => ({ clerkOrgId: `${REFERENCE_ORG_PREFIX}${i + 1}`, slug: `seed-${i + 1}`, name: ["Northwind", "Contoso", "Fabrikam"][i] ?? `Seed ${i + 1}`, logoUrl: null })))
    .returning({ id: schema.workspaces.id });
  const memberCounts = [userIds.length, Math.max(2, Math.floor(userIds.length * 0.4)), Math.max(2, Math.floor(userIds.length * 0.2))];
  const membersByWorkspace: string[][] = workspaceRows.map((_, w) => userIds.slice(0, memberCounts[w] ?? 2));
  await db.insert(schema.workspaceMembers).values(workspaceRows.flatMap((ws, w) => membersByWorkspace[w].map((userId, i) => ({ workspaceId: ws.id, userId, role: i === 0 ? ("owner" as const) : i < 3 ? ("admin" as const) : ("member" as const) }))));
  log(`workspaces: ${workspaceRows.length}`);

  // Projects: the first workspace gets most of them; the first project is the big one.
  const projectPlan = Array.from({ length: counts.projects }, (_, i) => ({ workspaceIndex: i < Math.ceil(counts.projects * 0.6) ? 0 : i < Math.ceil(counts.projects * 0.85) ? 1 : 2, index: i }));
  const projectIds: string[] = [];
  const statusIdsByProject: string[][] = [];
  const sectionIdsByProject: string[][] = [];
  for (const plan of projectPlan) {
    const ws = workspaceRows[plan.workspaceIndex];
    const template = workflowTemplates[plan.index % 2 === 0 ? "simple" : "kanban"];
    const [workflow] = await db.insert(schema.workflows).values({ workspaceId: ws.id, name: template.name }).returning();
    const statuses = await db
      .insert(schema.statuses)
      .values(template.statuses.map((s, i) => ({ workflowId: workflow.id, name: s.name, category: s.category, color: s.color, position: i, wipLimit: s.wipLimit ?? null })))
      .returning({ id: schema.statuses.id });
    const members = membersByWorkspace[plan.workspaceIndex];
    const [project] = await db
      .insert(schema.projects)
      .values({ workspaceId: ws.id, workflowId: workflow.id, key: `P${plan.index + 1}`, name: plan.index === 0 ? "Platform backlog" : `${verbs[plan.index % verbs.length]} ${nouns[plan.index % nouns.length]}`, color: colors[plan.index % colors.length], privacy: "workspace", ownerId: members[0], startDate: dateOffset(today, -60), endDate: dateOffset(today, 120) })
      .returning({ id: schema.projects.id });
    await db.insert(schema.projectMembers).values({ projectId: project.id, userId: members[0], role: "owner" });
    const sections = await db
      .insert(schema.sections)
      .values(["Now", "Next", "Later"].map((name, i) => ({ projectId: project.id, name, position: (i + 1) * 1024 })))
      .returning({ id: schema.sections.id });
    const [view] = await db.insert(schema.savedViews).values({ workspaceId: ws.id, projectId: project.id, ownerId: members[0], name: "Default", type: "list", spec: {}, isShared: true, position: 0 }).returning({ id: schema.savedViews.id });
    await db.update(schema.projects).set({ defaultViewId: view.id }).where(eq(schema.projects.id, project.id));
    projectIds.push(project.id);
    statusIdsByProject.push(statuses.map((s) => s.id));
    sectionIdsByProject.push(sections.map((s) => s.id));
  }
  log(`projects: ${projectIds.length}`);

  // Custom fields live in the first workspace's library and attach to the big project.
  const fieldTypes = ["text", "number", "date", "single_select", "checkbox"] as const;
  const fieldRows = await db
    .insert(schema.fieldDefinitions)
    .values(
      Array.from({ length: counts.fields }, (_, i) => {
        const type = fieldTypes[i % fieldTypes.length];
        return { workspaceId: workspaceRows[0].id, projectId: null, name: `${["Effort", "Risk", "Region", "Channel", "Reviewed", "Budget"][i % 6]} ${i + 1}`, type, config: type === "single_select" ? { options: [{ id: "a", name: "North", color: "blue" }, { id: "b", name: "South", color: "teal" }, { id: "c", name: "West", color: "green" }] } : {}, isRequired: false, position: i };
      }),
    )
    .returning({ id: schema.fieldDefinitions.id, type: schema.fieldDefinitions.type });
  await db.insert(schema.projectFields).values(fieldRows.map((f, i) => ({ projectId: projectIds[0], fieldId: f.id, position: i })));
  const tagRows = await db
    .insert(schema.tags)
    .values(Array.from({ length: 10 }, (_, i) => ({ workspaceId: workspaceRows[0].id, name: `tag-${i + 1}`, color: colors[i % colors.length] })))
    .returning({ id: schema.tags.id });
  log(`fields: ${fieldRows.length}`);

  // Tasks: explicit numbers skip the per row numbering trigger.
  let taskTotal = 0;
  const bigTaskIds: string[] = [];
  for (let p = 0; p < projectIds.length; p += 1) {
    const total = p === 0 ? counts.bigTasks : counts.smallTasks;
    const members = membersByWorkspace[projectPlan[p].workspaceIndex];
    const statuses = statusIdsByProject[p];
    const sections = sectionIdsByProject[p];
    const rows = Array.from({ length: total }, (_, i) => {
      const statusIndex = Math.floor(random() * statuses.length);
      const done = statusIndex === statuses.length - 1;
      const start = Math.floor(random() * 150) - 60;
      const length = 1 + Math.floor(random() * 14);
      const title = `${verbs[Math.floor(random() * verbs.length)]} ${nouns[Math.floor(random() * nouns.length)]} ${i + 1}`;
      return {
        workspaceId: workspaceRows[projectPlan[p].workspaceIndex].id,
        projectId: projectIds[p],
        sectionId: sections[Math.floor(random() * sections.length)],
        number: i + 1,
        title,
        descriptionText: random() < 0.3 ? `Notes for ${title.toLowerCase()}.` : null,
        statusId: statuses[statusIndex],
        priority: priorities[Math.floor(random() * priorities.length)],
        assigneeId: random() < 0.8 ? members[Math.floor(random() * members.length)] : null,
        startDate: random() < 0.7 ? dateOffset(today, start) : null,
        dueDate: random() < 0.7 ? dateOffset(today, start + length) : null,
        estimate: random() < 0.6 ? String(1 + Math.floor(random() * 13)) : null,
        isMilestone: random() < 0.03,
        position: (i + 1) * 1024,
        createdBy: members[Math.floor(random() * members.length)],
        completedAt: done ? new Date(today.getTime() - Math.floor(random() * 30) * 86_400_000) : null,
        createdAt: new Date(today.getTime() - Math.floor(random() * 120) * 86_400_000),
      };
    });
    await inBatches(rows, 1000, async (batch) => {
      const inserted = await db.insert(schema.tasks).values(batch).returning({ id: schema.tasks.id });
      if (p === 0) bigTaskIds.push(...inserted.map((t) => t.id));
    });
    await db.update(schema.projects).set({ nextTaskNumber: total + 1 }).where(eq(schema.projects.id, projectIds[p]));
    taskTotal += total;
  }
  log(`tasks: ${taskTotal}`);

  // Dependencies within the big project, always from a lower to a higher index so no cycle can form.
  const depPairs = new Set<string>();
  const depRows: Array<{ predecessorId: string; successorId: string; type: "fs"; lagDays: number }> = [];
  while (depRows.length < Math.min(counts.dependencies, Math.floor(bigTaskIds.length / 2))) {
    const a = Math.floor(random() * (bigTaskIds.length - 1));
    const b = a + 1 + Math.floor(random() * Math.min(20, bigTaskIds.length - a - 1));
    const key = `${a}:${b}`;
    if (depPairs.has(key)) continue;
    depPairs.add(key);
    depRows.push({ predecessorId: bigTaskIds[a], successorId: bigTaskIds[b], type: "fs", lagDays: Math.floor(random() * 3) });
  }
  await inBatches(depRows, 500, (batch) => db.insert(schema.taskDependencies).values(batch));
  log(`dependencies: ${depRows.length}`);

  // Field values and tags for a slice of the big project.
  const valued = bigTaskIds.slice(0, Math.min(bigTaskIds.length, 2000));
  const valueRows = valued.flatMap((taskId, i) =>
    fieldRows.slice(0, 3).map((f) => ({
      taskId,
      fieldId: f.id,
      valueText: f.type === "text" ? `Value ${i}` : f.type === "single_select" ? ["a", "b", "c"][i % 3] : null,
      valueNumber: f.type === "number" ? String((i % 13) + 1) : null,
      valueDate: f.type === "date" ? dateOffset(today, i % 40) : null,
      valueBool: f.type === "checkbox" ? i % 2 === 0 : null,
      valueJson: null,
    })),
  );
  await inBatches(valueRows, 1000, (batch) => db.insert(schema.taskFieldValues).values(batch));
  await inBatches(
    bigTaskIds.filter((_, i) => i % 5 === 0).map((taskId, i) => ({ taskId, tagId: tagRows[i % tagRows.length].id })),
    1000,
    (batch) => db.insert(schema.taskTags).values(batch),
  );

  // Cycles for the big project.
  await db.insert(schema.cycles).values([
    { projectId: projectIds[0], name: "Cycle 1", startDate: dateOffset(today, -28), endDate: dateOffset(today, -15), capacity: "60", closedAt: new Date(today.getTime() - 14 * 86_400_000) },
    { projectId: projectIds[0], name: "Cycle 2", startDate: dateOffset(today, -14), endDate: dateOffset(today, -1), capacity: "60", closedAt: new Date(today.getTime() - 86_400_000) },
    { projectId: projectIds[0], name: "Cycle 3", startDate: dateOffset(today, 0), endDate: dateOffset(today, 13), capacity: "60" },
  ]);

  // Events: a created event per task, then updates spread over the big project until the target count.
  const members = membersByWorkspace[0];
  const eventTypes = ["task.updated", "task.status_changed", "task.assigned", "task.dates_changed", "comment.created", "task.completed"] as const;
  const eventRows: Array<typeof schema.taskEvents.$inferInsert> = [];
  const allTasks = await db.select({ id: schema.tasks.id, projectId: schema.tasks.projectId, workspaceId: schema.tasks.workspaceId, createdBy: schema.tasks.createdBy, createdAt: schema.tasks.createdAt }).from(schema.tasks).where(inArray(schema.tasks.projectId, projectIds));
  for (const t of allTasks) eventRows.push({ workspaceId: t.workspaceId, projectId: t.projectId, taskId: t.id, actorId: t.createdBy, type: "task.created", after: {}, createdAt: t.createdAt });
  let i = 0;
  while (eventRows.length < counts.events) {
    const t = allTasks[i % allTasks.length];
    const type = eventTypes[Math.floor(random() * eventTypes.length)];
    eventRows.push({ workspaceId: t.workspaceId, projectId: t.projectId, taskId: t.id, actorId: members[Math.floor(random() * members.length)], type, field: type === "task.status_changed" ? "status" : type === "task.assigned" ? "assignee" : type === "task.dates_changed" ? "due_date" : null, before: null, after: null, createdAt: new Date(t.createdAt.getTime() + Math.floor(random() * 30) * 3_600_000) });
    i += 1;
  }
  await inBatches(eventRows, 2000, (batch) => db.insert(schema.taskEvents).values(batch));
  log(`events: ${eventRows.length}`);

  return { workspaces: workspaceRows.length, users: userIds.length, projects: projectIds.length, tasks: taskTotal, dependencies: depRows.length, fields: fieldRows.length, events: eventRows.length };
}

export type BetaMember = { name: string; email: string; role: "owner" | "admin" | "member" };

export const defaultBetaRoster: BetaMember[] = [
  { name: "Spencer Townley", email: "spencer@taskparty.local", role: "owner" },
  { name: "Jenny", email: "jenny@taskparty.local", role: "member" },
  { name: "Mary", email: "mary@taskparty.local", role: "member" },
  { name: "Amelia", email: "amelia@taskparty.local", role: "member" },
  { name: "Pete", email: "pete@taskparty.local", role: "member" },
  { name: "Anthony", email: "anthony@taskparty.local", role: "member" },
  { name: "Lisa", email: "lisa@taskparty.local", role: "member" },
  { name: "Logan", email: "logan@taskparty.local", role: "member" },
  { name: "Anisa", email: "anisa@taskparty.local", role: "member" },
  { name: "Karla", email: "karla@taskparty.local", role: "member" },
];

/** Applies `SEED_BETA_EMAILS` (a JSON object of first name to email) over the default roster. */
export function rosterWithEmails(overrides: Record<string, string> | null | undefined, roster = defaultBetaRoster): BetaMember[] {
  if (!overrides) return roster;
  const byFirst = new Map(Object.entries(overrides).map(([k, v]) => [k.trim().toLowerCase(), v.trim().toLowerCase()]));
  return roster.map((m) => ({ ...m, email: byFirst.get(m.name.split(" ")[0].toLowerCase()) ?? m.email }));
}

export type BetaSummary = { workspaceId: string; slug: string; members: number; projectId: string | null; created: boolean };

/**
 * The first real workspace: placeholder users for the roster (linked to Clerk by email on sign in), the TaskParty
 * workspace, and a starter project. Safe to run again: everything upserts and the starter project is created once.
 */
export async function seedBeta(db: Database, options: { roster?: BetaMember[]; clerkOrgId?: string; log?: SeedLog; today?: string } = {}): Promise<BetaSummary> {
  const roster = options.roster ?? defaultBetaRoster;
  const log = options.log ?? (() => undefined);
  const clerkOrgId = options.clerkOrgId ?? `${PLACEHOLDER_PREFIX}org:taskparty`;
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const workspace = await upsertWorkspace(db, { clerkOrgId, slug: "taskparty", name: "TaskParty", logoUrl: null });
  const users: Array<{ id: string; clerkUserId: string }> = [];
  for (const m of roster) {
    const email = m.email.toLowerCase();
    const [existing] = await db.select({ id: schema.users.id, clerkUserId: schema.users.clerkUserId }).from(schema.users).where(eq(schema.users.email, email));
    const clerkUserId = existing?.clerkUserId ?? `${PLACEHOLDER_PREFIX}${email}`;
    const user = await upsertUser(db, { clerkUserId, email, displayName: m.name, avatarUrl: null });
    users.push({ id: user.id, clerkUserId });
    await upsertMembership(db, clerkOrgId, clerkUserId, m.role === "owner" ? "org:owner" : m.role === "admin" ? "org:admin" : "org:member");
  }
  log(`workspace ${workspace.slug}: ${users.length} members`);

  const [existingProject] = await db.select({ id: schema.projects.id }).from(schema.projects).where(eq(schema.projects.workspaceId, workspace.id)).limit(1);
  if (existingProject) return { workspaceId: workspace.id, slug: workspace.slug, members: users.length, projectId: existingProject.id, created: false };

  const owner: Actor = { userId: users[0].id, workspaceId: workspace.id, workspaceRole: "owner" };
  const ctx = { db, actor: owner };
  const project = await createProject(ctx, { name: "Getting started", key: "START", color: "berry", privacy: "workspace", workflowTemplate: "simple", templateId: "simple", description: "A few tasks to try the views. Delete this project whenever you like." }, today);
  const [detail] = await db.select({ id: schema.sections.id }).from(schema.sections).where(eq(schema.sections.projectId, project.id)).orderBy(schema.sections.position).limit(1);
  const starters = [
    { title: "Invite the team from Settings", assignee: 0, due: 1, priority: "high" as const },
    { title: "Create a project from a template", assignee: 1, due: 2, priority: "medium" as const },
    { title: "Drag a card across the Board", assignee: 2, due: 3, priority: "medium" as const },
    { title: "Plan the first cycle from the backlog", assignee: 3, due: 5, priority: "low" as const },
    { title: "Import tasks from a CSV export", assignee: 4, due: 7, priority: "low" as const },
  ];
  for (let i = 0; i < starters.length; i += 1) {
    const s = starters[i];
    await createTask(ctx, { projectId: project.id, title: s.title, sectionId: detail?.id ?? null, assigneeId: users[s.assignee % users.length]?.id ?? null, dueDate: dateOffset(new Date(today + "T00:00:00Z"), s.due), priority: s.priority, estimate: 2 });
  }
  log(`starter project ${project.key}: ${starters.length} tasks`);
  return { workspaceId: workspace.id, slug: workspace.slug, members: users.length, projectId: project.id, created: true };
}
