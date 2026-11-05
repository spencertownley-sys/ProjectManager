import { test, expect, type Page } from "@playwright/test";

/*
  Calendar journeys against the fixture preview (no Clerk or database needed, fixture today is 4 Nov 2026).
  Mutations fail without a backend, so the assertions cover what the view owns: the month grid with multi day
  chips and overflow, quick add on a cell, drag to another day, the Me chip, and the week, day, and schedule modes.
*/

async function openCalendar(page: Page, options?: Record<string, unknown>) {
  const spec = { filters: { kind: "group", op: "and", items: [] }, sorts: [{ field: "manual", direction: "asc" }], subtasks: "nested", showCompleted: "recent", visibleFields: ["assignee", "due_date", "priority", "status"], columnWidths: {}, options: { ...options } };
  await page.goto(`/dev/preview?view=calendar&spec=${encodeURIComponent(JSON.stringify(spec))}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
}

test.describe("Calendar view", () => {
  test("shows the month with multi day chips, weekday headers, and today", async ({ page }) => {
    await openCalendar(page);
    await expect(page.getByText("November 2026")).toBeVisible();
    await expect(page.getByRole("columnheader")).toHaveText(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    const chips = page.getByRole("button", { name: /^Channel plan,/ });
    await expect(chips).toHaveCount(2);
    await expect(chips.first()).toHaveAttribute("aria-label", /28 Oct to 6 Nov/);
    await expect(page.getByRole("gridcell", { name: "Wednesday 4 November" }).getByText("4", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Launch day,/ })).toHaveAttribute("aria-label", /25 Nov/);
  });

  test("quick adds on an empty cell and moves a chip to another day", async ({ page }) => {
    await openCalendar(page);
    // 5 December is an empty cell in the fixture month grid.
    await page.getByRole("gridcell", { name: "Saturday 5 December" }).hover({ position: { x: 20, y: 60 } });
    await page.getByRole("button", { name: "Add task due 5 December" }).click();
    const input = page.getByLabel("New task title");
    await expect(input).toBeVisible();
    await input.fill("Review copy");
    await input.press("Enter");
    await expect(page.getByRole("status").filter({ hasText: "Could not create the task" })).toBeVisible();
    const chip = page.getByRole("button", { name: /^Photography shoot,/ });
    const box = (await chip.boundingBox())!;
    const target = (await page.getByRole("gridcell", { name: "Tuesday 10 November" }).boundingBox())!;
    await page.mouse.move(box.x + 20, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 30, box.y + 10, { steps: 3 });
    await page.mouse.move(target.x + target.width / 2, target.y + 40, { steps: 10 });
    await page.mouse.up();
    await expect(page.getByRole("status").filter({ hasText: "Could not save the change" })).toBeVisible();
  });

  test("Me chip filters by assignee and the navigation moves months", async ({ page }) => {
    await openCalendar(page);
    // The first click can land before hydration under load; retry until the filter count reacts.
    await expect(async () => {
      await page.getByRole("button", { name: "Only my tasks" }).click();
      await expect(page.getByRole("button", { name: /^Filter \(1\)/ })).toBeVisible({ timeout: 1500 });
    }).toPass();
    await page.getByRole("button", { name: "Only my tasks" }).click();
    await expect(page.getByRole("button", { name: /^Filter \(1\)/ })).toHaveCount(0);
    // Spec changes round trip through the URL; let that settle so the month change is not reverted by a re-render.
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Next month" }).click();
    await expect(page.getByText("December 2026")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Today", exact: true }).click();
    await expect(page.getByText("November 2026")).toBeVisible();
  });

  test("switches to week, day, and schedule modes", async ({ page }) => {
    await openCalendar(page);
    await page.getByRole("radio", { name: "Week" }).click();
    await expect(page.getByText("2 to 8 November 2026")).toBeVisible();
    await expect(page.getByRole("application", { name: "Timeline" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Channel plan,/ })).toBeVisible();
    await page.getByRole("radio", { name: "Day" }).click();
    await expect(page.getByText("Wednesday 4 November 2026")).toBeVisible();
    await page.getByRole("radio", { name: "Schedule" }).click();
    await expect(page.getByRole("list", { name: "Schedule" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Friday 6 November/ })).toBeVisible();
  });
});
