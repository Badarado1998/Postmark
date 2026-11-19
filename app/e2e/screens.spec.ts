import { test } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { installTestWallet, mockGithub } from "./testWallet";

const OUT = "../notes/screens/w2";
test.beforeAll(() => mkdirSync(OUT, { recursive: true }));

test("landing + explore screenshots", async ({ page }, testInfo) => {
  const size = testInfo.project.name;
  await page.goto("/");
  await page.waitForSelector("text=bounties on diana", { timeout: 30_000 });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}/landing-top-${size}.png` });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.35));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/landing-mid-${size}.png` });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.75));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/landing-end-${size}.png` });
  await page.goto("/explore");
  await page.waitForSelector("text=/QOR|no bounties/i", { timeout: 30_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/explore-${size}.png` });
});

test("landing reduced-motion", async ({ page }, testInfo) => {
  const size = testInfo.project.name;
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.waitForSelector("text=bounties on diana", { timeout: 30_000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/landing-reduced-${size}.png` });
});

test("create form + dashboard screenshots", async ({ page }, testInfo) => {
  const size = testInfo.project.name;
  await mockGithub(page);
  await installTestWallet(page);

  await page.goto("/create");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/create-empty-${size}.png` });

  const connectBtn = page.getByRole("button", { name: /connect/i }).first();
  if (await connectBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await connectBtn.click();
    const pick = page.getByText("Postmark E2E");
    if (await pick.isVisible({ timeout: 5_000 }).catch(() => false)) await pick.click();
  }
  await page.getByPlaceholder(/github\.com\/owner\/repo/i)
    .fill("https://github.com/postmark-e2e/sandbox/issues/1");
  await page.getByText("Postmark sandbox").waitFor({ timeout: 15_000 });
  const env = readFileSync(`${homedir()}/.config/postmark/e2e/verifier0.env`, "utf8");
  const v0 = env.match(/^ADDRESS=(0x[0-9a-fA-F]{40})/m)![1]!;
  for (let i = 0; i < 3; i++) {
    await page.getByPlaceholder(new RegExp(`Verifier ${i + 1}`)).fill(v0);
  }
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/create-error-${size}.png` });

  const v = (i: number) =>
    readFileSync(`${homedir()}/.config/postmark/e2e/verifier${i}.env`, "utf8")
      .match(/^ADDRESS=(0x[0-9a-fA-F]{40})/m)![1]!;
  for (let i = 0; i < 3; i++) {
    await page.getByPlaceholder(new RegExp(`Verifier ${i + 1}`)).fill(v(i));
  }
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/create-filled-${size}.png` });

  // preflight-blocked panel (no-window guide) as the "pending" state —
  // stub the window REST so no transaction can ever be sent here
  await page.route("**/qore-rest/qorechain/pqc/v1/evm_window/*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ found: false, live: false }) }));
  await page.getByRole("button", { name: /create bounty/i }).click();
  await page.getByText(/open an evm authorisation window in qorex/i)
    .waitFor({ timeout: 30_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/create-pending-${size}.png` });

  await page.goto("/me");
  await page.waitForSelector("text=/FUNDED|haven't funded/i", { timeout: 30_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/dashboard-${size}.png` });
});
