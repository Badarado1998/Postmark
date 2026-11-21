import {
  discoverQorexEip1193, getQorexNative, hasCapability,
  isQorexInstalled, type QorexEip1193Provider, type QorexNativeProvider,
  type QorexAccountSummary,
} from "@qorechain/qorex-types";
import { useEffect, useSyncExternalStore } from "react";
import { NATIVE_CHAIN_ID } from "../chain/config";

export interface QorexState {
  installed: boolean;
  eip1193: QorexEip1193Provider | null;
  native: QorexNativeProvider | null;
  accounts: QorexAccountSummary[];
  /** qor1 address of the active native account, once the user has linked QoreX to this site */
  qorAddress: string | null;
  /** QoreX can send EVM txs today (false on current builds; flips itself). */
  evmCanSend: boolean;
  /** QoreX can PQ-sign arbitrary messages (a capability read; needs no account). */
  canSignArbitrary: boolean;
  /** Interactive (user-click only): asks QoreX to connect this site, then reads the active account. */
  connectAccount: () => Promise<void>;
}

const LINKED_KEY = "pm-qorex-linked";
type Data = Omit<QorexState, "connectAccount">;
const IDLE_DATA: Data = {
  installed: false, eip1193: null, native: null,
  accounts: [], qorAddress: null, evmCanSend: false, canSignArbitrary: false,
};

let data: Data = IDLE_DATA;
let started = false;
const listeners = new Set<() => void>();
const publish = (next: Data) => { data = next; snapshot = { ...data, connectAccount }; listeners.forEach((l) => l()); };

const wasLinked = () => { try { return localStorage.getItem(LINKED_KEY) === "1"; } catch { return false; } };
const setLinked = (on: boolean) => { try { if (on) localStorage.setItem(LINKED_KEY, "1"); else localStorage.removeItem(LINKED_KEY); } catch { /* storage blocked */ } };

async function readAccounts(native: QorexNativeProvider) {
  const r = await native.listAccounts();
  return { accounts: r.accounts, qorAddress: r.accounts[r.activeIndex]?.address ?? null };
}

/** The user clicked something that needs the QoreX account: this is the only place that may prompt. */
async function connectAccount(): Promise<void> {
  const native = data.native;
  if (!native) throw new Error("QoreX is not installed.");
  try {
    await native.enable(NATIVE_CHAIN_ID);
    const acct = await readAccounts(native);
    setLinked(true);
    publish({ ...data, ...acct });
  } catch (e) {
    setLinked(false);
    throw e;
  }
}

let snapshot: QorexState = { ...IDLE_DATA, connectAccount };

/** Reads capabilities (no prompt). The account is read silently only if the user linked QoreX before. */
async function start() {
  if (started) return;
  started = true;
  if (!isQorexInstalled()) return;
  const [eip1193, native] = [
    await discoverQorexEip1193().catch(() => undefined) ?? null,
    getQorexNative() ?? null,
  ];
  const evmCanSend = native != null && (hasCapability(native, "evmTransactions") || hasCapability(native, "signAndSendEip1559"));
  const canSignArbitrary = native != null && (hasCapability(native, "signArbitrary") || hasCapability(native, "messageSigningV1"));
  publish({ ...IDLE_DATA, installed: true, eip1193, native, evmCanSend, canSignArbitrary });
  if (native && wasLinked() && hasCapability(native, "listAccounts")) {
    try { publish({ ...data, ...(await readAccounts(native)) }); }
    catch { setLinked(false); }
  }
}

/** Latest state outside React (after an interactive connect). */
export const getQorexSnapshot = (): QorexState => snapshot;

/** Test hook: forget the probe so the next mount starts again. */
export function resetQorexProbe() { started = false; data = IDLE_DATA; snapshot = { ...IDLE_DATA, connectAccount }; }

export function useQorex(): QorexState {
  useEffect(() => { void start(); }, []);
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => snapshot, () => snapshot);
}
