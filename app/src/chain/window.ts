import { REST } from "./config";
import { evmToQor } from "./bech32";

export interface EvmWindow {
  found: boolean;
  live: boolean;
  openedHeight?: string;
  expiryHeight?: string;
  maxTxs?: string;
  usedTxs?: string;
  maxValue?: string;
  usedValue?: string;
  remainingBlocks?: string;
  remainingTxs?: string;
  remainingValue?: string;
  nativeOnly?: boolean;
  allowedTargets?: string[];
}

/** REST /qorechain/pqc/v1/evm_window/{qor1}; accepts 0x too. */
export async function fetchEvmWindow(addr: string): Promise<EvmWindow> {
  const qor = addr.startsWith("0x") ? evmToQor(addr) : addr;
  const res = await fetch(`${REST}/qorechain/pqc/v1/evm_window/${qor}`);
  if (!res.ok) throw new Error(`evm_window REST ${res.status}`);
  const j = await res.json();
  const w = j.window ?? j;
  // REST keys are snake_case; normalize to camelCase
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pick = (a: any, b: any) => a ?? b;
  return {
    found: Boolean(w && (w.opened_height || w.openedHeight)),
    live: Boolean(w?.live),
    openedHeight: pick(w.openedHeight, w.opened_height),
    expiryHeight: pick(w.expiryHeight, w.expiry_height),
    maxTxs: pick(w.maxTxs, w.max_txs),
    usedTxs: pick(w.usedTxs, w.used_txs),
    maxValue: pick(w.maxValue, w.max_value),
    usedValue: pick(w.usedValue, w.used_value),
    remainingBlocks: pick(w.remainingBlocks, w.remaining_blocks),
    remainingTxs: pick(w.remainingTxs, w.remaining_txs),
    remainingValue: pick(w.remainingValue, w.remaining_value),
    nativeOnly: Boolean(pick(w.nativeOnly, w.native_only)),
    allowedTargets: pick(w.allowedTargets, w.allowed_targets),
  };
}
