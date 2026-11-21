import { lazy, Suspense } from "react";
import { Link } from "react-router";
import { useBountyRoute } from "../hooks/useBountyRoute";
import { useGithubItem } from "../hooks/queries";
import { StatusChip, Skeleton, ErrorState, EmptyState, Qor } from "../components/ui";
import { explainError } from "../chain/errors";
import { PageBody, PageHeader } from "../components/Page";
import { githubItemLabel } from "../github/parse";
import { GithubCard } from "./bounty/GithubCard";
import { BountyFacts } from "./bounty/BountyFacts";
import { PendingVerdict, DisputedBanner } from "./bounty/VerdictBanners";
import { Ruling, eventsFor } from "./bounty/Ruling";
import { Timeline } from "./bounty/Timeline";
import { Lifecycle } from "./bounty/Lifecycle";
import { AmountBreakdown, Deadlines, Verifiers } from "./bounty/Sidebar";
import type { Bounty } from "../chain/client";
import type { BountyMeta } from "../chain/indexer";

const TxActions = lazy(() => import("../wallet/TxActions"));
const ClaimPanel = lazy(() => import("../wallet/ClaimPanel"));
const ClaimedNote = lazy(() => import("../wallet/ClaimedNote"));
const FunderShare = lazy(() => import("../wallet/FunderShare"));

const STATE = { Open: 0, Claimed: 1, Pending: 2, Disputed: 3, Paid: 4, Refunded: 5 } as const;

/** Work title: the GitHub title once loaded, otherwise owner/repo#n. */
function WorkTitle({ meta }: { meta: BountyMeta | undefined }) {
  const item = useGithubItem(meta ?? { ownerRepo: "", kind: 0, number: 0 }, { retry: false, enabled: !!meta });
  if (!meta) return <p className="mt-1 text-xl text-gray">Work reference unavailable</p>;
  return (
    <p className="mt-1 text-xl font-medium tracking-tight text-charcoal">
      {item.data?.title ?? githubItemLabel(meta)}
    </p>
  );
}

function Header({ id, bounty: b, meta }: { id: bigint; bounty: Bounty; meta: BountyMeta | undefined }) {
  return (
    <PageHeader>
      <div>
        <Link to="/explore" className="text-sm text-charcoal hover:text-ink">← all bounties</Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-sans text-3xl font-semibold tracking-tight text-ink">
                Bounty <span className="font-mono text-deep">#{id.toString()}</span>
              </h1>
              <StatusChip state={b.state} />
            </div>
            <WorkTitle meta={meta} />
          </div>
          <div className="text-right">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-gray">total locked</div>
            <Qor wei={b.amount + b.challengeReward} className="text-3xl font-semibold tabular-nums tracking-tight" />
          </div>
        </div>
        <div className="mt-6"><Lifecycle state={b.state} /></div>
      </div>
    </PageHeader>
  );
}

export default function BountyDetail() {
  const { id, bounty, index, meta, notFound, loading } = useBountyRoute();

  if (id === undefined) {
    return <EmptyState title="Bad bounty id."><Link className="text-deep underline" to="/explore">Back to explore</Link></EmptyState>;
  }
  const b = bounty.data;
  const events = eventsFor(index.data?.events, id);
  const showDetail = !!b && !notFound;

  return (
    <div>
      {showDetail && <Header id={id} bounty={b} meta={meta} />}
      <PageBody>
        {!showDetail && <Link to="/explore" className="text-sm text-gray hover:text-ink">← all bounties</Link>}
        {loading && <Skeleton className="mt-6 h-64" />}
        {bounty.error && <div className="mt-6"><ErrorState message={explainError(bounty.error)} onRetry={() => void bounty.refetch()} /></div>}
        {notFound && !bounty.isPending && (
          <div className="mt-6"><EmptyState title={`Bounty #${id} doesn't exist.`}>
            <p>Nothing was ever stamped with that id on diana.</p>
          </EmptyState></div>
        )}
        {showDetail && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-[auto_1fr]">
            <div data-slot="verdict" className="order-1 min-w-0 space-y-6 empty:hidden lg:order-none lg:col-start-1 lg:row-start-1">
              <Suspense fallback={null}><FunderShare bounty={b} /></Suspense>
              {meta?.workHashMismatch && (
                <div role="alert" className="rounded-lg border border-salmon bg-salmon/25 p-3 font-mono text-xs text-ink">
                  Warning: emitted work metadata does not re-hash to the on-chain workHash. Do not trust this bounty.
                </div>
              )}
              {b.state === STATE.Claimed && (
                <Suspense fallback={null}><ClaimedNote bounty={b} /></Suspense>
              )}
              {(b.state === STATE.Claimed || b.state === STATE.Disputed) && (
                <Link to={`/bounty/${id}/review`}
                  className="block rounded-xl border border-ink/10 bg-mustard/40 p-4 text-sm font-medium text-ink hover:bg-mustard/60">
                  {b.state === STATE.Disputed
                    ? "This verdict is disputed — open the review tool to build a resolution →"
                    : "Open the verifier review tool → check the claim, sign a verdict, merge the quorum →"}
                </Link>
              )}
              {b.state === STATE.Pending && <PendingVerdict id={id} bounty={b} meta={meta} />}
              {b.state === STATE.Disputed && <DisputedBanner bounty={b} />}
              {(b.state === STATE.Paid || b.state === STATE.Refunded) && <Ruling state={b.state} events={events} />}
            </div>

            {/* below lg the aside is transparent so its two groups order into the main flow; from lg it is one sticky column */}
            <aside aria-label="Bounty summary"
              className="contents lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:block lg:min-w-0 lg:space-y-4 lg:sticky lg:top-24 lg:self-start">
              <div data-slot="actions" className="order-2 min-w-0 space-y-4 empty:hidden lg:order-none">
                {b.state === STATE.Open && meta && (
                  <Suspense fallback={null}><ClaimPanel id={id} bounty={b} meta={meta} /></Suspense>
                )}
                <Suspense fallback={null}><TxActions id={id} bounty={b} /></Suspense>
              </div>
              <div data-slot="facts" className="order-4 min-w-0 space-y-4 lg:order-none">
                <AmountBreakdown bounty={b} />
                <Deadlines bounty={b} />
                <Verifiers bounty={b} />
              </div>
            </aside>

            <div data-slot="story" className="order-3 min-w-0 space-y-6 lg:order-none lg:col-start-1 lg:row-start-2">
              {meta && <GithubCard ownerRepo={meta.ownerRepo} kind={meta.kind} number={meta.number} />}
              <Timeline events={events} />
              <details className="rounded-xl border border-ink/10 bg-white p-5">
                <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.18em] text-gray">all fields</summary>
                <div className="mt-4"><BountyFacts bounty={b} /></div>
              </details>
            </div>
          </div>
        )}
      </PageBody>
    </div>
  );
}
