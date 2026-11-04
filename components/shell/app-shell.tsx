"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { NavigationRail, type RailProject } from "./navigation-rail";
import { TopBar } from "./top-bar";
import { CommandPalette } from "./command-palette";
import { TaskPaneHost } from "@/components/task/task-pane-host";
import { useShellState, useViewState } from "@/lib/client/view-state";
import { useWorkspace } from "@/lib/client/workspace-context";
import { cn } from "@/lib/utils";

export type ShellData = {
  projects: RailProject[];
  workspaces: Array<{ id: string; slug: string; name: string; logoUrl: string | null }>;
  unreadCount: number;
};

export function AppShell({ data, children }: { data: ShellData; children: React.ReactNode }) {
  const { railCollapsed, setRailCollapsed } = useShellState();
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { slug } = useWorkspace();
  const openTask = useViewState((s) => s.openTask);

  React.useEffect(() => {
    let pendingG = false;
    let gTimer: number | undefined;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (typing) return;
      if (e.key === "[") {
        e.preventDefault();
        setRailCollapsed(!railCollapsed);
        return;
      }
      if (e.key === "Escape") {
        openTask(null);
        return;
      }
      if (e.key.toLowerCase() === "g" && !pendingG) {
        pendingG = true;
        gTimer = window.setTimeout(() => (pendingG = false), 800);
        return;
      }
      if (pendingG) {
        pendingG = false;
        if (gTimer) window.clearTimeout(gTimer);
        const routes: Record<string, string> = { h: `/w/${slug}/home`, m: `/w/${slug}/my-work`, i: `/w/${slug}/inbox`, p: `/w/${slug}/projects`, s: `/w/${slug}/settings` };
        const to = routes[e.key.toLowerCase()];
        if (to) router.push(to);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [railCollapsed, setRailCollapsed, router, slug, openTask]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-canvas text-fg">
      <NavigationRail projects={data.projects} workspaces={data.workspaces} unreadCount={data.unreadCount} collapsed={railCollapsed} onToggle={() => setRailCollapsed(!railCollapsed)} pathname={pathname} />
      <div className={cn("flex min-w-0 flex-1 flex-col")}>
        <TopBar onOpenPalette={() => setPaletteOpen(true)} unreadCount={data.unreadCount} />
        <div className="flex min-h-0 flex-1">
          <main className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
          <TaskPaneHost />
        </div>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} projects={data.projects} />
    </div>
  );
}
