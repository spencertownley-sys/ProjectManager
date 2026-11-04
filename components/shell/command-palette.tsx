"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Dialog as RadixDialog } from "radix-ui";
import { Search20Regular, Folder20Regular, Home20Regular, TaskListSquareLtr20Regular, Mail20Regular, Add20Regular, Settings20Regular } from "@fluentui/react-icons";
import { useWorkspace } from "@/lib/client/workspace-context";
import { useViewState } from "@/lib/client/view-state";
import type { RailProject } from "./navigation-rail";
import { KeyCap } from "@/components/ui/badge";

export function CommandPalette({ open, onOpenChange, projects }: { open: boolean; onOpenChange: (open: boolean) => void; projects: RailProject[] }) {
  const router = useRouter();
  const { slug } = useWorkspace();
  const openTask = useViewState((s) => s.openTask);
  const [query, setQuery] = React.useState("");

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  const itemClass = "flex h-9 cursor-default select-none items-center gap-2 rounded-sm px-2 type-body-1 text-fg data-[selected=true]:bg-hover";

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-fg/30" />
        <RadixDialog.Content className="fixed left-1/2 top-[15vh] z-50 w-[calc(100%-32px)] max-w-[640px] -translate-x-1/2 overflow-hidden rounded-md border border-border bg-surface-raised shadow-dialog outline-none">
          <RadixDialog.Title className="sr-only">Command palette</RadixDialog.Title>
          <RadixDialog.Description className="sr-only">Search or jump to a project, task, or action</RadixDialog.Description>
          <Command label="Command palette" loop>
            <div className="flex h-12 items-center gap-2 border-b border-border px-3">
              <Search20Regular className="text-fg-tertiary" />
              <Command.Input value={query} onValueChange={setQuery} placeholder="Search projects, tasks, people, or type a command" className="h-full flex-1 bg-transparent type-body-1 text-fg outline-none placeholder:text-fg-tertiary" />
              <KeyCap>Esc</KeyCap>
            </div>
            <Command.List className="max-h-[50vh] overflow-y-auto p-1">
              <Command.Empty className="px-2 py-6 text-center type-body-1 text-fg-secondary">No matches. Press Enter to search everything.</Command.Empty>
              <Command.Group heading="Actions" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:type-caption-1-strong [&_[cmdk-group-heading]]:text-fg-tertiary">
                <Command.Item className={itemClass} onSelect={() => { onOpenChange(false); openTask("new"); }} value="new task create">
                  <Add20Regular className="text-fg-secondary" /> New task <span className="ml-auto type-caption-1 text-fg-tertiary">N</span>
                </Command.Item>
                <Command.Item className={itemClass} onSelect={() => go(`/w/${slug}/templates`)} value="new project template">
                  <Add20Regular className="text-fg-secondary" /> New project from template
                </Command.Item>
                {query.trim() ? (
                  <Command.Item className={itemClass} onSelect={() => go(`/w/${slug}/search?q=${encodeURIComponent(query.trim())}`)} value={`search ${query}`}>
                    <Search20Regular className="text-fg-secondary" /> Search for &quot;{query.trim()}&quot;
                  </Command.Item>
                ) : null}
              </Command.Group>
              <Command.Group heading="Go to" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:type-caption-1-strong [&_[cmdk-group-heading]]:text-fg-tertiary">
                <Command.Item className={itemClass} onSelect={() => go(`/w/${slug}/home`)} value="home"><Home20Regular className="text-fg-secondary" /> Home</Command.Item>
                <Command.Item className={itemClass} onSelect={() => go(`/w/${slug}/my-work`)} value="my work"><TaskListSquareLtr20Regular className="text-fg-secondary" /> My work</Command.Item>
                <Command.Item className={itemClass} onSelect={() => go(`/w/${slug}/inbox`)} value="inbox"><Mail20Regular className="text-fg-secondary" /> Inbox</Command.Item>
                <Command.Item className={itemClass} onSelect={() => go(`/w/${slug}/settings`)} value="settings"><Settings20Regular className="text-fg-secondary" /> Settings</Command.Item>
              </Command.Group>
              <Command.Group heading="Projects" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:type-caption-1-strong [&_[cmdk-group-heading]]:text-fg-tertiary">
                {projects.map((p) => (
                  <Command.Item key={p.id} className={itemClass} onSelect={() => go(`/w/${slug}/projects/${p.key}`)} value={`${p.name} ${p.key}`}>
                    <Folder20Regular className="text-fg-secondary" />
                    <span className="truncate">{p.name}</span>
                    <span className="ml-auto font-mono type-caption-1 text-fg-tertiary">{p.key}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>
          </Command>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
