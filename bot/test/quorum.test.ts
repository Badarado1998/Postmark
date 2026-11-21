import { describe, it, expect } from "vitest";
import { bytesToHex, hexToBytes, zeroAddress, type Hex } from "viem";
import { mldsa87 } from "@qorechain/pqc";
import { selectQuorum, type OwnVerdict, type QuorumInput } from "../src/quorum";
import { assembleVerdict } from "../../app/src/chain/verdictCore";
import { verdictMessage, type VerdictFields } from "../../app/src/formats/messages";
import { BUNDLE_FORMAT, type VerdictBundle } from "../../app/src/formats/verdictBundle";
import { formatVerdictComment, parseVerdictComments } from "../../app/src/formats/verdictComment";
import { ESCROW, PAYEE } from "./fixtures";

const pairs = [1, 2, 3].map((n) => mldsa87.keygen(new Uint8Array(32).fill(n)));
const keys = pairs.map((p) => bytesToHex(p.publicKey) as Hex);
const VERIFIERS = ["0x" + "a1".repeat(20), "0x" + "a2".repeat(20), "0x" + "a3".repeat(20)] as unknown as readonly [`0x${string}`, `0x${string}`, `0x${string}`];
const ZERO = `0x${"0".repeat(64)}` as Hex;
const bounty = { payee: PAYEE, nonce: 0n, claimRound: 1n, pendingVerdictHash: ZERO, disputeEvidenceHash: ZERO, verifiers: VERIFIERS };

const verify = (pub: Hex, msg: Hex, sig: Hex) => mldsa87.verify(hexToBytes(pub), hexToBytes(msg), hexToBytes(sig));
const verdictFor = (outcome: 0 | 1, ev: Hex = `0x${"11".repeat(32)}`): VerdictFields =>
  assembleVerdict({ bountyId: 7n, bounty, phase: 0, outcome, evidenceHash: ev, ...(outcome === 0 ? { payee: PAYEE, mergedAt: 1_700_000_000n } : {}) });
const sign = (index: number, v: VerdictFields, keyIndex = index): OwnVerdict => {
  const message = verdictMessage(v, 9800, ESCROW);
  return { index, verdict: v, message, signature: bytesToHex(mldsa87.sign(pairs[keyIndex]!.secretKey, hexToBytes(message))) as Hex };
};
const asComment = (id: number, o: OwnVerdict, label: "bot" | "human" = "bot") => {
  const b: VerdictBundle = { format: BUNDLE_FORMAT, chainId: 9800, nativeChainId: "qorechain-diana", escrow: ESCROW,
    verdict: o.verdict, message: o.message, signatures: { [o.index]: o.signature } };
  return parseVerdictComments([{ id, user: { login: "x" }, created_at: "", body: formatVerdictComment(b, { signerIndex: o.index, signer: VERIFIERS[o.index]!, kind: label }) }])[0]!;
};
const input = (over: Partial<QuorumInput> = {}): QuorumInput => ({
  id: 7n, bounty, phase: 0, escrow: ESCROW, own: null, comments: [], keys, humans: new Set(), verify, ...over,
});

