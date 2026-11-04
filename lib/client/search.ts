import type { SearchResults, SearchTaskHit } from "@/lib/services/search";
import { HIGHLIGHT_START, HIGHLIGHT_END, type SearchInput } from "@/lib/validation/search";

/** Pure helpers for the Search page: URL state, highlighted snippets, counts, and the preview's static filtering. */

export type SearchQuery = Omit<SearchInput, "limit">;

export type Segment = { text: string; hit: boolean };

/** Splits a ts_headline snippet into plain and highlighted segments. Unbalanced markers are rendered as text. */
export function splitHighlight(snippet: string): Segment[] {
  const out: Segment[] = [];
  let rest = snippet;
  while (rest.length) {
    const start = rest.indexOf(HIGHLIGHT_START);
    if (start < 0) {
      out.push({ text: rest, hit: false });
      break;
    }
    const end = rest.indexOf(HIGHLIGHT_END, start + HIGHLIGHT_START.length);
    if (end < 0) {
      out.push({ text: rest, hit: false });
      break;
    }
    if (start > 0) out.push({ text: rest.slice(0, start), hit: false });
    out.push({ text: rest.slice(start + HIGHLIGHT_START.length, end), hit: true });
    rest = rest.slice(end + HIGHLIGHT_END.length);
  }
  // Merge adjacent segments of the same kind so React keys stay simple.
  return out.reduce<Segment[]>((acc, s) => {
    const last = acc[acc.length - 1];
    if (last && last.hit === s.hit) last.text += s.text;
    else acc.push({ ...s });
    return acc;
  }, []);
}

/** Reads the search state from the URL. Unknown or malformed values are dropped. */
export function parseSearchParams(params: URLSearchParams): SearchQuery {
  const q = (params.get("q") ?? "").trim();
  const out: SearchQuery = { q };
  const projectId = params.get("project");
  if (projectId) out.projectId = projectId;
  const assignee = params.get("assignee");
  if (assignee) out.assigneeId = assignee;
  const status = params.get("status");
  if (status === "backlog" || status === "not_started" || status === "in_progress" || status === "done") out.statusCategory = status;
  const from = params.get("from");
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) out.from = from;
  const to = params.get("to");
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) out.to = to;
  if (params.get("attachment") === "1") out.hasAttachment = true;
  return out;
}

export function toSearchParams(query: SearchQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.projectId) params.set("project", query.projectId);
  if (query.assigneeId) params.set("assignee", query.assigneeId);
  if (query.statusCategory) params.set("status", query.statusCategory);
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.hasAttachment) params.set("attachment", "1");
  return params;
}

export function activeFilterCount(query: SearchQuery): number {
  return [query.projectId, query.assigneeId, query.statusCategory, query.from, query.to, query.hasAttachment].filter(Boolean).length;
}

export function resultCount(results: SearchResults | null | undefined): number {
  if (!results) return 0;
  return results.tasks.length + results.projects.length + results.comments.length + results.people.length;
}

function wrap(text: string, q: string): string {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return text;
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "ig");
  return text.replace(re, `${HIGHLIGHT_START}$1${HIGHLIGHT_END}`);
}

/**
 * Filters a complete result set client side. The dev preview uses this instead of the database so the page can be
 * exercised without a backend; the matching is a plain substring test, not full text search.
 */
export function filterStaticResults(all: SearchResults, query: SearchQuery, meId: string): SearchResults {
  const q = query.q.trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  const matches = (text: string) => words.length > 0 && words.every((w) => text.toLowerCase().includes(w));
  const taskOk = (t: SearchTaskHit) => {
    if (query.projectId && t.projectId !== query.projectId) return false;
    if (query.assigneeId === "unassigned" && t.assignee) return false;
    if (query.assigneeId === "me" && t.assignee?.id !== meId) return false;
    if (query.assigneeId && query.assigneeId !== "me" && query.assigneeId !== "unassigned" && t.assignee?.id !== query.assigneeId) return false;
    if (query.statusCategory && t.status.category !== query.statusCategory) return false;
    if (query.from && (!t.dueDate || t.dueDate < query.from)) return false;
    if (query.to && (!t.dueDate || t.dueDate > query.to)) return false;
    if (query.hasAttachment && t.attachmentCount === 0) return false;
    return true;
  };
  return {
    q: query.q,
    truncated: false,
    tasks: all.tasks.filter((t) => taskOk(t) && (matches(t.title) || matches(t.snippet) || matches(t.key))).map((t) => ({ ...t, titleHighlighted: wrap(t.title, q), snippet: wrap(t.snippet, q) })),
    projects: all.projects.filter((p) => (!query.projectId || p.id === query.projectId) && (matches(p.name) || matches(p.key) || matches(p.description ?? ""))),
    comments: all.comments.filter((c) => (!query.projectId || c.projectId === query.projectId) && matches(c.snippet)).map((c) => ({ ...c, snippet: wrap(c.snippet, q) })),
    people: all.people.filter((p) => matches(p.displayName) || matches(p.email)),
  };
}
