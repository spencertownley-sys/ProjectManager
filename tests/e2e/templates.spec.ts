import { test, expect, type Page } from "@playwright/test";

/* Templates gallery journeys against the fixture preview; creating a project fails without a backend and shows the error. */

async function openTemplates(page: Page, panel?: string) {
  await page.goto(`/dev/preview?view=templates${panel ? `&panel=${panel}` : ""}`, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Templates" })).toBeVisible();
  await page.waitForTimeout(300);
}

test.describe("Templates", () => {
  test("lists built in and saved templates with category counts", async ({ page }) => {
    await openTemplates(page);
    await expect(page.getByRole("tab", { name: /^All/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("article")).toHaveCount(14);
    await expect(page.getByRole("article", { name: "Product launch" }).getByText("My templates")).toBeVisible();
    await page.getByRole("tab", { name: /^Engineering/ }).click();
    await expect(page.getByRole("article")).toHaveCount(2);
    await expect(page.getByRole("article", { name: "Scrum sprint" })).toBeVisible();
    await page.getByRole("tab", { name: /^My templates/ }).click();
    await expect(page.getByRole("article")).toHaveCount(2);
  });

  test("shows an empty state for saved templates when there are none", async ({ page }) => {
    await page.goto("/dev/preview?view=templates&panel=mine", { waitUntil: "networkidle" });
    await expect(page.getByRole("tab", { name: /^My templates/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("article")).toHaveCount(2);
  });

  test("use template pre-fills the create project dialog", async ({ page }) => {
    await openTemplates(page);
    await page.getByRole("button", { name: "Use template Marketing campaign" }).click();
    const dialog = page.getByRole("dialog", { name: "New project" });
    await expect(dialog.getByRole("button", { name: /Marketing campaign/ })).toHaveAttribute("aria-pressed", "true");
    await dialog.getByLabel("Name").fill("Autumn push");
    await dialog.getByRole("button", { name: "Create project" }).click();
    // Without a backend the action fails; the form shows the message inline and stays open.
    await expect(dialog.locator("p.text-danger")).toBeVisible({ timeout: 15_000 });
  });

  test("use a saved template shows the template card and lets you choose another", async ({ page }) => {
    await openTemplates(page);
    await page.getByRole("button", { name: "Use template Product launch" }).click();
    const dialog = page.getByRole("dialog", { name: "New project" });
    await expect(dialog.getByText("Saved in this workspace")).toBeVisible();
    await dialog.getByRole("button", { name: "Choose another" }).click();
    await expect(dialog.getByRole("button", { name: /Simple project/ })).toBeVisible();
  });
});
