import { openLocalSigner } from "./support/easyUi";
import { test, expect } from "@playwright/test";
import { installTestWallet, mockGithub, nodePublic, nodeWallet, profileAddress,
  openBountyOrCreate, connectInjected, pairingCodeFor, E2E_ESCROW as ESCROW } from "./testWallet";
import { encodeAbiParameters, keccak256 } from "viem";
import { postmarkEscrowAbi } from "../src/chain/abi";
import { e2eLog } from "./util";

test.use({ ignoreHTTPSErrors: true });
test.describe.configure({ retries: 0 });

const PORTS = { claimant: 47321, v0: 47322, v1: 47323, v2: 47324 } as const;

const identityHashOf = (login: string, claimant: string, commentId: bigint) =>
  keccak256(encodeAbiParameters(
    [{ type: "string" }, { type: "string" }, { type: "address" }, { type: "uint256" }],
    ["postmark-identity-v1", login, claimant as `0x${string}`, commentId]));

const claimLineOf = (bountyId: bigint, claimant: string) =>
  `postmark-claim v1 chain=9800 escrow=${ESCROW.toLowerCase()} bounty=${bountyId} claimant=${claimant.toLowerCase()}`;
const disputeLineOf = (bountyId: bigint) =>
  `postmark-dispute v1 chain=9800 escrow=${ESCROW.toLowerCase()} bounty=${bountyId}`;

/** Sign a claim off-chain through the claimant's local signer and send the
 * claim transaction from Node (the UI claim path is covered by claim.spec). */
async function claimOnChain(bountyId: bigint): Promise<`0x${string}`> {
  const claimant = profileAddress("claimant");
  const commentId = 987654321n;
  const bounty = (await nodePublic().readContract({
    address: ESCROW, abi: postmarkEscrowAbi, functionName: "getBounty", args: [bountyId],
  })) as { claimRound: bigint };
  const res = await fetch(`http://127.0.0.1:${PORTS.claimant}/sign`, {
    method: "POST",
    headers: { "content-type": "application/json", "origin": "http://localhost:4173",
      "x-postmark-pair": pairingCodeFor(PORTS.claimant) },
    body: JSON.stringify({ kind: "claim", bountyId: bountyId.toString(),
      identityHash: identityHashOf("e2e-claimant", claimant, commentId),
      claimRound: (bounty.claimRound + 1n).toString() }),
  });
  const body = await res.json() as { signature?: `0x${string}`; error?: string };
  if (!res.ok || !body.signature) throw new Error(`signer refused claim: ${body.error ?? res.status}`);
  const hash = await nodeWallet("claimant").writeContract({
    address: ESCROW, abi: postmarkEscrowAbi, functionName: "claim",
    args: [bountyId, identityHashOf("e2e-claimant", claimant, commentId), body.signature],
    gas: 500_000n,
  });
  const r = await nodePublic().waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (r.status !== "success") throw new Error(`claim reverted: ${hash}`);
  e2eLog("e2e", "claim tx", hash);
  return hash;
}

const getBounty = (id: bigint) => nodePublic().readContract({
  address: ESCROW, abi: postmarkEscrowAbi, functionName: "getBounty", args: [id],
}) as Promise<{
  state: number; payee: string; nonce: bigint; claimRound: bigint;
  pendingVerdictHash: string; disputer: string; challengeEndsAt: bigint;
}>;

async function pairSigner(page: import("@playwright/test").Page, port: number) {
  const portBox = page.getByRole("textbox", { name: /^port$/i }).or(page.locator("label:has-text('port') input")).first();
  await portBox.fill(String(port));
  await openLocalSigner(page);
  await page.getByPlaceholder(/8-char code/i).fill(pairingCodeFor(port));
}

async function signOnce(page: import("@playwright/test").Page, port: number, index: number) {
  await pairSigner(page, port);
  await page.getByRole("button", { name: /sign with the local signer/i }).click();
  await expect(page.getByText(`Signature #${index} verified locally`))
    .toBeVisible({ timeout: 90_000 });
}

async function waitState(bountyId: bigint, state: number, timeoutMs = 120_000) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const b = await getBounty(bountyId);
    if (b.state === state) return;
    if (Date.now() > until) throw new Error(`bounty ${bountyId} stuck in state ${b.state}, wanted ${state}`);
    await new Promise((r) => setTimeout(r, 3_000));
  }
}

async function waitConfirmed(page: import("@playwright/test").Page) {
  await expect(page.getByRole("status").getByText(/confirmed/i))
    .toBeVisible({ timeout: 120_000 });
}

