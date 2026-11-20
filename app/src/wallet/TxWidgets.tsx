import { formatUnits } from "viem";
import { explorerTx } from "../chain/config";
import type { TxState } from "../hooks/useTxAction";

function MaxFee({ state }: { state: TxState }) {
  if (state.maxFeeWei === undefined) return null;
  return (
    <p className="mt-2 font-mono text-[11px] text-ink-400">
      max fee ≈ {Number(formatUnits(state.maxFeeWei, 18)).toFixed(4)} QOR
      {state.gasLimit !== undefined && ` (gas ≤ ${state.gasLimit.toString()})`}
    </p>
  );
}

export function WindowGuide({ guide }: { guide: NonNullable<TxState["guide"]> }) {
  return (
    <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/5 p-4 text-left text-sm">
      <p className="font-medium text-amber-200">Open an EVM authorisation window in QoreX:</p>
      <ol className="mt-2 list-inside list-decimal space-y-1 font-mono text-xs text-ink-200">
        <li>QoreX → the account this wallet uses</li>
        <li>Authorisations → New EVM window</li>
        <li>Target: <span className="break-all text-paper-100">{guide.target}</span></li>
        <li>Txs: {guide.suggestedTxs} · Cap: {guide.suggestedValueUqor} uqor or more</li>
        <li>Confirm, then retry here</li>
      </ol>
    </div>
  );
}

export function TxStatusPanel({ state }: { state: TxState }) {
  if (state.phase === "idle") return null;
  return (
    <div className="mt-6 rounded-xl border border-white/10 bg-ink-900/60 p-4 text-sm" role="status">
      {state.phase === "blocked" && (
        <>
          <p className="text-amber-300">{state.blockReason}</p>
          {state.guide && <WindowGuide guide={state.guide} />}
        </>
      )}
      {state.phase === "checking" && <p className="text-ink-300">Checking chain, key and window…</p>}
      {state.phase === "simulating" && <p className="text-ink-300">Simulating on diana…</p>}
      {state.phase === "ready" && <p className="text-ink-300">Ready — confirm in the wallet.</p>}
      {state.phase === "wallet" && <p className="text-ink-300">Waiting for the wallet…</p>}
      {(state.phase === "ready" || state.phase === "wallet" || state.phase === "submitted") && <MaxFee state={state} />}
      {state.phase === "submitted" && (
        <p className="text-ink-300">Submitted.{" "}
          <a className="text-vermilion underline underline-offset-4" href={explorerTx(state.hash!)} target="_blank" rel="noreferrer">
            {state.hash!.slice(0, 14)}…
          </a>
        </p>
      )}
      {state.phase === "confirming" && <p className="text-ink-300">Confirming on diana…</p>}
      {state.phase === "confirmed" && (
        <p className="text-emerald-300">Confirmed.{" "}
          <a className="text-vermilion underline underline-offset-4" href={explorerTx(state.hash!)} target="_blank" rel="noreferrer">
            {state.hash!.slice(0, 14)}…
          </a>
        </p>
      )}
      {state.phase === "failed" && <p role="alert" className="text-vermilion">{state.error}</p>}
      {state.error && state.phase === "ready" && <p className="text-amber-300">{state.error}</p>}
    </div>
  );
}
