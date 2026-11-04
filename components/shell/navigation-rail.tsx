"use client";

import * as React from "react";
import Link from "next/link";
import {
  Home20Regular,
  Home20Filled,
  TaskListSquareLtr20Regular,
  Mail20Regular,
  Mail20Filled,
  Folder20Regular,
  Settings20Regular,
  PanelLeft20Regular,
  ChevronDown16Regular,
  Add20Regular,
  Grid20Regular,
  Apps20Regular,
  Target20Regular,
  PeopleTeam20Regular,
  Question20Regular,
} from "@fluentui/react-icons";
import { cn } from "@/lib/utils";
import { CountBadge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, MenuLabel } from "@/components/ui/menu";
import { useWorkspace } from "@/lib/client/workspace-context";
import { NewProjectDialog } from "@/components/project/new-project-dialog";
import { useViewState } from "@/lib/client/view-state";

export type RailProject = { id: string; key: string; name: string; color: string; icon: string | null; archivedAt: string | null };

type Props = {
  projects: RailProject[];
  workspaces: Array<{ id: string; slug: string; name: string; logoUrl: string | null }>;
  unreadCount: number;
  collapsed: boolean;
  onToggle: () => void;
  pathname: string;
};

export function NavigationRail({ projects, workspaces, unreadCount, collapsed, onToggle, pathname }: Props) {
  const { slug, workspace, role } = useWorkspace();
  const [newProjectOpen, setNewProjectOpen] = React.useState(false);
  const openTask = useViewState((s) => s.openTask);
  const base = `/w/${slug}`;
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const item = (href: string, label: string, icon: React.ReactNode, activeIcon?: React.ReactNode, badge?: number) => {
    const active = isActive(href);
    const content = (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-8 items-center gap-2 rounded-sm px-2 type-body-1 text-fg hover:bg-hover",
          active && "bg-selected font-semibold text-brand",
          collapsed && "justify-center px-0",
        )}
      >
        <span className="relative inline-flex shrink-0 [&>svg]:h-5 [&>svg]:w-5">
          {active && activeIcon ? activeIcon : icon}
          {collapsed && badge ? <CountBadge count={badge} className="absolute -right-2 -top-1" /> : null}
        </span>
        {!collapsed ? <span className="flex-1 truncate">{label}</span> : null}
        {!collapsed && badge ? <CountBadge count={badge} /> : null}
      </Link>
    );
    return collapsed ? (
      <Tooltip key={href} content={label} side="right">
        {content}
      </Tooltip>
    ) : (
      <React.Fragment key={href}>{content}</React.Fragment>
    );
  };

  const active = projects.filter((p) => !p.archivedAt);

  return (
    <nav
      aria-label="Primary"
      className={cn("flex h-full shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200 ease-[var(--ease-standard)]", collapsed ? "w-12" : "w-60")}
    >
      <div className={cn("flex h-12 items-center border-b border-border px-2", collapsed && "justify-center")}>
        <Menu>
          <MenuTrigger asChild>
            <button type="button" className={cn("flex h-8 min-w-0 flex-1 items-center gap-2 rounded-sm px-1 hover:bg-hover", collapsed && "w-8 flex-none justify-center px-0")} aria-label="Switch workspace">
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-brand type-caption-1-strong text-fg-on-brand">{workspace.name.slice(0, 2).toUpperCase()}</span>
              {!collapsed ? (
                <>
                  <span className="truncate type-body-1-strong">{workspace.name}</span>
                  <ChevronDown16Regular className="ml-auto text-fg-tertiary" />
                </>
              ) : null}
            </button>
          </MenuTrigger>
          <MenuContent className="w-64">
            <MenuLabel>Workspaces</MenuLabel>
            {workspaces.map((w) => (
              <MenuItem key={w.id} asChild>
                <Link href={`/w/${w.slug}/home`}>
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-xs bg-subtle type-caption-2 font-semibold">{w.name.slice(0, 2).toUpperCase()}</span>
                  <span className="truncate">{w.name}</span>
                </Link>
              </MenuItem>
            ))}
            <MenuSeparator />
            <MenuItem asChild>
              <Link href="/onboarding">Create workspace</Link>
            </MenuItem>
            {role === "owner" || role === "admin" ? (
              <MenuItem asChild>
                <Link href={`${base}/settings`}>Workspace settings</Link>
              </MenuItem>
            ) : null}
          </MenuContent>
        </Menu>
      </div>

      <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
        {role !== "guest" ? (
          <Menu>
            <MenuTrigger asChild>
              <button type="button" className={cn("mb-1 flex h-8 items-center gap-2 rounded-sm bg-brand px-2 type-body-1 font-semibold text-fg-on-brand hover:bg-brand-hover", collapsed && "justify-center px-0")}>
                <Add20Regular />
                {!collapsed ? "New" : null}
              </button>
            </MenuTrigger>
            <MenuContent>
              <MenuItem onSelect={() => openTask("new")}>Task</MenuItem>
              <MenuItem onSelect={() => setNewProjectOpen(true)}>Project</MenuItem>
              <MenuItem asChild>
                <Link href={`${base}/templates`}>Project from template</Link>
              </MenuItem>
            </MenuContent>
          </Menu>
        ) : null}

        {item(`${base}/home`, "Home", <Home20Regular />, <Home20Filled />)}
        {item(`${base}/my-work`, "My work", <TaskListSquareLtr20Regular />)}
        {item(`${base}/inbox`, "Inbox", <Mail20Regular />, <Mail20Filled />, unreadCount)}

        <div className={cn("mt-3 flex items-center justify-between px-2", collapsed && "justify-center px-0")}>
          {!collapsed ? <span className="type-caption-1-strong text-fg-tertiary">Projects</span> : <span className="h-px w-6 bg-border" />}
          {!collapsed && role !== "guest" ? (
            <button type="button" className="rounded-xs text-fg-tertiary hover:text-fg" aria-label="New project" onClick={() => setNewProjectOpen(true)}>
              <Add20Regular className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        {active.slice(0, 20).map((p) => {
          const href = `${base}/projects/${p.key}`;
          const isOn = isActive(href);
          const content = (
            <Link
              href={href}
              key={p.id}
              aria-current={isOn ? "page" : undefined}
              className={cn("flex h-8 items-center gap-2 rounded-sm px-2 type-body-1 text-fg hover:bg-hover", isOn && "bg-selected font-semibold", collapsed && "justify-center px-0")}
            >
              <span data-color={p.color} className="h-2.5 w-2.5 shrink-0 rounded-full bg-item" aria-hidden />
              {!collapsed ? <span className="truncate">{p.name}</span> : null}
            </Link>
          );
          return collapsed ? (
            <Tooltip key={p.id} content={p.name} side="right">
              {content}
            </Tooltip>
          ) : (
            content
          );
        })}
        {item(`${base}/projects`, "All projects", <Folder20Regular />)}

        <div className="mt-3">
          {item(`${base}/portfolios`, "Portfolios", <Grid20Regular />)}
          {item(`${base}/goals`, "Goals", <Target20Regular />)}
          {item(`${base}/teams`, "Teams", <PeopleTeam20Regular />)}
        </div>
      </div>

      <div className="flex flex-col gap-1 border-t border-border p-2">
        {item(`${base}/templates`, "Templates", <Apps20Regular />)}
        {item(`${base}/settings`, "Settings", <Settings20Regular />)}
        {item(`${base}/help`, "Help and shortcuts", <Question20Regular />)}
        <Tooltip content={collapsed ? "Expand" : "Collapse"} side="right" shortcut="[">
          <button type="button" onClick={onToggle} className={cn("flex h-8 items-center gap-2 rounded-sm px-2 type-body-1 text-fg-secondary hover:bg-hover", collapsed && "justify-center px-0")} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}>
            <PanelLeft20Regular />
            {!collapsed ? "Collapse" : null}
          </button>
        </Tooltip>
      </div>
      <NewProjectDialog open={newProjectOpen} onOpenChange={setNewProjectOpen} />
    </nav>
  );
}