describe("quorum (initial phase)", () => {
  const v = verdictFor(0);
  it("relays two matching valid signatures from comments", async () => {
    const r = await selectQuorum(input({ comments: [asComment(1, sign(0, v)), asComment(2, sign(2, v))] }));
    expect(r).toMatchObject({ ok: true, quorum: { indices: [0, 2] } });
  });
  it("prefers its own signature", async () => {
    const r = await selectQuorum(input({ own: sign(1, v), comments: [asComment(1, sign(0, v)), asComment(2, sign(2, v))] }));
    expect(r.ok && r.quorum.indices).toContain(1);
  });
  it("does nothing with one signature or with mismatched messages", async () => {
    expect((await selectQuorum(input({ comments: [asComment(1, sign(0, v))] }))).ok).toBe(false);
    const other = verdictFor(1, `0x${"22".repeat(32)}`);
    expect((await selectQuorum(input({ comments: [asComment(1, sign(0, v)), asComment(2, sign(1, other))] }))).ok).toBe(false);
  });
  it("only counts the group of its own verdict when it has one", async () => {
    const other = verdictFor(1, `0x${"22".repeat(32)}`);
    const r = await selectQuorum(input({ own: sign(2, v), comments: [asComment(1, sign(0, other)), asComment(2, sign(1, other))] }));
    expect(r.ok).toBe(false);
  });
  it("rejects a bad signature", async () => {
    const good = sign(0, v);
    const bad = { ...sign(1, v), signature: good.signature };
    const r = await selectQuorum(input({ comments: [asComment(1, good), asComment(2, bad)] }));
    expect(r.ok).toBe(false);
  });
  it("rejects a signature checked against the wrong signer index key", async () => {
    const wrongKey = sign(1, v, 2); // signed with key 2 but claims slot 1
    const r = await selectQuorum(input({ comments: [asComment(1, sign(0, v)), asComment(2, wrongKey)] }));
    expect(r.ok).toBe(false);
  });
  it("ignores verdicts for a stale nonce or another bounty", async () => {
    const stale = { ...v, nonce: 5n };
    const r = await selectQuorum(input({ comments: [asComment(1, sign(0, stale)), asComment(2, sign(1, stale))] }));
    expect(r.ok).toBe(false);
    const wrongBounty = { ...v, bountyId: 8n };
    expect((await selectQuorum(input({ comments: [asComment(1, sign(0, wrongBounty)), asComment(2, sign(1, wrongBounty))] }))).ok).toBe(false);
  });
  it("ignores a non-live verifier key", async () => {
    const r = await selectQuorum(input({ keys: [keys[0]!, null, keys[2]!], comments: [asComment(1, sign(0, v)), asComment(2, sign(1, v))] }));
    expect(r.ok).toBe(false);
  });
  it("refuses a PAY verdict whose payee is not the claimant", async () => {
    const bad = { ...v, payee: "0x" + "9".repeat(40) as `0x${string}` };
    expect((await selectQuorum(input({ comments: [asComment(1, sign(0, bad)), asComment(2, sign(1, bad))] }))).ok).toBe(false);
    expect(zeroAddress).toBeTruthy();
  });
});

describe("quorum (dispute phase)", () => {
  const dBounty = { ...bounty, pendingVerdictHash: `0x${"33".repeat(32)}` as Hex, disputeEvidenceHash: `0x${"44".repeat(32)}` as Hex };
  const dv = assembleVerdict({ bountyId: 7n, bounty: dBounty, phase: 1, outcome: 0, evidenceHash: `0x${"55".repeat(32)}`, payee: PAYEE, mergedAt: 1_700_000_000n });
  const base = (over: Partial<QuorumInput> = {}) => input({ bounty: dBounty, phase: 1, ...over });

  it("does not relay without a human verifier", async () => {
    const r = await selectQuorum(base({ comments: [asComment(1, sign(0, dv)), asComment(2, sign(1, dv))] }));
    expect(r).toEqual({ ok: false, reason: "a dispute needs a human verifier's signature" });
  });
  it("relays when the pair includes a human verifier address", async () => {
    const humans = new Set([VERIFIERS[2]!.toLowerCase()]);
    const r = await selectQuorum(base({ humans, own: sign(0, dv), comments: [asComment(2, sign(2, dv))] }));
    expect(r).toMatchObject({ ok: true, quorum: { indices: [0, 2] } });
  });
  it("includes a human even when two bots would sort first", async () => {
    const humans = new Set([VERIFIERS[2]!.toLowerCase()]);
    const r = await selectQuorum(base({ humans, comments: [asComment(1, sign(0, dv)), asComment(2, sign(1, dv)), asComment(3, sign(2, dv))] }));
    expect(r.ok && r.quorum.indices).toContain(2);
  });
  it("never trusts the comment label: a 'human' comment from a non-human verifier does not count", async () => {
    const humans = new Set([VERIFIERS[2]!.toLowerCase()]);
    const r = await selectQuorum(base({ humans, comments: [asComment(1, sign(0, dv), "human"), asComment(2, sign(1, dv), "human")] }));
    expect(r.ok).toBe(false);
  });
});
