import { expect, test } from "@playwright/test";

test("status page shows every layer connected", async ({ page }) => {
  await page.goto("/status");
  await expect(page.getByRole("heading", { name: "Bangkok Plot Envelope" })).toBeVisible();
  await expect(page.getByText("Reachable")).toBeVisible();
  await expect(page.getByText("Connected")).toBeVisible();
  await expect(page.getByText("PostGIS", { exact: true })).toBeVisible();
});

test("a visitor can start and end a guest session", async ({ page }) => {
  await page.goto("/status");
  await page.getByRole("button", { name: "Continue as guest" }).click();
  await expect(page.getByText("Signed in")).toBeVisible();
  await expect(page.getByText("Guest", { exact: true })).toBeVisible();

  const me = await page.request.get("/api/me");
  expect((await me.json()).session).toMatchObject({ isAnonymous: true });

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Continue as guest" })).toBeVisible();
});
