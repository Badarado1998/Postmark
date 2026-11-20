import { test, expect } from "@playwright/test";

const ADDR = "0x1111111111111111111111111111111111111111";
const WALLETS = ["Alpha Wallet", "Beta Wallet", "Gamma Wallet"];

test("single Connect wallet button opens a named chooser", async ({ page }) => {
  await page.addInitScript(({ names, addr }) => {
    let granted = false;
    const providers = names.map((name: string, i: number) => {
      const provider = {
        request: async ({ method }: { method: string }) => {
          if (method === "eth_requestAccounts") { granted = true; return [addr]; }
          if (method === "eth_accounts") return granted ? [addr] : [];
          if (method === "eth_chainId") return "0x2648";
          if (method === "wallet_switchEthereumChain") return null;
          if (method === "wallet_revokePermissions") return null;
          throw new Error(`unsupported ${method}`);
        },
        on() {}, removeListener() {},
      };
      const info = { uuid: `00000000-0000-4000-8000-00000000000${i}`, name,
        icon: "data:image/svg+xml,", rdns: `test.wallet.${i}` };
      return { info, provider };
    });
    const announce = () => providers.forEach((d: unknown) =>
      window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: d })));
    window.addEventListener("eip6963:requestProvider", announce);
    announce();
  }, { names: WALLETS, addr: ADDR });

  await page.goto("/explore");
  const header = page.getByRole("banner");
  const open = header.getByRole("button", { name: "Connect wallet" });
  await expect(open).toHaveCount(1);
  await expect(open).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await open.click();
  const dialog = page.getByRole("dialog", { name: "Choose a wallet" });
  await expect(dialog).toBeVisible();
  for (const n of WALLETS) await expect(dialog.getByRole("button", { name: n })).toBeVisible();

  await page.screenshot({ path: `../notes/screens/redesign/wallet-picker-${test.info().project.name}.png` });

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await open.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Beta Wallet" }).click();
  await expect(dialog).toBeHidden();
  await expect(header.getByRole("button", { name: /0x1111…1111/ })).toBeVisible();
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(sw).toBeLessThanOrEqual(page.viewportSize()!.width);
});
