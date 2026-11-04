import { test, expect, type Page } from "@playwright/test";

/*
  Settings journeys against the fixture preview (no Clerk or database needed).
  Mutations fail without a backend and roll back, so the assertions cover navigation, the members table and invite
  dialog, the fields dialog, the workflow editor, tags, and the notification matrix.
*/

// Server actions compile on first use in dev, so toasts that follow a mutation get a longer timeout. Toasts are located by
// CSS because an open modal dialog hides the rest of the page from the accessibility tree.
async function openSettings(page: Page, panel: string) {
  await page.goto(`/dev/preview?view=settings&panel=${panel}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
}

test.describe("Settings", () => {
  test("shows the settings navigation with workspace and account groups", async ({ page }) => {
    await openSettings(page, "general");
    const nav = page.getByRole("navigation", { name: "Settings" });
    await expect(nav.getByRole("link", { name: "General" })).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("link", { name: "Members" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Notifications" })).toBeVisible();
    await expect(nav.getByText("Teams")).toBeVisible();
    await expect(page.getByLabel("Workspace name")).toHaveValue("TaskParty");
    await page.getByLabel("Cycle label").fill("Sprint");
    await expect(page.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  test("lists members with roles and opens the invite dialog", async ({ page }) => {
    await openSettings(page, "members");
    const table = page.getByRole("table", { name: "Members" });
    await expect(table.getByRole("row")).toHaveCount(10);
    await expect(page.getByText("Spencer Townley")).toBeVisible();
    await expect(page.getByRole("button", { name: /Role for Jenny Park: Admin/ })).toBeVisible();
    await page.getByRole("tab", { name: /Guests/ }).click();
    await expect(page.getByRole("table", { name: "Guests" }).getByRole("row")).toHaveCount(2);
    await page.getByRole("tab", { name: /Invited/ }).click();
    await expect(page.getByText("sam@example.com")).toBeVisible();
    await page.getByRole("button", { name: "Invite" }).click();
    await page.getByLabel("Email").fill("new@example.com");
    await page.getByRole("button", { name: "Send invitation" }).click();
    await expect(page.locator('[role="status"]').filter({ hasText: "Could not send the invitation" })).toBeVisible({ timeout: 15_000 });
  });

  test("edits fields through the dialog", async ({ page }) => {
    await openSettings(page, "fields");
    await expect(page.getByRole("table", { name: "Fields" }).getByRole("row")).toHaveCount(4);
    await page.getByRole("button", { name: "Team", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("Edit field");
    await expect(page.getByLabel("Option 1", { exact: true })).toHaveValue("Web");
    await page.getByRole("button", { name: "Add option" }).click();
    await page.getByLabel("Option 3", { exact: true }).fill("Print");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.locator('[role="status"]').filter({ hasText: "Could not save the field" })).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Add field" }).click();
    await page.getByLabel("Name").fill("Vendor");
    await page.getByLabel("Type").selectOption("single_select");
    await expect(page.getByRole("button", { name: "Add field" }).last()).toBeDisabled();
  });

  test("edits the project workflow and reorders statuses", async ({ page }) => {
    await openSettings(page, "project");
    const table = page.getByRole("table", { name: "Statuses" });
    await expect(table.getByRole("row")).toHaveCount(6);
    await expect(page.getByRole("button", { name: "Save workflow" })).toBeDisabled();
    await page.getByRole("button", { name: "Move In review up" }).click();
    await expect(table.getByRole("row").nth(3).getByLabel(/Name of status/)).toHaveValue("In review");
    await page.getByLabel("WIP limit for In progress").fill("4");
    await expect(page.getByRole("button", { name: "Save workflow" })).toBeEnabled();
    await page.getByRole("button", { name: "Save workflow" }).click();
    await expect(page.locator('[role="status"]').filter({ hasText: "Could not save the workflow" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("table", { name: "Fields" }).getByRole("row")).toHaveCount(3);
    await expect(page.getByRole("button", { name: "Add from library" })).toBeVisible();
  });

  test("manages tags and notification preferences", async ({ page }) => {
    await openSettings(page, "tags");
    await expect(page.getByRole("table", { name: "Tags" }).getByRole("row")).toHaveCount(2);
    await page.getByLabel("New tag name").fill("Print");
    await page.getByRole("button", { name: "Add tag" }).click();
    await expect(page.locator('[role="status"]').filter({ hasText: "Could not add the tag" })).toBeVisible({ timeout: 15_000 });
    await openSettings(page, "notifications");
    const assignedEmail = page.getByRole("switch", { name: "Assigned to me by email" });
    await expect(assignedEmail).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("switch", { name: "Comments by email" })).toHaveAttribute("aria-checked", "false");
    await expect(page.getByRole("switch", { name: "Comments by chat" })).toBeDisabled();
    await assignedEmail.click();
    await expect(page.locator('[role="status"]').filter({ hasText: "Could not save the preference" })).toBeVisible({ timeout: 15_000 });
  });
});
