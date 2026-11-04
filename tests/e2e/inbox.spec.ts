import { test, expect, type Page } from "@playwright/test";

/*
  Inbox journeys against the fixture preview (no Clerk or database needed).
  Mutations fail without a backend and roll back, so the assertions cover the list, filters, the keyboard, and the
  optimistic archive and snooze before the rollback toast.
*/

async function openInbox(page: Page) {
  await page.goto("/dev/preview?view=inbox", { waitUntil: "networkidle" });
  await expect(row(page, /Mary Alvarez mentioned you in MKT-3/)).toBeVisible();
  await page.waitForTimeout(400);
}

/** A notification row; the hover action buttons carry the row text too, so rows are matched by their data attribute. */
const row = (page: Page, name: RegExp) => page.locator("[data-notification-id]").filter({ hasText: name });
const rows = (page: Page) => page.locator("[data-notification-id]");

test.describe("Inbox", () => {
  test("lists notifications with unread dots, project chips, and filters", async ({ page }) => {
    await openInbox(page);
    await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
    await expect(page.getByText("4 unread")).toBeVisible();
    await expect(rows(page)).toHaveCount(7);
    await expect(page.getByLabel("Unread", { exact: true })).toHaveCount(4);
    await page.getByRole("tab", { name: "Mentions" }).click();
    await expect(rows(page)).toHaveCount(1);
    await page.getByRole("tab", { name: "Updates" }).click();
    await expect(rows(page)).toHaveCount(4);
    await page.getByRole("tab", { name: "Due soon" }).click();
    await expect(row(page, /MKT-10 is due tomorrow/)).toBeVisible();
  });

  test("opens the referenced task on the right and marks it read", async ({ page }) => {
    await openInbox(page);
    const assigned = row(page, /Jenny Park assigned you MKT-4/);
    await assigned.click();
    await expect(assigned).toHaveAttribute("aria-current", "true");
    await expect(page.getByText("3 unread")).toBeVisible();
    // The task pane column only has room on wide screens.
    if ((page.viewportSize()?.width ?? 0) >= 1024) await expect(page.getByText("This task is not available.")).toBeVisible();
  });

  test("moves with J and K, archives with E, and snoozes with S", async ({ page }) => {
    await openInbox(page);
    await page.keyboard.press("j");
    await expect(row(page, /Mary Alvarez mentioned you/)).toBeFocused();
    await page.keyboard.press("j");
    await expect(row(page, /Jenny Park assigned you/)).toBeFocused();
    await page.keyboard.press("k");
    await expect(row(page, /Mary Alvarez mentioned you/)).toBeFocused();
    await page.keyboard.press("e");
    await expect(page.getByRole("status").filter({ hasText: "Could not update the inbox" }).first()).toBeVisible();
    await page.keyboard.press("s");
    await expect(page.getByRole("status").filter({ hasText: /Snoozed until tomorrow/ })).toBeVisible();
  });

  test("shows the caught up state when a filter is empty", async ({ page }) => {
    await openInbox(page);
    await page.getByRole("tab", { name: "Assigned" }).click();
    await page.getByRole("button", { name: /Archive: Jenny Park assigned you/ }).click({ force: true });
    await expect(page.getByText("You are all caught up.")).toBeVisible();
  });
});
