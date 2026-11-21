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
