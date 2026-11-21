import { useSyncExternalStore } from "react";

/**
 * Whether the visitor has shown any intent to use a wallet this session: they clicked a connect/action
 * button, or wagmi remembers a previous connection. Until then no wallet code (wagmi, QoreX, SDK) loads.
 */
const RECENT_KEY = "wagmi.recentConnectorId";
const listeners = new Set<() => void>();

const hasRecentConnection = () => {
  try { return !!localStorage.getItem(RECENT_KEY); } catch { return false; }
};

let wanted = hasRecentConnection();

export function requestWallet() {
  if (wanted) return;
  wanted = true;
  listeners.forEach((l) => l());
}

export function useWalletWanted(): boolean {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => wanted, () => false);
}

/** Test hook: reset to the stored state. */
export function resetWalletIntent() {
  wanted = hasRecentConnection();
  listeners.forEach((l) => l());
}
