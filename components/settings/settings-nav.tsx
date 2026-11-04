"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type SettingsNavItem = { href: string; label: string; disabled?: boolean };
export type SettingsNavGroup = { label: string; items: SettingsNavItem[] };

/** Builds the settings navigation (docs/10 section 13). Workspace groups show only to owners and admins. */
export function settingsGroups(base: string, canManageWorkspace: boolean): SettingsNavGroup[] {
  const groups: SettingsNavGroup[] = [];
  if (canManageWorkspace) {
    groups.push({
      label: "Workspace",
      items: [
        { href: `${base}/general`, label: "General" },
        { href: `${base}/members`, label: "Members" },
        { href: `${base}/teams`, label: "Teams", disabled: true },
        { href: `${base}/fields`, label: "Fields library" },
        { href: `${base}/workflows`, label: "Workflows library" },
        { href: `${base}/tags`, label: "Tags" },
        { href: `${base}/templates`, label: "Templates", disabled: true },
        { href: `${base}/trash`, label: "Trash", disabled: true },
      ],
    });
    groups.push({
      label: "Integrations",
      items: [
        { href: `${base}/integrations`, label: "Connected apps", disabled: true },
        { href: `${base}/api-keys`, label: "API keys", disabled: true },
        { href: `${base}/webhooks`, label: "Webhooks", disabled: true },
      ],
    });
  }
  groups.push({
    label: "Account",
    items: [
      { href: `${base}/account/profile`, label: "Profile" },
      { href: `${base}/account/notifications`, label: "Notifications" },
      { href: `${base}/account/appearance`, label: "Appearance" },
      { href: `${base}/account/shortcuts`, label: "Keyboard shortcuts", disabled: true },
    ],
  });
  return groups;
}

export function SettingsNav({ groups, currentPath }: { groups: SettingsNavGroup[]; currentPath?: string }) {
  const pathname = usePathname();
  const current = currentPath ?? pathname;
  return (
    <nav aria-label="Settings" className="flex w-[200px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-border bg-surface px-2 py-4">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="px-2 pb-1 type-caption-1-strong text-fg-tertiary">{g.label}</p>
          <ul className="flex flex-col gap-0.5">
            {g.items.map((item) => {
              const active = current === item.href || current.startsWith(`${item.href}/`);
              if (item.disabled) {
                return (
                  <li key={item.href}>
                    <Tooltip content="Coming in the next release" side="right">
                      <span className="flex h-8 cursor-default items-center rounded-sm px-2 type-body-1 text-fg-disabled">{item.label}</span>
                    </Tooltip>
                  </li>
                );
              }
              return (
                <li key={item.href}>
                  <Link href={item.href} aria-current={active ? "page" : undefined} className={cn("flex h-8 items-center rounded-sm px-2 type-body-1 text-fg-secondary hover:bg-hover hover:text-fg", active && "bg-selected font-semibold text-fg")}>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Page frame used by every settings panel: title, one sentence, then the content on a single column. */
export function SettingsPage({ title, description, actions, children }: { title: string; description?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="max-w-3xl px-6 py-5">
        <div className="flex items-start gap-3 pb-4">
          <div className="min-w-0 flex-1">
            <h1 className="type-subtitle-1 text-fg">{title}</h1>
            {description ? <p className="mt-0.5 type-body-1 text-fg-secondary">{description}</p> : null}
          </div>
          {actions}
        </div>
        {children}
      </div>
    </div>
  );
}
