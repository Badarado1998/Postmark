// Verdict construction: every field that binds the signature comes from the
// chain (nonce, claimRound, dispute hashes) or the verifier's evidence —
// never from free-form input.
import type { Hex } from "viem";
import { httpClient, escrow } from "./client";
import { verdictMessage, type VerdictFields } from "../formats/messages";
import { PHASE, OUTCOME, assembleVerdict, verdictPayloadHash } from "./verdictCore";

export { PHASE, OUTCOME, assembleVerdict, verdictPayloadHash };
import type { Bounty } from "./client";

export interface BuiltVerdict {
  verdict: VerdictFields;
  message: `0x${string}`;
  /** bytes returned by the deployed verdictMessage — must equal `message` */
  chainMessage: `0x${string}`;
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
