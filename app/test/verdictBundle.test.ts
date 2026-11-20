import { describe, it, expect } from "vitest";
import { mldsa87 } from "@qorechain/pqc";
import { parseBundle, mergeBundles, verifyBundleSignatures, BUNDLE_FORMAT } from "../src/formats/verdictBundle";
import { verdictMessage } from "../src/formats/messages";

const escrow = "0xb781E296FB35ccd2497589526114373bA0bff79b" as const;
const hex = (u: Uint8Array): `0x${string}` =>
  ("0x" + [...u].map((b) => b.toString(16).padStart(2, "0")).join("")) as `0x${string}`;

const verdict = {
  bountyId: 1n, phase: 0, outcome: 0,
  payee: "0x478f2a08a81be7cea42bd34bd6900593fa56c4b6" as `0x${string}`,
  mergedAt: 1700000000n,
  evidenceHash: ("0x" + "11".repeat(32)) as `0x${string}`,
  nonce: 0n, claimRound: 1n,
  disputedVerdictHash: ("0x" + "0".repeat(64)) as `0x${string}`,
  disputeEvidenceHash: ("0x" + "0".repeat(64)) as `0x${string}`,
};

describe("verdict bundle", () => {
  it("rejects bad input", () => {
    expect(() => parseBundle("{}")).toThrow(/bundle-v1/);
    expect(() => parseBundle({ format: BUNDLE_FORMAT, chainId: 1 })).toThrow();
  });
  it("verifies real ML-DSA-87 signatures", async () => {
    const k0 = mldsa87.keygen(new Uint8Array(32).fill(1));
    const k1 = mldsa87.keygen(new Uint8Array(32).fill(2));
    const msgHex = verdictMessage(verdict, 9800, escrow);
    const msg = Uint8Array.from(Buffer.from(msgHex.slice(2), "hex"));
    const sig0 = await mldsa87.sign(k0.secretKey, msg);
    const sig1 = await mldsa87.sign(k1.secretKey, msg);
    const b = {
      format: BUNDLE_FORMAT, chainId: 9800, nativeChainId: "qorechain-diana", escrow,
      verdict: { ...verdict,
        bountyId: "1", mergedAt: "1700000000", nonce: "0", claimRound: "1" },
      message: msgHex,
      signatures: { "0": hex(sig0) },
    };
    const parsed = parseBundle(b);
    const b2 = parseBundle({ ...b, signatures: { "2": hex(sig1) } });
    const merged = mergeBundles([structuredClone(parsed), b2]);
    expect(Object.keys(merged.signatures).sort()).toEqual(["0", "2"]);
    const ok = await verifyBundleSignatures(merged,
      [k0.publicKey, k1.publicKey, null]);
    expect(ok).toEqual([0]); // index 2 has no registered key supplied
  });

  const keys = [1, 2, 3].map((n) => mldsa87.keygen(new Uint8Array(32).fill(n)));
  const pubkeys = keys.map((k) => k.publicKey);
  const sign = async (k: (typeof keys)[number], msg: Uint8Array) =>
    hex(await mldsa87.sign(k.secretKey, msg));
  const bundleFor = async (v: typeof verdict, sigs: Record<string, `0x${string}`>,
    message = verdictMessage(v, 9800, escrow)) =>
    parseBundle({
      format: BUNDLE_FORMAT, chainId: 9800, nativeChainId: "qorechain-diana", escrow,
      verdict: { ...v, bountyId: v.bountyId.toString(), mergedAt: v.mergedAt.toString(),
        nonce: v.nonce.toString(), claimRound: v.claimRound.toString() },
      message, signatures: sigs,
    });

  it("a signature over a different message is invalid", async () => {
    const msg = Uint8Array.from(Buffer.from(verdictMessage(verdict, 9800, escrow).slice(2), "hex"));
    const other = Uint8Array.from(Buffer.from(
      verdictMessage({ ...verdict, claimRound: 99n }, 9800, escrow).slice(2), "hex"));
    const b = await bundleFor(verdict, {
      "0": await sign(keys[0]!, other),   // signed wrong bytes
      "1": await sign(keys[1]!, msg),
    });
    expect(await verifyBundleSignatures(b, pubkeys)).toEqual([1]);
    // fewer than 2 valid → submit stays disabled in the UI
  });

  it("a signature under the wrong verifier index fails", async () => {
    const msg = Uint8Array.from(Buffer.from(verdictMessage(verdict, 9800, escrow).slice(2), "hex"));
    const b = await bundleFor(verdict, {
      "0": await sign(keys[2]!, msg),   // index 0 but verifier 2's key
      "1": await sign(keys[1]!, msg),
    });
    expect(await verifyBundleSignatures(b, pubkeys)).toEqual([1]);
  });

  it("duplicate signer index cannot reach quorum", async () => {
    const msg = Uint8Array.from(Buffer.from(verdictMessage(verdict, 9800, escrow).slice(2), "hex"));
    const b0 = await bundleFor(verdict, { "0": await sign(keys[0]!, msg) });
    const b1 = await bundleFor(verdict, { "0": await sign(keys[0]!, msg) });
    const merged = mergeBundles([structuredClone(b0), b1]);
    expect(Object.keys(merged.signatures)).toEqual(["0"]);
    expect(await verifyBundleSignatures(merged, pubkeys)).toEqual([0]);
    expect((await verifyBundleSignatures(merged, pubkeys)).length).toBeLessThan(2);
  });

  it("merge refuses bundles that sign different messages or escrows", async () => {
    const msg = Uint8Array.from(Buffer.from(verdictMessage(verdict, 9800, escrow).slice(2), "hex"));
    const b0 = await bundleFor(verdict, { "0": await sign(keys[0]!, msg) });
    const other = await bundleFor({ ...verdict, nonce: 9n },
      { "1": await sign(keys[1]!, msg) });
    expect(() => mergeBundles([structuredClone(b0), other])).toThrow(/different messages/);
    const otherEscrow = await bundleFor(verdict, { "1": await sign(keys[1]!, msg) });
    otherEscrow.escrow = "0x0000000000000000000000000000000000000001";
    expect(() => mergeBundles([structuredClone(b0), otherEscrow])).toThrow(/different escrows/);
  });
});
