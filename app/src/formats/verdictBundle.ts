import { isHex, type Hex } from "viem";
import { type VerdictFields } from "./messages";
import { mldsa87 } from "@qorechain/pqc";

export const BUNDLE_FORMAT = "postmark-verdict-bundle-v1";

export interface VerdictBundle {
  format: string;
  chainId: number;
  nativeChainId: string;
  escrow: `0x${string}`;
  verdict: VerdictFields;
  evidence?: { format: string; fields: Record<string, unknown> };
  message: `0x${string}`;
  signatures: Record<string, `0x${string}`>;
}

const hexField = (v: unknown, name: string): Hex => {
  if (typeof v !== "string" || !isHex(v)) throw new Error(`bundle: ${name} is not hex`);
  return v;
};
const bigField = (v: unknown, name: string): bigint => {
  try { return BigInt(v as string | number); }
  catch { throw new Error(`bundle: ${name} is not a number`); }
};

/** Parse and structurally validate a bundle; throws on anything off. */
export function parseBundle(raw: string | object): VerdictBundle {
  const j = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (j?.format !== BUNDLE_FORMAT) throw new Error("not a postmark-verdict-bundle-v1");
  if (Number(j.chainId) !== 9800) throw new Error(`bundle chainId ${j.chainId} ≠ 9800`);
  if (j.nativeChainId !== "qorechain-diana") throw new Error(`bad nativeChainId`);
  const v = j.verdict ?? {};
  const verdict: VerdictFields = {
    bountyId: bigField(v.bountyId, "bountyId"),
    phase: Number(v.phase), outcome: Number(v.outcome),
    payee: hexField(v.payee ?? "0x0000000000000000000000000000000000000000", "payee") as `0x${string}`,
    mergedAt: bigField(v.mergedAt ?? 0, "mergedAt"),
    evidenceHash: hexField(v.evidenceHash, "evidenceHash"),
    nonce: bigField(v.nonce, "nonce"), claimRound: bigField(v.claimRound, "claimRound"),
    disputedVerdictHash: hexField(
      v.disputedVerdictHash ?? "0x" + "0".repeat(64), "disputedVerdictHash"),
    disputeEvidenceHash: hexField(
      v.disputeEvidenceHash ?? "0x" + "0".repeat(64), "disputeEvidenceHash"),
  };
  if (verdict.phase !== 0 && verdict.phase !== 1) throw new Error("bad phase");
  if (verdict.outcome !== 0 && verdict.outcome !== 1) throw new Error("bad outcome");
  const signatures: Record<string, `0x${string}`> = {};
  for (const [i, s] of Object.entries(j.signatures ?? {})) {
    const idx = Number(i);
    if (!Number.isInteger(idx) || idx < 0 || idx > 2) throw new Error(`bad signer index ${i}`);
    const sig = s as string;
    if (!isHex(sig)) throw new Error(`signature ${i} is not hex`);
    if ((sig.length - 2) / 2 !== 4627) throw new Error(`signature ${i} is not 4627 bytes`);
    signatures[i] = sig as `0x${string}`;
  }
  if (Object.keys(signatures).length === 0) throw new Error("bundle has no signatures");
  const bundle: VerdictBundle = {
    format: BUNDLE_FORMAT, chainId: 9800, nativeChainId: "qorechain-diana",
    escrow: hexField(j.escrow, "escrow") as `0x${string}`,
    verdict, message: hexField(j.message, "message") as `0x${string}`, signatures,
  };
  if (j.evidence?.format) bundle.evidence = { format: j.evidence.format, fields: j.evidence.fields ?? {} };
  return bundle;
}

/** Merge several bundles for the same verdict message into one signature map. */
export function mergeBundles(bundles: VerdictBundle[]): VerdictBundle {
  const [first, ...rest] = bundles;
  if (!first) throw new Error("no bundles");
  for (const b of rest) {
    if (b.message !== first.message) throw new Error("bundles sign different messages");
    if (b.escrow !== first.escrow) throw new Error("bundles target different escrows");
    Object.assign(first.signatures, b.signatures);
  }
  return first;
}

/** Verify each signature in the bundle against the given registered pubkeys
 * (indexed by verifier slot). Returns verified signer indices. */
export async function verifyBundleSignatures(
  bundle: VerdictBundle, pubkeys: (Uint8Array | `0x${string}` | null)[],
): Promise<number[]> {
  const msg = toBytesLocal(bundle.message);
  const ok: number[] = [];
  for (const [i, sig] of Object.entries(bundle.signatures)) {
    const pk = pubkeys[Number(i)];
    if (!pk) continue;
    const key = typeof pk === "string" ? toBytesLocal(pk) : pk;
    if (await mldsa87.verify(key, msg, toBytesLocal(sig))) ok.push(Number(i));
  }
  return ok.sort();
}

export const toBytesLocal = (h: `0x${string}` | Hex): Uint8Array => {
  const s = h.slice(2);
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
};
