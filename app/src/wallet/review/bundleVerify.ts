import { hexToBytes } from "viem";
import { mldsa87 } from "@qorechain/pqc";
import { pqcKeyStatus } from "../../chain/pqc";
import type { Bounty } from "../../chain/client";
import type { BuiltVerdict } from "../../chain/verdict";
import type { VerdictBundle } from "../../formats/verdictBundle";

export type SigStatus = "valid" | "invalid" | "key not live" | "pending";

export const bigintToString = (_k: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);

export function sameVerdict(a: BuiltVerdict["verdict"], b: BuiltVerdict["verdict"]) {
  return a.bountyId === b.bountyId && a.phase === b.phase && a.outcome === b.outcome
    && a.payee.toLowerCase() === b.payee.toLowerCase() && a.mergedAt === b.mergedAt
    && a.evidenceHash === b.evidenceHash && a.nonce === b.nonce
    && a.claimRound === b.claimRound
    && a.disputedVerdictHash === b.disputedVerdictHash
    && a.disputeEvidenceHash === b.disputeEvidenceHash;
}

/** Check each signature in the bundle against its verifier's live registered key. */
export async function signatureStatuses(
  bounty: Bounty, bundle: VerdictBundle | null,
): Promise<Record<number, SigStatus>> {
  const out: Record<number, SigStatus> = {};
  for (const [i, sig] of Object.entries(bundle?.signatures ?? {})) {
    const idx = Number(i);
    try {
      const key = await pqcKeyStatus(bounty.verifiers[idx]!);
      out[idx] = !key.live ? "key not live"
        : (await mldsa87.verify(hexToBytes(key.pubkey), hexToBytes(bundle!.message), hexToBytes(sig)))
          ? "valid" : "invalid";
    } catch { out[idx] = "invalid"; }
  }
  return out;
}
