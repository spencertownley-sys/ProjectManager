"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search20Regular, Attach16Regular, Dismiss16Regular } from "@fluentui/react-icons";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { useWorkspace } from "@/lib/client/workspace-context";
import { useViewState } from "@/lib/client/view-state";
import { call } from "@/lib/client/actions";
import { searchAction } from "@/lib/actions/search";
import type { SearchResults, SearchTaskHit, SearchCommentHit, SearchProjectHit, SearchPersonHit } from "@/lib/services/search";
import { splitHighlight, parseSearchParams, toSearchParams, activeFilterCount, filterStaticResults, resultCount, type SearchQuery } from "@/lib/client/search";
import { formatDateShort, formatRelativeTime } from "@/lib/client/dates";
import { cn } from "@/lib/utils";

export type SearchProjectOption = { id: string; key: string; name: string; color: string };

type Props = {
  projects: SearchProjectOption[];
  /** Dev preview: filter this result set client side instead of calling the search action. */
  staticResults?: SearchResults;
};

const categories: Array<{ value: NonNullable<SearchQuery["statusCategory"]> | ""; label: string }> = [
  { value: "", label: "Any status" },
  { value: "backlog", label: "Backlog" },
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
];

/** Search (docs/10 section 11): results grouped by Tasks, Projects, Comments, People with a left filter column. */
export function SearchPage({ projects, staticResults }: Props) {
  const { slug, user, members } = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const openTask = useViewState((s) => s.openTask);
  const query = React.useMemo(() => parseSearchParams(new URLSearchParams(params.toString())), [params]);
  const [draft, setDraft] = React.useState(query.q);
  const [seenQ, setSeenQ] = React.useState(query.q);
  if (seenQ !== query.q) {
    setSeenQ(query.q);
    setDraft(query.q);
  }

  const setQuery = React.useCallback(
    (next: SearchQuery) => {
      // Keep params this page does not own (the dev preview's view switch, for one).
      const merged = new URLSearchParams(params.toString());
      for (const key of ["q", "project", "assignee", "status", "from", "to", "attachment"]) merged.delete(key);
      toSearchParams(next).forEach((value, key) => merged.set(key, value));
      const qs = merged.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, params],
  );
  const patch = (changes: Partial<SearchQuery>) => {
    const next: SearchQuery = { ...query, ...changes };
    (Object.keys(next) as Array<keyof SearchQuery>).forEach((k) => {
      if (next[k] === undefined || next[k] === "" || next[k] === false) delete next[k];
    });
    setQuery({ ...next, q: next.q ?? "" });
  };

  const results = useQuery({
    queryKey: ["search", slug, query],
    queryFn: async () => {
      if (staticResults) return filterStaticResults(staticResults, query, user.id);
      const res = await call(searchAction(slug, query));
      if (!res.ok) throw new Error(res.error.message);
      return res.data;
    },
    enabled: query.q.trim().length > 0,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
  const data = query.q.trim() ? results.data : undefined;
  const count = resultCount(data);
  const filters = activeFilterCount(query);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    patch({ q: draft.trim() });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border bg-surface px-6 py-3">
        <h1 className="type-title-3">Search</h1>
        <form onSubmit={submit} className="mt-2 flex max-w-3xl items-center gap-2" role="search">
          <div className="relative flex-1">
            <Search20Regular className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-fg-tertiary" />
            <Input
              type="search"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Search tasks, projects, comments, and people"
              aria-label="Search"
              autoFocus
              className="h-9 pl-9 pr-8 [&::-webkit-search-cancel-button]:hidden"
            />
            {draft ? (
              <button type="button" aria-label="Clear search" onClick={() => { setDraft(""); patch({ q: "" }); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xs p-0.5 text-fg-tertiary hover:text-fg">
                <Dismiss16Regular />
              </button>
            ) : null}
          </div>
          <Button type="submit" variant="primary" disabled={!draft.trim()}>
            Search
          </Button>
        </form>
        {query.q ? (
          <p className="mt-2 type-caption-1 text-fg-secondary" aria-live="polite">
            {results.isFetching && !data ? "Searching" : `${count} ${count === 1 ? "result" : "results"} for "${query.q}"`}
            {data?.truncated ? ", showing the first 50 tasks" : ""}
          </p>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 overflow-y-auto border-r border-border bg-surface px-4 py-3 md:block" aria-label="Filters">
          <div className="flex items-center justify-between">
            <h2 className="type-caption-1-strong text-fg-secondary">Filters</h2>
            {filters ? (
              <button type="button" className="type-caption-1 text-brand hover:underline" onClick={() => setQuery({ q: query.q })}>
                Clear {filters}
              </button>
            ) : null}
          </div>
          <FilterGroup label="Project">
            <RadioList
              name="project"
              value={query.projectId ?? ""}
              onChange={(v) => patch({ projectId: v || undefined })}
              options={[{ value: "", label: "All projects" }, ...projects.map((p) => ({ value: p.id, label: p.name, color: p.color }))]}
            />
          </FilterGroup>
          <FilterGroup label="Assignee">
            <RadioList
              name="assignee"
              value={query.assigneeId ?? ""}
              onChange={(v) => patch({ assigneeId: v || undefined })}
              options={[{ value: "", label: "Anyone" }, { value: "me", label: "Me" }, { value: "unassigned", label: "Unassigned" }, ...members.filter((m) => m.id !== user.id).map((m) => ({ value: m.id, label: m.displayName }))]}
              collapseAfter={5}
            />
          </FilterGroup>
          <FilterGroup label="Status">
            <RadioList name="status" value={query.statusCategory ?? ""} onChange={(v) => patch({ statusCategory: (v || undefined) as SearchQuery["statusCategory"] })} options={categories} />
          </FilterGroup>
          <FilterGroup label="Due date">
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 type-caption-1 text-fg-secondary">
                <span className="w-9">From</span>
                <Input type="date" value={query.from ?? ""} onChange={(e) => patch({ from: e.target.value || undefined })} className="h-7 px-1.5" />
              </label>
              <label className="flex items-center gap-2 type-caption-1 text-fg-secondary">
                <span className="w-9">To</span>
                <Input type="date" value={query.to ?? ""} onChange={(e) => patch({ to: e.target.value || undefined })} className="h-7 px-1.5" />
              </label>
            </div>
          </FilterGroup>
          <FilterGroup label="More">
            <label className="flex h-7 cursor-pointer items-center gap-2 type-body-1">
              <Checkbox checked={Boolean(query.hasAttachment)} onCheckedChange={(v) => patch({ hasAttachment: v === true || undefined })} aria-label="Has attachment" />
              Has attachment
            </label>
          </FilterGroup>
        </aside>
        <div className="min-w-0 flex-1 overflow-y-auto">
          {!query.q ? (
            <EmptyState title="Search the workspace" description="Type a few words to find tasks, projects, comments, and people. Keys like MKT-12 work too." className="mx-auto mt-16 max-w-lg" />
          ) : results.isError ? (
            <EmptyState title="Search is unavailable" description={(results.error as Error).message} className="mx-auto mt-16 max-w-lg" />
          ) : data && count === 0 ? (
            <EmptyState title={`No results for "${query.q}"`} description={filters ? "Try fewer words or clear a filter." : "Try fewer words or check the spelling."} action={filters ? <Button variant="secondary" onClick={() => setQuery({ q: query.q })}>Clear filters</Button> : undefined} className="mx-auto mt-16 max-w-lg" />
          ) : data ? (
            <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-4">
              <ResultGroup title="Tasks" count={data.tasks.length}>
                {data.tasks.map((t) => (
                  <TaskResult key={t.id} hit={t} onOpen={() => openTask(t.id)} />
                ))}
              </ResultGroup>
              <ResultGroup title="Projects" count={data.projects.length}>
                {data.projects.map((p) => (
                  <ProjectResult key={p.id} hit={p} href={`/w/${slug}/projects/${p.key}`} />
                ))}
              </ResultGroup>
              <ResultGroup title="Comments" count={data.comments.length}>
                {data.comments.map((c) => (
                  <CommentResult key={c.id} hit={c} onOpen={() => openTask(c.taskId)} />
                ))}
              </ResultGroup>
              <ResultGroup title="People" count={data.people.length}>
                {data.people.map((p) => (
                  <PersonResult key={p.id} hit={p} onSearch={() => patch({ assigneeId: p.id })} />
                ))}
              </ResultGroup>
            </div>
          ) : (
            <div className="mx-auto max-w-4xl px-6 py-4" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="mb-2 h-12 animate-pulse rounded-sm bg-hover" />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="mt-4">
      <legend className="mb-1 type-caption-1-strong text-fg">{label}</legend>
      {children}
    </fieldset>
  );
}

function RadioList({ name, value, onChange, options, collapseAfter }: { name: string; value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string; color?: string }>; collapseAfter?: number }) {
  const [expanded, setExpanded] = React.useState(false);
  const shown = collapseAfter && !expanded ? options.filter((o, i) => i < collapseAfter || o.value === value) : options;
  return (
    <div className="flex flex-col">
      {shown.map((o) => (
        <label key={o.value} className={cn("flex h-7 cursor-pointer items-center gap-2 rounded-xs px-1 type-body-1 hover:bg-hover", value === o.value && "font-semibold")}>
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="accent-brand" />
          {o.color ? <span data-color={o.color} className="h-2 w-2 shrink-0 rounded-full bg-item" aria-hidden /> : null}
          <span className="truncate">{o.label}</span>
        </label>
      ))}
      {collapseAfter && options.length > collapseAfter ? (
        <button type="button" className="mt-0.5 self-start px-1 type-caption-1 text-brand hover:underline" onClick={() => setExpanded((e) => !e)}>
          {expanded ? "Show fewer" : `Show all ${options.length}`}
        </button>
      ) : null}
    </div>
  );
}

function ResultGroup({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <section aria-label={title}>
      <h2 className="mb-1 flex items-baseline gap-2 type-subtitle-2">
        {title} <span className="type-caption-1 text-fg-tertiary">{count}</span>
      </h2>
      <div className="divide-y divide-border rounded-md border border-border bg-surface">{children}</div>
    </section>
  );
}

function Highlighted({ text, className }: { text: string; className?: string }) {
  return (
    <span className={className}>
      {splitHighlight(text).map((s, i) => (s.hit ? <mark key={i} className="rounded-xs bg-brand-tint text-fg">{s.text}</mark> : <React.Fragment key={i}>{s.text}</React.Fragment>))}
    </span>
  );
}

function TaskResult({ hit, onOpen }: { hit: SearchTaskHit; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} data-result-id={hit.id} className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-hover">
      <span className="mt-0.5 w-16 shrink-0 font-mono type-caption-1 text-fg-tertiary">{hit.key}</span>
      <span className="min-w-0 flex-1">
        <Highlighted text={hit.titleHighlighted || hit.title} className={cn("block truncate type-body-1-strong", hit.completedAt && "text-fg-secondary line-through")} />
        {hit.snippet && hit.snippet !== hit.title ? <Highlighted text={hit.snippet} className="mt-0.5 line-clamp-2 type-caption-1 text-fg-secondary" /> : null}
        <span className="mt-1 flex flex-wrap items-center gap-2 type-caption-1 text-fg-secondary">
          <span className="inline-flex items-center gap-1">
            <span data-color={hit.projectColor} className="h-2 w-2 rounded-full bg-item" aria-hidden />
            {hit.projectName}
          </span>
          <Badge color={hit.status.color} dot>
            {hit.status.name}
          </Badge>
          {hit.dueDate ? <span>Due {formatDateShort(hit.dueDate)}</span> : null}
          {hit.attachmentCount ? (
            <span className="inline-flex items-center gap-0.5">
              <Attach16Regular /> {hit.attachmentCount}
            </span>
          ) : null}
        </span>
      </span>
      {hit.assignee ? <Avatar name={hit.assignee.displayName} src={hit.assignee.avatarUrl} size="sm" className="mt-0.5" /> : <span className="w-6" />}
    </button>
  );
}

function ProjectResult({ hit, href }: { hit: SearchProjectHit; href: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 px-3 py-2 hover:bg-hover">
      <span data-color={hit.color} className="h-3 w-3 shrink-0 rounded-full bg-item" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate type-body-1-strong">{hit.name}</span>
        {hit.description ? <span className="block truncate type-caption-1 text-fg-secondary">{hit.description}</span> : null}
      </span>
      <span className="font-mono type-caption-1 text-fg-tertiary">{hit.key}</span>
      <span className="type-caption-1 text-fg-secondary">{hit.taskCount} tasks</span>
      {hit.archivedAt ? <Badge color="gray">Archived</Badge> : null}
    </Link>
  );
}

function CommentResult({ hit, onOpen }: { hit: SearchCommentHit; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-hover">
      <Avatar name={hit.author.displayName} src={hit.author.avatarUrl} size="sm" className="mt-0.5" />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2 type-caption-1 text-fg-secondary">
          <span className="type-caption-1-strong text-fg">{hit.author.displayName}</span>
          <span>on</span>
          <span className="font-mono">{hit.taskKey}</span>
          <span className="truncate">{hit.taskTitle}</span>
          <span className="ml-auto shrink-0">{formatRelativeTime(hit.createdAt)}</span>
        </span>
        <Highlighted text={hit.snippet} className="mt-0.5 line-clamp-2 type-body-1" />
      </span>
    </button>
  );
}

function PersonResult({ hit, onSearch }: { hit: SearchPersonHit; onSearch: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
      <Avatar name={hit.displayName} src={hit.avatarUrl} size="md" />
      <span className="min-w-40 flex-1">
        <span className="block type-body-1-strong">{hit.displayName}</span>
        <span className="block type-caption-1 text-fg-secondary">{hit.email}</span>
      </span>
      <span className="flex items-center gap-2">
        <Badge color="gray">{hit.role}</Badge>
        <Button variant="subtle" size="sm" onClick={onSearch}>
          Show their tasks
        </Button>
      </span>
    </div>
  );
}
