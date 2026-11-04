import { test, expect as baseExpect, type Page } from "@playwright/test";

// Filter changes go through the router, which re-fetches the route on the server; allow for a slow first compile.
const expect = baseExpect.configure({ timeout: 15_000 });

/*
  Search journeys against the fixture preview. The preview filters a static result set client side, so these cover the
  URL state, grouping, highlighting, filters, and opening a result; relevance ranking is covered by the service test.
*/

async function openSearch(page: Page, query = "") {
  await page.goto(`/dev/preview?view=search${query ? `&q=${encodeURIComponent(query)}` : ""}`, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Search", exact: true })).toBeVisible();
  await page.waitForTimeout(400);
}

test.describe("Search", () => {
  test("groups results by tasks, projects, comments, and people with highlights", async ({ page }) => {
    await openSearch(page, "landing page");
    await expect(page.getByText('6 results for "landing page"')).toBeVisible();
    const tasks = page.getByRole("region", { name: "Tasks" });
    await expect(tasks.getByRole("button")).toHaveCount(3);
    await expect(tasks.locator("mark").first()).toHaveText(/landing/i);
    await expect(page.getByRole("region", { name: "Projects" }).getByRole("link", { name: /Spring campaign/ })).toBeVisible();
    await expect(page.getByRole("region", { name: "Comments" }).getByRole("button")).toHaveCount(2);
    await expect(page.getByRole("region", { name: "People" })).toHaveCount(0);
  });

  test("searches from the field and syncs the query to the URL", async ({ page }) => {
    await openSearch(page);
    await expect(page.getByText("Search the workspace")).toBeVisible();
    // The submit button enables only once React has hydrated and seen the typed value; pressing Enter before that
    // would submit the form natively and drop the preview's view param.
    await page.getByRole("searchbox", { name: "Search" }).fill("jenny");
    await expect(page.getByRole("button", { name: "Search", exact: true })).toBeEnabled();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/view=search.*q=jenny/);
    await expect(page.getByRole("region", { name: "People" }).getByText("Jenny Park")).toBeVisible();
    await page.getByRole("button", { name: "Clear search" }).click();
    await expect(page).not.toHaveURL(/q=/);
    await expect(page.getByText("Search the workspace")).toBeVisible();
  });

  test("filters narrow the task results and can be cleared", async ({ page, isMobile }) => {
    test.skip(isMobile, "The filter column is hidden on small screens");
    await openSearch(page, "landing page");
    await page.getByRole("radio", { name: "Done" }).click();
    await expect(page).toHaveURL(/status=done/);
    await expect(page.getByRole("radio", { name: "Done" })).toBeChecked();
    // No landing page task is done; projects and comments still match.
    await expect(page.getByRole("region", { name: "Tasks" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Comments" }).getByRole("button")).toHaveCount(2);
    await page.getByRole("button", { name: /^Clear 1$/ }).click();
    await expect(page.getByRole("region", { name: "Tasks" }).getByRole("button")).toHaveCount(3);
    await page.getByRole("checkbox", { name: "Has attachment" }).click();
    await expect(page).toHaveURL(/attachment=1/);
    await expect(page.getByRole("region", { name: "Tasks" }).getByRole("button")).toHaveCount(1);
    await page.getByRole("button", { name: /^Clear 1$/ }).click();
    await expect(page.getByRole("region", { name: "Tasks" }).getByRole("button")).toHaveCount(3);
  });

  test("opens a task result in the details pane", async ({ page }) => {
    await openSearch(page, "landing page");
    await page.getByRole("region", { name: "Tasks" }).getByRole("button", { name: /Landing page build/ }).click();
    await expect(page.getByRole("complementary").or(page.getByRole("dialog")).first()).toBeVisible();
  });

  test("a person result filters to their tasks", async ({ page }) => {
    await openSearch(page, "lisa");
    await page.getByRole("button", { name: "Show their tasks" }).first().click();
    await expect(page).toHaveURL(/assignee=u-/);
  });
});
