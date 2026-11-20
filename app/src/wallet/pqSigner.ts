// PQ signing abstraction: the local signer today, QoreX signArbitrary
// automatically once the capability ships. ML-DSA-87 secrets never touch the app.
import type { QorexNativeProvider } from "@qorechain/qorex-types";
import { NATIVE_CHAIN_ID } from "../chain/config";
import { signClaim as localSignClaim, signVerdict as localSignVerdict,
  signerUrl, SignerError } from "../chain/localSigner";
import { hexToBytes, type Hex } from "viem";
import type { VerdictFields } from "../formats/messages";
import type { QorexState } from "./qorex";

export interface ClaimSignRequest {
  bountyId: bigint;
  identityHash: Hex;
  claimRound: bigint;
  /** the exact message bytes the signature must cover (verified locally too) */
  message: `0x${string}`;
}

export interface VerdictSignRequest {
  verdict: VerdictFields;
  /** the exact message bytes the signature must cover (verified locally too) */
  message: `0x${string}`;
}

export interface PqSigner {
  id: "local" | "qorex";
  label: string;
  sign(req: ClaimSignRequest): Promise<`0x${string}`>;
  signVerdict(req: VerdictSignRequest): Promise<`0x${string}`>;
}

async function qorexSign(native: QorexNativeProvider, qor1: string, message: `0x${string}`) {
  const res = await native.signArbitrary(
    NATIVE_CHAIN_ID, qor1, hexToBytes(message)) as unknown as
    { pq?: { signature?: string }; signature?: string };
  const sig = res?.pq?.signature ?? res?.signature;
  if (!sig) throw new Error("QoreX returned no PQ signature.");
  return (sig.startsWith("0x") ? sig : `0x${sig}`) as `0x${string}`;
}

export const localSigner: PqSigner = {
  id: "local",
  get label() { return `Local signer (${signerUrl()})`; },
  async sign(req) {
    const out = await localSignClaim({
      bountyId: req.bountyId, identityHash: req.identityHash, claimRound: req.claimRound,
    });
    return out.signature;
  },
  async signVerdict(req) {
    const out = await localSignVerdict(req.verdict);
    return out.signature;
  },
};

export function qorexSigner(native: QorexNativeProvider, qor1: string): PqSigner {
  return {
    id: "qorex",
    label: `QoreX signArbitrary (${qor1})`,
    sign: (req) => qorexSign(native, qor1, req.message),
    signVerdict: (req) => qorexSign(native, qor1, req.message),
  };
}

/** QoreX when it can sign arbitrary messages for the active account, else the local signer. */
export function pickSigner(qorex: QorexState): PqSigner {
  return qorex.canSignArbitrary && qorex.native && qorex.qorAddress
    ? qorexSigner(qorex.native, qorex.qorAddress) : localSigner;
}

export { SignerError };
