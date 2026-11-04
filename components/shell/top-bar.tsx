"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthBridge } from "@/lib/client/auth-bridge";
import { Search20Regular, Mail20Regular, Question20Regular } from "@fluentui/react-icons";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { KeyCap, CountBadge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, MenuLabel, MenuRadioGroup, MenuRadioItem } from "@/components/ui/menu";
import { useWorkspace } from "@/lib/client/workspace-context";
import { useShellState } from "@/lib/client/view-state";

export function TopBar({ onOpenPalette, unreadCount }: { onOpenPalette: () => void; unreadCount: number }) {
  const { slug, workspace, user } = useWorkspace();
  const pathname = usePathname();
  const { signOut, openProfile } = useAuthBridge();
  const { density, setDensity } = useShellState();
  const [theme, setTheme] = React.useState<string>(() => (typeof window === "undefined" ? "system" : (localStorage.getItem("tp-theme") ?? "system")));

  const applyTheme = (value: string) => {
    setTheme(value);
    if (value === "system") {
      localStorage.removeItem("tp-theme");
      document.documentElement.dataset.theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } else {
      localStorage.setItem("tp-theme", value);
      document.documentElement.dataset.theme = value;
    }
  };

  const crumbs = pathname.replace(`/w/${slug}`, "").split("/").filter(Boolean);
  const section = crumbs[0] ? { home: "Home", "my-work": "My work", inbox: "Inbox", projects: "Projects", settings: "Settings", templates: "Templates", portfolios: "Portfolios", goals: "Goals", teams: "Teams", search: "Search", help: "Help" }[crumbs[0]] ?? crumbs[0] : "";

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-surface px-3">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 type-body-1 text-fg-secondary">
        <Link href={`/w/${slug}/home`} className="truncate hover:text-fg">
          {workspace.name}
        </Link>
        {section ? (
          <>
            <span aria-hidden>/</span>
            <span className="truncate text-fg">{section}</span>
          </>
        ) : null}
      </nav>
      <div className="flex-1" />
      <button
        type="button"
        onClick={onOpenPalette}
        className="hidden h-8 w-72 items-center gap-2 rounded-sm border border-border bg-canvas px-2 text-left type-body-1 text-fg-tertiary hover:border-border-strong md:flex"
      >
        <Search20Regular className="h-4 w-4" />
        <span className="flex-1">Search or jump to</span>
        <KeyCap>Ctrl K</KeyCap>
      </button>
      <Tooltip content="Search" shortcut="Ctrl K">
        <Button variant="subtle" size="icon" className="md:hidden" aria-label="Search" onClick={onOpenPalette}>
          <Search20Regular />
        </Button>
      </Tooltip>
      <Tooltip content="Inbox" shortcut="G I">
        <Button variant="subtle" size="icon" asChild aria-label="Inbox">
          <Link href={`/w/${slug}/inbox`} className="relative">
            <Mail20Regular />
            {unreadCount > 0 ? <CountBadge count={unreadCount} className="absolute -right-0.5 -top-0.5" /> : null}
          </Link>
        </Button>
      </Tooltip>
      <Tooltip content="Help and shortcuts" shortcut="?">
        <Button variant="subtle" size="icon" asChild aria-label="Help">
          <Link href={`/w/${slug}/help`}>
            <Question20Regular />
          </Link>
        </Button>
      </Tooltip>
      <Menu>
        <MenuTrigger asChild>
          <button type="button" className="rounded-full" aria-label="Account menu">
            <Avatar name={user.displayName} src={user.avatarUrl} size="md" />
          </button>
        </MenuTrigger>
        <MenuContent align="end" className="w-60">
          <MenuLabel>
            <span className="block truncate text-fg">{user.displayName}</span>
            <span className="block truncate font-normal">{user.email}</span>
          </MenuLabel>
          <MenuSeparator />
          <MenuItem onSelect={() => openProfile()}>Profile and security</MenuItem>
          <MenuItem asChild>
            <Link href={`/w/${slug}/settings/notifications`}>Notification settings</Link>
          </MenuItem>
          <MenuSeparator />
          <MenuLabel>Theme</MenuLabel>
          <MenuRadioGroup value={theme} onValueChange={applyTheme}>
            <MenuRadioItem value="system">System</MenuRadioItem>
            <MenuRadioItem value="light">Light</MenuRadioItem>
            <MenuRadioItem value="dark">Dark</MenuRadioItem>
          </MenuRadioGroup>
          <MenuSeparator />
          <MenuLabel>Density</MenuLabel>
          <MenuRadioGroup value={density} onValueChange={(v) => setDensity(v as typeof density)}>
            <MenuRadioItem value="compact">Compact</MenuRadioItem>
            <MenuRadioItem value="default">Default</MenuRadioItem>
            <MenuRadioItem value="comfortable">Comfortable</MenuRadioItem>
          </MenuRadioGroup>
          <MenuSeparator />
          <MenuItem onSelect={() => signOut()}>Sign out</MenuItem>
        </MenuContent>
      </Menu>
    </header>
  );
}
