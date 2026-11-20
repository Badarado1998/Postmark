// Verdict construction: every field that binds the signature comes from the
// chain (nonce, claimRound, dispute hashes) or the verifier's evidence —
// never from free-form input.
import { type Hex, keccak256, encodeAbiParameters, zeroAddress } from "viem";
import { httpClient, escrow } from "./client";
import { ESCROW_ADDRESS } from "./config";
import { VERDICT_TYPEHASH, verdictMessage, type VerdictFields } from "../formats/messages";
import type { Bounty } from "./client";

export const PHASE = { INITIAL: 0, DISPUTE: 1 } as const;
export const OUTCOME = { PAY: 0, REFUND: 1 } as const;

/** keccak256 of the abi-encoded verdict payload — what the chain stores as
 * pendingVerdictHash for the INITIAL verdict and what DISPUTE binds to. */
export function verdictPayloadHash(v: VerdictFields): Hex {
  const zero = `0x${"0".repeat(64)}` as Hex;
  return keccak256(encodeAbiParameters(
    [
      { type: "bytes32" }, { type: "uint256" }, { type: "address" }, { type: "uint256" },
      { type: "uint8" }, { type: "uint8" }, { type: "address" }, { type: "uint64" },
      { type: "bytes32" }, { type: "uint256" }, { type: "uint256" },
      { type: "bytes32" }, { type: "bytes32" },
    ],
    [VERDICT_TYPEHASH, 9800n, ESCROW_ADDRESS, v.bountyId, v.phase, v.outcome,
      v.payee, v.mergedAt, v.evidenceHash, v.nonce, v.claimRound,
      v.phase === 1 ? v.disputedVerdictHash : zero,
      v.phase === 1 ? v.disputeEvidenceHash : zero]));
}

export interface BuiltVerdict {
  verdict: VerdictFields;
  message: `0x${string}`;
  /** bytes returned by the deployed verdictMessage — must equal `message` */
  chainMessage: `0x${string}`;
}

/** Pure field assembly — nonce/claimRound/dispute hashes always come from the
 * stored bounty; REFUND always zeroes payee and mergedAt. */
export function assembleVerdict(input: {
  bountyId: bigint;
  bounty: Pick<Bounty, "payee" | "nonce" | "claimRound" | "pendingVerdictHash" | "disputeEvidenceHash">;
  phase: number;
  outcome: number;
  evidenceHash: Hex;
  payee?: `0x${string}`;
  mergedAt?: bigint;
}): VerdictFields {
  const { bountyId, bounty, phase, outcome } = input;
  const zero = `0x${"0".repeat(64)}` as Hex;
  return {
    bountyId, phase, outcome,
    payee: outcome === OUTCOME.PAY ? (input.payee ?? bounty.payee) : zeroAddress,
    mergedAt: outcome === OUTCOME.PAY ? (input.mergedAt ?? 0n) : 0n,
    evidenceHash: input.evidenceHash,
    nonce: bounty.nonce,
    claimRound: bounty.claimRound,
    disputedVerdictHash: phase === PHASE.DISPUTE ? bounty.pendingVerdictHash : zero,
    disputeEvidenceHash: phase === PHASE.DISPUTE ? bounty.disputeEvidenceHash : zero,
  };
}

/** Assemble a Verdict for `bounty` and return both the locally built and the
 * chain-built message. Throws if they differ (client/contract drift). */
export async function buildVerdictFor(input: {
  bountyId: bigint;
  bounty: Bounty;
  phase: number;
  outcome: number;
  evidenceHash: Hex;
  payee?: `0x${string}`;
  mergedAt?: bigint;
}): Promise<BuiltVerdict> {
  const verdict = assembleVerdict(input);
  const message = verdictMessage(verdict);
  const chainMessage = await httpClient.readContract({
    ...escrow, functionName: "verdictMessage",
    args: [{
      bountyId: verdict.bountyId, phase: verdict.phase, outcome: verdict.outcome,
      payee: verdict.payee, mergedAt: verdict.mergedAt,
      evidenceHash: verdict.evidenceHash, nonce: verdict.nonce, claimRound: verdict.claimRound,
    }],
  }) as `0x${string}`;
  if (chainMessage !== message) {
    throw new Error("The locally built verdict message differs from the contract's — refusing to sign.");
  }
  return { verdict, message, chainMessage };
}
