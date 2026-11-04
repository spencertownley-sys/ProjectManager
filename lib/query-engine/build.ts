/*
  Translates a ViewSpec into SQL. One engine for every view (docs/05 section 6).
  Filters compile to a WHERE fragment; sorts compile to ORDER BY. Grouping is applied by the
  client over the returned rows, because every view needs the full row set for virtualization.
*/
import { sql, type SQL } from "drizzle-orm";
import type { Filter, FilterGroup, FilterOperator, Sort, ViewSpec } from "@/lib/validation/view-spec";

export type QueryContext = {
  /** The current user's id, for the is_me operator. */
  userId: string;
  /** The active cycle id of the project, for is_current_cycle. */
  currentCycleId?: string | null;
  /** Today's date as YYYY-MM-DD in the viewer's timezone. */
  today: string;
};

const t = {
  id: sql`t.id`,
  title: sql`t.title`,
  number: sql`t.number`,
  status: sql`t.status_id`,
  statusCategory: sql`s.category`,
  statusPosition: sql`s.position`,
  assignee: sql`t.assignee_id`,
  assigneeName: sql`u.display_name`,
  startDate: sql`t.start_date`,
  dueDate: sql`t.due_date`,
  priority: sql`t.priority`,
  estimate: sql`t.estimate`,
  section: sql`t.section_id`,
  sectionPosition: sql`sec.position`,
  cycle: sql`t.cycle_id`,
  isMilestone: sql`t.is_milestone`,
  parent: sql`t.parent_id`,
  createdBy: sql`t.created_by`,
  createdAt: sql`t.created_at`,
  updatedAt: sql`t.updated_at`,
  completedAt: sql`t.completed_at`,
  position: sql`t.position`,
};

const priorityRank = sql`case t.priority when 'urgent' then 4 when 'high' then 3 when 'medium' then 2 when 'low' then 1 else 0 end`;

function customFieldId(field: string): string | null {
  return field.startsWith("custom:") ? field.slice(7) : null;
}

function toArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (value === null || value === undefined) return [];
  return [String(value)];
}

