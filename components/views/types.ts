import type { TaskRow, DependencyRow, StatusRef, SectionRef, PersonRef } from "@/lib/query-engine/types";
import type { ViewSpec } from "@/lib/validation/view-spec";
import type { ViewType } from "@/lib/db/schema";
import type { Group } from "@/lib/client/grouping";

export type ProjectInfo = {
  id: string;
  key: string;
  name: string;
  color: string;
  icon: string | null;
  privacy: "workspace" | "team" | "private";
  ownerId: string | null;
  startDate: string | null;
  endDate: string | null;
  autoSchedule: boolean;
  defaultViewId: string | null;
  archivedAt: string | null;
  statuses: Array<StatusRef & { wipLimit: number | null }>;
  sections: SectionRef[];
  fields: Array<{ id: string; name: string; type: string; config: unknown; position: number; isRequired: boolean }>;
  cycles: Array<{ id: string; name: string; goal: string | null; startDate: string; endDate: string; capacity: number | null; closedAt: string | null }>;
  views: Array<{ id: string; name: string; type: ViewType; spec: ViewSpec; isShared: boolean; ownerId: string | null; position: number }>;
  members: PersonRef[];
  /** Saved Gantt baselines, newest first. `tasks` is only filled by the dev preview fixtures. */
  baselines: Array<{ id: string; name: string; createdAt: string; tasks?: Record<string, { startDate: string | null; dueDate: string | null }> }>;
  role: "owner" | "editor" | "commenter" | "viewer" | null;
};

/** Everything a view component receives. Views never fetch on their own. */
export type ViewProps = {
  project: ProjectInfo;
  rows: TaskRow[];
  dependencies: DependencyRow[];
  groups: Group[];
  spec: ViewSpec;
  setSpec: (updater: (prev: ViewSpec) => ViewSpec) => void;
  isFetching: boolean;
  canEdit: boolean;
};
