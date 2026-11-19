import {
  discoverQorexEip1193, getQorexNative, hasCapability,
  isQorexInstalled, type QorexEip1193Provider, type QorexNativeProvider,
  type QorexAccountSummary,
} from "@qorechain/qorex-types";
import { useEffect, useState } from "react";

export interface QorexState {
  installed: boolean;
  eip1193: QorexEip1193Provider | null;
  native: QorexNativeProvider | null;
  accounts: QorexAccountSummary[];
  /** qor1 address of the active native account, when connectable */
  qorAddress: string | null;
  /** QoreX can send EVM txs today (false on current builds; flips itself). */
  evmCanSend: boolean;
  /** QoreX can PQ-sign arbitrary messages (planned; false today). */
  canSignArbitrary: boolean;
}

const IDLE: QorexState = {
  installed: false, eip1193: null, native: null,
  accounts: [], qorAddress: null, evmCanSend: false, canSignArbitrary: false,
};

/** Probe QoreX once per mount; capability-driven, so new features light up alone. */
export function useQorex(): QorexState {
  const [state, setState] = useState<QorexState>(IDLE);
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!isQorexInstalled()) { if (alive) setState(IDLE); return; }
      const [eip1193, native] = [
        await discoverQorexEip1193().catch(() => undefined) ?? null,
        getQorexNative() ?? null,
      ];
      let accounts: QorexAccountSummary[] = [];
      let qorAddress: string | null = null;
      if (native && hasCapability(native, "listAccounts")) {
        try {
          const r = await native.listAccounts();
          accounts = r.accounts;
          qorAddress = r.accounts[r.activeIndex]?.address ?? null;
        } catch { /* site not connected yet — identity stays empty */ }
      }
      // Switch on automatically the day QoreX ships these.
      const evmCanSend = native != null && (
        hasCapability(native, "evmTransactions")
        || hasCapability(native, "signAndSendEip1559"));
      const canSignArbitrary = native != null && (
        hasCapability(native, "signArbitrary")
        || hasCapability(native, "messageSigningV1"));
      if (alive) setState({ installed: true, eip1193, native, accounts, qorAddress,
        evmCanSend, canSignArbitrary });
    })();
    return () => { alive = false; };
  }, []);
  return state;
}
