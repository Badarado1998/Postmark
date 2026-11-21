// One-click "Enable transactions": opens an EVM authorisation window through QoreX signAndBroadcast.
// NOTE: written against the documented QoreX native API and the SDK's openEvmWindowMsg; it could not be
// exercised against a real QoreX from CI, so it needs a live test (see the hand-off notes).
import { hasCapability, type QorexNativeProvider, type QorexSignAndBroadcastResult } from "@qorechain/qorex-types";
import { ESCROW_ADDRESS, NATIVE_CHAIN_ID } from "../chain/config";

export const WINDOW_BLOCKS = 2000n;
export const WINDOW_MAX_TXS = 10n;
const UQOR_PER_WEI_DIVISOR = 1_000_000_000_000n; // 1 QOR = 1e18 wei = 1e6 uqor
/** headroom for the maximum fee of every admitted tx (a createBounty can cap near 0.1 QOR) */
export const WINDOW_FEE_MARGIN_UQOR = 300_000n;

export interface WindowRequest {
  sender: string;
  blocks: bigint;
  maxTxs: bigint;
  /** uqor: value PLUS the max fee of every admitted tx */
  maxValue: string;
  allowedTargets: `0x${string}`[];
}

/** Window bounds for an action that sends `neededWei`, scoped to the escrow contract. */
export function windowRequest(sender: string, neededWei: bigint): WindowRequest {
  return {
    sender, blocks: WINDOW_BLOCKS, maxTxs: WINDOW_MAX_TXS,
    maxValue: (neededWei / UQOR_PER_WEI_DIVISOR + WINDOW_FEE_MARGIN_UQOR).toString(),
    allowedTargets: [ESCROW_ADDRESS],
  };
}

export const canEnableTransactions = (native: QorexNativeProvider | null | undefined) =>
  !!native && hasCapability(native, "signAndBroadcast");

/** Encodes MsgOpenEVMWindow with the SDK (lazy-loaded) and hands it to QoreX to sign and broadcast. */
export async function enableTransactions(
  native: QorexNativeProvider, sender: string, neededWei: bigint,
): Promise<QorexSignAndBroadcastResult> {
  const sdk = await import("@qorechain/sdk");
  const req = windowRequest(sender, neededWei);
  const message = sdk.openEvmWindowMsg(req);
  const value = sdk.qorechainRegistry().encode(message);
  await native.enable(NATIVE_CHAIN_ID);
  return native.signAndBroadcast({
    chainId: NATIVE_CHAIN_ID,
    messages: [{ typeUrl: message.typeUrl, value }],
  });
}
