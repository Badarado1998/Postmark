import { test } from "@playwright/test";
import { mkdirSync } from "node:fs";

const OUT = "../notes/screens/w1";

test.beforeAll(() => mkdirSync(OUT, { recursive: true }));

test("screenshots", async ({ page }, testInfo) => {
  const size = testInfo.project.name; // desktop | mobile
  await page.goto("/");
  await page.waitForSelector("text=bounties on diana", { timeout: 30_000 });
  await page.waitForTimeout(2500); // let the stamp/waves finish drawing
  await page.screenshot({ path: `${OUT}/landing-top-${size}.png` });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.55));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/landing-mid-${size}.png` });
  await page.goto("/explore");
  await page.waitForSelector("text=/no bounties yet/i", { timeout: 30_000 });
  await page.screenshot({ path: `${OUT}/explore-${size}.png` });
});

test("screenshots reduced-motion", async ({ page }, testInfo) => {
  const size = testInfo.project.name;
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.waitForSelector("text=bounties on diana", { timeout: 30_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/landing-reduced-${size}.png` });
});
