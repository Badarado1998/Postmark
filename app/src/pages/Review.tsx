import { lazy, Suspense } from "react";
import { Link } from "react-router";
import { useBountyRoute } from "../hooks/useBountyRoute";
import { StatusChip, Skeleton, ErrorState, EmptyState } from "../components/ui";
import { explainError } from "../chain/errors";
import { githubItemLabel } from "../github/parse";

const STEPS = ["Identity", "PR checks", "Verdict", "Sign", "Merge & submit"];

const ReviewPanel = lazy(() => import("../wallet/ReviewPanel"));

export default function Review() {
  const { id, bounty, meta, notFound, loading } = useBountyRoute();

  if (id === undefined) {
    return <EmptyState title="Bad bounty id."><Link className="text-deep underline" to="/explore">Back to explore</Link></EmptyState>;
  }

  return (
    <div className="-mx-4 pb-4">
      <header className="border-b border-ink/10 bg-leaf/25 px-4 py-8">
        <div className="mx-auto max-w-4xl">
          <Link to={`/bounty/${id}`} className="text-sm text-charcoal hover:text-ink">← bounty</Link>
          {bounty.data && meta && !notFound && (
            <>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <h1 className="font-sans text-3xl font-semibold tracking-tight text-ink">
                  Review <span className="font-mono text-deep">#{id.toString()}</span>
                </h1>
                <StatusChip state={bounty.data.state} />
                <span className="font-mono text-xs text-charcoal">{githubItemLabel(meta)}</span>
              </div>
              <ol aria-label="Verifier steps" className="mt-5 flex flex-wrap gap-2">
                {STEPS.map((label, i) => (
                  <li key={label} className="flex items-center gap-2 rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs font-semibold">
                    <span aria-hidden className="grid size-4 place-items-center rounded-full bg-ink text-[9px] text-paper">{i + 1}</span>
                    {label}
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      </header>
      <div className="mx-auto max-w-4xl px-4 pt-6">
        {loading && <Skeleton className="h-64" />}
        {bounty.error && <ErrorState message={explainError(bounty.error)} onRetry={() => void bounty.refetch()} />}
        {notFound && !bounty.isPending && (
          <EmptyState title={`Bounty #${id} doesn't exist.`}><p /></EmptyState>)}
        {bounty.data && meta && !notFound && (
          <Suspense fallback={<Skeleton className="h-64" />}>
            <ReviewPanel id={id} bounty={bounty.data} meta={meta} />
          </Suspense>
        )}
      </div>
    </div>
  );
}
