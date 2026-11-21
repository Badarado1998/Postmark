import { useSyncExternalStore } from "react";
import { tryQorToEvm } from "../chain/bech32";
import { sameAddress } from "../chain/address";
import { shortAddr } from "../components/ui";

/** Plain-language block when the QoreX account and the account that must act are different. */
export function accountMismatchMessage(qor1: string | null | undefined, expectedEvm: string | null | undefined) {
  const qorEvm = tryQorToEvm(qor1);
  if (!qorEvm || !expectedEvm || sameAddress(qorEvm, expectedEvm)) return null;
  return `Your wallet and QoreX are on different accounts. Switch MetaMask to ${shortAddr(expectedEvm)} or select the matching account in QoreX.`;
}

const LOCAL_KEY = "pm-use-local-signer";
const listeners = new Set<() => void>();

/** Whether the user chose the advanced local signer over QoreX for this tab. */
export function prefersLocalSigner(): boolean {
  try { return sessionStorage.getItem(LOCAL_KEY) === "1"; } catch { return false; }
}

export function setPrefersLocalSigner(on: boolean) {
  try { if (on) sessionStorage.setItem(LOCAL_KEY, "1"); else sessionStorage.removeItem(LOCAL_KEY); } catch { /* storage blocked */ }
  listeners.forEach((l) => l());
}

export function usePrefersLocalSigner(): boolean {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    prefersLocalSigner, () => false);
}
