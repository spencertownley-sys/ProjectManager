"use client";

import * as React from "react";
import Link from "next/link";
import { Keyboard20Regular, Book20Regular, Mail20Regular, Apps20Regular, Search20Regular, Settings20Regular } from "@fluentui/react-icons";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/lib/client/workspace-context";
import { useHelpStore } from "@/lib/client/help-store";
import { ShortcutList } from "./shortcut-list";

const guides = [
  { title: "Plan a project", body: "Create a project from a template, add sections, then switch between List, Board, Table, Gantt, Timeline, and Calendar. Every view shares the same filters and sorts.", href: "templates", icon: <Apps20Regular /> },
  { title: "Work from your inbox", body: "Mentions, assignments, due reminders, and status changes land in the Inbox. Archive, snooze, or open the task from the row.", href: "inbox", icon: <Mail20Regular /> },
  { title: "Find anything", body: "Search looks across task titles, descriptions, comments, projects, and people. Filter by project, assignee, status, dates, or attachments.", href: "search", icon: <Search20Regular /> },
  { title: "Set up the workspace", body: "Owners and admins manage members, the fields and workflow libraries, tags, and notification defaults from Settings.", href: "settings", icon: <Settings20Regular /> },
];

/** Help (docs/10 section 1): the shortcut sheet content on a page, short guides, and where to get support. */
export function HelpPage() {
  const { slug } = useWorkspace();
  const openSheet = useHelpStore((s) => s.setSheetOpen);
  return (
    <div className="h-full overflow-y-auto">
      <div className="border-b border-border bg-surface px-6 py-4">
        <h1 className="type-title-3">Help and shortcuts</h1>
        <p className="type-body-1 text-fg-secondary">Short guides for the main flows and every keyboard shortcut in one place.</p>
      </div>
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-6">
        <section aria-labelledby="guides-heading">
          <h2 id="guides-heading" className="mb-3 flex items-center gap-2 type-subtitle-1">
            <Book20Regular className="text-fg-secondary" /> Guides
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {guides.map((g) => (
              <Link key={g.title} href={`/w/${slug}/${g.href}`} className="flex gap-3 rounded-md border border-border bg-surface p-4 hover:bg-hover">
                <span className="mt-0.5 text-brand">{g.icon}</span>
                <span className="min-w-0">
                  <span className="block type-body-1-strong">{g.title}</span>
                  <span className="mt-0.5 block type-body-1 text-fg-secondary">{g.body}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
        <section aria-labelledby="shortcuts-heading">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="shortcuts-heading" className="flex items-center gap-2 type-subtitle-1">
              <Keyboard20Regular className="text-fg-secondary" /> Keyboard shortcuts
            </h2>
            <Button variant="secondary" size="sm" onClick={() => openSheet(true)}>
              Open as a sheet
            </Button>
          </div>
          <div className="rounded-md border border-border bg-surface p-4">
            <ShortcutList columns={3} />
          </div>
        </section>
        <section aria-labelledby="support-heading" className="rounded-md border border-border bg-surface p-4">
          <h2 id="support-heading" className="type-subtitle-1">Need a hand</h2>
          <p className="mt-1 type-body-1 text-fg-secondary">Write to the TaskParty team from the account menu, or ask a workspace owner to invite the person who can help. Release notes are listed on the changelog page.</p>
          <div className="mt-3 flex gap-2">
            <Button asChild variant="secondary" size="sm">
              <Link href="/changelog">Read the changelog</Link>
            </Button>
            <Button asChild variant="subtle" size="sm">
              <Link href={`/w/${slug}/settings/account/profile`}>Account settings</Link>
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
