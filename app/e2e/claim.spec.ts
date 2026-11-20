import { test, expect } from "@playwright/test";
import { installTestWallet, mockGithub, nodePublic, nodeWallet, profileAddress } from "./testWallet";
import { readFileSync, existsSync } from "node:fs";
import { encodeAbiParameters, keccak256 } from "viem";

const e2eDeployment = JSON.parse(
  readFileSync(new URL("../../deployments/diana-e2e.json", import.meta.url), "utf8"),
) as { address: string };
const ESCROW = e2eDeployment.address as `0x${string}`;
const STATE_FILE = new URL("./.signer-state.json", import.meta.url).pathname;

import { postmarkEscrowAbi } from "../src/chain/abi";

test.use({ ignoreHTTPSErrors: true });
test.describe.configure({ retries: 0 }); // chain txs must not retry

function verifierAddr(i: number) {
  const env = readFileSync(
    `${process.env.HOME}/.config/postmark/e2e/verifier${i}.env`, "utf8");
  return env.match(/^ADDRESS=(0x[0-9a-fA-F]{40})$/m)![1] as `0x${string}`;
}

function pairingCode() {
  return (JSON.parse(readFileSync(STATE_FILE, "utf8")) as { pairingCode: string }).pairingCode;
}

/** Reuse an existing Open bounty whose deadline still fits a 1 h claim
 * window; otherwise create a real one through the Node-side funder wallet. */
async function openBountyOrCreate(): Promise<bigint> {
  const w = nodeWallet("funder");
  const pub = nodePublic();
  const next = (await pub.readContract({
    address: ESCROW, abi: postmarkEscrowAbi, functionName: "nextBountyId",
  })) as bigint;
  const now = BigInt(Math.floor(Date.now() / 1000));
  for (let id = next - 1n; id >= 1n; id--) {
    const b = await pub.readContract({ address: ESCROW, abi: postmarkEscrowAbi,
      functionName: "getBounty", args: [id] }) as
      { state: number; deadline: bigint; claimTimeout: bigint };
    if (b.state === 0 && b.deadline > now + b.claimTimeout + 600n) {
      console.log("[e2e] reusing open bounty", id.toString());
      return id;
    }
  }
  // No reusable Open bounty. Prefer the e2e funder; if it cannot cover gas,
  // fall back to a dust-value bounty from the deployer profile (deployer spend
  // is outside the e2e QOR budget; createBounty is permissionless and the claim
  // flow does not depend on the funded amount).
  const id = next;
  const deadline = now + 3n * 3600n;
  const gasPrice = await pub.getGasPrice();
  const budget = await pub.getBalance({ address: w.account.address });
  const useFunder = budget > 300_000_000_000_000_000n + gasPrice * 1_000_000n;
  const wallet = useFunder ? w : nodeWallet("../deployer");
  const [amount, reward, bond] = useFunder
    ? [200_000_000_000_000_000n, 50_000_000_000_000_000n, 50_000_000_000_000_000n]
    : [1_000n, 1_000n, 1_000n];
  console.log(`[e2e] creating bounty via ${useFunder ? "funder" : "deployer (dust)"}`);
  const hash = await wallet.writeContract({
    address: ESCROW, abi: postmarkEscrowAbi, functionName: "createBounty",
    args: [amount, "postmark-e2e/sandbox", 0, 1n,
      deadline, 3600n, [verifierAddr(0), verifierAddr(1), verifierAddr(2)],
      reward, bond],
    value: amount + reward,
    gas: 900_000n,
  });
  const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (receipt.status !== "success") throw new Error(`createBounty failed: ${hash}`);
  console.log("[e2e] claim-spec bounty", id.toString(), "tx", hash);
  return id;
}

const identityHashOf = (login: string, claimant: string, commentId: bigint) =>
  keccak256(encodeAbiParameters(
    [{ type: "string" }, { type: "string" }, { type: "address" }, { type: "uint256" }],
    ["postmark-identity-v1", login, claimant as `0x${string}`, commentId]));

async function findOpenBounty(): Promise<bigint | null> {
  const pub = nodePublic();
  const next = (await pub.readContract({ address: ESCROW, abi: postmarkEscrowAbi,
    functionName: "nextBountyId" })) as bigint;
  for (let id = next - 1n; id >= 1n; id--) {
    const b = await pub.readContract({ address: ESCROW, abi: postmarkEscrowAbi,
      functionName: "getBounty", args: [id] }) as { state: number };
    if (b.state === 0) return id;
  }
  return null;
}

async function connectInjected(page: import("@playwright/test").Page) {
  const connectBtn = page.getByRole("button", { name: /connect/i }).first();
  if (await connectBtn.isVisible({ timeout: 6_000 }).catch(() => false)) {
    await connectBtn.click();
    const pick = page.getByText("Postmark E2E");
    if (await pick.isVisible({ timeout: 6_000 }).catch(() => false)) await pick.click();
  }
}

