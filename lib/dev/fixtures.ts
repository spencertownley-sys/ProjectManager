/* Deterministic fixture data for the /dev/preview route and visual tests. Not used in production. */
import type { TaskRow, DependencyRow, PersonRef } from "@/lib/query-engine/types";
import type { ProjectInfo } from "@/components/views/types";
import { defaultViewSpec } from "@/lib/validation/view-spec";

const people: PersonRef[] = [
  { id: "u-spencer", displayName: "Spencer Townley", avatarUrl: null, email: "spencer@example.com" },
  { id: "u-jenny", displayName: "Jenny Park", avatarUrl: null, email: "jenny@example.com" },
  { id: "u-mary", displayName: "Mary Alvarez", avatarUrl: null, email: "mary@example.com" },
  { id: "u-amelia", displayName: "Amelia Chen", avatarUrl: null, email: "amelia@example.com" },
  { id: "u-pete", displayName: "Pete Okafor", avatarUrl: null, email: "pete@example.com" },
  { id: "u-anthony", displayName: "Anthony Rossi", avatarUrl: null, email: "anthony@example.com" },
  { id: "u-lisa", displayName: "Lisa Nguyen", avatarUrl: null, email: "lisa@example.com" },
  { id: "u-logan", displayName: "Logan Reed", avatarUrl: null, email: "logan@example.com" },
  { id: "u-anisa", displayName: "Anisa Rahman", avatarUrl: null, email: "anisa@example.com" },
  { id: "u-karla", displayName: "Karla Mendez", avatarUrl: null, email: "karla@example.com" },
];

const statuses = [
  { id: "s-proposed", name: "Proposed", category: "not_started" as const, color: "gray", position: 0, wipLimit: null },
  { id: "s-approved", name: "Approved", category: "not_started" as const, color: "navy", position: 1, wipLimit: null },
  { id: "s-progress", name: "In progress", category: "in_progress" as const, color: "blue", position: 2, wipLimit: 5 },
  { id: "s-review", name: "In review", category: "in_progress" as const, color: "purple", position: 3, wipLimit: 3 },
  { id: "s-complete", name: "Complete", category: "done" as const, color: "green", position: 4, wipLimit: null },
];

const sections = [
  { id: "sec-plan", name: "Planning", position: 1024, isCollapsed: false },
  { id: "sec-prod", name: "Production", position: 2048, isCollapsed: false },
  { id: "sec-launch", name: "Launch", position: 3072, isCollapsed: false },
  { id: "sec-wrap", name: "Wrap-up", position: 4096, isCollapsed: false },
];

export const fixtureToday = "2026-11-04";

