"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { MoreHorizontal20Regular, Archive16Regular, Clock16Regular, Mail16Regular, Dismiss20Regular } from "@fluentui/react-icons";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuTrigger, MenuSeparator } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { TaskPane } from "@/components/task/task-pane";
import type { NotificationItem } from "@/lib/services/notifications";
import { listNotificationsAction, markNotificationsAction } from "@/lib/actions/notifications";
import { inboxFilters, notificationText, filterNotifications, snoozeOptions, snoozeUntil, type InboxFilter, type SnoozeOption } from "@/lib/client/inbox";
import { useWorkspace } from "@/lib/client/workspace-context";
import { formatRelativeTime } from "@/lib/client/dates";
import { cn } from "@/lib/utils";

const key = (slug: string, filter: InboxFilter) => ["notifications", slug, filter] as const;

/** Inbox (docs/10 section 5): notification list on the left, the referenced task on the right. */
export function InboxView({ initialItems, staticItems }: { initialItems: NotificationItem[]; staticItems?: NotificationItem[] }) {
  const { slug, today } = useWorkspace();
  const client = useQueryClient();
  const router = useRouter();
  const { toast } = useToast();
  const [filter, setFilter] = React.useState<InboxFilter>("all");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [focusedId, setFocusedId] = React.useState<string | null>(null);
  const listRef = React.useRef<HTMLUListElement>(null);

  const query = useQuery({
    queryKey: key(slug, filter),
    queryFn: async () => {
      if (staticItems) return filterNotifications(staticItems, filter);
      const res = await listNotificationsAction(slug, filter);
      if (!res.ok) throw new Error(res.error.message);
      return res.data;
    },
    initialData: filter === "all" ? initialItems : staticItems ? filterNotifications(staticItems, filter) : undefined,
    staleTime: 15_000,
  });
  const items = React.useMemo(() => query.data ?? [], [query.data]);
  const selected = items.find((n) => n.id === selectedId) ?? null;

  const patchAll = React.useCallback(
    (fn: (list: NotificationItem[]) => NotificationItem[]) => client.setQueriesData<NotificationItem[]>({ queryKey: ["notifications", slug] }, (old) => (old ? fn(old) : old)),
    [client, slug],
  );
  const mark = useMutation({
    mutationFn: async (input: { ids?: string[]; all?: boolean; onlyRead?: boolean; action: "read" | "unread" | "archive" | "snooze"; snoozeUntil?: string }) => {
      const res = await markNotificationsAction(slug, input);
      if (!res.ok) throw new Error(res.error.message);
      return res.data;
    },
    onMutate: async (input) => {
      await client.cancelQueries({ queryKey: ["notifications", slug] });
      const snapshot = client.getQueriesData<NotificationItem[]>({ queryKey: ["notifications", slug] });
      const hits = (n: NotificationItem) => (input.all ? !input.onlyRead || n.readAt !== null : (input.ids ?? []).includes(n.id));
      if (input.action === "read") patchAll((list) => list.map((n) => (hits(n) ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n)));
      else if (input.action === "unread") patchAll((list) => list.map((n) => (hits(n) ? { ...n, readAt: null } : n)));
      else patchAll((list) => list.filter((n) => !hits(n)));
      return { snapshot };
    },
    onError: (error, _input, context) => {
      context?.snapshot.forEach(([k, data]) => client.setQueryData(k, data));
      toast({ title: "Could not update the inbox", description: error.message, kind: "danger" });
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: ["notifications", slug] });
      router.refresh();
    },
  });

  const open = React.useCallback(
    (n: NotificationItem) => {
      setSelectedId(n.id);
      setFocusedId(n.id);
      if (!n.readAt) mark.mutate({ ids: [n.id], action: "read" });
    },
    [mark],
  );
  const archive = React.useCallback(
    (n: NotificationItem) => {
      mark.mutate({ ids: [n.id], action: "archive" });
      if (selectedId === n.id) setSelectedId(null);
    },
    [mark, selectedId],
  );
  const snooze = React.useCallback(
    (n: NotificationItem, option: SnoozeOption) => {
      const until = snoozeUntil(option, new Date());
      mark.mutate({ ids: [n.id], action: "snooze", snoozeUntil: until.toISOString() });
      if (selectedId === n.id) setSelectedId(null);
      toast({ title: `Snoozed until ${option === "hour" ? "later today" : option === "tomorrow" ? "tomorrow at 9 am" : "next Monday at 9 am"}`, kind: "info" });
    },
    [mark, selectedId, toast],
  );

  // J and K move, E archives, S snoozes until tomorrow, Enter opens (docs/10 section 5).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable || target.closest("[role=menu],[role=dialog]"))) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const idx = items.findIndex((n) => n.id === focusedId);
      const current = idx >= 0 ? items[idx] : null;
      const focusRow = (n: NotificationItem | undefined) => {
        if (!n) return;
        setFocusedId(n.id);
        listRef.current?.querySelector<HTMLElement>(`[data-notification-id="${n.id}"]`)?.focus();
      };
      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          focusRow(items[idx < 0 ? 0 : Math.min(items.length - 1, idx + 1)]);
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          focusRow(items[idx < 0 ? 0 : Math.max(0, idx - 1)]);
          break;
        case "Enter":
          if (current && target?.dataset.notificationId === current.id) {
            e.preventDefault();
            open(current);
          }
          break;
        case "e":
          if (current) {
            e.preventDefault();
            archive(current);
            focusRow(items[idx + 1] ?? items[idx - 1]);
          }
          break;
        case "s":
          if (current) {
            e.preventDefault();
            snooze(current, "tomorrow");
            focusRow(items[idx + 1] ?? items[idx - 1]);
          }
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, focusedId, open, archive, snooze]);

  const unread = items.filter((n) => !n.readAt).length;

  return (
    <div className="flex h-full min-h-0">
      <section className="flex w-full shrink-0 flex-col border-r border-border bg-surface md:w-[400px]" aria-label="Notifications">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
          <h1 className="type-subtitle-1">Inbox</h1>
          {unread > 0 ? <span className="type-caption-1 text-fg-tertiary">{unread} unread</span> : null}
          <div className="flex-1" />
          <Menu>
            <MenuTrigger asChild>
              <Button variant="subtle" size="icon" aria-label="Inbox actions">
                <MoreHorizontal20Regular />
              </Button>
            </MenuTrigger>
            <MenuContent align="end">
              <MenuItem onSelect={() => mark.mutate({ all: true, action: "read" })}>Mark all read</MenuItem>
              <MenuItem onSelect={() => mark.mutate({ all: true, onlyRead: true, action: "archive" })}>Archive all read</MenuItem>
            </MenuContent>
          </Menu>
        </div>
        <div className="flex h-10 shrink-0 items-center gap-0.5 border-b border-border px-2" role="tablist" aria-label="Filter notifications">
          {inboxFilters.map((f) => (
            <button key={f.value} type="button" role="tab" aria-selected={filter === f.value} onClick={() => setFilter(f.value)} className={cn("h-7 rounded-sm px-2.5 type-caption-1-strong text-fg-secondary hover:bg-hover hover:text-fg", filter === f.value && "bg-selected text-brand")}>
              {f.label}
            </button>
          ))}
        </div>
        {items.length === 0 ? (
          <div className="flex flex-col items-start gap-3 p-6">
            <svg width="48" height="40" viewBox="0 0 48 40" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-fg-tertiary" aria-hidden>
              <path d="M6 22 L10 8 H38 L42 22 V34 H6 Z" strokeLinejoin="round" />
              <path d="M6 22 H17 L20 27 H28 L31 22 H42" strokeLinejoin="round" />
              <path d="M18 15 H30 M21 11 H27" strokeLinecap="round" />
            </svg>
            <p className="type-body-1-strong">You are all caught up.</p>
            <p className="type-body-1 text-fg-secondary">{filter === "all" ? "New assignments, mentions, and updates show up here." : "Nothing matches this filter."}</p>
          </div>
        ) : (
          <ul ref={listRef} role="list" className="min-h-0 flex-1 overflow-y-auto">
            {items.map((n) => {
              const { text, excerpt } = notificationText(n, today);
              const active = selectedId === n.id;
              return (
                <li key={n.id} className="group relative border-b border-border">
                  <div
                    role="button"
                    tabIndex={0}
                    data-notification-id={n.id}
                    aria-current={active ? "true" : undefined}
                    onClick={() => open(n)}
                    onFocus={() => setFocusedId(n.id)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); open(n); } }}
                    className={cn("flex w-full cursor-pointer gap-3 px-4 py-3 text-left outline-none hover:bg-hover focus-visible:bg-hover", active && "bg-selected hover:bg-selected")}
                  >
                    <span className="relative shrink-0 pt-0.5">
                      {n.actor ? <Avatar name={n.actor.displayName} src={n.actor.avatarUrl} size="sm" /> : <span data-color={n.project?.color} className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-item-tint"><span className="h-2.5 w-2.5 rounded-full bg-item" /></span>}
                      {!n.readAt ? <span className="absolute -top-0.5 -left-0.5 h-2 w-2 rounded-full bg-brand ring-2 ring-surface" aria-label="Unread" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate type-body-1", !n.readAt && "font-semibold")}>{text}</span>
                      {excerpt ? <span className="block truncate type-caption-1 text-fg-secondary">{excerpt}</span> : null}
                      <span className="mt-1 flex items-center gap-2">
                        {n.project ? <Badge color={n.project.color}>{n.project.name}</Badge> : null}
                        <span className="type-caption-1 text-fg-tertiary">{formatRelativeTime(n.createdAt)}</span>
                      </span>
                    </span>
                  </div>
                  <div className="absolute top-2 right-2 flex items-center gap-0.5 rounded-sm border border-border bg-surface-raised p-0.5 opacity-0 shadow-menu group-hover:opacity-100 group-focus-within:opacity-100">
                    <Tooltip content="Archive" shortcut="E">
                      <Button variant="subtle" size="icon-sm" aria-label={`Archive: ${text}`} onClick={(e) => { e.stopPropagation(); archive(n); }}>
                        <Archive16Regular />
                      </Button>
                    </Tooltip>
                    <Menu>
                      <MenuTrigger asChild>
                        <Button variant="subtle" size="icon-sm" aria-label={`Snooze: ${text}`} onClick={(e) => e.stopPropagation()}>
                          <Clock16Regular />
                        </Button>
                      </MenuTrigger>
                      <MenuContent align="end">
                        {snoozeOptions.map((o) => (
                          <MenuItem key={o.value} onSelect={() => snooze(n, o.value)}>
                            {o.label}
                          </MenuItem>
                        ))}
                      </MenuContent>
                    </Menu>
                    <Tooltip content={n.readAt ? "Mark unread" : "Mark read"}>
                      <Button variant="subtle" size="icon-sm" aria-label={`${n.readAt ? "Mark unread" : "Mark read"}: ${text}`} onClick={(e) => { e.stopPropagation(); mark.mutate({ ids: [n.id], action: n.readAt ? "unread" : "read" }); }}>
                        <Mail16Regular />
                      </Button>
                    </Tooltip>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <div className="hidden min-w-0 flex-1 bg-canvas md:block">
        {selected?.task ? (
          <div className="h-full bg-surface-raised">
            <TaskPane taskId={selected.task.id} onClose={() => setSelectedId(null)} />
          </div>
        ) : selected ? (
          <div className="flex h-full flex-col items-start gap-2 p-6">
            <p className="type-body-1-strong">{notificationText(selected, today).text}</p>
            {selected.project ? <p className="type-body-1 text-fg-secondary">Project {selected.project.name}</p> : null}
            <Button variant="subtle" size="sm" onClick={() => setSelectedId(null)}><Dismiss20Regular className="h-4 w-4" /> Close</Button>
          </div>
        ) : (
          <div className="flex h-full items-start p-6">
            <p className="type-body-1 text-fg-secondary">Select a notification to see the task.</p>
          </div>
        )}
      </div>
      <MenuSeparator className="hidden" />
    </div>
  );
}
