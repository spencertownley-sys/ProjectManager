-- TaskParty initial schema
-- Version 1.0, 03 Nov 2026
-- Postgres 16 on Supabase. Executable form of docs/06-data-model.md.
-- Conventions: snake_case, uuid primary keys (uuidv7 where available), timestamptz,
-- soft delete via deleted_at on user-facing entities, version counter on tasks.

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
create type workspace_role as enum ('owner', 'admin', 'member', 'guest');
create type project_role as enum ('owner', 'editor', 'commenter', 'viewer');
create type project_privacy as enum ('workspace', 'team', 'private');
create type status_category as enum ('backlog', 'not_started', 'in_progress', 'done');
create type priority as enum ('none', 'low', 'medium', 'high', 'urgent');
create type dependency_type as enum ('fs', 'ss', 'ff', 'sf');
create type field_type as enum (
  'text', 'long_text', 'number', 'currency', 'percent', 'date', 'single_select',
  'multi_select', 'person', 'checkbox', 'url', 'email', 'phone', 'formula', 'rollup', 'relation'
);
create type view_type as enum (
  'list', 'board', 'table', 'gantt', 'timeline', 'calendar', 'workload', 'dashboard'
);
create type health as enum ('on_track', 'at_risk', 'off_track', 'on_hold', 'complete');
create type estimate_unit as enum ('points', 'hours');
create type notification_channel as enum ('in_app', 'email', 'chat');
create type webhook_delivery_status as enum ('pending', 'delivered', 'failed', 'disabled');

-- ---------------------------------------------------------------------------
-- Identity mirror (source of truth is Clerk)
-- ---------------------------------------------------------------------------
create table users (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null unique,
  email text not null,
  display_name text not null,
  avatar_url text,
  timezone text not null default 'UTC',
  locale text not null default 'en-US',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  clerk_org_id text not null unique,
  slug text not null unique,
  name text not null,
  logo_url text,
  estimate_unit estimate_unit not null default 'points',
  allow_multiple_assignees boolean not null default false,
  cycle_label text not null default 'Cycle',
  week_starts_on smallint not null default 1 check (week_starts_on between 0 and 6),
  plan text not null default 'free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table workspace_members (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role workspace_role not null default 'member',
  weekly_capacity_hours numeric(5,2) not null default 40,
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  description text,
  color text not null default '#0F6CBD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table team_members (
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  is_lead boolean not null default false,
  primary key (team_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Projects and structure
-- ---------------------------------------------------------------------------
create table workflows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  is_template boolean not null default false,
  created_at timestamptz not null default now()
);

create table statuses (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references workflows(id) on delete cascade,
  name text not null,
  category status_category not null,
  color text not null,
  position integer not null,
  wip_limit integer,
  unique (workflow_id, name)
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  team_id uuid references teams(id) on delete set null,
  workflow_id uuid not null references workflows(id),
  key text not null,                       -- short prefix for task keys, e.g. MKT
  name text not null,
  description text,
  color text not null default '#0F6CBD',
  icon text,
  privacy project_privacy not null default 'workspace',
  owner_id uuid references users(id) on delete set null,
  start_date date,
  end_date date,
  default_view_id uuid,                    -- fk added after saved_views exists
  auto_schedule boolean not null default false,
  next_task_number integer not null default 1,
  is_template boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workspace_id, key)
);

create table project_members (
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role project_role not null default 'editor',
  primary key (project_id, user_id)
);

create table sections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  position double precision not null,
  is_collapsed boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table cycles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  goal text,
  start_date date not null,
  end_date date not null,
  capacity numeric(8,2),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

-- ---------------------------------------------------------------------------
-- Tasks
-- ---------------------------------------------------------------------------
create table tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,   -- home project
  section_id uuid references sections(id) on delete set null,
  parent_id uuid references tasks(id) on delete cascade,
  cycle_id uuid references cycles(id) on delete set null,
  number integer not null,                                              -- per project
  title text not null,
  description jsonb,                                                    -- Tiptap JSON
  description_text text,                                                -- plain text for search
  status_id uuid not null references statuses(id),
  priority priority not null default 'none',
  assignee_id uuid references users(id) on delete set null,
  start_date date,
  due_date date,
  due_time time,
  estimate numeric(8,2),
  is_milestone boolean not null default false,
  recurrence jsonb,                                                     -- RRULE-like spec
  position double precision not null default 0,                         -- within section
  version integer not null default 1,
  created_by uuid not null references users(id),
  completed_at timestamptz,
  completed_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description_text, '')), 'B')
  ) stored,
  unique (project_id, number),
  check (not is_milestone or start_date is null or start_date = due_date)
);

