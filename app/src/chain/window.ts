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
  return { found: Boolean(w && (w.opened_height || w.openedHeight)), live: Boolean(w?.live), ...w };
}
