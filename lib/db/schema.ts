/*
  Drizzle schema for TaskParty. Mirrors supabase/migrations/0001_initial_schema.sql.
  The SQL migration is the source of truth; keep this file in step with it.
*/
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  integer,
  bigint,
  numeric,
  date,
  time,
  timestamp,
  jsonb,
  doublePrecision,
  smallint,
  primaryKey,
  unique,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql, relations } from "drizzle-orm";

// Enumerations ---------------------------------------------------------------
export const workspaceRole = pgEnum("workspace_role", ["owner", "admin", "member", "guest"]);
export const projectRole = pgEnum("project_role", ["owner", "editor", "commenter", "viewer"]);
export const projectPrivacy = pgEnum("project_privacy", ["workspace", "team", "private"]);
export const statusCategory = pgEnum("status_category", ["backlog", "not_started", "in_progress", "done"]);
export const priority = pgEnum("priority", ["none", "low", "medium", "high", "urgent"]);
export const dependencyType = pgEnum("dependency_type", ["fs", "ss", "ff", "sf"]);
export const fieldType = pgEnum("field_type", [
  "text",
  "long_text",
  "number",
  "currency",
  "percent",
  "date",
  "single_select",
  "multi_select",
  "person",
  "checkbox",
  "url",
  "email",
  "phone",
  "formula",
  "rollup",
  "relation",
]);
export const viewType = pgEnum("view_type", [
  "list",
  "board",
  "table",
  "gantt",
  "timeline",
  "calendar",
  "workload",
  "dashboard",
]);
export const health = pgEnum("health", ["on_track", "at_risk", "off_track", "on_hold", "complete"]);
export const estimateUnit = pgEnum("estimate_unit", ["points", "hours"]);
export const notificationChannel = pgEnum("notification_channel", ["in_app", "email", "chat"]);
export const webhookDeliveryStatus = pgEnum("webhook_delivery_status", [
  "pending",
  "delivered",
  "failed",
  "disabled",
]);

const now = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const deletedAt = () => timestamp("deleted_at", { withTimezone: true });

// Identity -------------------------------------------------------------------
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  timezone: text("timezone").notNull().default("UTC"),
  locale: text("locale").notNull().default("en-US"),
  createdAt: now(),
  updatedAt: updatedAt(),
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkOrgId: text("clerk_org_id").notNull().unique(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  estimateUnit: estimateUnit("estimate_unit").notNull().default("points"),
  allowMultipleAssignees: boolean("allow_multiple_assignees").notNull().default(false),
  cycleLabel: text("cycle_label").notNull().default("Cycle"),
  weekStartsOn: smallint("week_starts_on").notNull().default(1),
  plan: text("plan").notNull().default("free"),
  createdAt: now(),
  updatedAt: updatedAt(),
  deletedAt: deletedAt(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: workspaceRole("role").notNull().default("member"),
    weeklyCapacityHours: numeric("weekly_capacity_hours", { precision: 5, scale: 2 }).notNull().default("40"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] }), index().on(t.userId)],
);

export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").notNull().default("blue"),
  createdAt: now(),
  updatedAt: updatedAt(),
  deletedAt: deletedAt(),
});

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    isLead: boolean("is_lead").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.userId] })],
);

// Projects and structure -----------------------------------------------------
export const workflows = pgTable("workflows", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  isTemplate: boolean("is_template").notNull().default(false),
  createdAt: now(),
});

export const statuses = pgTable(
  "statuses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: statusCategory("category").notNull(),
    color: text("color").notNull(),
    position: integer("position").notNull(),
    wipLimit: integer("wip_limit"),
  },
  (t) => [unique().on(t.workflowId, t.name)],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    color: text("color").notNull().default("blue"),
    icon: text("icon"),
    privacy: projectPrivacy("privacy").notNull().default("workspace"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    startDate: date("start_date"),
    endDate: date("end_date"),
    defaultViewId: uuid("default_view_id"),
    autoSchedule: boolean("auto_schedule").notNull().default(false),
    nextTaskNumber: integer("next_task_number").notNull().default(1),
    isTemplate: boolean("is_template").notNull().default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: now(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [unique().on(t.workspaceId, t.key)],
);

export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: projectRole("role").notNull().default("editor"),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.userId] }), index().on(t.userId)],
);

export const sections = pgTable(
  "sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: doublePrecision("position").notNull(),
    isCollapsed: boolean("is_collapsed").notNull().default(false),
    createdAt: now(),
    deletedAt: deletedAt(),
  },
  (t) => [index().on(t.projectId, t.position)],
);

