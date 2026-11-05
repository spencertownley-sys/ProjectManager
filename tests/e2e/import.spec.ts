import { test, expect, type Page } from "@playwright/test";

/*
  CSV import dialog against the fixture preview (journey 10 in docs/15 section 3). Starting the job needs a backend,
  so the assertions stop at the preview and the error toast.
*/

const csv = ["Task name,Section,Status,Owner,Deadline,Priority,Labels,Milestone", "Write the brief,Planning,Complete,Jenny Park,12/11/2026,High,\"Email, Web\",no", "Launch day,Go live,In progress,Nobody Here,13 Nov 2026,Critical,,yes", ",Planning,,,,,,"].join("\n");

async function openImport(page: Page) {
  await page.goto("/dev/preview?view=import", { waitUntil: "networkidle" });
  await expect(page.getByRole("dialog", { name: "Import tasks from CSV" })).toBeVisible();
  await page.waitForTimeout(300);
}

test.describe("CSV import", () => {
  test("uploads a file, maps columns automatically, previews coerced values, and reports problems", async ({ page }) => {
    await openImport(page);
    const dialog = page.getByRole("dialog", { name: "Import tasks from CSV" });
    await dialog.getByLabel("Choose a CSV file").setInputFiles({ name: "tasks.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await expect(dialog.getByText("3 rows, 8 columns")).toBeVisible();
    await dialog.getByRole("button", { name: "Map columns" }).click();
    await expect(dialog.getByLabel("Import Task name as")).toHaveValue("title");
    await expect(dialog.getByLabel("Import Owner as")).toHaveValue("assignee");
    await expect(dialog.getByLabel("Import Deadline as")).toHaveValue("dueDate");
    await expect(dialog.getByLabel("Import Labels as")).toHaveValue("tags");
    await dialog.getByRole("button", { name: "Preview" }).click();
    await expect(dialog.getByText("1 ready")).toBeVisible();
    await expect(dialog.getByText("2 with problems")).toBeVisible();
    await expect(dialog.getByText("New sections: Go live")).toBeVisible();
    await expect(dialog.getByText("New tags: Email, Web")).toBeVisible();
    const preview = dialog.getByRole("table", { name: "Preview" });
    await expect(preview.getByRole("row").nth(1)).toContainText("2026-11-12");
    await expect(preview.getByRole("row").nth(1)).toContainText("Jenny Park");
    await expect(preview.getByRole("row").nth(2)).toContainText('No member named "Nobody Here"');
    await expect(preview.getByRole("row").nth(3)).toContainText("Title is empty");
    await dialog.getByRole("button", { name: "Import 1 task" }).click();
    await expect(page.locator('[role="status"]').filter({ hasText: "Could not start the import" })).toBeVisible({ timeout: 15_000 });
  });

  test("pasted text, the header switch, and remapping a column", async ({ page }) => {
    await openImport(page);
    const dialog = page.getByRole("dialog", { name: "Import tasks from CSV" });
    await dialog.getByPlaceholder(/Title,Section/).fill("Thing one;Planning\nThing two;Brand new");
    await expect(dialog.getByText("1 row, 2 columns")).toBeVisible();
    await dialog.getByLabel("First row is a header").click();
    await expect(dialog.getByText("2 rows, 2 columns")).toBeVisible();
    await dialog.getByRole("button", { name: "Map columns" }).click();
    await expect(dialog.getByRole("button", { name: "Preview" })).toBeDisabled();
    await expect(dialog.getByText("Map one column to Title to continue.")).toBeVisible();
    await dialog.getByLabel("Import Column 1 as").selectOption("title");
    await dialog.getByLabel("Import Column 2 as").selectOption("section");
    await dialog.getByRole("button", { name: "Preview" }).click();
    await expect(dialog.getByText("2 ready")).toBeVisible();
    await expect(dialog.getByText("New sections: Brand new")).toBeVisible();
  });

  test("opens from the project menu", async ({ page }) => {
    await page.goto("/dev/preview?view=list", { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: "Project actions" }).click();
    await page.getByRole("menuitem", { name: "Import from CSV" }).click();
    await expect(page.getByRole("dialog", { name: "Import tasks from CSV" })).toBeVisible();
  });
});
