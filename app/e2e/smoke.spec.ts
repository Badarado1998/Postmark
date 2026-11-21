import { test, expect } from "@playwright/test";

// Read-only smoke against the real diana RPC.
test("landing renders its hero and calls to action", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /bounties that pay when the work is verified/i }))
    .toBeVisible();
  await expect(page.getByRole("link", { name: "Fund a bounty" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Browse bounties" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("explore lists bounties from the e2e escrow", async ({ page }) => {
  await page.goto("/explore");
  await expect(page.getByRole("heading", { name: "Bounties" })).toBeVisible();
  // the e2e deployment has real bounties from prior runs
  await expect(page.getByRole("main").getByText(/#\d+|no bounties yet/i).first())
    .toBeVisible({ timeout: 30_000 });
});

test("non-existent bounty id shows a clean not-found", async ({ page }) => {
  await page.goto("/bounty/999");
  await expect(page.getByText(/doesn't exist/i)).toBeVisible({ timeout: 30_000 });
});