export const cycles = pgTable("cycles", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  goal: text("goal"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  capacity: numeric("capacity", { precision: 8, scale: 2 }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: now(),
});

// Tasks ----------------------------------------------------------------------
export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id").references(() => sections.id, { onDelete: "set null" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => tasks.id, { onDelete: "cascade" }),
    cycleId: uuid("cycle_id").references(() => cycles.id, { onDelete: "set null" }),
    number: integer("number").notNull().default(0),
    title: text("title").notNull(),
    description: jsonb("description"),
    descriptionText: text("description_text"),
    statusId: uuid("status_id")
      .notNull()
      .references(() => statuses.id),
    priority: priority("priority").notNull().default("none"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    startDate: date("start_date"),
    dueDate: date("due_date"),
    dueTime: time("due_time"),
    estimate: numeric("estimate", { precision: 8, scale: 2 }),
    isMilestone: boolean("is_milestone").notNull().default(false),
    recurrence: jsonb("recurrence"),
    position: doublePrecision("position").notNull().default(0),
    version: integer("version").notNull().default(1),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: uuid("completed_by").references(() => users.id),
    createdAt: now(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    unique().on(t.projectId, t.number),
    index().on(t.projectId, t.sectionId, t.position),
    index().on(t.parentId),
    index().on(t.cycleId),
    index().on(t.statusId),
    index().on(t.projectId, t.dueDate),
  ],
);

export const taskAssignees = pgTable(
  "task_assignees",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.userId] })],
);

export const taskProjects = pgTable(
  "task_projects",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id").references(() => sections.id, { onDelete: "set null" }),
    position: doublePrecision("position").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.projectId] })],
);

export const taskDependencies = pgTable(
  "task_dependencies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    predecessorId: uuid("predecessor_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    successorId: uuid("successor_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    type: dependencyType("type").notNull().default("fs"),
    lagDays: integer("lag_days").notNull().default(0),
    createdAt: now(),
  },
  (t) => [unique().on(t.predecessorId, t.successorId), index().on(t.successorId)],
);

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull(),
  },
  (t) => [unique().on(t.workspaceId, t.name)],
);

export const taskTags = pgTable(
  "task_tags",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.tagId] })],
);

export const taskFollowers = pgTable(
  "task_followers",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.userId] })],
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    body: jsonb("body").notNull(),
    bodyText: text("body_text").notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => comments.id, { onDelete: "cascade" }),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    createdAt: now(),
    deletedAt: deletedAt(),
  },
  (t) => [index().on(t.taskId, t.createdAt)],
);

export const attachments = pgTable("attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  commentId: uuid("comment_id").references(() => comments.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  mimeType: text("mime_type"),
  sizeBytes: bigint("size_bytes", { mode: "number" }),
  storagePath: text("storage_path"),
  url: text("url"),
  uploadedBy: uuid("uploaded_by")
    .notNull()
    .references(() => users.id),
  createdAt: now(),
  deletedAt: deletedAt(),
});

export const commentReactions = pgTable(
  "comment_reactions",
  {
    commentId: uuid("comment_id")
      .notNull()
      .references(() => comments.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
  },
  (t) => [primaryKey({ columns: [t.commentId, t.userId, t.emoji] })],
);

// Custom fields ----------------------------------------------------------------
export const fieldDefinitions = pgTable("field_definitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: fieldType("type").notNull(),
  config: jsonb("config").notNull().default({}),
  isRequired: boolean("is_required").notNull().default(false),
  position: integer("position").notNull().default(0),
  createdAt: now(),
  deletedAt: deletedAt(),
});

export const projectFields = pgTable(
  "project_fields",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    fieldId: uuid("field_id")
      .notNull()
      .references(() => fieldDefinitions.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.fieldId] })],
);

export const taskFieldValues = pgTable(
  "task_field_values",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    fieldId: uuid("field_id")
      .notNull()
      .references(() => fieldDefinitions.id, { onDelete: "cascade" }),
    valueText: text("value_text"),
    valueNumber: numeric("value_number", { precision: 18, scale: 4 }),
    valueDate: date("value_date"),
    valueBool: boolean("value_bool"),
    valueJson: jsonb("value_json"),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.fieldId] })],
);

// Views, portfolios, goals, status updates, baselines -------------------------
export const savedViews = pgTable(
  "saved_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    type: viewType("type").notNull(),
    spec: jsonb("spec").notNull(),
    isShared: boolean("is_shared").notNull().default(false),
    position: integer("position").notNull().default(0),
    createdAt: now(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index().on(t.projectId, t.position)],
);

