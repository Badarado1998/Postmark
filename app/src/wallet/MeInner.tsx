import { Suspense } from "react";
import { Link } from "react-router";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { creditOf } from "../chain/client";
import { useIndex, useBounties } from "../hooks/queries";
import { StatusChip, Qor, Countdown, shortAddr, Skeleton } from "../components/ui";
import { useTxAction } from "../hooks/useTxAction";
import { useToast } from "../components/Toasts";
import { usePqcStatus } from "../hooks/queries";
import { TxStatusPanel } from "./TxWidgets";
import TxActions from "./TxActions";

function Credits() {
  const { address } = useAccount();
  const credits = useQuery({
    queryKey: ["credits", address],
    queryFn: () => creditOf(address!),
    enabled: !!address, staleTime: 15_000,
  });
  const pqc = usePqcStatus(address);
  const tx = useTxAction();
  const toast = useToast();
  const busy = ["checking","simulating","wallet","submitted","confirming"].includes(tx.state.phase);
  if (!address) return null;
  if (credits.isPending) return <Skeleton className="h-28" />;
  const [ungated, gated] = credits.data ?? [0n, 0n];
  if (ungated === 0n && gated === 0n) {
    return <p className="text-sm text-ink-300">No credits yet.</p>;
  }
  return (
    <div className="rounded-xl border border-white/10 bg-ink-900/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-8">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">ungated</div>
            <Qor wei={ungated} />
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">payee-gated</div>
            <Qor wei={gated} />
          </div>
        </div>
        <button disabled={busy || (ungated === 0n && gated === 0n)}
          onClick={() => void tx.run({ functionName: "withdraw", args: [],
            onConfirmed: () => toast({ kind: "info", text: "Withdrawn." }) })}
          className="rounded-lg bg-vermilion px-5 py-2 text-sm font-medium text-ink-950 hover:brightness-110 disabled:opacity-40">
          Withdraw
        </button>
      </div>
      {gated > 0n && (
        <p className="mt-3 text-xs text-ink-400">
          Payee-gated credit withdraws only while your ML-DSA-87 key is live.
          {pqc.data && !pqc.data.live && " Yours is not registered — withdrawals will revert."}
        </p>
      )}
      <TxStatusPanel state={tx.state} />
    </div>
  );
}

function FundedBounties() {
  const { address } = useAccount();
  const index = useIndex();
  const ids = index.data?.bountyIds;
  const bounties = useBounties(ids);
  if (!address) return null;
  if (index.isPending || bounties.isPending) return <Skeleton className="h-40" />;
  const mine = (bounties.data ?? []).filter(
    (b) => b.bounty && b.bounty.funder.toLowerCase() === address.toLowerCase());
  if (mine.length === 0) {
    return <p className="text-sm text-ink-300">You haven't funded a bounty yet. <Link className="text-vermilion underline" to="/create">Fund one.</Link></p>;
  }
  return (
    <ul className="space-y-3">
      {mine.map(({ id, bounty }) => bounty && (
        <li key={id.toString()} className="rounded-xl border border-white/10 bg-ink-900/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Link to={`/bounty/${id}`} className="font-mono text-vermilion hover:underline">#{id.toString()}</Link>
              <StatusChip state={bounty.state} />
            </div>
            <div className="flex items-center gap-4 text-sm text-ink-300">
              <Qor wei={bounty.amount} />
              <span className="font-mono text-xs">deadline <Countdown to={bounty.deadline} /></span>
            </div>
          </div>
          <Suspense fallback={null}>
            <TxActions id={id} bounty={bounty} />
          </Suspense>
        </li>
      ))}
    </ul>
  );
}

export default function MeInner() {
  const { address, isConnected } = useAccount();
  if (!isConnected || !address) {
    return (
      <div className="py-16 text-center">
        <h1 className="font-serif text-4xl font-semibold text-paper-100">My bounties</h1>
        <p className="mt-4 text-ink-300">Connect an EVM wallet to see your funded bounties and credits.</p>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-3xl py-10">
      <h1 className="font-serif text-4xl font-semibold text-paper-100">My bounties</h1>
      <p className="mt-1 font-mono text-sm text-ink-400">{shortAddr(address)}</p>
      <h2 className="mt-8 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">credits</h2>
      <div className="mt-3"><Credits /></div>
      <h2 className="mt-8 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">funded</h2>
      <div className="mt-3"><FundedBounties /></div>
    </div>
  );
}
