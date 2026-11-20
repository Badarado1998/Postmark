// PQ signing abstraction: the local signer today, QoreX signArbitrary
// automatically once the capability ships. ML-DSA-87 secrets never touch the app.
import type { QorexNativeProvider } from "@qorechain/qorex-types";
import { NATIVE_CHAIN_ID } from "../chain/config";
import { signClaim as localSignClaim, SignerError } from "../chain/localSigner";
import { hexToBytes, type Hex } from "viem";

export interface ClaimSignRequest {
  bountyId: bigint;
  identityHash: Hex;
  claimRound: bigint;
  /** the exact message bytes the signature must cover (verified locally too) */
  message: `0x${string}`;
}

export interface PqSigner {
  id: "local" | "qorex";
  label: string;
  sign(req: ClaimSignRequest): Promise<`0x${string}`>;
}

export const localSigner: PqSigner = {
  id: "local",
  label: "Local signer (127.0.0.1:47321)",
  async sign(req) {
    const out = await localSignClaim({
      bountyId: req.bountyId, identityHash: req.identityHash, claimRound: req.claimRound,
    });
    return out.signature;
  },
};

export function qorexSigner(native: QorexNativeProvider, qor1: string): PqSigner {
  return {
    id: "qorex",
    label: `QoreX signArbitrary (${qor1})`,
    async sign(req) {
      const res = await native.signArbitrary(
        NATIVE_CHAIN_ID, qor1, hexToBytes(req.message)) as unknown as
        { pq?: { signature?: string }; signature?: string };
      const sig = res?.pq?.signature ?? res?.signature;
      if (!sig) throw new Error("QoreX returned no PQ signature.");
      return (sig.startsWith("0x") ? sig : `0x${sig}`) as `0x${string}`;
    },
  };
}

export { SignerError };
