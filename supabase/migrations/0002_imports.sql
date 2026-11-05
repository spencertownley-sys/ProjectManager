-- CSV imports (document 16 step 1.17): one row per upload, processed by the Inngest job in batches.
-- Parsed rows are kept on the row until the job finishes so a retry can resume from processed_rows.

create type import_status as enum ('pending', 'running', 'completed', 'failed');

create table imports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  created_by uuid not null references users(id),
  file_name text not null,
  mapping jsonb not null,                     -- column to task field mapping, see lib/validation/import.ts
  rows jsonb not null,                        -- string[][] without the header row
  status import_status not null default 'pending',
  total_rows integer not null,
  processed_rows integer not null default 0,
  created_count integer not null default 0,
  error_count integer not null default 0,
  errors jsonb not null default '[]',         -- [{ row, message }], first 100
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index on imports (project_id, created_at desc);
