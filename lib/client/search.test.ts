import { describe, it, expect } from "vitest";
import { splitHighlight, parseSearchParams, toSearchParams, activeFilterCount, filterStaticResults, resultCount } from "./search";
import type { SearchResults } from "@/lib/services/search";

const results: SearchResults = {
  q: "",
  truncated: false,
  tasks: [
    { id: "t-1", key: "MKT-1", title: "Landing page build", titleHighlighted: "", snippet: "Build the landing page", projectId: "p-1", projectKey: "MKT", projectName: "Spring", projectColor: "berry", status: { name: "In progress", color: "blue", category: "in_progress" }, assignee: { id: "u-1", displayName: "Lisa", avatarUrl: null }, dueDate: "2026-11-10", completedAt: null, attachmentCount: 1 },
    { id: "t-2", key: "MKT-2", title: "Press release", titleHighlighted: "", snippet: "Draft the press release", projectId: "p-1", projectKey: "MKT", projectName: "Spring", projectColor: "berry", status: { name: "Done", color: "green", category: "done" }, assignee: null, dueDate: "2026-11-20", completedAt: "2026-11-01T00:00:00Z", attachmentCount: 0 },
  ],
  projects: [{ id: "p-1", key: "MKT", name: "Spring campaign", color: "berry", description: "Landing pages and email", taskCount: 10, archivedAt: null }],
  comments: [{ id: "c-1", taskId: "t-1", taskKey: "MKT-1", taskTitle: "Landing page build", projectId: "p-1", projectKey: "MKT", author: { id: "u-1", displayName: "Lisa", avatarUrl: null }, snippet: "The landing page copy is ready", createdAt: "2026-11-02T10:00:00Z" }],
  people: [{ id: "u-1", displayName: "Lisa Nguyen", email: "lisa@example.com", avatarUrl: null, role: "member" }],
};

describe("splitHighlight", () => {
  it("splits marked snippets into plain and hit segments", () => {
    expect(splitHighlight("Build the [[landing]] [[page]] now")).toEqual([
      { text: "Build the ", hit: false },
      { text: "landing", hit: true },
      { text: " ", hit: false },
      { text: "page", hit: true },
      { text: " now", hit: false },
    ]);
  });
  it("renders unbalanced markers as text", () => {
    expect(splitHighlight("odd [[marker")).toEqual([{ text: "odd [[marker", hit: false }]);
    expect(splitHighlight("")).toEqual([]);
  });
});

describe("search params", () => {
  it("round trips the query and filters and drops bad values", () => {
    const query = parseSearchParams(new URLSearchParams("q=landing&project=p-1&assignee=me&status=done&from=2026-11-01&to=bad&attachment=1"));
    expect(query).toEqual({ q: "landing", projectId: "p-1", assigneeId: "me", statusCategory: "done", from: "2026-11-01", hasAttachment: true });
    expect(toSearchParams(query).toString()).toBe("q=landing&project=p-1&assignee=me&status=done&from=2026-11-01&attachment=1");
    expect(activeFilterCount(query)).toBe(5);
    expect(parseSearchParams(new URLSearchParams("status=weird"))).toEqual({ q: "" });
  });
});

describe("filterStaticResults", () => {
  it("matches every word across the groups and highlights hits", () => {
    const out = filterStaticResults(results, { q: "landing page" }, "u-1");
    expect(out.tasks.map((t) => t.key)).toEqual(["MKT-1"]);
    expect(out.tasks[0].titleHighlighted).toBe("[[Landing]] [[page]] build");
    expect(out.projects).toHaveLength(1);
    expect(out.comments).toHaveLength(1);
    expect(out.people).toHaveLength(0);
    expect(resultCount(out)).toBe(3);
  });
  it("applies the task filters", () => {
    expect(filterStaticResults(results, { q: "e", assigneeId: "unassigned" }, "u-1").tasks.map((t) => t.key)).toEqual(["MKT-2"]);
    expect(filterStaticResults(results, { q: "e", assigneeId: "me" }, "u-1").tasks.map((t) => t.key)).toEqual(["MKT-1"]);
    expect(filterStaticResults(results, { q: "e", statusCategory: "done" }, "u-1").tasks.map((t) => t.key)).toEqual(["MKT-2"]);
    expect(filterStaticResults(results, { q: "e", from: "2026-11-15" }, "u-1").tasks.map((t) => t.key)).toEqual(["MKT-2"]);
    expect(filterStaticResults(results, { q: "e", hasAttachment: true }, "u-1").tasks.map((t) => t.key)).toEqual(["MKT-1"]);
    expect(filterStaticResults(results, { q: "" }, "u-1").tasks).toHaveLength(0);
  });
});
