import { useState, type ReactNode } from "react";
import { pairingCode, setPairingCode, signerPort, setSignerPort } from "../chain/localSigner";
import { setPrefersLocalSigner, usePrefersLocalSigner } from "./signerPreference";

/** "Advanced: use the local signer" disclosure: terminal signer pairing, kept out of the default flow. */
export function AdvancedSigner({ showPort = false, children }: { showPort?: boolean; children?: ReactNode }) {
  const preferLocal = usePrefersLocalSigner();
  const [pair, setPair] = useState(pairingCode() ?? "");
  const [port, setPort] = useState(String(signerPort()));
  return (
    <details className="mt-3 rounded-lg border border-ink/10 bg-paper/60 p-3 text-xs text-gray">
      <summary className="cursor-pointer font-medium text-charcoal">Advanced: use the local signer</summary>
      <div className="mt-3 space-y-3">
        <p>
          For developers: a small terminal program holds your post-quantum key instead of QoreX.{" "}
          <a href="/signer" className="text-deep underline underline-offset-4">How it works</a>
        </p>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={preferLocal} onChange={(e) => setPrefersLocalSigner(e.target.checked)} />
          Use the local signer instead of QoreX
        </label>
        <div className="flex flex-wrap items-center gap-3 font-mono">
          <label>Pairing code
            <input value={pair} onChange={(e) => { setPair(e.target.value); setPairingCode(e.target.value); }}
              placeholder="8-char code"
              className="ml-2 w-32 rounded border border-ink/10 bg-white px-2 py-1 text-ink" /></label>
          {showPort && (
            <label>port
              <input value={port} onChange={(e) => { setPort(e.target.value); setSignerPort(Number(e.target.value)); }}
                className="ml-2 w-20 rounded border border-ink/10 bg-white px-2 py-1 text-ink" /></label>
          )}
        </div>
        {children}
      </div>
    </details>
  );
}
