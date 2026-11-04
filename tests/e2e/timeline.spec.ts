import { test, expect, type Page } from "@playwright/test";

/*
  Timeline journeys against the fixture preview (no Clerk or database needed).
  Mutations fail without a backend, so the assertions cover what the view owns: labelled bars without a grid,
  group rows in the chart, the dependencies toggle, the unscheduled tray, and drag to schedule.
*/

async function openTimeline(page: Page, options?: Record<string, unknown>) {
  const spec = { filters: { kind: "group", op: "and", items: [] }, sorts: [{ field: "manual", direction: "asc" }], subtasks: "nested", showCompleted: "recent", visibleFields: ["assignee", "due_date", "priority", "status"], columnWidths: {}, options: { timelineZoom: "week", ...options } };
  await page.goto(`/dev/preview?view=timeline&spec=${encodeURIComponent(JSON.stringify(spec))}`, { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: /^Channel plan,/ })).toBeVisible();
  await page.waitForTimeout(500);
}

test.describe("Timeline view", () => {
  test("renders labelled bars, chart side group rows, and the unscheduled tray", async ({ page }) => {
    await openTimeline(page);
    await expect(page.getByRole("columnheader")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Collapse Planning/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Channel plan,/ })).toHaveAttribute("aria-label", /28 Oct to 6 Nov/);
    await expect(page.getByRole("region", { name: "Unscheduled tasks" })).toContainText("Vendor contract renewal");
    await expect(page.getByRole("button", { name: /Dependency FS/ })).toHaveCount(0);
  });

  test("toggles dependencies and the critical path", async ({ page }) => {
    await openTimeline(page);
    await page.getByRole("button", { name: "Dependencies" }).click();
    await expect(page.getByRole("button", { name: /Dependency FS from MKT-1 to MKT-2/ })).toBeAttached();
    await page.getByRole("button", { name: "Critical path" }).click();
    await expect(page.getByRole("button", { name: "Critical path" })).toHaveAttribute("aria-pressed", "true");
  });

  test("collapses a group from the chart and the tray from its header", async ({ page }) => {
    await openTimeline(page);
    await page.getByRole("button", { name: /Collapse Planning/ }).click();
    await expect(page.getByRole("button", { name: /^Channel plan,/ })).toHaveCount(0);
    await page.getByRole("button", { name: /^Unscheduled/ }).click();
    await expect(page.getByRole("button", { name: /Vendor contract renewal, unscheduled/ })).toHaveCount(0);
  });

  test("schedules a task by dragging it from the tray onto the chart", async ({ page }) => {
    await openTimeline(page);
    const chip = page.getByRole("button", { name: /Vendor contract renewal, unscheduled/ });
    const chart = page.getByRole("application", { name: "Timeline" });
    await chip.dragTo(chart, { targetPosition: { x: 300, y: 120 } });
    await expect(page.getByRole("status").filter({ hasText: /Vendor contract renewal scheduled for/ })).toBeVisible();
  });
});
