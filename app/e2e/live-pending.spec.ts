import { test, expect } from "@playwright/test";
import { encodeAbiParameters, keccak256 } from "viem";
import { postmarkEscrowAbi } from "../src/chain/abi";
import { nodePublic, nodeWallet, profileAddress,
  pairingCodeFor, verifierAddr, E2E_ESCROW as ESCROW } from "./testWallet";

// One-shot live fixture: funder creates, claimant claims, verifier0+verifier1
// sign an INITIAL PAY verdict, claimant relays submitVerdict — stop at Pending.
// The 24h challenge window then runs on real chain time; the
// finalize-when-ready job picks it up. GitHub is not needed on this path —
// the identity/evidence hashes are computed, not fetched.

test.describe.configure({ retries: 0 });

const PORTS = { claimant: 47321, v0: 47322, v1: 47323 } as const;
const REPO = "postmark-e2e/sandbox";
const QOR = 10n ** 18n;

const identityHashOf = (login: string, claimant: string, commentId: bigint) =>
  keccak256(encodeAbiParameters(
    [{ type: "string" }, { type: "string" }, { type: "address" }, { type: "uint256" }],
    ["postmark-identity-v1", login, claimant as `0x${string}`, commentId]));

const payEvidenceHashOf = (mergedAtSec: bigint, sha: string) =>
  keccak256(encodeAbiParameters(
    [{ type: "string" }, { type: "string" }, { type: "uint256" }, { type: "string" },
      { type: "uint64" }, { type: "string" }],
    ["postmark-evidence-v1", REPO, 2n, sha, mergedAtSec, "e2e-claimant"]));

const getBounty = (id: bigint) => nodePublic().readContract({
  address: ESCROW, abi: postmarkEscrowAbi, functionName: "getBounty", args: [id],
}) as Promise<{ state: number; payee: `0x${string}`; nonce: bigint;
  claimRound: bigint; challengeEndsAt: bigint }>;

async function sign(port: number, body: object) {
  const res = await fetch(`http://127.0.0.1:${port}/sign`, {
    method: "POST",
    headers: { "content-type": "application/json", "origin": "http://localhost:4173",
      "x-postmark-pair": pairingCodeFor(port) },
    body: JSON.stringify(body),
  });
  const out = await res.json() as { signature?: `0x${string}`; error?: string };
  if (!res.ok || !out.signature) throw new Error(`signer :${port} refused: ${out.error ?? res.status}`);
  return out.signature;
}

test("live bounty driven to Pending for the 24h challenge", async () => {
  test.skip(test.info().project.name !== "desktop", "chain tx — desktop only");
  test.setTimeout(600_000);
  const pub = nodePublic();
  const wait = (hash: `0x${string}`) =>
    pub.waitForTransactionReceipt({ hash, timeout: 120_000 });
  const claimant = profileAddress("claimant");

  // ---- create: funder, 0.05 QOR amount + 0.01 reward, 0.01 bond,
  // deadline now + 4 days, claim timeout 1 day ----
  const id = (await pub.readContract({
    address: ESCROW, abi: postmarkEscrowAbi, functionName: "nextBountyId" })) as bigint;
  const now = BigInt(Math.floor(Date.now() / 1000));
  const deadline = now + 4n * 86400n;
  const createHash = await nodeWallet("funder").writeContract({
    address: ESCROW, abi: postmarkEscrowAbi, functionName: "createBounty",
    args: [5n * QOR / 100n, REPO, 0, 1n, deadline, 86400n,
      [verifierAddr(0), verifierAddr(1), verifierAddr(2)],
      QOR / 100n, QOR / 100n],
    value: 6n * QOR / 100n,
    gas: 900_000n,
  });
  const cr = await wait(createHash);
  if (cr.status !== "success") throw new Error(`createBounty reverted: ${createHash}`);
  console.log(`[live] create bounty #${id} tx ${createHash}`);

  // ---- claim: ML-DSA-87 signature from the claimant's local signer ----
  const commentId = 987654321n;
  const idHash = identityHashOf("e2e-claimant", claimant, commentId);
  let b = await getBounty(id);
  const claimSig = await sign(PORTS.claimant, {
    kind: "claim", bountyId: id.toString(), identityHash: idHash,
    claimRound: (b.claimRound + 1n).toString() });
  const claimHash = await nodeWallet("claimant").writeContract({
    address: ESCROW, abi: postmarkEscrowAbi, functionName: "claim",
    args: [id, idHash, claimSig], gas: 500_000n });
  if ((await wait(claimHash)).status !== "success")
    throw new Error(`claim reverted: ${claimHash}`);
  console.log(`[live] claim tx ${claimHash}`);
  b = await getBounty(id);
  expect(b.state).toBe(1);

  // ---- INITIAL PAY verdict: verifier0 + verifier1 sign, claimant relays ----
  const mergedAt = now;
  const evidenceHash = payEvidenceHashOf(mergedAt, "f".repeat(40));
  const verdict = {
    bountyId: id, phase: 0, outcome: 0, payee: b.payee,
    mergedAt, evidenceHash, nonce: b.nonce, claimRound: b.claimRound,
  };
  const msg = await pub.readContract({
    address: ESCROW, abi: postmarkEscrowAbi, functionName: "verdictMessage",
    args: [verdict] }) as `0x${string}`;
  const sigFields = {
    bountyId: id.toString(), phase: 0, outcome: 0, payee: b.payee,
    mergedAt: mergedAt.toString(), evidenceHash,
    nonce: b.nonce.toString(), claimRound: b.claimRound.toString() };
  const sig0 = await sign(PORTS.v0, { kind: "verdict", verdict: sigFields });
  const sig1 = await sign(PORTS.v1, { kind: "verdict", verdict: sigFields });
  console.log(`[live] verdictMessage ${msg.slice(0, 26)}… signed by verifier0+verifier1`);

  const submitHash = await nodeWallet("claimant").writeContract({
    address: ESCROW, abi: postmarkEscrowAbi, functionName: "submitVerdict",
    args: [verdict, [0, 1], [sig0, sig1]], gas: 900_000n });
  if ((await wait(submitHash)).status !== "success")
    throw new Error(`submitVerdict reverted: ${submitHash}`);
  console.log(`[live] submitVerdict tx ${submitHash}`);

  b = await getBounty(id);
  expect(b.state).toBe(2); // Pending
  console.log(`[live] PENDING bounty=${id} challengeEndsAt=${b.challengeEndsAt}` +
    ` (${new Date(Number(b.challengeEndsAt) * 1000).toISOString()})`);
  console.log(`[live] summary id=${id} create=${createHash} claim=${claimHash}` +
    ` verdict=${submitHash} ends=${b.challengeEndsAt}`);
});
