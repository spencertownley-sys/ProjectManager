import { and, eq, ilike, isNull, or, sql, inArray, type SQL } from "drizzle-orm";
import { schema } from "@/lib/db/client";
import { type ServiceContext, visibleProjectIds } from "./context";
import { HIGHLIGHT_START, HIGHLIGHT_END, type SearchInput } from "@/lib/validation/search";

/*
  Workspace search (docs/10 section 11, docs/05 decision 9): Postgres full text search over tasks.search_vector and
  comment bodies, plus simple matching for projects and people. Results stay inside the projects the actor can read.
  Highlighted snippets wrap hits in [[ and ]] so the client can render them without HTML.
*/

export type SearchTaskHit = {
  id: string;
  key: string;
  title: string;
  titleHighlighted: string;
  snippet: string;
  projectId: string;
  projectKey: string;
  projectName: string;
  projectColor: string;
  status: { name: string; color: string; category: string };
  assignee: { id: string; displayName: string; avatarUrl: string | null } | null;
  dueDate: string | null;
  completedAt: string | null;
  attachmentCount: number;
};
export type SearchProjectHit = { id: string; key: string; name: string; color: string; description: string | null; taskCount: number; archivedAt: string | null };
export type SearchCommentHit = {
  id: string;
  taskId: string;
  taskKey: string;
  taskTitle: string;
  projectId: string;
  projectKey: string;
  author: { id: string; displayName: string; avatarUrl: string | null };
  snippet: string;
  createdAt: string;
};
export type SearchPersonHit = { id: string; displayName: string; email: string; avatarUrl: string | null; role: string };
export type SearchResults = { q: string; tasks: SearchTaskHit[]; projects: SearchProjectHit[]; comments: SearchCommentHit[]; people: SearchPersonHit[]; truncated: boolean };

