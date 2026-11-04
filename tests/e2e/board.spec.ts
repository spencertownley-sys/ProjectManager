import { test, expect, type Page } from "@playwright/test";

/*
  Board view journeys against the fixture preview (no Clerk or database needed).
  Mutations fail without a backend, so the assertions cover what the view itself owns:
  columns, drag and drop with pointer and keyboard, live region announcements, quick add, and keyboard focus.
*/

async function openBoard(page: Page, spec?: Record<string, unknown>) {
  const url = spec ? `/dev/preview?view=board&spec=${encodeURIComponent(JSON.stringify(spec))}` : "/dev/preview?view=board";
  await page.goto(url, { waitUntil: "networkidle" });
  await expect(page.locator('[data-task-id="t-9"]')).toBeVisible();
  // Give hydration a moment so window key handlers are attached.
  await page.waitForTimeout(500);
}

const baseSpec = {
  filters: { kind: "group", op: "and", items: [] },
  sorts: [{ field: "manual", direction: "asc" }],
  subtasks: "nested",
  showCompleted: "recent",
  visibleFields: ["assignee", "due_date", "priority", "status"],
  columnWidths: {},
  options: {},
};

test.describe("Board view", () => {
  test("renders a column per status with counts and WIP limits", async ({ page }) => {
    await openBoard(page);
    const headings = page.getByRole("heading", { level: 2 });
    await expect(headings).toHaveText([/Proposed/, /Approved/, /In progress/, /In review/, /Complete/]);
    await expect(page.getByLabel("3 of 5 allowed")).toBeVisible();
    await expect(page.getByRole("list", { name: "Proposed" }).getByRole("listitem")).toHaveCount(11);
  });

  test("drags a card to another column with the pointer", async ({ page }) => {
    await openBoard(page);
    // Proposed and Approved are the first two columns, so both are on screen at tablet width too.
    const card = page.locator('[data-task-id="t-9"]');
    const target = page.locator('[data-task-id="t-8"]');
    const a = (await card.boundingBox())!;
    const b = (await target.boundingBox())!;
    await page.mouse.move(a.x + 40, a.y + 10);
    await page.mouse.down();
    await page.mouse.move(a.x + 60, a.y + 30, { steps: 4 });
    await page.mouse.move(b.x + 60, b.y + 10, { steps: 10 });
    await expect(page.locator('[id^="DndLiveRegion"]')).toContainText("Email templates is over Approved");
    await page.mouse.up();
    await expect(page.getByRole("status").filter({ hasText: "Dropped Email templates in Approved." })).toBeVisible();
  });

  test("moves a card between columns with the keyboard and announces it", async ({ page }) => {
    await openBoard(page);
    await page.locator('[data-task-id="t-8"]').focus();
    await page.keyboard.press("Space");
    const live = page.locator('[id^="DndLiveRegion"]');
    await expect(live).toContainText("Landing page build is over");
    await page.keyboard.press("ArrowRight");
    await expect(live).toContainText("Landing page build is over In progress");
    await page.keyboard.press("Space");
    await expect(page.getByRole("status").filter({ hasText: "Dropped Landing page build in In progress." })).toBeVisible();
  });

  test("navigates cards with J, K, H, and L and opens the composer with N", async ({ page }) => {
    await openBoard(page);
    await page.keyboard.press("j");
    await expect(page.locator('[data-task-id="t-9"]')).toBeFocused();
    await page.keyboard.press("j");
    await expect(page.locator('[data-task-id="t-11"]')).toBeFocused();
    await page.keyboard.press("l");
    await expect(page.locator('[data-task-id="t-10"]')).toBeFocused();
    await page.keyboard.press("k");
    await expect(page.locator('[data-task-id="t-8"]')).toBeFocused();
    await page.keyboard.press("Escape");
    await page.keyboard.press("n");
    await expect(page.getByLabel("New task title")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByLabel("New task title")).toHaveCount(0);
  });

  test("shows swimlanes when grouped and collapses columns from the menu", async ({ page }) => {
    await openBoard(page, { ...baseSpec, groupBy: "assignee" });
    await expect(page.getByRole("region", { name: "Spring campaign board" }).getByRole("button", { name: /Collapse Amelia Chen/ })).toBeVisible();
    await page.getByRole("button", { name: "Approved column options" }).click();
    await page.getByRole("menuitem", { name: "Collapse column" }).click();
    await expect(page.getByRole("button", { name: /Expand Approved/ }).first()).toBeVisible();
  });
});
