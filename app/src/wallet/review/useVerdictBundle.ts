import { useState } from "react";
import { useToast } from "../../components/Toasts";
import { parseBundle, mergeBundles, BUNDLE_FORMAT, type VerdictBundle } from "../../formats/verdictBundle";
import { ESCROW_ADDRESS, NATIVE_CHAIN_ID } from "../../chain/config";
import { errorMessage } from "../../chain/errors";
import type { Bounty } from "../../chain/client";
import type { BuiltVerdict } from "../../chain/verdict";
import { bigintToString, sameVerdict, signatureStatuses, type SigStatus } from "./bundleVerify";

export type { SigStatus };

/** The working verdict bundle: persisted locally, signatures verified against live keys, mergeable. */
export function useVerdictBundle(id: bigint, bounty: Bounty, phase: number, built: BuiltVerdict | null) {
  const toast = useToast();
  const storageKey = `pm-verdict-${ESCROW_ADDRESS}-${id}-${bounty.nonce}-${phase}`;
  const [bundle, setBundle] = useState<VerdictBundle | null>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? parseBundle(raw) : null;
    } catch { return null; }
  });
  const [sigStatus, setSigStatus] = useState<Record<number, SigStatus>>({});
  const [importText, setImportText] = useState("");
  const [importErr, setImportErr] = useState<string | null>(null);

  const persist = (b: VerdictBundle | null) => {
    setBundle(b);
    if (b) localStorage.setItem(storageKey, JSON.stringify(b, bigintToString));
    else localStorage.removeItem(storageKey);
  };

  const refreshSigStatus = async (b: VerdictBundle | null) => {
    setSigStatus(Object.fromEntries(Object.keys(b?.signatures ?? {}).map((i) => [i, "pending" as const])));
    setSigStatus(await signatureStatuses(bounty, b));
  };

  /** Add one signature to the working bundle for the current verdict. */
  const recordSignature = (index: number, signature: `0x${string}`) => {
    const b: VerdictBundle = {
      format: BUNDLE_FORMAT, chainId: 9800, nativeChainId: NATIVE_CHAIN_ID,
      escrow: ESCROW_ADDRESS, verdict: built!.verdict, message: built!.message,
      signatures: { ...(bundle?.signatures ?? {}), [index]: signature },
    };
    persist(b);
    void refreshSigStatus(b);
  };

  const importBundle = async () => {
    setImportErr(null);
    try {
      if (!built) throw new Error("Build a decision first — imports must match this exact verdict.");
      const b = parseBundle(importText);
      if (b.escrow.toLowerCase() !== ESCROW_ADDRESS.toLowerCase()) throw new Error("bundle targets a different escrow");
      if (b.message !== built.message) throw new Error("bundle signs different message bytes");
      if (!sameVerdict(b.verdict, built.verdict)) throw new Error("bundle verdict fields differ");
      const dups = Object.keys(b.signatures).filter((i) => bundle?.signatures[i]);
      const merged = mergeBundles([{ ...(bundle ?? b), signatures: { ...(bundle?.signatures ?? {}) } }, b]);
      persist(merged);
      await refreshSigStatus(merged);
      toast({ kind: "info", text: `Bundle merged${dups.length ? ` (duplicate signer index ${dups.join(", ")} ignored)` : ""}.` });
      setImportText("");
    } catch (e) {
      setImportErr(errorMessage(e));
    }
  };

  const bundleJson = bundle ? JSON.stringify(bundle, bigintToString, 2) : "";
  const validIndices = Object.keys(bundle?.signatures ?? {}).map(Number)
    .filter((i) => sigStatus[i] === "valid").sort((a, b) => a - b);

  const download = () => {
    const blob = new Blob([bundleJson], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `postmark-verdict-${id}-${bounty.nonce}-${phase}.json`;
    a.click(); URL.revokeObjectURL(a.href);
  };

  return {
    bundle, bundleJson, sigStatus, validIndices, importText, setImportText, importErr,
    persist, recordSignature, importBundle, download,
  };
}
