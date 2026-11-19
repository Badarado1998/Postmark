import { describe, it, expect } from "vitest";
import { mldsa87 } from "@qorechain/pqc";
import { parseBundle, mergeBundles, verifyBundleSignatures, BUNDLE_FORMAT } from "../src/formats/verdictBundle";
import { verdictMessage } from "../src/formats/messages";

const escrow = "0xb781E296FB35ccd2497589526114373bA0bff79b" as const;
const hex = (u: Uint8Array) => "0x" + [...u].map((b) => b.toString(16).padStart(2, "0")).join("");

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
});
