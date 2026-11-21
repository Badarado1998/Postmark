// Choosing which two verdict signatures to relay. Pure apart from the injected signature check.
import { zeroAddress, type Address, type Hex } from "viem";
import type { Bounty } from "../../app/src/chain/client";
import { assembleVerdict } from "../../app/src/chain/verdictCore";
import { verdictMessage, type VerdictFields } from "../../app/src/formats/messages";
import type { VerdictBundle } from "../../app/src/formats/verdictBundle";
import type { ParsedVerdictComment } from "../../app/src/formats/verdictComment";

export type VerifySig = (pubkey: Hex, message: Hex, signature: Hex) => boolean | Promise<boolean>;

export interface OwnVerdict { index: number; verdict: VerdictFields; message: Hex; signature: Hex }

export interface QuorumInput {
  id: bigint;
  bounty: Pick<Bounty, "payee" | "nonce" | "claimRound" | "pendingVerdictHash" | "disputeEvidenceHash" | "verifiers">;
  phase: number;
  escrow: Address;
  own: OwnVerdict | null;
  comments: ParsedVerdictComment[];
  /** live registered ML-DSA-87 key per verifier slot, null when not live */
  keys: (Hex | null)[];
  /** lower-case addresses of human verifiers; the only thing the dispute rule trusts */
  humans: Set<string>;
  verify: VerifySig;
}

export interface QuorumResult {
  message: Hex; verdict: VerdictFields; indices: number[]; signatures: Hex[];
}
export type QuorumOutcome = { ok: true; quorum: QuorumResult } | { ok: false; reason: string };

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The verdict must be for this bounty's current nonce/round/phase with the chain's own dispute hashes. */
function isCurrent(q: QuorumInput, v: VerdictFields, message: Hex): boolean {
  if (v.bountyId !== q.id || v.phase !== q.phase) return false;
  const expected = assembleVerdict({
    bountyId: q.id, bounty: q.bounty, phase: q.phase, outcome: v.outcome,
    evidenceHash: v.evidenceHash, payee: v.payee, mergedAt: v.mergedAt,
  });
  if (v.nonce !== expected.nonce || v.claimRound !== expected.claimRound
    || v.disputedVerdictHash !== expected.disputedVerdictHash
    || v.disputeEvidenceHash !== expected.disputeEvidenceHash) return false;
  if (v.outcome === 0 && (q.bounty.payee === zeroAddress || !same(v.payee, q.bounty.payee))) return false;
  if (v.outcome === 1 && (v.payee !== zeroAddress || v.mergedAt !== 0n)) return false;
  return verdictMessage(v, 9800, q.escrow) === message;
}

export async function selectQuorum(q: QuorumInput): Promise<QuorumOutcome> {
  const groups = new Map<Hex, { verdict: VerdictFields; sigs: Map<number, Hex> }>();
  const consider = async (b: Pick<VerdictBundle, "message" | "verdict" | "escrow">, index: number, signature: Hex) => {
    if (!same(b.escrow, q.escrow) || !isCurrent(q, b.verdict, b.message)) return;
    const key = q.keys[index];
    if (!key) return;
    let ok = false;
    try { ok = await q.verify(key, b.message, signature); } catch { ok = false; }
    if (!ok) return;
    const g = groups.get(b.message) ?? { verdict: b.verdict, sigs: new Map<number, Hex>() };
    g.sigs.set(index, signature);
    groups.set(b.message, g);
  };

  if (q.own) await consider({ message: q.own.message, verdict: q.own.verdict, escrow: q.escrow }, q.own.index, q.own.signature);
  for (const c of q.comments) {
    for (const [i, sig] of Object.entries(c.bundle.signatures)) {
      const index = Number(i);
      if (index >= 0 && index < q.bounty.verifiers.length) await consider(c.bundle, index, sig);
    }
  }

  const ownMessage = q.own?.message;
  const candidates = [...groups.entries()].filter(([message, g]) =>
    (ownMessage === undefined || message === ownMessage) && g.sigs.size >= 2);
  if (candidates.length === 0) return { ok: false, reason: "no two matching valid signatures yet" };
  if (candidates.length > 1) return { ok: false, reason: "conflicting verdict groups" };
  const [message, group] = candidates[0]!;

  const isHuman = (index: number) => q.humans.has(q.bounty.verifiers[index]!.toLowerCase());
  const indices = [...group.sigs.keys()].sort((a, b) => a - b);
  const preferred = (a: number, b: number) =>
    Number(b === q.own?.index) - Number(a === q.own?.index) || a - b;
  let pool = [...indices].sort(preferred);
  if (q.phase === 1) {
    const human = pool.find(isHuman);
    if (human === undefined) return { ok: false, reason: "a dispute needs a human verifier's signature" };
    const rest = pool.filter((x) => x !== human);
    const own = q.own && rest.includes(q.own.index) ? q.own.index : rest[0];
    if (own === undefined) return { ok: false, reason: "no second signer" };
    pool = [human, own];
  }
  const chosen = pool.slice(0, 2).sort((a, b) => a - b);
  return {
    ok: true,
    quorum: { message, verdict: group.verdict, indices: chosen, signatures: chosen.map((i) => group.sigs.get(i)!) },
  };
}
