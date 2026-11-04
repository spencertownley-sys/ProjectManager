import { sql } from "drizzle-orm";
import type { DbOrTx } from "@/lib/db/client";
import type { ViewSpec } from "@/lib/validation/view-spec";
import { compileFilter, compileSorts, compileCompletedFilter, compileSubtaskFilter, type QueryContext } from "./build";
import type { TaskRow, TagRef, QueryResult, DependencyRow } from "./types";

export const MAX_ROWS = 5000;

export type Scope =
  | { kind: "project"; projectId: string }
  | { kind: "ids"; ids: string[]; visibleProjectIds: string[] }
  | { kind: "workspace"; workspaceId: string; visibleProjectIds: string[] }
  | { kind: "assignee"; workspaceId: string; userId: string; visibleProjectIds: string[] };

type RawRow = {
  id: string;
  number: number;
  workspace_id: string;
  project_id: string;
  project_key: string;
  project_color: string;
  section_id: string | null;
  parent_id: string | null;
  cycle_id: string | null;
  title: string;
  status_id: string;
  status_name: string;
  status_category: TaskRow["status"]["category"];
  status_color: string;
  status_position: number;
  priority: TaskRow["priority"];
  assignee_id: string | null;
  assignee_name: string | null;
  assignee_avatar: string | null;
  assignee_email: string | null;
  start_date: string | null;
  due_date: string | null;
  due_time: string | null;
  estimate: string | null;
  is_milestone: boolean;
  position: number;
  version: number;
  created_by: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  subtask_count: number | string;
  subtask_done_count: number | string;
  comment_count: number | string;
  attachment_count: number | string;
  blocked_by_count: number | string;
};

function scopeSql(scope: Scope) {
  switch (scope.kind) {
    case "project":
      return sql`t.project_id = ${scope.projectId}::uuid`;
    case "ids":
      return scope.ids.length && scope.visibleProjectIds.length
        ? sql`t.id in (${sql.join(scope.ids.map((id) => sql`${id}::uuid`), sql`, `)}) and t.project_id in (${sql.join(scope.visibleProjectIds.map((id) => sql`${id}::uuid`), sql`, `)})`
        : sql`false`;
    case "workspace":
      return scope.visibleProjectIds.length
        ? sql`t.workspace_id = ${scope.workspaceId}::uuid and t.project_id in (${sql.join(scope.visibleProjectIds.map((id) => sql`${id}::uuid`), sql`, `)})`
        : sql`false`;
    case "assignee":
      return scope.visibleProjectIds.length
        ? sql`t.workspace_id = ${scope.workspaceId}::uuid and t.assignee_id = ${scope.userId}::uuid and t.project_id in (${sql.join(scope.visibleProjectIds.map((id) => sql`${id}::uuid`), sql`, `)})`
        : sql`false`;
  }
}

