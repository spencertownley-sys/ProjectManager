import type { NotificationItem, NotificationFilter } from "@/lib/services/notifications";
import { formatDue } from "./dates";

/** Pure helpers for the Inbox (docs/10 section 5). */

export type InboxFilter = Exclude<NotificationFilter, "unread">;
export const inboxFilters: Array<{ value: InboxFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "mentions", label: "Mentions" },
  { value: "assigned", label: "Assigned" },
  { value: "due", label: "Due soon" },
  { value: "updates", label: "Updates" },
];

const fieldLabels: Record<string, string> = { status: "the status", status_id: "the status", due_date: "the due date", start_date: "the start date", dates: "the dates", assignee: "the assignee", priority: "the priority", title: "the title" };

/** One line of text for a notification row, plus an optional secondary excerpt. */
export function notificationText(n: NotificationItem, today: string): { text: string; excerpt: string | null } {
  const actor = n.actor?.displayName ?? "Someone";
  const key = n.task?.key || n.task?.title || "a task";
  const p = n.payload ?? {};
  const excerpt = typeof p.excerpt === "string" && p.excerpt.trim() ? p.excerpt.trim() : null;
  switch (n.type) {
    case "assigned":
      return { text: `${actor} assigned you ${key}`, excerpt: typeof p.taskTitle === "string" ? p.taskTitle : null };
    case "mention":
      return { text: `${actor} mentioned you in ${key}`, excerpt };
    case "comment":
      return { text: `${actor} commented on ${key}`, excerpt };
    case "due_soon": {
      const due = typeof p.dueDate === "string" ? p.dueDate : null;
      return { text: `${key} is due ${due ? formatDue(due, today).toLowerCase() : "soon"}`, excerpt: typeof p.taskTitle === "string" ? p.taskTitle : null };
    }
    case "update": {
      const field = typeof p.field === "string" ? (fieldLabels[p.field] ?? p.field.replace(/_/g, " ")) : "a field";
      return { text: `${actor} changed ${field} on ${key}`, excerpt: typeof p.taskTitle === "string" ? p.taskTitle : null };
    }
    case "status_update":
      return { text: `${actor} posted a status update on ${n.project?.name ?? "a project"}`, excerpt };
    case "dependency_unblocked":
      return { text: `${key} is unblocked`, excerpt: typeof p.taskTitle === "string" ? p.taskTitle : null };
    case "webhook_disabled":
      return { text: "A webhook was disabled after 20 failed deliveries", excerpt: typeof p.url === "string" ? p.url : null };
    default:
      return { text: `${actor} updated ${key}`, excerpt };
  }
}

/** Filters a loaded list the same way the service does, for the dev preview and optimistic filtering. */
export function filterNotifications(items: NotificationItem[], filter: InboxFilter): NotificationItem[] {
  switch (filter) {
    case "mentions":
      return items.filter((n) => n.type === "mention");
    case "assigned":
      return items.filter((n) => n.type === "assigned");
    case "due":
      return items.filter((n) => n.type === "due_soon");
    case "updates":
      return items.filter((n) => ["comment", "status_update", "dependency_unblocked", "update"].includes(n.type));
    default:
      return items;
  }
}

export type SnoozeOption = "hour" | "tomorrow" | "next_week";
export const snoozeOptions: Array<{ value: SnoozeOption; label: string }> = [
  { value: "hour", label: "1 hour" },
  { value: "tomorrow", label: "Tomorrow 9 am" },
  { value: "next_week", label: "Next week" },
];

/** When a snoozed notification comes back: in an hour, tomorrow at 9 am, or next Monday at 9 am. */
export function snoozeUntil(option: SnoozeOption, now: Date): Date {
  if (option === "hour") return new Date(now.getTime() + 60 * 60 * 1000);
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0, 0);
  if (option === "tomorrow") {
    d.setDate(d.getDate() + 1);
    return d;
  }
  const daysToMonday = ((8 - d.getDay()) % 7) || 7;
  d.setDate(d.getDate() + daysToMonday);
  return d;
}