function dateOffset(today: string, days: number): string {
  const d = new Date(today + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function compileStandard(f: Filter, ctx: QueryContext): SQL {
  const { field, op, value } = f;
  const str = value === undefined || value === null ? null : String(value);
  const list = toArray(value);

  const textFilter = (col: SQL): SQL => {
    switch (op) {
      case "is":
      case "eq":
        return sql`${col} = ${str}`;
      case "is_not":
      case "neq":
        return sql`${col} <> ${str}`;
      case "contains":
        return sql`${col} ilike ${"%" + (str ?? "") + "%"}`;
      case "not_contains":
        return sql`${col} not ilike ${"%" + (str ?? "") + "%"}`;
      case "is_empty":
        return sql`(${col} is null or ${col} = '')`;
      case "is_not_empty":
        return sql`(${col} is not null and ${col} <> '')`;
      default:
        return sql`true`;
    }
  };

  const idFilter = (col: SQL, meRef?: string): SQL => {
    switch (op) {
      case "is":
      case "eq":
        return sql`${col} = ${str}::uuid`;
      case "is_not":
      case "neq":
        return sql`${col} is distinct from ${str}::uuid`;
      case "is_any_of":
        return list.length ? sql`${col} in (${sql.join(list.map((v) => sql`${v}::uuid`), sql`, `)})` : sql`false`;
      case "is_none_of":
        return list.length
          ? sql`(${col} is null or ${col} not in (${sql.join(list.map((v) => sql`${v}::uuid`), sql`, `)}))`
          : sql`true`;
      case "is_empty":
        return sql`${col} is null`;
      case "is_not_empty":
        return sql`${col} is not null`;
      case "is_me":
        return meRef ? sql`${col} = ${meRef}::uuid` : sql`false`;
      default:
        return sql`true`;
    }
  };

  const dateFilter = (col: SQL): SQL => {
    switch (op) {
      case "is":
      case "eq":
        return sql`${col} = ${str}::date`;
      case "is_not":
      case "neq":
        return sql`${col} is distinct from ${str}::date`;
      case "before":
      case "lt":
        return sql`${col} < ${str}::date`;
      case "after":
      case "gt":
        return sql`${col} > ${str}::date`;
      case "lte":
        return sql`${col} <= ${str}::date`;
      case "gte":
        return sql`${col} >= ${str}::date`;
      case "between":
        return list.length === 2 ? sql`${col} between ${list[0]}::date and ${list[1]}::date` : sql`true`;
      case "is_today":
        return sql`${col} = ${ctx.today}::date`;
      case "is_this_week": {
        const d = new Date(ctx.today + "T00:00:00Z");
        const day = (d.getUTCDay() + 6) % 7; // Monday = 0
        const start = dateOffset(ctx.today, -day);
        const end = dateOffset(start, 6);
        return sql`${col} between ${start}::date and ${end}::date`;
      }
      case "next_7_days":
        return sql`${col} between ${ctx.today}::date and ${dateOffset(ctx.today, 7)}::date`;
      case "is_overdue":
        return sql`(${col} < ${ctx.today}::date and t.completed_at is null)`;
      case "is_empty":
        return sql`${col} is null`;
      case "is_not_empty":
        return sql`${col} is not null`;
      default:
        return sql`true`;
    }
  };

  const numberFilter = (col: SQL): SQL => {
    const n = value === null || value === undefined ? null : Number(value);
    switch (op) {
      case "eq":
      case "is":
        return sql`${col} = ${n}`;
      case "neq":
      case "is_not":
        return sql`${col} is distinct from ${n}`;
      case "gt":
        return sql`${col} > ${n}`;
      case "gte":
        return sql`${col} >= ${n}`;
      case "lt":
        return sql`${col} < ${n}`;
      case "lte":
        return sql`${col} <= ${n}`;
      case "between":
        return list.length === 2 ? sql`${col} between ${Number(list[0])} and ${Number(list[1])}` : sql`true`;
      case "is_empty":
        return sql`${col} is null`;
      case "is_not_empty":
        return sql`${col} is not null`;
      default:
        return sql`true`;
    }
  };

  const enumFilter = (col: SQL): SQL => {
    switch (op) {
      case "is":
      case "eq":
        return sql`${col}::text = ${str}`;
      case "is_not":
      case "neq":
        return sql`${col}::text <> ${str}`;
      case "is_any_of":
        return list.length ? sql`${col}::text in (${sql.join(list.map((v) => sql`${v}`), sql`, `)})` : sql`false`;
      case "is_none_of":
        return list.length ? sql`${col}::text not in (${sql.join(list.map((v) => sql`${v}`), sql`, `)})` : sql`true`;
      default:
        return sql`true`;
    }
  };

  switch (field) {
    case "title":
      return textFilter(t.title);
    case "key":
      return textFilter(sql`(p.key || '-' || t.number::text)`);
    case "status":
      return idFilter(t.status);
    case "status_category":
      return enumFilter(t.statusCategory);
    case "assignee":
      return idFilter(t.assignee, ctx.userId);
    case "created_by":
      return idFilter(t.createdBy, ctx.userId);
    case "section":
      return idFilter(t.section);
    case "parent":
      return idFilter(t.parent);
    case "cycle":
      if (op === "is_current_cycle") return ctx.currentCycleId ? sql`t.cycle_id = ${ctx.currentCycleId}::uuid` : sql`false`;
      return idFilter(t.cycle);
    case "start_date":
      return dateFilter(t.startDate);
    case "due_date":
      return dateFilter(t.dueDate);
    case "created_at":
      return dateFilter(sql`t.created_at::date`);
    case "updated_at":
      return dateFilter(sql`t.updated_at::date`);
    case "completed_at":
      return dateFilter(sql`t.completed_at::date`);
    case "priority":
      return enumFilter(t.priority);
    case "estimate":
      return numberFilter(t.estimate);
    case "is_milestone":
      return op === "is_checked" ? sql`t.is_milestone = true` : op === "is_not_checked" ? sql`t.is_milestone = false` : sql`true`;
    case "tags": {
      const inList = list.length ? sql`(${sql.join(list.map((v) => sql`${v}::uuid`), sql`, `)})` : null;
      switch (op) {
        case "includes_any":
        case "is_any_of":
          return inList ? sql`exists (select 1 from task_tags tt where tt.task_id = t.id and tt.tag_id in ${inList})` : sql`false`;
        case "includes_all":
          return inList
            ? sql`(select count(*) from task_tags tt where tt.task_id = t.id and tt.tag_id in ${inList}) = ${list.length}`
            : sql`true`;
        case "includes_none":
        case "is_none_of":
          return inList ? sql`not exists (select 1 from task_tags tt where tt.task_id = t.id and tt.tag_id in ${inList})` : sql`true`;
        case "is_empty":
          return sql`not exists (select 1 from task_tags tt where tt.task_id = t.id)`;
        case "is_not_empty":
          return sql`exists (select 1 from task_tags tt where tt.task_id = t.id)`;
        default:
          return sql`true`;
      }
    }
    default:
      return sql`true`;
  }
}

function compileCustom(fieldId: string, f: Filter, ctx: QueryContext): SQL {
  const { op, value } = f;
  const str = value === undefined || value === null ? null : String(value);
  const list = toArray(value);
  const base = sql`select 1 from task_field_values v where v.task_id = t.id and v.field_id = ${fieldId}::uuid`;
  const exists = (cond: SQL) => sql`exists (${base} and ${cond})`;
  const n = value === null || value === undefined ? null : Number(value);

  switch (op as FilterOperator) {
    case "is_empty":
      return sql`not exists (${base} and (v.value_text is not null or v.value_number is not null or v.value_date is not null or v.value_bool is not null or (v.value_json is not null and v.value_json <> 'null'::jsonb and v.value_json <> '[]'::jsonb)))`;
    case "is_not_empty":
      return sql`exists (${base} and (v.value_text is not null or v.value_number is not null or v.value_date is not null or v.value_bool is not null or (v.value_json is not null and v.value_json <> 'null'::jsonb and v.value_json <> '[]'::jsonb)))`;
    case "contains":
      return exists(sql`v.value_text ilike ${"%" + (str ?? "") + "%"}`);
    case "not_contains":
      return sql`not ${exists(sql`v.value_text ilike ${"%" + (str ?? "") + "%"}`)}`;
    case "is":
      return exists(sql`(v.value_text = ${str} or v.value_json ? ${str})`);
    case "is_not":
      return sql`not ${exists(sql`(v.value_text = ${str} or v.value_json ? ${str})`)}`;
    case "eq":
      return exists(sql`(v.value_number = ${n} or v.value_date = ${str}::date)`);
    case "neq":
      return sql`not ${exists(sql`(v.value_number = ${n} or v.value_date = ${str}::date)`)}`;
    case "gt":
    case "after":
      return exists(sql`(v.value_number > ${n} or v.value_date > ${str}::date)`);
    case "gte":
      return exists(sql`(v.value_number >= ${n} or v.value_date >= ${str}::date)`);
    case "lt":
    case "before":
      return exists(sql`(v.value_number < ${n} or v.value_date < ${str}::date)`);
    case "lte":
      return exists(sql`(v.value_number <= ${n} or v.value_date <= ${str}::date)`);
    case "between":
      return list.length === 2
        ? exists(sql`(v.value_number between ${Number(list[0])} and ${Number(list[1])} or v.value_date between ${list[0]}::date and ${list[1]}::date)`)
        : sql`true`;
    case "is_today":
      return exists(sql`v.value_date = ${ctx.today}::date`);
    case "next_7_days":
      return exists(sql`v.value_date between ${ctx.today}::date and ${dateOffset(ctx.today, 7)}::date`);
    case "is_checked":
      return exists(sql`v.value_bool = true`);
    case "is_not_checked":
      return sql`not ${exists(sql`v.value_bool = true`)}`;
    case "is_any_of":
    case "includes_any":
      return list.length ? exists(sql`v.value_json ?| ${sql`array[${sql.join(list.map((v) => sql`${v}`), sql`, `)}]::text[]`}`) : sql`false`;
    case "includes_all":
      return list.length ? exists(sql`v.value_json ?& ${sql`array[${sql.join(list.map((v) => sql`${v}`), sql`, `)}]::text[]`}`) : sql`true`;
    case "is_none_of":
    case "includes_none":
      return list.length ? sql`not ${exists(sql`v.value_json ?| ${sql`array[${sql.join(list.map((v) => sql`${v}`), sql`, `)}]::text[]`}`)}` : sql`true`;
    case "is_me":
      return exists(sql`v.value_json ? ${ctx.userId}`);
    default:
      return sql`true`;
  }
}

export function compileFilter(item: Filter | FilterGroup, ctx: QueryContext): SQL {
  if (item.kind === "group") {
    if (item.items.length === 0) return sql`true`;
    const parts = item.items.map((i) => sql`(${compileFilter(i, ctx)})`);
    return sql.join(parts, item.op === "and" ? sql` and ` : sql` or `);
  }
  const custom = customFieldId(item.field);
  return custom ? compileCustom(custom, item, ctx) : compileStandard(item, ctx);
}

export function compileSorts(sorts: Sort[]): SQL {
  const parts: SQL[] = [];
  for (const s of sorts) {
    const dir = s.direction === "desc" ? sql`desc nulls last` : sql`asc nulls last`;
    const custom = customFieldId(s.field);
    if (custom) {
      parts.push(
        sql`(select coalesce(v.value_text, v.value_number::text, v.value_date::text) from task_field_values v where v.task_id = t.id and v.field_id = ${custom}::uuid) ${dir}`,
      );
      continue;
    }
    switch (s.field) {
      case "manual":
        parts.push(sql`sec.position asc nulls last`, sql`t.position asc`);
        break;
      case "title":
        parts.push(sql`t.title ${dir}`);
        break;
      case "key":
        parts.push(sql`t.number ${dir}`);
        break;
      case "status":
        parts.push(sql`s.position ${dir}`);
        break;
      case "status_category":
        parts.push(sql`s.category ${dir}`);
        break;
      case "assignee":
        parts.push(sql`u.display_name ${dir}`);
        break;
      case "start_date":
        parts.push(sql`t.start_date ${dir}`);
        break;
      case "due_date":
        parts.push(sql`t.due_date ${dir}`);
        break;
      case "priority":
        parts.push(sql`${priorityRank} ${dir}`);
        break;
      case "estimate":
        parts.push(sql`t.estimate ${dir}`);
        break;
      case "section":
        parts.push(sql`sec.position ${dir}`);
        break;
      case "cycle":
        parts.push(sql`c.start_date ${dir}`);
        break;
      case "is_milestone":
        parts.push(sql`t.is_milestone ${dir}`);
        break;
      case "created_at":
        parts.push(sql`t.created_at ${dir}`);
        break;
      case "updated_at":
        parts.push(sql`t.updated_at ${dir}`);
        break;
      case "completed_at":
        parts.push(sql`t.completed_at ${dir}`);
        break;
      default:
        break;
    }
  }
  parts.push(sql`t.created_at asc`, sql`t.id asc`);
  return sql.join(parts, sql`, `);
}

/** Completed-task visibility from the spec, as a SQL fragment. */
export function compileCompletedFilter(spec: ViewSpec, ctx: QueryContext): SQL {
  switch (spec.showCompleted) {
    case "none":
      return sql`t.completed_at is null`;
    case "recent":
      return sql`(t.completed_at is null or t.completed_at >= ${dateOffset(ctx.today, -7)}::date)`;
    case "all":
    default:
      return sql`true`;
  }
}

export function compileSubtaskFilter(spec: ViewSpec): SQL {
  return spec.subtasks === "hidden" ? sql`t.parent_id is null` : sql`true`;
}