test("verdict, dispute and resolution end to end", async ({ page, context }) => {
  test.skip(test.info().project.name !== "desktop", "chain tx — desktop only");
  test.setTimeout(600_000);
  const claimant = profileAddress("claimant");
  const bountyId = await openBountyOrCreate();

  await mockGithub(page, {
    comments: [
      { id: 987654321, user: { login: "e2e-claimant" },
        body: claimLineOf(bountyId, claimant), created_at: new Date().toISOString() },
      { id: 555000222, user: { login: "e2e-disputer" },
        body: `not actually fixed\n${disputeLineOf(bountyId)}`, created_at: new Date().toISOString() },
    ],
    pull: { number: 2, title: "wire the funder flow", state: "closed", merged: true,
      merged_at: new Date(Date.now() - 60_000).toISOString(),
      merge_commit_sha: "f".repeat(40), user: { login: "e2e-claimant" },
      html_url: "https://github.com/postmark-e2e/sandbox/pull/2" },
  });

  // --- claim (Node path; UI claim covered by claim.spec) ---
  await claimOnChain(bountyId);
  expect((await getBounty(bountyId)).state).toBe(1);

  // --- review: verifier0 + verifier1 sign INITIAL PAY, claimant relays ---
  await installTestWallet(page, "claimant");
  await page.goto(`/bounty/${bountyId}/review`);
  await connectInjected(page);
  await page.getByRole("button", { name: /scan comments/i }).click();
  await expect(page.getByText(/identity matches/i)).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: /find linked prs/i }).click();
  await page.getByRole("button", { name: "#2", exact: true }).click();
  await expect(page.getByText(/merge_commit_sha present/i)).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "PAY", exact: true }).click();
  await expect(page.getByText(/message matches escrow\.verdictMessage/i))
    .toBeVisible({ timeout: 60_000 });
  await signOnce(page, PORTS.v0, 0);
  await signOnce(page, PORTS.v1, 1);
  await page.getByRole("button", { name: /submit verdict/i }).click();
  await waitConfirmed(page);
  expect((await getBounty(bountyId)).state).toBe(2); // Pending

  // --- pending view + dispute (disputer) ---
  const dpage = await context.newPage();
  await mockGithub(dpage, {
    comments: [{ id: 555000222, user: { login: "e2e-disputer" },
      body: disputeLineOf(bountyId), created_at: new Date().toISOString() }],
  });
  await installTestWallet(dpage, "disputer");
  await dpage.goto(`/bounty/${bountyId}`);
  await connectInjected(dpage);
  await expect(dpage.getByText(/verdict pending/i)).toBeVisible({ timeout: 60_000 });
  await dpage.getByPlaceholder(/your github login/i).fill("e2e-disputer");
  await dpage.getByRole("button", { name: /find my comment/i }).click();
  await dpage.getByRole("button", { name: /bond dispute/i }).click();
  await waitState(bountyId, 3); // Disputed (view swaps to frozen; status text is transient)
  await expect(dpage.getByText(/payout frozen — disputed/i)).toBeVisible({ timeout: 60_000 });

  // --- resolution: verifier1 + verifier2 sign DISPUTE PAY, claimant relays ---
  const rpage = await context.newPage();
  await mockGithub(rpage, {
    comments: [
      { id: 987654321, user: { login: "e2e-claimant" },
        body: claimLineOf(bountyId, claimant), created_at: new Date().toISOString() },
      { id: 555000222, user: { login: "e2e-disputer" },
        body: disputeLineOf(bountyId), created_at: new Date().toISOString() },
    ],
    pull: { number: 2, title: "wire the funder flow", state: "closed", merged: true,
      merged_at: new Date(Date.now() - 60_000).toISOString(),
      merge_commit_sha: "f".repeat(40), user: { login: "e2e-claimant" },
      html_url: "https://github.com/postmark-e2e/sandbox/pull/2" },
  });
  await installTestWallet(rpage, "claimant");
  await rpage.goto(`/bounty/${bountyId}/review`);
  await connectInjected(rpage);
  await expect(rpage.getByText(/disputed claim/i)).toBeVisible({ timeout: 60_000 });
  await rpage.getByRole("button", { name: /scan comments/i }).click();
  await expect(rpage.getByText(/dispute comment by @e2e-disputer/i))
    .toBeVisible({ timeout: 60_000 });
  await rpage.getByRole("button", { name: /find linked prs/i }).click();
  await rpage.getByRole("button", { name: "#2", exact: true }).click();
  await rpage.getByRole("button", { name: /resolve pay/i }).click();
  await expect(rpage.getByText(/message matches escrow\.verdictMessage/i))
    .toBeVisible({ timeout: 60_000 });
  await signOnce(rpage, PORTS.v1, 1);
  await signOnce(rpage, PORTS.v2, 2);
  await rpage.getByRole("button", { name: /submit resolution/i }).click();
  await waitState(bountyId, 4); // Paid (dispute rejected; view swaps to ruling)

  // --- ruling view + claimant withdraws the payee-gated credit ---
  await rpage.goto(`/bounty/${bountyId}`);
  await expect(rpage.getByText(/ruling/i)).toBeVisible({ timeout: 60_000 });
  await expect(rpage.getByText(/dispute was rejected/i)).toBeVisible();
  await rpage.goto("/me");
  await expect(rpage.getByText(/payee-gated/i).first()).toBeVisible({ timeout: 60_000 });
  await rpage.getByRole("button", { name: /^withdraw$/i }).click();
  await expect(rpage.getByRole("status").getByText(/confirmed/i))
    .toBeVisible({ timeout: 120_000 });
  const [ungated, gated] = await nodePublic().readContract({
    address: ESCROW, abi: postmarkEscrowAbi, functionName: "creditOf",
    args: [claimant],
  }) as [bigint, bigint];
  expect(ungated).toBe(0n);
  expect(gated).toBe(0n);
});
