import { test, expect } from "@playwright/test";

/* Help page and the keyboard shortcut sheet. */

test.describe("Help", () => {
  test("lists guides and every shortcut group", async ({ page }) => {
    await page.goto("/dev/preview?view=help", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Help and shortcuts" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Plan a project/ })).toHaveAttribute("href", "/w/taskparty/templates");
    for (const group of ["Global", "Go to", "Tasks", "Quick add", "Table", "Timeline and Gantt"]) {
      await expect(page.getByRole("region", { name: group }).first()).toBeVisible();
    }
    await expect(page.getByText("Search or jump to anything")).toBeVisible();
  });

  test("the ? key opens the sheet anywhere and typing does not", async ({ page }) => {
    await page.goto("/dev/preview?view=board", { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await expect(async () => {
      await page.keyboard.press("?");
      await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible({ timeout: 1000 });
    }).toPass();
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toHaveCount(0);
    await page.goto("/dev/preview?view=search", { waitUntil: "networkidle" });
    await page.getByRole("searchbox", { name: "Search" }).fill("what?");
    await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toHaveCount(0);
  });

  test("the help page button and the account menu open the sheet", async ({ page }) => {
    await page.goto("/dev/preview?view=help", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Open as a sheet" }).click();
    await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Keyboard shortcuts" }).click();
    await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
  });
});
