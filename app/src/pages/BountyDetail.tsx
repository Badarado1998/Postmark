import { lazy, Suspense } from "react";
import { Link } from "react-router";
import { useBountyRoute } from "../hooks/useBountyRoute";
import { StatusChip, Skeleton, ErrorState, EmptyState, Card, SectionLabel, AddressLink } from "../components/ui";
import { explainError } from "../chain/errors";
import { usePqcStatus } from "../hooks/queries";
import { GithubCard } from "./bounty/GithubCard";
import { BountyFacts } from "./bounty/BountyFacts";
import { PendingVerdict, DisputedBanner } from "./bounty/VerdictBanners";
import { Ruling, eventsFor } from "./bounty/Ruling";
import { Timeline } from "./bounty/Timeline";

const TxActions = lazy(() => import("../wallet/TxActions"));
const ClaimPanel = lazy(() => import("../wallet/ClaimPanel"));
const ClaimedNote = lazy(() => import("../wallet/ClaimedNote"));
const FunderShare = lazy(() => import("../wallet/FunderShare"));

const STATE = { Open: 0, Claimed: 1, Pending: 2, Disputed: 3, Paid: 4, Refunded: 5 } as const;

function VerifierBadge({ addr }: { addr: `0x${string}` }) {
  const s = usePqcStatus(addr);
  return (
    <div className="flex items-center gap-2">
      <AddressLink address={addr} className="font-mono text-sm text-ink hover:text-deep" />
      {s.isPending && <span className="text-xs text-gray">…</span>}
      {s.data && (
        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${
          s.data.live ? "border-leaf/60 text-deep" : "border-gray/50 text-gray"}`}>
          {s.data.live ? "PQ key live" : "no live key"}
        </span>
      )}
      {s.error && <span className="text-[10px] text-gray">key status unavailable</span>}
    </div>
  );
}

export default function BountyDetail() {
  const { id, bounty, index, meta, notFound, loading } = useBountyRoute();

  if (id === undefined) {
    return <EmptyState title="Bad bounty id."><Link className="text-deep underline" to="/explore">Back to explore</Link></EmptyState>;
  }
  const b = bounty.data;
  const events = eventsFor(index.data?.events, id);

  return (
    <div className="py-10">
      <Link to="/explore" className="text-sm text-gray hover:text-ink">← all bounties</Link>
      {loading && <Skeleton className="mt-6 h-64" />}
      {bounty.error && <div className="mt-6"><ErrorState message={explainError(bounty.error)} onRetry={() => void bounty.refetch()} /></div>}
      {notFound && !bounty.isPending && (
        <div className="mt-6"><EmptyState title={`Bounty #${id} doesn't exist.`}>
          <p>Nothing was ever stamped with that id on diana.</p>
        </EmptyState></div>
      )}
      {b && !notFound && (
        <div className="mt-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="font-sans text-3xl font-semibold text-ink">
              Bounty <span className="font-mono text-deep">#{id.toString()}</span>
            </h1>
            <StatusChip state={b.state} />
          </div>
          <Suspense fallback={null}>
            <FunderShare bounty={b} />
          </Suspense>

          {meta?.workHashMismatch && (
            <div role="alert" className="rounded-lg border border-salmon/50 bg-salmon/10 p-3 font-mono text-xs text-orange">
              Warning: emitted work metadata does not re-hash to the on-chain workHash. Do not trust this bounty.
            </div>
          )}
          {meta && <GithubCard ownerRepo={meta.ownerRepo} kind={meta.kind} number={meta.number} />}

          <BountyFacts bounty={b} />

          {b.state === STATE.Claimed && (
            <Suspense fallback={null}>
              <ClaimedNote bounty={b} />
            </Suspense>
          )}
          {b.state === STATE.Open && meta && (
            <Suspense fallback={null}>
              <ClaimPanel id={id} bounty={b} meta={meta} />
            </Suspense>
          )}

          {(b.state === STATE.Claimed || b.state === STATE.Pending || b.state === STATE.Disputed) && (
            <Link to={`/bounty/${id}/review`}
              className="block rounded-xl border border-salmon/30 bg-salmon/5 p-4 text-sm text-deep hover:bg-salmon/10">
              {b.state === STATE.Disputed
                ? "This verdict is disputed — open the review tool to build a resolution →"
                : "Open the verifier review tool → check the claim, sign a verdict, merge the quorum →"}
            </Link>
          )}

          {b.state === STATE.Pending && <PendingVerdict id={id} bounty={b} meta={meta} />}
          {b.state === STATE.Disputed && <DisputedBanner bounty={b} />}
          {(b.state === STATE.Paid || b.state === STATE.Refunded) && <Ruling state={b.state} events={events} />}

          <Suspense fallback={null}>
            <TxActions id={id} bounty={b} />
          </Suspense>

          <Card>
            <SectionLabel>verifiers</SectionLabel>
            <div className="mt-3 space-y-2">
              {b.verifiers.map((v) => <VerifierBadge key={v} addr={v} />)}
            </div>
          </Card>

          <Timeline events={events} />
        </div>
      )}
    </div>
  );
}
