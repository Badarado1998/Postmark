import { useAccount } from "wagmi";
import WalletRoot from "./WalletRoot";
import { useTxAction } from "../hooks/useTxAction";
import { useToast } from "../components/Toasts";
import type { Bounty } from "../chain/client";

const now = () => BigInt(Math.floor(Date.now() / 1000));

function ActionButton({ label, run, busy }:
  { label: string; run: () => void; busy: boolean }) {
  return (
    <button onClick={run} disabled={busy}
      className="rounded-lg border border-vermilion/50 px-4 py-2 text-sm font-medium text-vermilion transition hover:bg-vermilion/10 disabled:cursor-not-allowed disabled:opacity-40">
      {label}
    </button>
  );
}

function ActionsInner({ id, bounty }: { id: bigint; bounty: Bounty }) {
  const { address } = useAccount();
  const tx = useTxAction();
  const toast = useToast();
  const busy = ["checking", "simulating", "wallet", "submitted", "confirming"].includes(tx.state.phase);
  const t = now();
  const isFunder = !!address && address.toLowerCase() === bounty.funder.toLowerCase();

  const refund = isFunder && (bounty.state === 0 || bounty.state === 1) && t >= bounty.deadline;
  const finalize = bounty.state === 2 && bounty.challengeEndsAt > 0n && t >= bounty.challengeEndsAt;
  const reopen = bounty.state === 1 && bounty.claimExpiresAt > 0n && t >= bounty.claimExpiresAt;

  const done = () => {
    toast({ kind: "info", text: "Transaction confirmed." });
  };

  if (!refund && !finalize && !reopen) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-ink-900/60 p-5">
      <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">actions</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {refund && <ActionButton busy={busy} label="Refund expired bounty"
          run={() => void tx.run({ functionName: "refundExpired", args: [id], onConfirmed: done })} />}
        {finalize && <ActionButton busy={busy} label="Finalize payout"
          run={() => void tx.run({ functionName: "finalize", args: [id], onConfirmed: done })} />}
        {reopen && <ActionButton busy={busy} label="Reopen expired claim"
          run={() => void tx.run({ functionName: "reopen", args: [id], onConfirmed: done })} />}
      </div>
      <TxPanel state={tx.state} />
    </div>
  );
}

import { TxStatusPanel as TxPanel } from "./TxWidgets";

export default function TxActions(props: { id: bigint; bounty: Bounty }) {
  return <WalletRoot><Gate {...props} /></WalletRoot>;
}

function Gate(props: { id: bigint; bounty: Bounty }) {
  const { isConnected } = useAccount();
  if (!isConnected) return null;
  return <ActionsInner {...props} />;
}
