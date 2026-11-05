import { test, expect } from "@playwright/test";

/* API keys settings panel against the fixture preview; creating a key needs a backend and shows the error toast. */

test.describe("API keys", () => {
  test("lists active keys with prefixes and scopes and notes revoked ones", async ({ page }) => {
    await page.goto("/dev/preview?view=settings&panel=api-keys", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "API keys" })).toBeVisible();
    const table = page.getByRole("table", { name: "API keys" });
    await expect(table.getByRole("row")).toHaveCount(3);
    await expect(table.getByText("tp_live_a1b2...")).toBeVisible();
    await expect(table.getByRole("row").nth(1).getByText("write")).toBeVisible();
    await expect(table.getByText("Never")).toBeVisible();
    await expect(page.getByText("1 revoked key: Old Zapier (tp_live_e5f6)")).toBeVisible();
  });

  test("create key dialog needs a name and at least one scope", async ({ page }) => {
    await page.goto("/dev/preview?view=settings&panel=api-keys", { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Create key" }).click();
    const dialog = page.getByRole("dialog", { name: "Create API key" });
    const submit = dialog.getByRole("button", { name: "Create key" });
    await expect(submit).toBeDisabled();
    await dialog.getByLabel("Name").fill("Zapier");
    await expect(submit).toBeEnabled();
    await dialog.getByRole("checkbox", { name: "read" }).click();
    await dialog.getByRole("checkbox", { name: "write" }).click();
    await expect(submit).toBeDisabled();
    await dialog.getByRole("checkbox", { name: "admin" }).click();
    await submit.click();
    await expect(page.locator('[role="status"]').filter({ hasText: "Could not create the key" })).toBeVisible({ timeout: 15_000 });
  });

  test("revoke asks for confirmation", async ({ page }) => {
    await page.goto("/dev/preview?view=settings&panel=api-keys", { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    page.once("dialog", (d) => d.dismiss());
    await page.getByRole("table", { name: "API keys" }).getByRole("button", { name: "Revoke" }).first().click();
    await expect(page.getByRole("table", { name: "API keys" }).getByRole("row")).toHaveCount(3);
  });
});