export const portfolios = pgTable("portfolios", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  description: text("description"),
  createdAt: now(),
  deletedAt: deletedAt(),
});

export const portfolioProjects = pgTable(
  "portfolio_projects",
  {
    portfolioId: uuid("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.portfolioId, t.projectId] })],
);

export const goals = pgTable("goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id").references((): AnyPgColumn => goals.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  periodStart: date("period_start"),
  periodEnd: date("period_end"),
  progressMode: text("progress_mode").notNull().default("auto"),
  progress: numeric("progress", { precision: 5, scale: 2 }).notNull().default("0"),
  health: health("health"),
  createdAt: now(),
  deletedAt: deletedAt(),
});

export const goalLinks = pgTable("goal_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  goalId: uuid("goal_id")
    .notNull()
    .references(() => goals.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
});

export const statusUpdates = pgTable("status_updates", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id),
  health: health("health").notNull(),
  title: text("title").notNull(),
  body: jsonb("body"),
  metrics: jsonb("metrics"),
  createdAt: now(),
});

export const baselines = pgTable("baselines", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: now(),
});

export const baselineTasks = pgTable(
  "baseline_tasks",
  {
    baselineId: uuid("baseline_id")
      .notNull()
      .references(() => baselines.id, { onDelete: "cascade" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    startDate: date("start_date"),
    dueDate: date("due_date"),
  },
  (t) => [primaryKey({ columns: [t.baselineId, t.taskId] })],
);

// Events and notifications -----------------------------------------------------
export const taskEvents = pgTable(
  "task_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    automationId: uuid("automation_id"),
    type: text("type").notNull(),
    field: text("field"),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: now(),
  },
  (t) => [index().on(t.taskId, t.createdAt), index().on(t.projectId, t.createdAt)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    payload: jsonb("payload").notNull().default({}),
    readAt: timestamp("read_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    createdAt: now(),
  },
  (t) => [index().on(t.userId, t.workspaceId, t.createdAt)],
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    channel: notificationChannel("channel").notNull(),
    enabled: boolean("enabled").notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.userId, t.workspaceId, t.type, t.channel] })],
);

// Forms and automations ----------------------------------------------------------
export const forms = pgTable("forms", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  sectionId: uuid("section_id").references(() => sections.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  publicToken: text("public_token").unique(),
  schema: jsonb("schema").notNull(),
  isEnabled: boolean("is_enabled").notNull().default(true),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: now(),
  updatedAt: updatedAt(),
  deletedAt: deletedAt(),
});

export const formSubmissions = pgTable("form_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  formId: uuid("form_id")
    .notNull()
    .references(() => forms.id, { onDelete: "cascade" }),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
  submitterEmail: text("submitter_email"),
  data: jsonb("data").notNull(),
  createdAt: now(),
});

export const automations = pgTable("automations", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  trigger: jsonb("trigger").notNull(),
  conditions: jsonb("conditions").notNull().default([]),
  actions: jsonb("actions").notNull(),
  isEnabled: boolean("is_enabled").notNull().default(true),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: now(),
  updatedAt: updatedAt(),
  deletedAt: deletedAt(),
});

export const automationRuns = pgTable("automation_runs", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  automationId: uuid("automation_id")
    .notNull()
    .references(() => automations.id, { onDelete: "cascade" }),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
  triggeredByEventId: bigint("triggered_by_event_id", { mode: "number" }),
  status: text("status").notNull(),
  error: text("error"),
  durationMs: integer("duration_ms"),
  createdAt: now(),
});

// Integrations -------------------------------------------------------------------
export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  scopes: text("scopes")
    .array()
    .notNull()
    .default(sql`'{read,write}'`),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: now(),
});

export const webhooks = pgTable("webhooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  secret: text("secret").notNull(),
  events: text("events").array().notNull(),
  isEnabled: boolean("is_enabled").notNull().default(true),
  failureCount: integer("failure_count").notNull().default(0),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: now(),
  deletedAt: deletedAt(),
});

export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  webhookId: uuid("webhook_id")
    .notNull()
    .references(() => webhooks.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  status: webhookDeliveryStatus("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  lastResponseCode: integer("last_response_code"),
  lastError: text("last_error"),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  createdAt: now(),
});