create table task_assignees (             -- used only when workspace allows multiple assignees
  task_id uuid not null references tasks(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  primary key (task_id, user_id)
);

create table task_projects (              -- multi-homing: task appears in additional projects
  task_id uuid not null references tasks(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  section_id uuid references sections(id) on delete set null,
  position double precision not null default 0,
  primary key (task_id, project_id)
);

create table task_dependencies (
  id uuid primary key default gen_random_uuid(),
  predecessor_id uuid not null references tasks(id) on delete cascade,
  successor_id uuid not null references tasks(id) on delete cascade,
  type dependency_type not null default 'fs',
  lag_days integer not null default 0,
  created_at timestamptz not null default now(),
  unique (predecessor_id, successor_id),
  check (predecessor_id <> successor_id)
);

create table tags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  color text not null,
  unique (workspace_id, name)
);

create table task_tags (
  task_id uuid not null references tasks(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  primary key (task_id, tag_id)
);

create table task_followers (
  task_id uuid not null references tasks(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  primary key (task_id, user_id)
);

create table attachments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  task_id uuid references tasks(id) on delete cascade,
  comment_id uuid,                        -- fk added below
  name text not null,
  mime_type text,
  size_bytes bigint,
  storage_path text,                      -- null for link attachments
  url text,                               -- external link
  uploaded_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (storage_path is not null or url is not null)
);

create table comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  author_id uuid not null references users(id),
  body jsonb not null,
  body_text text not null,
  parent_id uuid references comments(id) on delete cascade,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table attachments
  add constraint attachments_comment_fk foreign key (comment_id) references comments(id) on delete cascade;

create table comment_reactions (
  comment_id uuid not null references comments(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  emoji text not null,
  primary key (comment_id, user_id, emoji)
);

-- ---------------------------------------------------------------------------
-- Custom fields
-- ---------------------------------------------------------------------------
create table field_definitions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,   -- null = workspace library
  name text not null,
  type field_type not null,
  config jsonb not null default '{}'::jsonb,   -- options, precision, currency, formula, rollup spec, relation target
  is_required boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table project_fields (                 -- which library fields a project has adopted
  project_id uuid not null references projects(id) on delete cascade,
  field_id uuid not null references field_definitions(id) on delete cascade,
  position integer not null default 0,
  primary key (project_id, field_id)
);

create table task_field_values (
  task_id uuid not null references tasks(id) on delete cascade,
  field_id uuid not null references field_definitions(id) on delete cascade,
  value_text text,
  value_number numeric(18,4),
  value_date date,
  value_bool boolean,
  value_json jsonb,                           -- select option ids, person ids, relation ids
  updated_at timestamptz not null default now(),
  primary key (task_id, field_id)
);

-- ---------------------------------------------------------------------------
-- Views, portfolios, goals, status updates, baselines
-- ---------------------------------------------------------------------------
create table saved_views (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,   -- null for workspace views (My Work etc.)
  owner_id uuid references users(id) on delete set null,
  name text not null,
  type view_type not null,
  spec jsonb not null,                        -- ViewSpec
  is_shared boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table projects
  add constraint projects_default_view_fk foreign key (default_view_id) references saved_views(id) on delete set null;

create table portfolios (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  owner_id uuid references users(id) on delete set null,
  description text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table portfolio_projects (
  portfolio_id uuid not null references portfolios(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  position integer not null default 0,
  primary key (portfolio_id, project_id)
);

create table goals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  parent_id uuid references goals(id) on delete cascade,     -- key result under objective
  name text not null,
  description text,
  owner_id uuid references users(id) on delete set null,
  period_start date,
  period_end date,
  progress_mode text not null default 'auto' check (progress_mode in ('auto', 'manual')),
  progress numeric(5,2) not null default 0,
  health health,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table goal_links (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references goals(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  task_id uuid references tasks(id) on delete cascade,
  check ((project_id is not null)::int + (task_id is not null)::int = 1)
);
create unique index goal_links_project_unique on goal_links (goal_id, project_id) where project_id is not null;
create unique index goal_links_task_unique on goal_links (goal_id, task_id) where task_id is not null;

create table status_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  author_id uuid not null references users(id),
  health health not null,
  title text not null,
  body jsonb,
  metrics jsonb,                              -- snapshot: completed, overdue, upcoming milestones
  created_at timestamptz not null default now()
);

create table baselines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

create table baseline_tasks (
  baseline_id uuid not null references baselines(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  start_date date,
  due_date date,
  primary key (baseline_id, task_id)
);

-- ---------------------------------------------------------------------------
-- Events, notifications
-- ---------------------------------------------------------------------------
create table task_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  actor_id uuid references users(id) on delete set null,     -- null for system or automation
  automation_id uuid,
  type text not null,                         -- task.created, task.status_changed, ...
  field text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  type text not null,
  task_id uuid references tasks(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  actor_id uuid references users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  archived_at timestamptz,
  snoozed_until timestamptz,
  created_at timestamptz not null default now()
);

create table notification_preferences (
  user_id uuid not null references users(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  type text not null,
  channel notification_channel not null,
  enabled boolean not null default true,
  primary key (user_id, workspace_id, type, channel)
);

-- ---------------------------------------------------------------------------
-- Forms and automations
-- ---------------------------------------------------------------------------
create table forms (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  section_id uuid references sections(id) on delete set null,
  name text not null,
  description text,
  public_token text unique,
  schema jsonb not null,                      -- fields, mapping, conditions
  is_enabled boolean not null default true,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table form_submissions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references forms(id) on delete cascade,
  task_id uuid references tasks(id) on delete set null,
  submitter_email text,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table automations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,   -- null = workspace-wide
  name text not null,
  trigger jsonb not null,
  conditions jsonb not null default '[]'::jsonb,
  actions jsonb not null,
  is_enabled boolean not null default true,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table automation_runs (
  id bigint generated always as identity primary key,
  automation_id uuid not null references automations(id) on delete cascade,
  task_id uuid references tasks(id) on delete set null,
  triggered_by_event_id bigint references task_events(id) on delete set null,
  status text not null check (status in ('success', 'failed', 'skipped')),
  error text,
  duration_ms integer,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Integrations
-- ---------------------------------------------------------------------------
create table api_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  key_prefix text not null,                   -- first 8 characters for display
  key_hash text not null unique,              -- sha256 of full key
  scopes text[] not null default '{read,write}',
  created_by uuid not null references users(id),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table webhooks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  url text not null,
  secret text not null,
  events text[] not null,
  is_enabled boolean not null default true,
  failure_count integer not null default 0,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table webhook_deliveries (
  id bigint generated always as identity primary key,
  webhook_id uuid not null references webhooks(id) on delete cascade,
  event_type text not null,
  payload jsonb not null,
  status webhook_delivery_status not null default 'pending',
  attempts integer not null default 0,
  last_response_code integer,
  last_error text,
  next_attempt_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create table inbound_webhooks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  token text not null unique,
  secret text,
  mapping jsonb not null,                     -- JSON path to task field mapping
  is_enabled boolean not null default true,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

create table connections (                    -- Slack, Teams, GitHub, calendar, Zapier
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,     -- null for workspace-level
  provider text not null,
  external_id text,
  credentials jsonb not null,                 -- encrypted at application level
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id, provider)
);

create table task_links (                     -- GitHub PRs, external URLs with metadata
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  provider text not null,
  external_id text,
  url text not null,
  title text,
  state text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id, provider, external_id)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index on workspace_members (user_id);
create index on team_members (user_id);
create index on projects (workspace_id) where deleted_at is null;
create index on project_members (user_id);
create index on sections (project_id, position);
create index on tasks (project_id, section_id, position) where deleted_at is null;
create index on tasks (workspace_id, assignee_id, due_date) where deleted_at is null and completed_at is null;
create index on tasks (parent_id);
create index on tasks (cycle_id);
create index on tasks (status_id);
create index on tasks (project_id, due_date);
create index on tasks (project_id, start_date, due_date);
create index on tasks using gin (search_vector);
create index on tasks using gin (title gin_trgm_ops);
create index on task_projects (project_id, section_id, position);
create index on task_dependencies (successor_id);
create index on task_field_values (field_id, value_number);
create index on task_field_values (field_id, value_date);
create index on task_field_values (field_id, value_text);
create index on comments (task_id, created_at);
create index on attachments (task_id);
create index on task_events (task_id, created_at desc);
create index on task_events (project_id, created_at desc);
create index on task_events (workspace_id, created_at desc);
create index on notifications (user_id, workspace_id, created_at desc) where archived_at is null;
create index on automation_runs (automation_id, created_at desc);
create index on webhook_deliveries (webhook_id, created_at desc);
create index on webhook_deliveries (status, next_attempt_at) where status = 'pending';
create index on saved_views (project_id, position);

-- ---------------------------------------------------------------------------
-- Triggers: updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  for t in select unnest(array['users','workspaces','teams','projects','tasks','comments',
                               'saved_views','forms','automations','connections','task_links'])
  loop
    execute format('create trigger %I_set_updated_at before update on %I for each row execute function set_updated_at()', t, t);
  end loop;
end $$;

-- Task number assignment per project
create or replace function assign_task_number() returns trigger language plpgsql as $$
begin
  if new.number is null or new.number = 0 then
    update projects set next_task_number = next_task_number + 1
      where id = new.project_id
      returning next_task_number - 1 into new.number;
  end if;
  return new;
end $$;

alter table tasks alter column number set default 0;
create trigger tasks_assign_number before insert on tasks for each row execute function assign_task_number();

-- Dependency cycle guard
create or replace function check_dependency_cycle() returns trigger language plpgsql as $$
begin
  if exists (
    with recursive chain as (
      select new.predecessor_id as task_id
      union
      select d.predecessor_id from task_dependencies d join chain c on d.successor_id = c.task_id
    )
    select 1 from chain where task_id = new.successor_id
  ) then
    raise exception 'dependency_cycle' using hint = 'This dependency would create a loop.';
  end if;
  return new;
end $$;

create trigger task_dependencies_cycle_guard before insert or update on task_dependencies
  for each row execute function check_dependency_cycle();

-- ---------------------------------------------------------------------------
-- Row-level security (second layer; application layer enforces first)
-- Clerk third-party auth: auth.jwt() ->> 'sub' is the Clerk user id,
-- auth.jwt() ->> 'org_id' is the Clerk organization id of the active session.
-- ---------------------------------------------------------------------------
create or replace function current_clerk_user_id() returns text language sql stable as $$
  select coalesce(auth.jwt() ->> 'sub', '')
$$;

create or replace function current_workspace_id() returns uuid language sql stable as $$
  select w.id from workspaces w where w.clerk_org_id = coalesce(auth.jwt() ->> 'org_id', '')
$$;

create or replace function is_workspace_member(ws uuid) returns boolean language sql stable as $$
  select exists (
    select 1 from workspace_members m join users u on u.id = m.user_id
    where m.workspace_id = ws and u.clerk_user_id = current_clerk_user_id()
  )
$$;

create or replace function can_read_project(p uuid) returns boolean language sql stable as $$
  select exists (
    select 1 from projects pr
    join users u on u.clerk_user_id = current_clerk_user_id()
    left join workspace_members wm on wm.workspace_id = pr.workspace_id and wm.user_id = u.id
    left join project_members pm on pm.project_id = pr.id and pm.user_id = u.id
    left join team_members tm on tm.team_id = pr.team_id and tm.user_id = u.id
    where pr.id = p and pr.deleted_at is null and (
      pm.user_id is not null
      or (pr.privacy = 'workspace' and wm.user_id is not null and wm.role <> 'guest')
      or (pr.privacy = 'team' and tm.user_id is not null)
      or (wm.role in ('owner', 'admin'))
    )
  )
$$;

alter table tasks enable row level security;
alter table comments enable row level security;
alter table sections enable row level security;
alter table task_events enable row level security;
alter table notifications enable row level security;

create policy tasks_read on tasks for select using (can_read_project(project_id));
create policy comments_read on comments for select using (
  exists (select 1 from tasks t where t.id = comments.task_id and can_read_project(t.project_id))
);
create policy sections_read on sections for select using (can_read_project(project_id));
create policy task_events_read on task_events for select using (can_read_project(project_id));
create policy notifications_read on notifications for select using (
  exists (select 1 from users u where u.id = notifications.user_id and u.clerk_user_id = current_clerk_user_id())
);

-- Writes from the browser are not permitted; the service role (server) bypasses RLS.
-- Realtime publication
alter publication supabase_realtime add table tasks, comments, sections, task_events, notifications;
