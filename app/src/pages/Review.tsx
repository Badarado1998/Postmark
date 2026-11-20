import { lazy, Suspense } from "react";
import { Link } from "react-router";
import { useBountyRoute } from "../hooks/useBountyRoute";
import { StatusChip, Skeleton, ErrorState, EmptyState } from "../components/ui";
import { explainError } from "../chain/errors";
import { githubItemLabel } from "../github/parse";

const ReviewPanel = lazy(() => import("../wallet/ReviewPanel"));

export default function Review() {
  const { id, bounty, meta, notFound, loading } = useBountyRoute();

  if (id === undefined) {
    return <EmptyState title="Bad bounty id."><Link className="text-deep underline" to="/explore">Back to explore</Link></EmptyState>;
  }

  return (
    <div className="mx-auto max-w-4xl py-10">
      <Link to={`/bounty/${id}`} className="text-sm text-gray hover:text-ink">← bounty</Link>
      {loading && <Skeleton className="mt-6 h-64" />}
      {bounty.error && <div className="mt-6"><ErrorState message={explainError(bounty.error)} onRetry={() => void bounty.refetch()} /></div>}
      {notFound && !bounty.isPending && (
        <div className="mt-6"><EmptyState title={`Bounty #${id} doesn't exist.`}><p /></EmptyState></div>)}
      {bounty.data && meta && !notFound && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <h1 className="font-sans text-3xl font-semibold text-ink">
              Review <span className="font-mono text-deep">#{id.toString()}</span>
            </h1>
            <StatusChip state={bounty.data.state} />
            <span className="font-mono text-xs text-gray">
              {githubItemLabel(meta)}
            </span>
          </div>
          <div className="mt-6">
            <Suspense fallback={<Skeleton className="h-64" />}>
              <ReviewPanel id={id} bounty={bounty.data} meta={meta} />
            </Suspense>
          </div>
        </>
      )}
    </div>
  );
}
