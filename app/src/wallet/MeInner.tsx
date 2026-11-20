import { Suspense } from "react";
import { Link } from "react-router";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { creditOf } from "../chain/client";
import { getIssue, getPull, type GhIssue, type GhPull } from "../github/client";
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

function WorkRef({ ownerRepo, kind, number }:
  { ownerRepo: string; kind: number; number: bigint }) {
  const n = Number(number);
  const q = useQuery({
    queryKey: ["gh", kind === 1 ? "pull" : "issue", ownerRepo, n],
    queryFn: (): Promise<GhIssue | GhPull> =>
      (kind === 1 ? getPull(ownerRepo, n) : getIssue(ownerRepo, n)),
    staleTime: 5 * 60_000, retry: false,
  });
  return (
    <div className="min-w-0">
      <span className="font-mono text-xs text-ink-300">{ownerRepo}{kind === 1 ? "/pull/" : "#"}{n}</span>
      {q.data?.title && <p className="truncate text-sm text-paper-200">{q.data.title}</p>}
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
            <Link to={`/bounty/${id}`} className="group flex min-w-0 items-center gap-3">
              <span className="font-mono text-vermilion group-hover:underline">#{id.toString()}</span>
              <StatusChip state={bounty.state} />
              {index.data?.metaById.get(id) && <WorkRef {...index.data.metaById.get(id)!} />}
            </Link>
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

function MyClaims() {
  const { address } = useAccount();
  const index = useIndex();
  const ids = index.data?.bountyIds;
  const bounties = useBounties(ids);
  if (!address) return null;
  if (index.isPending || bounties.isPending) return <Skeleton className="h-28" />;
  const me = address.toLowerCase();
  // claim history for this account from Claimed events + current state
  const mine = (bounties.data ?? [])
    .filter((b) => b.bounty && b.bounty.payee.toLowerCase() === me)
    .map((b) => ({
      ...b,
      active: b.bounty!.state === 1 && b.bounty!.claimExpiresAt > BigInt(Math.floor(Date.now() / 1000)),
    }));
  if (mine.length === 0) {
    return <p className="text-sm text-ink-300">No claims yet — claim a bounty from its page.</p>;
  }
  return (
    <ul className="space-y-3">
      {mine.map(({ id, bounty, active }) => bounty && (
        <li key={id.toString()} className="rounded-xl border border-white/10 bg-ink-900/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link to={`/bounty/${id}`} className="group flex min-w-0 items-center gap-3">
              <span className="font-mono text-vermilion group-hover:underline">#{id.toString()}</span>
              <StatusChip state={bounty.state} />
              {index.data?.metaById.get(id) && <WorkRef {...index.data.metaById.get(id)!} />}
            </Link>
            <div className="text-right font-mono text-xs text-ink-300">
              <div>{active ? "expires" : "claim"} <Countdown to={bounty.claimExpiresAt} /></div>
              <div className="text-ink-400">round {bounty.claimRound.toString()}</div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function VerifierBounties() {
  const { address } = useAccount();
  const index = useIndex();
  const ids = index.data?.bountyIds;
  const bounties = useBounties(ids);
  if (!address) return null;
  if (index.isPending || bounties.isPending) return <Skeleton className="h-28" />;
  const me = address.toLowerCase();
  const mine = (bounties.data ?? []).filter(
    (b) => b.bounty && b.bounty.verifiers.some((v) => v.toLowerCase() === me));
  if (mine.length === 0) {
    return <p className="text-sm text-ink-300">You're not a verifier on any bounty.</p>;
  }
  const action = (state: number) =>
    state === 1 ? "review claim" : state === 3 ? "resolve dispute"
    : state === 2 ? "verdict pending" : null;
  return (
    <ul className="space-y-3">
      {mine.map(({ id, bounty }) => bounty && (
        <li key={id.toString()} className="rounded-xl border border-white/10 bg-ink-900/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link to={`/bounty/${id}`} className="group flex min-w-0 items-center gap-3">
              <span className="font-mono text-vermilion group-hover:underline">#{id.toString()}</span>
              <StatusChip state={bounty.state} />
              {index.data?.metaById.get(id) && <WorkRef {...index.data.metaById.get(id)!} />}
            </Link>
            <div className="flex items-center gap-4 text-sm">
              {action(bounty.state)
                ? <Link to={`/bounty/${id}/review`} className="text-vermilion underline underline-offset-4">{action(bounty.state)} →</Link>
                : <span className="font-mono text-xs text-ink-400">nothing due</span>}
            </div>
          </div>
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
      <h2 className="mt-8 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">my claims</h2>
      <div className="mt-3"><MyClaims /></div>
      <h2 className="mt-8 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">verifier</h2>
      <div className="mt-3"><VerifierBounties /></div>
    </div>
  );
}