function day(offset: number): string {
  const d = new Date(fixtureToday + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

const titles: Array<[string, string, number, number | null, number | null, string | null, TaskRow["priority"], boolean]> = [
  ["Campaign brief", "sec-plan", 4, -14, -9, "u-spencer", "high", false],
  ["Audience research", "sec-plan", 4, -12, -6, "u-anisa", "medium", false],
  ["Budget approval", "sec-plan", 3, -8, -1, "u-mary", "urgent", false],
  ["Channel plan", "sec-plan", 2, -7, 2, "u-jenny", "medium", false],
  ["Kickoff with agency", "sec-plan", 4, -5, -5, "u-spencer", "none", true],
  ["Creative concepts", "sec-prod", 2, -3, 6, "u-amelia", "high", false],
  ["Copy deck v1", "sec-prod", 2, -1, 4, "u-lisa", "medium", false],
  ["Landing page build", "sec-prod", 1, 2, 12, "u-logan", "high", false],
  ["Email templates", "sec-prod", 0, 5, 11, "u-karla", "low", false],
  ["Photography shoot", "sec-prod", 1, 1, 3, "u-pete", "medium", false],
  ["Legal review", "sec-prod", 0, 10, 14, "u-anthony", "medium", false],
  ["Creative approval", "sec-prod", 0, 15, 15, "u-spencer", "none", true],
  ["QA landing page", "sec-launch", 0, 13, 17, "u-logan", "high", false],
  ["Schedule social posts", "sec-launch", 0, 16, 19, "u-karla", "medium", false],
  ["Press release", "sec-launch", 0, 14, 20, "u-lisa", "low", false],
  ["Launch day", "sec-launch", 0, 21, 21, "u-spencer", "urgent", true],
  ["Monitor performance", "sec-wrap", 0, 22, 29, "u-anisa", "medium", false],
  ["Results report", "sec-wrap", 0, 30, 36, "u-mary", "medium", false],
  ["Retrospective", "sec-wrap", 0, 37, 37, "u-spencer", "none", true],
  ["Archive assets", "sec-wrap", 0, 38, 40, "u-amelia", "low", false],
];

export function fixtureRows(): TaskRow[] {
  const rows: TaskRow[] = titles.map(([title, sectionId, statusIdx, start, due, assignee, priority, milestone], i) => {
    const status = statuses[statusIdx];
    return {
      id: `t-${i + 1}`,
      key: `MKT-${i + 1}`,
      number: i + 1,
      workspaceId: "w-1",
      projectId: "p-1",
      projectKey: "MKT",
      projectColor: "berry",
      sectionId,
      parentId: null,
      cycleId: null,
      title,
      status,
      priority,
      assignee: assignee ? (people.find((p) => p.id === assignee) ?? null) : null,
      startDate: start === null ? null : day(milestone ? (due as number) : start),
      dueDate: due === null ? null : day(due),
      dueTime: null,
      estimate: milestone ? null : ((i * 7) % 13) + 1,
      isMilestone: milestone,
      position: (i + 1) * 1024,
      version: 1,
      createdBy: "u-spencer",
      completedAt: status.category === "done" ? day(-2) + "T10:00:00Z" : null,
      createdAt: day(-20) + "T10:00:00Z",
      updatedAt: day(-1) + "T10:00:00Z",
      subtaskCount: i % 4 === 0 ? 3 : 0,
      subtaskDoneCount: i % 4 === 0 ? 1 : 0,
      commentCount: (i * 3) % 5,
      attachmentCount: i % 6 === 0 ? 2 : 0,
      blockedByCount: 0,
      tags: i % 3 === 0 ? [{ id: "tag-email", name: "Email", color: "teal" }] : i % 5 === 0 ? [{ id: "tag-web", name: "Web", color: "purple" }] : [],
      customFields: {},
    };
  });
  // Subtasks for the first task
  rows.push(
    { ...rows[0], id: "t-sub-1", key: "MKT-21", number: 21, parentId: "t-1", title: "Define objectives", subtaskCount: 0, subtaskDoneCount: 0, commentCount: 0, attachmentCount: 0, tags: [], status: statuses[4], completedAt: day(-10) + "T10:00:00Z", isMilestone: false, dueDate: day(-12), startDate: day(-13) },
    { ...rows[0], id: "t-sub-2", key: "MKT-22", number: 22, parentId: "t-1", title: "List success metrics", subtaskCount: 0, subtaskDoneCount: 0, commentCount: 1, attachmentCount: 0, tags: [], status: statuses[4], completedAt: day(-10) + "T10:00:00Z", isMilestone: false, dueDate: day(-11), startDate: day(-12) },
    { ...rows[0], id: "t-sub-3", key: "MKT-23", number: 23, parentId: "t-1", title: "Share with stakeholders", subtaskCount: 0, subtaskDoneCount: 0, commentCount: 0, attachmentCount: 0, tags: [], status: statuses[4], completedAt: day(-9) + "T10:00:00Z", isMilestone: false, dueDate: day(-9), startDate: day(-10) },
  );
  return rows;
}

export function fixtureDependencies(): DependencyRow[] {
  return [
    { id: "d-1", predecessorId: "t-1", successorId: "t-2", type: "fs", lagDays: 0 },
    { id: "d-2", predecessorId: "t-3", successorId: "t-6", type: "fs", lagDays: 0 },
    { id: "d-3", predecessorId: "t-6", successorId: "t-8", type: "fs", lagDays: 0 },
    { id: "d-4", predecessorId: "t-8", successorId: "t-13", type: "fs", lagDays: 1 },
    { id: "d-5", predecessorId: "t-13", successorId: "t-16", type: "fs", lagDays: 0 },
    { id: "d-6", predecessorId: "t-7", successorId: "t-9", type: "fs", lagDays: 0 },
    { id: "d-7", predecessorId: "t-11", successorId: "t-12", type: "fs", lagDays: 0 },
    { id: "d-8", predecessorId: "t-16", successorId: "t-17", type: "fs", lagDays: 0 },
    { id: "d-9", predecessorId: "t-17", successorId: "t-18", type: "fs", lagDays: 0 },
    { id: "d-10", predecessorId: "t-14", successorId: "t-16", type: "ff", lagDays: 0 },
  ];
}

export function fixtureProject(): ProjectInfo {
  return {
    id: "p-1",
    key: "MKT",
    name: "Spring campaign",
    color: "berry",
    icon: null,
    privacy: "workspace",
    ownerId: "u-spencer",
    startDate: day(-14),
    endDate: day(40),
    autoSchedule: false,
    defaultViewId: "v-default",
    archivedAt: null,
    statuses,
    sections,
    fields: [],
    cycles: [],
    views: [
      { id: "v-default", name: "Default", type: "list", spec: defaultViewSpec(), isShared: true, ownerId: "u-spencer", position: 0 },
      { id: "v-mine", name: "My open tasks", type: "list", spec: { ...defaultViewSpec(), filters: { kind: "group", op: "and", items: [{ kind: "filter", field: "assignee", op: "is_me" }] } }, isShared: false, ownerId: "u-spencer", position: 1 },
    ],
    members: people,
    baselines: [
      {
        id: "bl-1",
        name: "Plan v1",
        createdAt: day(-7) + "T09:00:00Z",
        // The original plan: production ran two days earlier, launch a week earlier.
        tasks: Object.fromEntries(titles.map(([, , , start, due, , , milestone], i) => {
          const shift = i >= 5 && i < 12 ? -2 : i >= 12 ? -7 : 0;
          const s = start === null ? null : day((milestone ? (due as number) : start) + shift);
          const d = due === null ? null : day(due + shift);
          return [`t-${i + 1}`, { startDate: s, dueDate: d }];
        })),
      },
    ],
    role: "owner",
  };
}

export const fixturePeople = people;
