import { test, expect, type Page } from "@playwright/test";

/*
  Cycles journeys against the fixture preview (no Clerk or database needed).
  Charts compute from fixture events client side; planning mutations fail without a backend and show a toast.
*/

async function openCycles(page: Page) {
  await page.goto("/dev/preview?view=cycles", { waitUntil: "networkidle" });
  await expect(summaryHeading(page, "Cycle 2")).toBeVisible();
  await page.waitForTimeout(500);
}

/** The selected cycle's heading in the summary strip (the planner column repeats the name as its own heading). */
const summaryHeading = (page: Page, name: string) => page.getByRole("region", { name: `${name} summary` }).getByRole("heading", { name });

const plannerRow = (page: Page, key: string) => page.locator(`[data-task-id="${key}"]`);

test.describe("Cycles", () => {
  test("shows the active cycle summary with capacity and days remaining", async ({ page }) => {
    await openCycles(page);
    await expect(page.getByRole("region", { name: "Cycle 2 summary" }).getByText("Active", { exact: true })).toBeVisible();
    await expect(page.getByText("2 Nov to 13 Nov")).toBeVisible();
    await expect(page.getByText("9 days remaining")).toBeVisible();
    await expect(page.getByText("48 of 40 pts committed")).toBeVisible();
    await expect(page.getByText("Creative and landing page in review")).toBeVisible();
  });

  test("backlog tab lists unplanned tasks beside the cycle and plans the selection", async ({ page }) => {
    await openCycles(page);
    const backlog = page.getByRole("region", { name: "Backlog" });
    const cycle = page.getByRole("region", { name: "Cycle 2", exact: true });
    await expect(backlog.getByRole("listitem")).toHaveCount(9);
    await expect(cycle.getByRole("listitem")).toHaveCount(7);
    await expect(backlog.getByText("9 tasks, 43 pts")).toBeVisible();
    await page.getByLabel("Select MKT-13").click();
    await page.getByLabel("Select MKT-14").click();
    await page.getByRole("button", { name: "Add 2 to Cycle 2" }).click();
    await expect(page.locator('[role="status"]').filter({ hasText: "Could not move the tasks" })).toBeVisible({ timeout: 15_000 });
  });

  test("drags a backlog task into the cycle column", async ({ page }) => {
    await openCycles(page);
    const source = plannerRow(page, "t-15");
    const target = page.getByRole("region", { name: "Cycle 2", exact: true }).getByRole("list");
    const from = (await source.boundingBox())!;
    const to = (await target.boundingBox())!;
    await page.mouse.move(from.x + 200, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + 220, from.y + from.height / 2, { steps: 4 });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height - 40, { steps: 12 });
    await page.mouse.up();
    await expect(page.locator('[role="status"]').filter({ hasText: "Could not save the change" })).toBeVisible({ timeout: 15_000 });
  });

  test("active tab shows the board filtered to the cycle", async ({ page }) => {
    await openCycles(page);
    await page.getByRole("tab", { name: "Active" }).click();
    await expect(page.getByText("Creative concepts")).toBeVisible();
    await expect(page.getByText("QA landing page")).toHaveCount(0);
  });

  test("burndown tab draws the chart and offers a table", async ({ page }) => {
    await openCycles(page);
    await page.getByRole("tab", { name: "Burndown" }).click();
    await expect(page.getByRole("img", { name: /Burndown:/ })).toBeVisible();
    await expect(page.getByText("Scope", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Show as table" }).click();
    await expect(page.getByRole("columnheader", { name: "Ideal" })).toBeVisible();
    // Header row plus one row per day of the 12 day cycle.
    await expect(page.getByRole("row")).toHaveCount(13);
  });

  test("history tab lists past cycles with velocity and opens one", async ({ page }) => {
    await openCycles(page);
    await page.getByRole("tab", { name: "History" }).click();
    await expect(page.getByRole("img", { name: /Velocity:/ })).toBeVisible();
    await expect(page.getByText("Average 12 pts per cycle")).toBeVisible();
    await page.getByRole("cell", { name: "Cycle 1" }).click();
    await expect(summaryHeading(page, "Cycle 1")).toBeVisible();
    await expect(page.getByText("Closed", { exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Burndown" })).toHaveAttribute("data-state", "active");
  });

  test("close cycle dialog offers the next cycle or the backlog", async ({ page }) => {
    await openCycles(page);
    await page.getByRole("button", { name: "Close cycle" }).click();
    const dialog = page.getByRole("dialog", { name: "Close Cycle 2" });
    await expect(dialog.getByText("7 tasks are not done")).toBeVisible();
    await expect(dialog.getByRole("radio", { name: /Move to Cycle 3/ })).toBeChecked();
    await dialog.getByRole("radio", { name: /Back to the backlog/ }).check();
    await dialog.getByRole("button", { name: "Close cycle" }).click();
    await expect(page.locator('[role="status"]').filter({ hasText: "Could not close the cycle" })).toBeVisible({ timeout: 15_000 });
  });

  test("new cycle dialog validates the dates before submitting", async ({ page }) => {
    await openCycles(page);
    await page.getByRole("button", { name: "New cycle" }).click();
    const dialog = page.getByRole("dialog", { name: "New cycle" });
    const submit = dialog.getByRole("button", { name: "Create cycle" });
    await expect(submit).toBeDisabled();
    await dialog.getByLabel("Name").fill("Cycle 4");
    await dialog.getByLabel("Start").fill("2026-12-01");
    await dialog.getByLabel("End").fill("2026-11-20");
    await expect(dialog.getByText("Must be after the start date")).toBeVisible();
    await expect(submit).toBeDisabled();
    await dialog.getByLabel("End").fill("2026-12-12");
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(page.locator('[role="status"]').filter({ hasText: "Could not create the cycle" })).toBeVisible({ timeout: 15_000 });
  });

  test("switches the cycle from the header menu", async ({ page }) => {
    await openCycles(page);
    await page.getByRole("button", { name: "Choose cycle" }).click();
    await page.getByRole("menuitemradio", { name: /Cycle 3/ }).click();
    await expect(summaryHeading(page, "Cycle 3")).toBeVisible();
    await expect(page.getByText("Upcoming", { exact: true })).toBeVisible();
    await expect(page.getByText("No goal yet")).toBeVisible();
  });
});
