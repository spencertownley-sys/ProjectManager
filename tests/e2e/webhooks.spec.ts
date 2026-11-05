import { test, expect } from "@playwright/test";

/* Webhooks settings panel against the fixture preview; mutations need a backend and show the error toast. */

const url = "/dev/preview?view=settings&panel=webhooks";

test.describe("Webhooks", () => {
  test("lists webhooks with scope, events, last delivery, and state", async ({ page }) => {
    await page.goto(url, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Webhooks" })).toBeVisible();
    const list = page.getByRole("list", { name: "Webhooks" });
    await expect(list.getByRole("listitem")).toHaveCount(3);
    await expect(list.getByText("https://hooks.example.com/taskparty")).toBeVisible();
    await expect(list.getByText(/Whole workspace\. 4 events\. Last delivery delivered/)).toBeVisible();
    await expect(list.getByText(/Spring campaign\. 1 event\./)).toBeVisible();
    await expect(list.getByText("3 failing")).toBeVisible();
    await expect(list.getByText("Paused")).toBeVisible();
    await expect(list.getByRole("switch", { name: "Enable webhook https://old.example.com/hook" })).toHaveAttribute("data-state", "unchecked");
  });

  test("shows the delivery log with payloads and replays a delivery", async ({ page }) => {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Deliveries" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Deliveries" });
    const log = dialog.getByRole("table", { name: "Delivery log" });
    await expect(log.getByRole("row")).toHaveCount(4);
    await expect(log.getByText("task.status_changed")).toBeVisible();
    await expect(log.getByText("HTTP 503: upstream unavailable")).toBeVisible();
    await dialog.getByRole("button", { name: "Payload" }).first().click();
    await expect(dialog.getByText('"key": "MKT-8"')).toBeVisible();
    await dialog.getByRole("button", { name: "Replay delivery 41" }).click();
    await expect(page.locator('[role="status"]').filter({ hasText: "Could not replay the delivery" })).toBeVisible({ timeout: 15_000 });
  });

  test("add webhook needs a URL and at least one event, with group toggles", async ({ page }) => {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Add webhook" }).click();
    const dialog = page.getByRole("dialog", { name: "Add webhook" });
    const submit = dialog.getByRole("button", { name: "Add webhook" });
    await expect(submit).toBeDisabled();
    await dialog.getByLabel("Endpoint URL").fill("https://example.com/receive");
    await expect(submit).toBeEnabled();
    await expect(dialog.getByText("(4 selected)")).toBeVisible();
    await dialog.getByRole("checkbox", { name: "All projects events" }).click();
    await expect(dialog.getByText("(12 selected)")).toBeVisible();
    await dialog.getByLabel("Scope").selectOption({ label: "Spring campaign (MKT)" });
    await submit.click();
    await expect(page.locator('[role="status"]').filter({ hasText: "Could not add the webhook" })).toBeVisible({ timeout: 15_000 });
  });

  test("pausing a webhook rolls back when the save fails", async ({ page }) => {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    const toggle = page.getByRole("switch", { name: "Enable webhook https://hooks.example.com/taskparty" });
    await toggle.click();
    await expect(page.locator('[role="status"]').filter({ hasText: "Could not pause the webhook" })).toBeVisible({ timeout: 15_000 });
    await expect(toggle).toHaveAttribute("data-state", "checked");
  });
});
