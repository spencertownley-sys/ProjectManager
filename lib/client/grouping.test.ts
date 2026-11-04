import { describe, it, expect } from "vitest";
import { groupRows, buildTree, dueBucket } from "./grouping";
import type { TaskRow } from "@/lib/query-engine/types";

const base = (over: Partial<TaskRow>): TaskRow => ({
  id: over.id ?? "t1",
  key: "P-1",
  number: 1,
  workspaceId: "w",
  projectId: "p",
  projectKey: "P",
  projectColor: "blue",
  sectionId: null,
  parentId: null,
  cycleId: null,
  title: "Task",
  status: { id: "s1", name: "To do", category: "not_started", color: "gray", position: 0 },
  priority: "none",
  assignee: null,
  startDate: null,
  dueDate: null,
  dueTime: null,
  estimate: null,
  isMilestone: false,
  position: 0,
  version: 1,
  createdBy: "u",
  completedAt: null,
  createdAt: "",
  updatedAt: "",
  subtaskCount: 0,
  subtaskDoneCount: 0,
  commentCount: 0,
  attachmentCount: 0,
  blockedByCount: 0,
  tags: [],
  customFields: {},
  ...over,
});

const ctx = { sections: [{ id: "a", name: "A", position: 1, isCollapsed: false }, { id: "b", name: "B", position: 2, isCollapsed: false }], statuses: [], members: [], fields: [], today: "2026-11-03" };

describe("grouping", () => {
  it("keeps section order and adds a group for unsectioned rows", () => {
    const groups = groupRows([base({ id: "1", sectionId: "b" }), base({ id: "2", sectionId: "a" }), base({ id: "3" })], "section", ctx);
    expect(groups.map((g) => g.label)).toEqual(["A", "B", "No section"]);
    expect(groups[0].rows[0].id).toBe("2");
  });
  it("buckets due dates", () => {
    expect(dueBucket("2026-11-01", "2026-11-03")).toBe("overdue");
    expect(dueBucket("2026-11-03", "2026-11-03")).toBe("today");
    expect(dueBucket("2026-11-04", "2026-11-03")).toBe("tomorrow");
    expect(dueBucket("2026-11-09", "2026-11-03")).toBe("week");
    expect(dueBucket("2026-12-01", "2026-11-03")).toBe("later");
    expect(dueBucket(null, "2026-11-03")).toBe("none");
    const groups = groupRows([base({ id: "1", dueDate: "2026-12-01" }), base({ id: "2", dueDate: "2026-11-01" })], "due_date", ctx);
    expect(groups.map((g) => g.label)).toEqual(["Overdue", "Later"]);
  });
  it("builds a nested tree with depth", () => {
    const tree = buildTree([base({ id: "p" }), base({ id: "c", parentId: "p" }), base({ id: "gc", parentId: "c" }), base({ id: "orphan", parentId: "missing" })]);
    expect(tree.map((n) => `${n.row.id}:${n.depth}`)).toEqual(["p:0", "c:1", "gc:2", "orphan:0"]);
    expect(tree[0].hasChildren).toBe(true);
  });
});
