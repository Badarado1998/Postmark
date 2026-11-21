import { test, expect } from "@playwright/test";

// bounty 13 is Pending with an expired window, so the Actions panel (finalize prompt) is present
test("actions panel placement follows the viewport", async ({ page }) => {
  await page.goto("/bounty/13");
  const actions = page.locator('[data-slot="actions"]');
  const timeline = page.getByRole("heading", { name: "timeline" });
  await expect(actions).toBeVisible({ timeout: 60_000 });
  await expect(timeline).toBeVisible();
  const a = (await actions.boundingBox())!;
  const t = (await timeline.boundingBox())!;
  const width = page.viewportSize()!.width;
  if (width < 1024) {
    expect(a.y, "actions sit above the timeline on mobile").toBeLessThan(t.y);
  } else {
    expect(a.x, "actions sit in the right column on desktop").toBeGreaterThan(width / 2);
    expect(a.x).toBeGreaterThan(t.x);
  }
});

test("claim card sits right under the Timeline on an open bounty", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-17T12:00:00Z"));
  await page.goto("/bounty/1");
  const card = page.getByTestId("claim-card");
  await expect(card).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Bounty created and funded")).toBeVisible({ timeout: 60_000 });
  const timelineCard = page.getByRole("heading", { name: "timeline" }).locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
  const t = (await timelineCard.boundingBox())!;
  const c = (await card.boundingBox())!;
  expect(c.y, "claim card is below the timeline").toBeGreaterThanOrEqual(t.y + t.height);
  expect(c.y - (t.y + t.height), "and directly after it").toBeLessThan(40);
  expect(Math.abs(c.x - t.x), "in the same column").toBeLessThan(2);
  for (const step of ["Post your claim line", "Find my comment", "Sign with QoreX and claim"]) {
    await expect(card.getByText(step)).toBeVisible();
  }
});