const headlineOptions = `StartSel=${HIGHLIGHT_START}, StopSel=${HIGHLIGHT_END}, MaxWords=24, MinWords=10, MaxFragments=1`;

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function searchWorkspace(ctx: ServiceContext, input: SearchInput): Promise<SearchResults> {
  const { db, actor } = ctx;
  // Authorization is the project scope: only projects the actor may read are searched (same rule as listProjects).
  const q = input.q.trim();
  const empty: SearchResults = { q, tasks: [], projects: [], comments: [], people: [], truncated: false };
  if (!q) return empty;
  const projectIds = await visibleProjectIds(db, actor);
  const scope = input.projectId ? projectIds.filter((id) => id === input.projectId) : projectIds;
  const like = `%${escapeLike(q)}%`;
  const tsquery = sql`websearch_to_tsquery('english', ${q})`;
  const limit = input.limit;

  const taskFilters: SQL[] = [eq(schema.tasks.workspaceId, actor.workspaceId), isNull(schema.tasks.deletedAt)];
  if (scope.length === 0) taskFilters.push(sql`false`);
  else taskFilters.push(inArray(schema.tasks.projectId, scope));
  if (input.assigneeId === "unassigned") taskFilters.push(isNull(schema.tasks.assigneeId));
  else if (input.assigneeId === "me") taskFilters.push(eq(schema.tasks.assigneeId, actor.userId));
  else if (input.assigneeId) taskFilters.push(eq(schema.tasks.assigneeId, input.assigneeId));
  if (input.statusCategory) taskFilters.push(eq(schema.statuses.category, input.statusCategory));
  if (input.from) taskFilters.push(sql`${schema.tasks.dueDate} >= ${input.from}::date`);
  if (input.to) taskFilters.push(sql`${schema.tasks.dueDate} <= ${input.to}::date`);
  if (input.hasAttachment) taskFilters.push(sql`exists (select 1 from attachments a where a.task_id = ${schema.tasks.id})`);

  const taskMatch = or(sql`${sql.raw('"tasks".search_vector')} @@ ${tsquery}`, ilike(schema.tasks.title, like), sql`(${schema.projects.key} || '-' || ${schema.tasks.number}::text) ilike ${like}`)!;

  const [taskRows, projectRows, commentRows, peopleRows] = await Promise.all([
    db
      .select({
        id: schema.tasks.id,
        number: schema.tasks.number,
        title: schema.tasks.title,
        titleHighlighted: sql<string>`ts_headline('english', ${schema.tasks.title}, ${tsquery}, ${sql.raw(`'${headlineOptions}, HighlightAll=true'`)})`,
        snippet: sql<string>`ts_headline('english', coalesce(nullif(${schema.tasks.descriptionText}, ''), ${schema.tasks.title}), ${tsquery}, ${sql.raw(`'${headlineOptions}'`)})`,
        projectId: schema.tasks.projectId,
        projectKey: schema.projects.key,
        projectName: schema.projects.name,
        projectColor: schema.projects.color,
        statusName: schema.statuses.name,
        statusColor: schema.statuses.color,
        statusCategory: schema.statuses.category,
        assigneeId: schema.users.id,
        assigneeName: schema.users.displayName,
        assigneeAvatar: schema.users.avatarUrl,
        dueDate: schema.tasks.dueDate,
        completedAt: schema.tasks.completedAt,
        attachmentCount: sql<number>`(select count(*)::int from attachments a where a.task_id = ${schema.tasks.id})`,
        rank: sql<number>`ts_rank(${sql.raw('"tasks".search_vector')}, ${tsquery})`,
      })
      .from(schema.tasks)
      .innerJoin(schema.projects, eq(schema.projects.id, schema.tasks.projectId))
      .innerJoin(schema.statuses, eq(schema.statuses.id, schema.tasks.statusId))
      .leftJoin(schema.users, eq(schema.users.id, schema.tasks.assigneeId))
      .where(and(...taskFilters, taskMatch))
      .orderBy(sql`ts_rank(${sql.raw('"tasks".search_vector')}, ${tsquery}) desc`, sql`${schema.tasks.updatedAt} desc`)
      .limit(limit + 1),
    scope.length === 0
      ? Promise.resolve([])
      : db
          .select({
            id: schema.projects.id,
            key: schema.projects.key,
            name: schema.projects.name,
            color: schema.projects.color,
            description: schema.projects.description,
            archivedAt: schema.projects.archivedAt,
            taskCount: sql<number>`(select count(*)::int from tasks t where t.project_id = ${schema.projects.id} and t.deleted_at is null and t.parent_id is null)`,
          })
          .from(schema.projects)
          .where(and(inArray(schema.projects.id, scope), isNull(schema.projects.deletedAt), eq(schema.projects.isTemplate, false), or(ilike(schema.projects.name, like), ilike(schema.projects.key, like), ilike(schema.projects.description, like))))
          .orderBy(schema.projects.name)
          .limit(20),
    scope.length === 0
      ? Promise.resolve([])
      : db
          .select({
            id: schema.comments.id,
            taskId: schema.comments.taskId,
            taskKey: sql<string>`${schema.projects.key} || '-' || ${schema.tasks.number}::text`,
            taskTitle: schema.tasks.title,
            projectId: schema.tasks.projectId,
            projectKey: schema.projects.key,
            authorId: schema.users.id,
            authorName: schema.users.displayName,
            authorAvatar: schema.users.avatarUrl,
            snippet: sql<string>`ts_headline('english', ${schema.comments.bodyText}, ${tsquery}, ${sql.raw(`'${headlineOptions}'`)})`,
            createdAt: schema.comments.createdAt,
          })
          .from(schema.comments)
          .innerJoin(schema.tasks, eq(schema.tasks.id, schema.comments.taskId))
          .innerJoin(schema.projects, eq(schema.projects.id, schema.tasks.projectId))
          .innerJoin(schema.users, eq(schema.users.id, schema.comments.authorId))
          .where(and(inArray(schema.tasks.projectId, scope), isNull(schema.comments.deletedAt), isNull(schema.tasks.deletedAt), or(sql`to_tsvector('english', ${schema.comments.bodyText}) @@ ${tsquery}`, ilike(schema.comments.bodyText, like))))
          .orderBy(sql`${schema.comments.createdAt} desc`)
          .limit(20),
    db
      .select({ id: schema.users.id, displayName: schema.users.displayName, email: schema.users.email, avatarUrl: schema.users.avatarUrl, role: schema.workspaceMembers.role })
      .from(schema.workspaceMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.workspaceMembers.userId))
      .where(and(eq(schema.workspaceMembers.workspaceId, actor.workspaceId), or(ilike(schema.users.displayName, like), ilike(schema.users.email, like))))
      .orderBy(schema.users.displayName)
      .limit(20),
  ]);

  const guestHidesPeople = actor.workspaceRole === "guest";
  return {
    q,
    truncated: taskRows.length > limit,
    tasks: taskRows.slice(0, limit).map((r) => ({
      id: r.id,
      key: `${r.projectKey}-${r.number}`,
      title: r.title,
      titleHighlighted: r.titleHighlighted,
      snippet: r.snippet,
      projectId: r.projectId,
      projectKey: r.projectKey,
      projectName: r.projectName,
      projectColor: r.projectColor,
      status: { name: r.statusName, color: r.statusColor, category: r.statusCategory },
      assignee: r.assigneeId ? { id: r.assigneeId, displayName: r.assigneeName ?? "", avatarUrl: r.assigneeAvatar ?? null } : null,
      dueDate: r.dueDate,
      completedAt: r.completedAt?.toISOString() ?? null,
      attachmentCount: r.attachmentCount,
    })),
    projects: projectRows.map((p) => ({ ...p, archivedAt: p.archivedAt?.toISOString() ?? null })),
    comments: commentRows.map((c) => ({
      id: c.id,
      taskId: c.taskId,
      taskKey: c.taskKey,
      taskTitle: c.taskTitle,
      projectId: c.projectId,
      projectKey: c.projectKey,
      author: { id: c.authorId, displayName: c.authorName, avatarUrl: c.authorAvatar },
      snippet: c.snippet,
      createdAt: c.createdAt.toISOString(),
    })),
    people: guestHidesPeople ? [] : peopleRows,
  };
}
