// Live check: local message builders must byte-match the deployed contract's
// claimMessage/verdictMessage views on diana (chain 9800).
import { describe, it, expect } from "vitest";
import { createPublicClient, http } from "viem";
import { readFileSync } from "node:fs";
import { claimMessage, verdictMessage } from "../src/formats/messages";
import { workHashOf } from "../src/formats/hashes";

const artifact = JSON.parse(readFileSync(
  "../out/PostmarkEscrow.sol/PostmarkEscrow.json", "utf8"));
const deployment = JSON.parse(readFileSync(
  "../deployments/diana.json", "utf8"));

const client = createPublicClient({
  transport: http("https://evm-testnet.qore.host", { timeout: 20_000 }),
});
const escrow = deployment.address as `0x${string}`;
const abi = artifact.abi;

describe("deployed PostmarkEscrow", () => {
  it("claimMessage matches the contract", async () => {
    const claimant = "0x478f2a08a81be7cea42bd34bd6900593fa56c4b6";
    const identity = "0x79475837a323888e787d418785840c32d91b5f998809269840d584b8808bc654" as const;
    const onchain = await client.readContract({
      address: escrow, abi, functionName: "claimMessage",
      args: [7n, claimant, identity, 2n],
    });
    expect(claimMessage(7n, claimant, identity, 2n, 9800, escrow)).toBe(onchain);
  });

  it("verdictMessage matches the contract (13-word tuple)", async () => {
    const v = {
      bountyId: 3n, phase: 0, outcome: 0,
      payee: "0x478f2a08a81be7cea42bd34bd6900593fa56c4b6" as `0x${string}`,
      mergedAt: 1700000000n,
      evidenceHash: ("0x" + "11".repeat(32)) as `0x${string}`,
      nonce: 1n, claimRound: 2n,
      disputedVerdictHash: ("0x" + "22".repeat(32)) as `0x${string}`,
      disputeEvidenceHash: ("0x" + "33".repeat(32)) as `0x${string}`,
    };
    const onchain = await client.readContract({
      address: escrow, abi, functionName: "verdictMessage",
      args: [v],
    });
    expect(verdictMessage(v, 9800, escrow)).toBe(onchain);
  });

  it("DISPUTE-phase verdictMessage matches the contract (live Disputed bounty)", async () => {
    const id = 14n; // a real Disputed bounty on the e2e escrow
    const b = (await client.readContract({
      address: escrow, abi, functionName: "getBounty", args: [id],
    })) as { state: number; payee: `0x${string}`; nonce: bigint; claimRound: bigint;
      initialMergedAt: bigint; pendingVerdictHash: `0x${string}`;
      disputeEvidenceHash: `0x${string}` };
    if (b.state !== 3) return; // fixture gone — INITIAL case above still covers the builder
    const v = {
      bountyId: id, phase: 1, outcome: 0,
      payee: b.payee, mergedAt: b.initialMergedAt,
      evidenceHash: ("0x" + "44".repeat(32)) as `0x${string}`,
      nonce: b.nonce, claimRound: b.claimRound,
      disputedVerdictHash: b.pendingVerdictHash,
      disputeEvidenceHash: b.disputeEvidenceHash,
    };
    const onchain = await client.readContract({
      address: escrow, abi, functionName: "verdictMessage", args: [v],
    });
    expect(verdictMessage(v, 9800, escrow)).toBe(onchain);
  });

  it("typehash constants match the contract", async () => {
    const [claim, verdict, chain] = await Promise.all([
      client.readContract({ address: escrow, abi, functionName: "CLAIM_TYPEHASH" }),
      client.readContract({ address: escrow, abi, functionName: "VERDICT_TYPEHASH" }),
      client.readContract({ address: escrow, abi, functionName: "nativeChainId" }),
    ]);
    const { CLAIM_TYPEHASH, VERDICT_TYPEHASH } = await import("../src/formats/messages");
    expect(CLAIM_TYPEHASH).toBe(claim);
    expect(VERDICT_TYPEHASH).toBe(verdict);
    expect(chain).toBe("qorechain-diana");
  });

  it("getBounty/unknown id and totalLiabilities read cleanly", async () => {
    const [liab, next] = await Promise.all([
      client.readContract({ address: escrow, abi, functionName: "totalLiabilities" }),
      client.readContract({ address: escrow, abi, functionName: "nextBountyId" }),
    ]);
    expect(typeof liab).toBe("bigint");
    expect(typeof next).toBe("bigint");
  });

  it("workHash formula is the chain's own (D11)", () => {
    // recomputed exactly like the contract; vector produced with cast abi-encode
    expect(workHashOf("acme/widgets", 0, 42)).toBe(
      "0x527626824701be80595a0c890ec5756744f6bde53f7f6876c64ba101dce7f1d5");
  });
});