test("a tampered signature is rejected by local verification", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "chain state — desktop only");
  const openId = await openBountyOrCreate();
  const claimant = profileAddress("claimant");
  const commentId = 555000111n;
  const line = `postmark-claim v1 chain=9800 escrow=${ESCROW.toLowerCase()} bounty=${openId} claimant=${claimant.toLowerCase()}`;
  await mockGithub(page, {
    comments: [{ id: Number(commentId), user: { login: "e2e-claimant" },
      body: line, created_at: new Date().toISOString() }],
  });
  // stub signer: status ok, /sign returns garbage
  await page.route("http://127.0.0.1:47321/*", (route) => {
    const u = route.request().url();
    if (u.includes("/status")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        address: claimant, qor1: "qor1stub", pubkeySha256: "ab", live: true,
        escrow: ESCROW, chainId: 9800 }) });
    }
    if (u.includes("/sign")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        signature: "0x" + "12".repeat(4627), signer: claimant, pubkeySha256: "ab" }) });
    }
    return route.fulfill({ status: 404, body: "{}" });
  });
  await installTestWallet(page, "claimant");
  await page.goto(`/bounty/${openId}`);
  await connectInjected(page);
  await expect(page.getByPlaceholder(/8-char code/i)).toBeVisible({ timeout: 90_000 });
  await page.getByPlaceholder(/8-char code/i).fill("anything");
  await page.getByRole("button", { name: /find my comment/i }).click();
  await page.getByRole("button", { name: /sign the claim/i }).click();
  await expect(page.getByText(/failed local ML-DSA-87 verification/i))
    .toBeVisible({ timeout: 60_000 });
});

test("claimant posts identity, signs with the local signer and claims", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "chain tx — desktop only");
  expect(existsSync(STATE_FILE), "signer state file missing — global setup did not start the signer").toBe(true);

  const bountyId = await openBountyOrCreate();
  const claimant = profileAddress("claimant");
  const commentId = 987654321n;
  const line = `postmark-claim v1 chain=9800 escrow=${ESCROW.toLowerCase()} bounty=${bountyId} claimant=${claimant.toLowerCase()}`;
  await mockGithub(page, {
    comments: [{ id: Number(commentId), user: { login: "e2e-claimant" },
      body: `Claiming this.\n${line}`, created_at: new Date().toISOString() }],
  });
  await installTestWallet(page, "claimant");

  await page.goto(`/bounty/${bountyId}`);
  await connectInjected(page);

  // step 1 — identity
  await expect(page.getByText(/postmark-claim v1 chain=9800/).first())
    .toBeVisible({ timeout: 90_000 });
  await page.getByPlaceholder(/8-char code/i).fill(pairingCode());
  await page.getByRole("button", { name: /find my comment/i }).click();
  await expect(page.getByText(/@e2e-claimant/i)).toBeVisible({ timeout: 30_000 });

  // step 2 — sign (signer auto-confirms under POSTMARK_SIGNER_TEST=1 + e2e)
  await page.getByRole("button", { name: /sign the claim/i }).click();
  await expect(page.getByText(/verified locally/i)).toBeVisible({ timeout: 60_000 });

  // step 3 — send
  await page.getByRole("button", { name: "Claim bounty", exact: true }).click();
  await expect(page.getByRole("status").getByText(/submitted|confirming|confirmed/i))
    .toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("status").getByText(/confirmed/i))
    .toBeVisible({ timeout: 120_000 });

  // on-chain truth
  const pub = nodePublic();
  const b = await pub.readContract({
    address: ESCROW, abi: postmarkEscrowAbi, functionName: "getBounty", args: [bountyId],
  }) as { state: number; payee: string; payeeIdentityHash: string; claimRound: bigint };
  expect(b.state).toBe(1); // Claimed
  expect(b.payee.toLowerCase()).toBe(claimant.toLowerCase());
  expect(b.claimRound).toBe(1n);
  expect(b.payeeIdentityHash.toLowerCase()).toBe(
    identityHashOf("e2e-claimant", claimant, commentId));

  // claimed state visible on page
  await page.goto(`/bounty/${bountyId}`);
  await expect(page.getByText(/your claim is live/i)).toBeVisible({ timeout: 30_000 });
});

test("the funder sees 'cannot claim' before any transaction", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "chain state — desktop only");
  const openId = await findOpenBounty();
  test.skip(openId === null, "no Open bounty on the e2e escrow");
  await mockGithub(page);
  await installTestWallet(page, "funder");
  await page.goto(`/bounty/${openId}`);
  await connectInjected(page);
  await expect(page.getByText(/cannot claim their own bounty/i))
    .toBeVisible({ timeout: 90_000 });
});


