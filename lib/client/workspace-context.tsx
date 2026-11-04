"use client";

import * as React from "react";
import type { PersonRef } from "@/lib/query-engine/types";

export type WorkspaceContextValue = {
  slug: string;
  workspace: { id: string; name: string; slug: string; logoUrl: string | null; estimateUnit: "points" | "hours"; cycleLabel: string; weekStartsOn: number };
  user: { id: string; displayName: string; email: string; avatarUrl: string | null };
  role: "owner" | "admin" | "member" | "guest";
  members: PersonRef[];
  today: string;
};

const Ctx = React.createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ value, children }: { value: WorkspaceContextValue; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return v;
}
