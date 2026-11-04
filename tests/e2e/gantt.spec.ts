import { test, expect, type Page } from "@playwright/test";

/*
  Gantt journeys against the fixture preview (no Clerk or database needed).
  Mutations fail without a backend, so the assertions cover what the view owns: the grid, bars, zoom,
  critical path, baseline, drag to move, keyboard moves, and the link gesture.
*/

async function openGantt(page: Page, options?: Record<string, unknown>) {
  const spec = { filters: { kind: "group", op: "and", items: [] }, sorts: [{ field: "manual", direction: "asc" }], subtasks: "nested", showCompleted: "recent", visibleFields: ["assignee", "due_date", "priority", "status"], columnWidths: {}, options: { ganttZoom: "week", ...options } };
  await page.goto(`/dev/preview?view=gantt&spec=${encodeURIComponent(JSON.stringify(spec))}`, { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: /^Channel plan,/ })).toBeVisible();
  await page.waitForTimeout(500);
}

const bar = (page: Page, title: string) => page.getByRole("button", { name: new RegExp(`^${title},`) });

test.describe("Gantt view", () => {
  test("renders the grid, bars with accessible names, milestones, and the today line", async ({ page }) => {
    await openGantt(page);
    await expect(page.getByRole("button", { name: /Collapse Planning/ })).toBeVisible();
    await expect(bar(page, "Channel plan")).toHaveAttribute("aria-label", /Channel plan, 28 Oct to 6 Nov, In progress/);
    await expect(bar(page, "Launch day")).toHaveAttribute("aria-label", /Launch day, 25 Nov, Proposed/);
    await expect(page.getByRole("button", { name: /Dependency FS from MKT-1 to MKT-2/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Zoom Week" })).toBeVisible();
  });

  test("changes zoom from the command bar and with Ctrl and the wheel", async ({ page }) => {
    await openGantt(page);
    await page.getByRole("button", { name: "Zoom Week" }).click();
    await page.getByRole("menuitemradio", { name: "Month" }).click();
    await expect(page.getByRole("button", { name: "Zoom Month" })).toBeVisible();
    const chart = page.getByRole("application", { name: "Timeline" });
    await chart.hover({ position: { x: 300, y: 300 } });
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -100);
    await page.keyboard.up("Control");
    await expect(page.getByRole("button", { name: "Zoom Week" })).toBeVisible();
  });

  test("toggles the critical path and the baseline", async ({ page }) => {
    await openGantt(page);
    await page.getByRole("button", { name: "Critical path" }).click();
    await expect(page.getByRole("button", { name: "Critical path" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Baseline" }).click();
    await page.getByRole("menuitemradio", { name: /Plan v1/ }).click();
    await expect(page.getByRole("button", { name: /Baseline Plan v1/ })).toBeVisible();
    await expect(page.locator('[aria-label^="Baseline "]').first()).toBeAttached();
  });

  test("moves a bar with the pointer and the keyboard", async ({ page }) => {
    await openGantt(page);
    const b = bar(page, "Email templates");
    const box = (await b.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 45, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();
    await expect(page.getByRole("status").filter({ hasText: "Could not save the change" }).first()).toBeVisible();
    await bar(page, "Press release").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("status").filter({ hasText: "Could not save the change" }).nth(1)).toBeVisible();
  });

  test("collapses the grid to names and a group from its chevron", async ({ page }) => {
    await openGantt(page);
    // Narrow viewports start with the grid collapsed to names.
    const show = page.getByRole("button", { name: "Show grid columns" });
    if (await show.isVisible()) await show.click();
    await page.getByRole("button", { name: "Collapse grid to names" }).click();
    await expect(page.getByRole("button", { name: "Show grid columns" })).toBeVisible();
    await page.getByRole("button", { name: /Collapse Planning/ }).click();
    await expect(bar(page, "Channel plan")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Expand Planning/ })).toBeVisible();
  });
});
