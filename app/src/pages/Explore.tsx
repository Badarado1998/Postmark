import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useBounties, useIndex } from "../hooks/queries";
import { StatusChip, Countdown, Qor, Skeleton, EmptyState, ErrorState, STATE_NAMES } from "../components/ui";
import { explainError } from "../chain/errors";

const FILTERS = ["all", ...STATE_NAMES] as const;

export default function Explore() {
  const index = useIndex();
  const ids = index.data?.bountyIds;
  const bounties = useBounties(ids);
  const [status, setStatus] = useState<(typeof FILTERS)[number]>("all");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    if (!bounties.data) return [];
    return bounties.data.filter(({ id, bounty }) => {
      if (!bounty) return false;
      const meta = index.data?.metaById.get(id);
      if (status !== "all" && STATE_NAMES[bounty.state] !== status) return false;
      if (q && !meta?.ownerRepo.includes(q.toLowerCase()) &&
          !String(meta?.number ?? "").includes(q.trim())) return false;
      return true;
    });
  }, [bounties.data, index.data, status, q]);

  const loading = index.isPending || (ids !== undefined && ids.length > 0 && bounties.isPending);
  const error = index.error ?? bounties.error;

  return (
    <div className="py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl font-semibold text-paper-100">Bounties</h1>
          <p className="mt-2 text-sm text-ink-300">
            GitHub issues funded in test QOR on diana.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="owner/repo or #"
            className="rounded-lg border border-white/10 bg-ink-900 px-3 py-1.5 font-mono text-sm text-paper-100 placeholder:text-ink-500 focus:outline-none focus:ring-1 focus:ring-vermilion" />
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setStatus(f)}
              className={`rounded-full border px-3 py-1 text-xs capitalize transition ${
                status === f ? "border-vermilion bg-vermilion/15 text-vermilion"
                  : "border-white/10 text-ink-300 hover:text-paper-200"}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 space-y-3">
        {loading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}
        {error && <ErrorState message={explainError(error)} onRetry={() => { void index.refetch(); void bounties.refetch(); }} />}
        {!loading && !error && rows.length === 0 && (
          <EmptyState title={ids && ids.length > 0 ? "Nothing matches those filters." : "No bounties yet."}>
            <p>The first stamp hasn't landed. <Link to="/create" className="text-vermilion underline underline-offset-4">Fund a GitHub issue</Link> — payouts are test QOR, no monetary value.</p>
          </EmptyState>
        )}
        {rows.map(({ id, bounty }) => {
          const meta = index.data?.metaById.get(id);
          return (
            <Link key={id.toString()} to={`/bounty/${id}`}
              className="block rounded-xl border border-white/8 bg-ink-900/60 p-5 transition hover:border-vermilion/40 hover:bg-ink-900 focus-visible:outline-2 focus-visible:outline-vermilion">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-ink-400">#{id.toString()}</span>
                  <StatusChip state={bounty!.state} />
                  {meta?.workHashMismatch && (
                    <span className="text-xs text-vermilion" title="On-chain workHash does not match the emitted metadata">⚠ hash mismatch</span>
                  )}
                </div>
                <Qor wei={bounty!.amount + bounty!.challengeReward} className="font-mono text-sm text-paper-100" />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
                {meta ? (
                  <a className="font-mono text-paper-200 hover:text-vermilion"
                    href={`https://github.com/${meta.ownerRepo}/${meta.kind === 1 ? "pull" : "issues"}/${meta.number}`}
                    target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                    {meta.ownerRepo}{meta.kind === 1 ? "/pull/" : "#"}{meta.number.toString()}
                  </a>
                ) : <span className="text-ink-400">work reference unavailable</span>}
                <span className="text-ink-300">
                  deadline <Countdown to={bounty!.deadline} className="text-paper-200" />
                </span>
                {bounty!.state === 1 && bounty!.claimExpiresAt > 0n && (
                  <span className="text-ink-300">
                    claim expires <Countdown to={bounty!.claimExpiresAt} className="text-paper-200" />
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