export const inboundWebhooks = pgTable("inbound_webhooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  token: text("token").notNull().unique(),
  secret: text("secret"),
  mapping: jsonb("mapping").notNull(),
  isEnabled: boolean("is_enabled").notNull().default(true),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: now(),
});

export const connections = pgTable(
  "connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    externalId: text("external_id"),
    credentials: jsonb("credentials").notNull(),
    settings: jsonb("settings").notNull().default({}),
    createdAt: now(),
    updatedAt: updatedAt(),
  },
  (t) => [unique().on(t.workspaceId, t.userId, t.provider)],
);

export const taskLinks = pgTable(
  "task_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    externalId: text("external_id"),
    url: text("url").notNull(),
    title: text("title"),
    state: text("state"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: now(),
    updatedAt: updatedAt(),
  },
  (t) => [unique().on(t.taskId, t.provider, t.externalId)],
);

// Relations (used by db.query helpers) --------------------------------------------
export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, { fields: [tasks.projectId], references: [projects.id] }),
  section: one(sections, { fields: [tasks.sectionId], references: [sections.id] }),
  status: one(statuses, { fields: [tasks.statusId], references: [statuses.id] }),
  assignee: one(users, { fields: [tasks.assigneeId], references: [users.id] }),
  parent: one(tasks, { fields: [tasks.parentId], references: [tasks.id], relationName: "subtasks" }),
  subtasks: many(tasks, { relationName: "subtasks" }),
  comments: many(comments),
  tags: many(taskTags),
  fieldValues: many(taskFieldValues),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [projects.workspaceId], references: [workspaces.id] }),
  workflow: one(workflows, { fields: [projects.workflowId], references: [workflows.id] }),
  sections: many(sections),
  tasks: many(tasks),
  members: many(projectMembers),
}));

export const workflowsRelations = relations(workflows, ({ many }) => ({ statuses: many(statuses) }));
export const statusesRelations = relations(statuses, ({ one }) => ({
  workflow: one(workflows, { fields: [statuses.workflowId], references: [workflows.id] }),
}));
export const sectionsRelations = relations(sections, ({ one, many }) => ({
  project: one(projects, { fields: [sections.projectId], references: [projects.id] }),
  tasks: many(tasks),
}));
export const commentsRelations = relations(comments, ({ one }) => ({
  task: one(tasks, { fields: [comments.taskId], references: [tasks.id] }),
  author: one(users, { fields: [comments.authorId], references: [users.id] }),
}));
export const taskTagsRelations = relations(taskTags, ({ one }) => ({
  task: one(tasks, { fields: [taskTags.taskId], references: [tasks.id] }),
  tag: one(tags, { fields: [taskTags.tagId], references: [tags.id] }),
}));
export const taskFieldValuesRelations = relations(taskFieldValues, ({ one }) => ({
  task: one(tasks, { fields: [taskFieldValues.taskId], references: [tasks.id] }),
  field: one(fieldDefinitions, { fields: [taskFieldValues.fieldId], references: [fieldDefinitions.id] }),
}));
export const workspaceMembersRelations = relations(workspaceMembers, ({ one }) => ({
  workspace: one(workspaces, { fields: [workspaceMembers.workspaceId], references: [workspaces.id] }),
  user: one(users, { fields: [workspaceMembers.userId], references: [users.id] }),
}));
export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, { fields: [projectMembers.projectId], references: [projects.id] }),
  user: one(users, { fields: [projectMembers.userId], references: [users.id] }),
}));

// Inferred types ------------------------------------------------------------------
export type User = typeof users.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Section = typeof sections.$inferSelect;
export type Status = typeof statuses.$inferSelect;
export type Workflow = typeof workflows.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type Comment = typeof comments.$inferSelect;
export type FieldDefinition = typeof fieldDefinitions.$inferSelect;
export type TaskFieldValue = typeof taskFieldValues.$inferSelect;
export type SavedView = typeof savedViews.$inferSelect;
export type Cycle = typeof cycles.$inferSelect;
export type TaskEvent = typeof taskEvents.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type TaskDependency = typeof taskDependencies.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type WorkspaceRole = (typeof workspaceRole.enumValues)[number];
export type ProjectRole = (typeof projectRole.enumValues)[number];
export type StatusCategory = (typeof statusCategory.enumValues)[number];
export type Priority = (typeof priority.enumValues)[number];
export type ViewType = (typeof viewType.enumValues)[number];
export type FieldType = (typeof fieldType.enumValues)[number];
export type DependencyType = (typeof dependencyType.enumValues)[number];
export type Health = (typeof health.enumValues)[number];
