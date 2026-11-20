import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useBounties, useIndex } from "../hooks/queries";
import { StatusChip, Countdown, Qor, Skeleton, EmptyState, ErrorState, STATE_NAMES } from "../components/ui";
import { explainError } from "../chain/errors";
import { githubItemLabel, githubItemUrl } from "../github/parse";

const FILTERS = ["all", ...STATE_NAMES] as const;

export default function Explore() {
  const index = useIndex();
  const ids = index.data?.bountyIds;
  const bounties = useBounties(ids);
  const [status, setStatus] = useState<(typeof FILTERS)[number]>("all");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const out = [];
    for (const { id, bounty } of bounties.data ?? []) {
      if (!bounty) continue;
      const meta = index.data?.metaById.get(id);
      if (status !== "all" && STATE_NAMES[bounty.state] !== status) continue;
      if (q && !meta?.ownerRepo.includes(q.toLowerCase()) &&
          !String(meta?.number ?? "").includes(q.trim())) continue;
      out.push({ id, bounty, meta });
    }
    return out;
  }, [bounties.data, index.data, status, q]);

  const loading = index.isPending || (ids !== undefined && ids.length > 0 && bounties.isPending);
  const error = index.error ?? bounties.error;

  return (
    <div className="py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-sans text-4xl font-semibold text-ink">Bounties</h1>
          <p className="mt-2 text-sm text-gray">
            GitHub issues funded in test QOR on diana.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="owner/repo or #"
            className="rounded-lg border border-ink/10 bg-white px-3 py-1.5 font-mono text-sm text-ink placeholder:text-gray focus:outline-none focus:ring-1 focus:ring-deep" />
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setStatus(f)}
              className={`rounded-full border px-3 py-1 text-xs capitalize transition ${
                status === f ? "border-salmon bg-salmon/15 text-deep"
                  : "border-ink/10 text-gray hover:text-ink"}`}>
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
            <p>The first stamp hasn't landed. <Link to="/create" className="text-deep underline underline-offset-4">Fund a GitHub issue</Link> — payouts are test QOR, no monetary value.</p>
          </EmptyState>
        )}
        {rows.map(({ id, bounty, meta }) => {
          return (
            <Link key={id.toString()} to={`/bounty/${id}`}
              className="block rounded-xl border border-ink/10 bg-white/70 p-5 transition hover:border-salmon/40 hover:bg-white focus-visible:outline-2 focus-visible:outline-deep">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-gray">#{id.toString()}</span>
                  <StatusChip state={bounty.state} />
                  {meta?.workHashMismatch && (
                    <span className="text-xs text-deep" title="On-chain workHash does not match the emitted metadata">⚠ hash mismatch</span>
                  )}
                </div>
                <Qor wei={bounty.amount + bounty.challengeReward} className="font-mono text-sm text-ink" />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
                {meta ? (
                  <a className="font-mono text-ink hover:text-deep"
                    href={githubItemUrl(meta)}
                    target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                    {githubItemLabel(meta)}
                  </a>
                ) : <span className="text-gray">work reference unavailable</span>}
                <span className="text-gray">
                  deadline <Countdown to={bounty.deadline} className="text-ink" />
                </span>
                {bounty.state === 1 && bounty.claimExpiresAt > 0n && (
                  <span className="text-gray">
                    claim expires <Countdown to={bounty.claimExpiresAt} className="text-ink" />
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
