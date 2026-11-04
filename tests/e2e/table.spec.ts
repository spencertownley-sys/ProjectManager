import { test, expect, type Page } from "@playwright/test";

/*
  Table view journeys against the fixture preview (no Clerk or database needed).
  Mutations fail without a backend, so the assertions cover what the view itself owns:
  spreadsheet navigation and editing, column resize and reorder, the header menu, group roll-ups, and the footer.
*/

async function openTable(page: Page, spec?: Record<string, unknown>) {
  const url = spec ? `/dev/preview?view=table&spec=${encodeURIComponent(JSON.stringify(spec))}` : "/dev/preview?view=table";
  await page.goto(url, { waitUntil: "networkidle" });
  await expect(page.locator('[data-cell="t-4:title"]')).toBeVisible();
  await page.waitForTimeout(500);
}

const cell = (page: Page, row: string, col: string) => page.locator(`[data-cell="${row}:${col}"]`);

const baseSpec = {
  filters: { kind: "group", op: "and", items: [] },
  sorts: [{ field: "manual", direction: "asc" }],
  subtasks: "nested",
  showCompleted: "recent",
  visibleFields: ["status", "assignee", "due_date", "priority", "estimate"],
  columnWidths: {},
  options: {},
};

test.describe("Table view", () => {
  test("shows a frozen title column, headers, and footer aggregates", async ({ page }) => {
    await openTable(page);
    await expect(page.getByRole("columnheader")).toHaveText(["", "Title", "Assignee", "Due date", "Priority", "Status"]);
    await expect(page.getByRole("button", { name: /Title aggregate/ })).toHaveText("23 tasks");
    await expect(page.getByRole("button", { name: /Status aggregate/ })).toHaveText(/% complete/);
    const title = cell(page, "t-4", "title");
    await expect(title).toHaveCSS("position", "sticky");
  });

  test("navigates cells with arrows and Tab and opens pickers with Enter", async ({ page }) => {
    await openTable(page);
    await cell(page, "t-4", "due_date").click({ position: { x: 100, y: 10 } });
    await expect(cell(page, "t-4", "due_date")).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowRight");
    await expect(cell(page, "t-4", "priority")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(cell(page, "t-5", "priority")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(cell(page, "t-5", "status")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("edits a title inline with E and commits with Enter", async ({ page }) => {
    await openTable(page);
    await cell(page, "t-6", "title").click({ position: { x: 250, y: 10 } });
    await page.keyboard.press("e");
    const input = page.getByRole("textbox", { name: "Title" });
    await expect(input).toBeVisible();
    await input.press("End");
    await page.keyboard.type(" v2");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status").filter({ hasText: "Could not save the change" })).toBeVisible();
    await expect(cell(page, "t-7", "title")).toBeFocused();
  });

  test("resizes and reorders columns from the header", async ({ page }) => {
    // Narrow widths keep every header on screen at tablet width.
    await openTable(page, { ...baseSpec, visibleFields: ["assignee", "due_date", "priority", "status"], columnWidths: { title: 160, assignee: 120, due_date: 100, priority: 100, status: 120 } });
    const header = page.getByRole("columnheader", { name: /Assignee/ });
    const before = (await header.boundingBox())!;
    const handle = page.getByRole("separator", { name: "Resize Assignee" });
    const hb = (await handle.boundingBox())!;
    await page.mouse.move(hb.x + hb.width / 2, hb.y + 10);
    await page.mouse.down();
    await page.mouse.move(hb.x + 60, hb.y + 10, { steps: 6 });
    await page.mouse.up();
    await expect.poll(async () => (await header.boundingBox())!.width).toBeGreaterThan(before.width + 40);

    const priority = page.getByRole("columnheader", { name: /Priority/ });
    const pb = (await priority.boundingBox())!;
    const ab = (await header.boundingBox())!;
    await page.mouse.move(pb.x + 30, pb.y + 18);
    await page.mouse.down();
    await page.mouse.move(pb.x + 40, pb.y + 20, { steps: 3 });
    await page.mouse.move(ab.x + 20, ab.y + 18, { steps: 10 });
    await page.mouse.up();
    await expect(page.getByRole("columnheader")).toHaveText(["", "Title", "Priority", "Assignee", "Due date", "Status"]);
  });

  test("header menu sorts, groups, and hides columns", async ({ page }) => {
    await openTable(page);
    await page.getByRole("columnheader", { name: /Due date/ }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Sort descending" }).click();
    await expect(page.getByRole("columnheader", { name: /Due date/ })).toHaveAttribute("aria-sort", "descending");
    await page.getByRole("columnheader", { name: /Priority/ }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Hide column" }).click();
    await expect(page.getByRole("columnheader")).toHaveText(["", "Title", "Assignee", "Due date", "Status"]);
  });

  test("shows group roll-ups when grouped", async ({ page }) => {
    await openTable(page, { ...baseSpec, groupBy: "section" });
    await expect(page.getByText("Planning", { exact: true })).toBeVisible();
    await expect(page.getByText(/Sum \d+, avg/).first()).toBeVisible();
    await expect(page.getByText(/% done/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Estimate aggregate/ })).toHaveText(/Sum/);
  });
});
