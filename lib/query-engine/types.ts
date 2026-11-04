import type { Priority, StatusCategory } from "@/lib/db/schema";
import type { PaletteColor } from "@/lib/validation/common";

export type StatusRef = { id: string; name: string; category: StatusCategory; color: string; position: number };
export type PersonRef = { id: string; displayName: string; avatarUrl: string | null; email?: string };
export type TagRef = { id: string; name: string; color: string };
export type SectionRef = { id: string; name: string; position: number; isCollapsed: boolean };

/** Hydrated task row returned by the query engine and consumed by every view. */
export type TaskRow = {
  id: string;
  key: string;
  number: number;
  workspaceId: string;
  projectId: string;
  projectKey: string;
  projectColor: PaletteColor | string;
  sectionId: string | null;
  parentId: string | null;
  cycleId: string | null;
  title: string;
  status: StatusRef;
  priority: Priority;
  assignee: PersonRef | null;
  startDate: string | null;
  dueDate: string | null;
  dueTime: string | null;
  estimate: number | null;
  isMilestone: boolean;
  position: number;
  version: number;
  createdBy: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  subtaskCount: number;
  subtaskDoneCount: number;
  commentCount: number;
  attachmentCount: number;
  tags: TagRef[];
  customFields: Record<string, unknown>;
  blockedByCount: number;
};

export type DependencyRow = {
  id: string;
  predecessorId: string;
  successorId: string;
  type: "fs" | "ss" | "ff" | "sf";
  lagDays: number;
};

export type QueryResult = {
  rows: TaskRow[];
  total: number;
  truncated: boolean;
};