export async function runTaskQuery(
  db: DbOrTx,
  scope: Scope,
  spec: ViewSpec,
  ctx: QueryContext,
  limit = MAX_ROWS,
): Promise<QueryResult> {
  const where = sql`t.deleted_at is null and ${scopeSql(scope)} and (${compileFilter(spec.filters, ctx)}) and ${compileCompletedFilter(spec, ctx)} and ${compileSubtaskFilter(spec)}`;
  const orderBy = compileSorts(spec.sorts);

  const query = sql`
    select
      t.id, t.number, t.workspace_id, t.project_id, p.key as project_key, p.color as project_color,
      t.section_id, t.parent_id, t.cycle_id, t.title,
      t.status_id, s.name as status_name, s.category as status_category, s.color as status_color, s.position as status_position,
      t.priority, t.assignee_id, u.display_name as assignee_name, u.avatar_url as assignee_avatar, u.email as assignee_email,
      t.start_date::text as start_date, t.due_date::text as due_date, t.due_time::text as due_time, t.estimate::text as estimate,
      t.is_milestone, t.position, t.version, t.created_by,
      t.completed_at::text as completed_at, t.created_at::text as created_at, t.updated_at::text as updated_at,
      (select count(*) from tasks st where st.parent_id = t.id and st.deleted_at is null) as subtask_count,
      (select count(*) from tasks st join statuses ss on ss.id = st.status_id where st.parent_id = t.id and st.deleted_at is null and ss.category = 'done') as subtask_done_count,
      (select count(*) from comments cm where cm.task_id = t.id and cm.deleted_at is null) as comment_count,
      (select count(*) from attachments a where a.task_id = t.id and a.deleted_at is null) as attachment_count,
      (select count(*) from task_dependencies d join tasks pt on pt.id = d.predecessor_id join statuses ps on ps.id = pt.status_id
         where d.successor_id = t.id and ps.category <> 'done' and pt.deleted_at is null) as blocked_by_count
    from tasks t
    join projects p on p.id = t.project_id
    join statuses s on s.id = t.status_id
    left join users u on u.id = t.assignee_id
    left join sections sec on sec.id = t.section_id
    left join cycles c on c.id = t.cycle_id
    where ${where}
    order by ${orderBy}
    limit ${limit + 1}
  `;

  const result = await db.execute(query);
  const raw = (Array.isArray(result) ? result : (result as unknown as { rows: RawRow[] }).rows) as RawRow[];
  const truncated = raw.length > limit;
  const rows = truncated ? raw.slice(0, limit) : raw;
  const ids = rows.map((r) => r.id);

  const tagsByTask = new Map<string, TagRef[]>();
  const fieldsByTask = new Map<string, Record<string, unknown>>();
  if (ids.length) {
    const idList = sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `);
    const tagRes = await db.execute(sql`
      select tt.task_id, tg.id, tg.name, tg.color from task_tags tt join tags tg on tg.id = tt.tag_id where tt.task_id in (${idList}) order by tg.name
    `);
    const tagRows = (Array.isArray(tagRes) ? tagRes : (tagRes as { rows: unknown[] }).rows) as Array<{ task_id: string; id: string; name: string; color: string }>;
    for (const r of tagRows) {
      const list = tagsByTask.get(r.task_id) ?? [];
      list.push({ id: r.id, name: r.name, color: r.color });
      tagsByTask.set(r.task_id, list);
    }
    const fieldRes = await db.execute(sql`
      select v.task_id, v.field_id, f.type, v.value_text, v.value_number::text as value_number, v.value_date::text as value_date, v.value_bool, v.value_json
      from task_field_values v join field_definitions f on f.id = v.field_id where v.task_id in (${idList})
    `);
    const fieldRows = (Array.isArray(fieldRes) ? fieldRes : (fieldRes as { rows: unknown[] }).rows) as Array<{
      task_id: string;
      field_id: string;
      type: string;
      value_text: string | null;
      value_number: string | null;
      value_date: string | null;
      value_bool: boolean | null;
      value_json: unknown;
    }>;
    for (const r of fieldRows) {
      const rec = fieldsByTask.get(r.task_id) ?? {};
      rec[r.field_id] = r.value_text ?? (r.value_number !== null ? Number(r.value_number) : null) ?? r.value_date ?? r.value_bool ?? r.value_json ?? null;
      fieldsByTask.set(r.task_id, rec);
    }
  }

  const hydrated: TaskRow[] = rows.map((r) => ({
    id: r.id,
    key: `${r.project_key}-${r.number}`,
    number: r.number,
    workspaceId: r.workspace_id,
    projectId: r.project_id,
    projectKey: r.project_key,
    projectColor: r.project_color,
    sectionId: r.section_id,
    parentId: r.parent_id,
    cycleId: r.cycle_id,
    title: r.title,
    status: { id: r.status_id, name: r.status_name, category: r.status_category, color: r.status_color, position: r.status_position },
    priority: r.priority,
    assignee: r.assignee_id
      ? { id: r.assignee_id, displayName: r.assignee_name ?? "", avatarUrl: r.assignee_avatar, email: r.assignee_email ?? undefined }
      : null,
    startDate: r.start_date,
    dueDate: r.due_date,
    dueTime: r.due_time,
    estimate: r.estimate === null ? null : Number(r.estimate),
    isMilestone: r.is_milestone,
    position: Number(r.position),
    version: r.version,
    createdBy: r.created_by,
    completedAt: r.completed_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    subtaskCount: Number(r.subtask_count),
    subtaskDoneCount: Number(r.subtask_done_count),
    commentCount: Number(r.comment_count),
    attachmentCount: Number(r.attachment_count),
    blockedByCount: Number(r.blocked_by_count),
    tags: tagsByTask.get(r.id) ?? [],
    customFields: fieldsByTask.get(r.id) ?? {},
  }));

  return { rows: hydrated, total: hydrated.length, truncated };
}

export async function loadDependencies(db: DbOrTx, projectId: string): Promise<DependencyRow[]> {
  const res = await db.execute(sql`
    select d.id, d.predecessor_id, d.successor_id, d.type, d.lag_days
    from task_dependencies d
    join tasks a on a.id = d.predecessor_id
    join tasks b on b.id = d.successor_id
    where (a.project_id = ${projectId}::uuid or b.project_id = ${projectId}::uuid) and a.deleted_at is null and b.deleted_at is null
  `);
  const rows = (Array.isArray(res) ? res : (res as { rows: unknown[] }).rows) as Array<{
    id: string;
    predecessor_id: string;
    successor_id: string;
    type: DependencyRow["type"];
    lag_days: number;
  }>;
  return rows.map((r) => ({ id: r.id, predecessorId: r.predecessor_id, successorId: r.successor_id, type: r.type, lagDays: r.lag_days }));
}
