import { describe, it, expect } from "vitest";
import { notificationText, filterNotifications, snoozeUntil } from "./inbox";
import type { NotificationItem } from "@/lib/services/notifications";

const base = (over: Partial<NotificationItem>): NotificationItem => ({
  id: over.id ?? "n1",
  type: "assigned",
  payload: {},
  readAt: null,
  createdAt: "2026-11-04T09:00:00Z",
  actor: { id: "u1", displayName: "Dana Reyes", avatarUrl: null },
  task: { id: "t1", title: "Campaign brief", number: 142, key: "MKT-142" },
  project: { id: "p1", key: "MKT", name: "Spring campaign", color: "berry" },
  ...over,
});

describe("inbox text", () => {
  it("phrases each notification type", () => {
    expect(notificationText(base({}), "2026-11-04").text).toBe("Dana Reyes assigned you MKT-142");
    expect(notificationText(base({ type: "mention", payload: { excerpt: "Can you look?" } }), "2026-11-04")).toEqual({ text: "Dana Reyes mentioned you in MKT-142", excerpt: "Can you look?" });
    expect(notificationText(base({ type: "comment" }), "2026-11-04").text).toBe("Dana Reyes commented on MKT-142");
    expect(notificationText(base({ type: "due_soon", payload: { dueDate: "2026-11-05" } }), "2026-11-04").text).toBe("MKT-142 is due tomorrow");
    expect(notificationText(base({ type: "update", payload: { field: "due_date" } }), "2026-11-04").text).toBe("Dana Reyes changed the due date on MKT-142");
    expect(notificationText(base({ type: "status_update", actor: null, task: null }), "2026-11-04").text).toBe("Someone posted a status update on Spring campaign");
    expect(notificationText(base({ type: "dependency_unblocked", payload: { taskTitle: "Campaign brief" } }), "2026-11-04")).toEqual({ text: "MKT-142 is unblocked", excerpt: "Campaign brief" });
  });
  it("filters like the service", () => {
    const items = [base({ id: "a" }), base({ id: "b", type: "mention" }), base({ id: "c", type: "comment" }), base({ id: "d", type: "due_soon" })];
    expect(filterNotifications(items, "all")).toHaveLength(4);
    expect(filterNotifications(items, "mentions").map((n) => n.id)).toEqual(["b"]);
    expect(filterNotifications(items, "assigned").map((n) => n.id)).toEqual(["a"]);
    expect(filterNotifications(items, "due").map((n) => n.id)).toEqual(["d"]);
    expect(filterNotifications(items, "updates").map((n) => n.id)).toEqual(["c"]);
  });
  it("computes snooze times", () => {
    const now = new Date(2026, 10, 4, 15, 30); // Wednesday
    expect(snoozeUntil("hour", now).getTime()).toBe(now.getTime() + 3_600_000);
    expect(snoozeUntil("tomorrow", now)).toEqual(new Date(2026, 10, 5, 9, 0));
    expect(snoozeUntil("next_week", now)).toEqual(new Date(2026, 10, 9, 9, 0));
    expect(snoozeUntil("next_week", new Date(2026, 10, 9, 10, 0))).toEqual(new Date(2026, 10, 16, 9, 0));
  });
});
