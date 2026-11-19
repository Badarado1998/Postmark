import { test, expect } from "@playwright/test";

// Read-only smoke against the real diana RPC.
test("landing renders with live chain numbers", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /stamped for merged work/i }))
    .toBeVisible();
  // live strip shows real numbers from diana
  await expect(page.getByText("bounties on diana")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("test QOR in escrow")).toBeVisible();
  await expect(page.getByRole("link", { name: /explore bounties/i })).toBeVisible();
  expect(errors).toEqual([]);
});

test("explore shows the real empty state", async ({ page }) => {
  await page.goto("/explore");
  await expect(page.getByRole("heading", { name: "Bounties" })).toBeVisible();
  await expect(page.getByText(/no bounties yet/i)).toBeVisible({ timeout: 30_000 });
});

test("non-existent bounty id shows a clean not-found", async ({ page }) => {
  await page.goto("/bounty/999");
  await expect(page.getByText(/doesn't exist/i)).toBeVisible({ timeout: 30_000 });
});
