// Pure preflight decisions for a contract write — unit-tested separately.
import type { EvmWindow } from "./window";

export interface PreflightInput {
  connected: boolean;
  chainId: number | undefined;
  pqcLive: boolean | undefined;
  window: EvmWindow | undefined;
  /** wei the tx sends */
  valueWei: bigint;
  /** wei headroom for gas (gasLimit * feeCap) */
  maxFeeWei: bigint;
  escrow: `0x${string}`;
}

export type Preflight =
  | { ok: true }
  | { ok: false; reason: string; guide?: WindowGuide };

export interface WindowGuide {
  target: `0x${string}`;
  suggestedTxs: number;
  suggestedValueUqor: string;
}

const UQOR_PER_WEI = 1_000_000_000_000n; // 1 QOR = 1e18 wei = 1e6 uqor

export function preflightTx(i: PreflightInput): Preflight {
  if (!i.connected) return { ok: false, reason: "Connect an EVM wallet first." };
  if (i.chainId !== 9800) {
    return { ok: false, reason: "Wrong network — switch the wallet to QoreChain diana (chain 9800)." };
  }
  if (i.pqcLive === false) {
    return { ok: false, reason: "This account has no live ML-DSA-87 key registered on diana." };
  }
  const w = i.window;
  const guide: WindowGuide = {
    target: i.escrow,
    suggestedTxs: 10,
    suggestedValueUqor: ((i.valueWei + i.maxFeeWei) / UQOR_PER_WEI + 1n).toString(),
  };
  if (!w?.found || !w.live) {
    return { ok: false, reason: "No open EVM authorisation window.", guide };
  }
  const remainingTxs = BigInt(w.remainingTxs ?? "0");
  if (remainingTxs < 1n) {
    return { ok: false, reason: "The EVM window has no transactions left.", guide };
  }
  const remainingValue = BigInt(w.remainingValue ?? "0");
  if (remainingValue < i.valueWei / UQOR_PER_WEI + i.maxFeeWei / UQOR_PER_WEI) {
    return { ok: false, reason: "The EVM window's remaining value won't cover this transaction.", guide };
  }
  if (w.allowedTargets && w.allowedTargets.length > 0
      && !w.allowedTargets.some((t) => t.toLowerCase() === i.escrow.toLowerCase())) {
    return { ok: false, reason: "The open EVM window is scoped to different targets.", guide };
  }
  return { ok: true };
}
