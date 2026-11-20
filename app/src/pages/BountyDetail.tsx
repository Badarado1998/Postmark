import { lazy, Suspense, useEffect, useState } from "react";
import { useParams, Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useBounty, useIndex, useNextBountyId, usePqcStatus } from "../hooks/queries";
import { StatusChip, Countdown, Qor, Skeleton, ErrorState, EmptyState, shortAddr } from "../components/ui";
import { explainError } from "../chain/errors";
import { explorerAddress, explorerTx } from "../chain/config";
import { getIssue, getPull, getLinkedPrs, GithubRateLimitError, type GhIssue, type GhPull } from "../github/client";

const TxActions = lazy(() => import("../wallet/TxActions"));
const ClaimPanel = lazy(() => import("../wallet/ClaimPanel"));
const ClaimedNote = lazy(() => import("../wallet/ClaimedNote"));
const DisputePanel = lazy(() => import("../wallet/DisputePanel"));

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-gray">{label}</dt>
      <dd className="mt-1 break-words font-mono text-sm text-ink">{children}</dd>
    </div>
  );
}

function VerifierBadge({ addr }: { addr: `0x${string}` }) {
  const s = usePqcStatus(addr);
  return (
    <div className="flex items-center gap-2">
      <a className="font-mono text-sm text-ink hover:text-deep"
        href={explorerAddress(addr)} target="_blank" rel="noreferrer">{shortAddr(addr)}</a>
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

function GithubCard({ ownerRepo, kind, number }:
  { ownerRepo: string; kind: number; number: bigint }) {
  const n = Number(number);
  const issue = useQuery({
    queryKey: ["gh", kind === 1 ? "pull" : "issue", ownerRepo, n],
    queryFn: (): Promise<GhIssue | GhPull> => kind === 1 ? getPull(ownerRepo, n) : getIssue(ownerRepo, n),
    staleTime: 5 * 60_000, retry: (c, e) => !(e instanceof GithubRateLimitError) && c < 2,
  });
  const linked = useQuery({
    queryKey: ["gh-linked", ownerRepo, n],
    queryFn: () => getLinkedPrs(ownerRepo, n),
    enabled: kind === 0 && !!issue.data,
    staleTime: 5 * 60_000, retry: false,
  });
  const linkedPr = useQuery({
    queryKey: ["gh", "pull", ownerRepo, linked.data?.[0]],
    queryFn: () => getPull(ownerRepo, linked.data![0]!),
    enabled: !!linked.data?.[0],
    staleTime: 5 * 60_000, retry: false,
  });

  // GitHub can hang on rate limits; never leave a skeleton up forever.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!issue.isPending) return;
    const t = setTimeout(() => setSlow(true), 10_000);
    return () => clearTimeout(t);
  }, [issue.isPending]);

  if (issue.isPending && !slow) return <Skeleton className="h-32" />;
  if (issue.error || (issue.isPending && slow)) {
    const msg = issue.error instanceof GithubRateLimitError
      ? issue.error.message
      : "GitHub unavailable (rate limit or private repo).";
    return <div className="rounded-xl border border-ink/10 p-5 text-sm text-gray">
      {msg} <a className="text-deep underline underline-offset-4"
        href={`https://github.com/${ownerRepo}/${kind === 1 ? "pull" : "issues"}/${n}`}
        target="_blank" rel="noreferrer">Open on GitHub</a>
    </div>;
  }
  const d = issue.data as GhIssue & GhPull;
  return (
    <div className="rounded-xl border border-ink/10 bg-white/70 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <a href={d.html_url} target="_blank" rel="noreferrer"
          className="font-sans text-lg text-ink hover:text-deep">
          {d.title}
        </a>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
          d.state === "open" ? "border-leaf/60 text-deep" : "border-gray/50 text-gray"}`}>
          {d.state}
        </span>
      </div>
      <p className="mt-2 font-mono text-xs text-gray">
        {ownerRepo}{kind === 1 ? "/pull/" : "#"}{n} · by {d.user?.login}
      </p>
      {d.labels && d.labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {d.labels.map((l) => (
            <span key={l.name} className="rounded-full bg-ink/5 px-2 py-0.5 text-[10px] text-gray">{l.name}</span>
          ))}
        </div>
      )}
      {kind === 1 && "merged" in d && (
        <p className="mt-3 text-sm">
          {d.merged
            ? <span className="text-deep">merged {d.merged_at ? new Date(d.merged_at).toLocaleString() : ""} {d.merge_commit_sha ? `· ${d.merge_commit_sha.slice(0, 10)}` : ""}</span>
            : <span className="text-orange">not merged</span>}
        </p>
      )}
      {kind === 0 && linkedPr.data && (
        <p className="mt-3 text-sm text-gray">
          linked PR <a className="text-deep underline underline-offset-4" href={linkedPr.data.html_url} target="_blank" rel="noreferrer">#{linkedPr.data.number}</a>
          {" "}{linkedPr.data.merged ? `merged ${linkedPr.data.merged_at ? new Date(linkedPr.data.merged_at).toLocaleString() : ""}` : "not merged"}
          {linkedPr.data.user?.login ? ` · by ${linkedPr.data.user.login}` : ""}
        </p>
      )}
    </div>
  );
}

const EVENT_LABEL: Record<string, string> = {
  BountyCreated: "Bounty created and funded",
  BountyWork: "GitHub work reference emitted",
  Claimed: "Claimed by a contributor",
  ClaimReleased: "Claim expired and released",
  VerdictSubmitted: "Verdict submitted",
  Disputed: "Verdict disputed",
  DisputeResolved: "Dispute resolved",
  Settled: "Settled",
  Credited: "Credit posted",
  Withdrawn: "Withdrawn",
};

const FunderShare = lazy(() => import("../wallet/FunderShare"));

export default function BountyDetail() {
  const { id: idStr } = useParams();
  const id = (() => { try { return BigInt(idStr ?? ""); } catch { return undefined; } })();
  const next = useNextBountyId();
  const bounty = useBounty(id);
  const index = useIndex();

  if (id === undefined) {
    return <EmptyState title="Bad bounty id."><Link className="text-deep underline" to="/explore">Back to explore</Link></EmptyState>;
  }
  const notFound = next.data !== undefined && id >= next.data;

  return (
    <div className="py-10">
      <Link to="/explore" className="text-sm text-gray hover:text-ink">← all bounties</Link>
      {(bounty.isPending || index.isPending || next.isPending) && <Skeleton className="mt-6 h-64" />}
      {bounty.error && <div className="mt-6"><ErrorState message={explainError(bounty.error)} onRetry={() => void bounty.refetch()} /></div>}
      {notFound && !bounty.isPending && (
        <div className="mt-6"><EmptyState title={`Bounty #${id} doesn't exist.`}>
          <p>Nothing was ever stamped with that id on diana.</p>
        </EmptyState></div>
      )}
      {bounty.data && !notFound && (
        <div className="mt-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="font-sans text-3xl font-semibold text-ink">
              Bounty <span className="font-mono text-deep">#{id.toString()}</span>
            </h1>
            <StatusChip state={bounty.data.state} />
          </div>
          <Suspense fallback={null}>
            <FunderShare bounty={bounty.data} />
          </Suspense>

          {index.data?.metaById.get(id) && (() => {
            const m = index.data.metaById.get(id)!;
            return (
              <>
                {m.workHashMismatch && (
                  <div role="alert" className="rounded-lg border border-salmon/50 bg-salmon/10 p-3 font-mono text-xs text-deep">
                    Warning: emitted work metadata does not re-hash to the on-chain workHash. Do not trust this bounty.
                  </div>
                )}
                <GithubCard ownerRepo={m.ownerRepo} kind={m.kind} number={m.number} />
              </>
            );
          })()}

          <dl className="grid grid-cols-2 gap-5 rounded-xl border border-ink/10 bg-white/70 p-5 sm:grid-cols-3">
            <Field label="funder"><a className="hover:text-deep" href={explorerAddress(bounty.data.funder)} target="_blank" rel="noreferrer">{shortAddr(bounty.data.funder)}</a></Field>
            <Field label="principal"><Qor wei={bounty.data.amount} /></Field>
            <Field label="challenge reward"><Qor wei={bounty.data.challengeReward} /></Field>
            <Field label="bond"><Qor wei={bounty.data.bondAmount} /></Field>
            <Field label="deadline"><Countdown to={bounty.data.deadline} /></Field>
            <Field label="claim timeout">{Number(bounty.data.claimTimeout) / 3600}h</Field>
            <Field label="claim round">{bounty.data.claimRound.toString()}</Field>
            {bounty.data.payee !== "0x0000000000000000000000000000000000000000" && (
              <Field label="claimant / payee">
                <a className="hover:text-deep" href={explorerAddress(bounty.data.payee)} target="_blank" rel="noreferrer">{shortAddr(bounty.data.payee)}</a>
              </Field>
            )}
            {bounty.data.claimExpiresAt > 0n && (
              <Field label="claim expires"><Countdown to={bounty.data.claimExpiresAt} /></Field>
            )}
            {bounty.data.payeeIdentityHash !== "0x0000000000000000000000000000000000000000000000000000000000000000" && (
              <Field label="identity hash">{bounty.data.payeeIdentityHash.slice(0, 18)}…</Field>
            )}
            {bounty.data.challengeEndsAt > 0n && (
              <Field label="challenge ends"><Countdown to={bounty.data.challengeEndsAt} /></Field>
            )}
            {bounty.data.disputer !== "0x0000000000000000000000000000000000000000" && (
              <Field label="disputer"><a className="hover:text-deep" href={explorerAddress(bounty.data.disputer)} target="_blank" rel="noreferrer">{shortAddr(bounty.data.disputer)}</a></Field>
            )}
            <Field label="work hash">{bounty.data.workHash.slice(0, 18)}…</Field>
            <Field label="initial verdict">
              {bounty.data.initialOutcome === 0 && bounty.data.pendingVerdictHash !== "0x0000000000000000000000000000000000000000000000000000000000000000" ? "PAY"
                : bounty.data.initialOutcome === 1 ? "REFUND" : "—"}
              {bounty.data.initialMergedAt > 0n && ` · merged ${new Date(Number(bounty.data.initialMergedAt) * 1000).toLocaleDateString()}`}
            </Field>
          </dl>

          {bounty.data.state === 1 && (
            <Suspense fallback={null}>
              <ClaimedNote bounty={bounty.data} />
            </Suspense>
          )}
          {bounty.data.state === 0 && index.data?.metaById.get(id) && (
            <Suspense fallback={null}>
              <ClaimPanel id={id} bounty={bounty.data} meta={index.data.metaById.get(id)!} />
            </Suspense>
          )}

          {/* review link — Claimed, Pending or Disputed */}
          {[1, 2, 3].includes(bounty.data.state) && (
            <Link to={`/bounty/${id}/review`}
              className="block rounded-xl border border-salmon/30 bg-salmon/5 p-4 text-sm text-deep hover:bg-salmon/10">
              {bounty.data.state === 3
                ? "This verdict is disputed — open the review tool to build a resolution →"
                : "Open the verifier review tool → check the claim, sign a verdict, merge the quorum →"}
            </Link>
          )}

          {/* Pending: frozen verdict + challenge countdown + dispute */}
          {bounty.data.state === 2 && (
            <div className="rounded-xl border border-ink/10 bg-white/70 p-5">
              <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-gray">verdict pending</h2>
              <p className="mt-2 text-sm text-gray">
                Initial verdict: <span className="text-ink">{bounty.data.initialOutcome === 0 ? "PAY" : "REFUND"}</span>
                {bounty.data.payee !== "0x0000000000000000000000000000000000000000" && (
                  <> to <a className="font-mono hover:text-deep" href={explorerAddress(bounty.data.payee)} target="_blank" rel="noreferrer">{shortAddr(bounty.data.payee)}</a>
                  {" "}· <Qor wei={bounty.data.amount} /></>)}
                {" "}— the payout is frozen until the challenge window closes.
              </p>
              <p className="mt-1 font-mono text-xs text-gray">
                challenge window <Countdown to={bounty.data.challengeEndsAt} />
              </p>
              <Suspense fallback={null}>
                {index.data?.metaById.get(id) && (
                  <div className="mt-4">
                    <DisputePanel id={id} bounty={bounty.data} meta={index.data.metaById.get(id)!} />
                  </div>
                )}
              </Suspense>
            </div>
          )}

          {/* Disputed: payout frozen, link to resolution */}
          {bounty.data.state === 3 && (
            <div className="rounded-xl border border-orange/40 bg-orange/10 p-5">
              <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-orange">payout frozen — disputed</h2>
              <p className="mt-2 text-sm text-gray">
                <a className="font-mono hover:text-deep" href={explorerAddress(bounty.data.disputer)} target="_blank" rel="noreferrer">{shortAddr(bounty.data.disputer)}</a>
                {" "}bonded <Qor wei={bounty.data.bondAmount} /> against the
                {" "}{bounty.data.initialOutcome === 0 ? "PAY" : "REFUND"} verdict. The winner also
                takes the <Qor wei={bounty.data.challengeReward} /> challenge reward.
              </p>
              <p className="mt-1 break-all font-mono text-xs text-gray">
                dispute evidence {bounty.data.disputeEvidenceHash.slice(0, 26)}…
              </p>
            </div>
          )}

          {/* ruling: a resolved dispute or a settled verdict */}
          {(bounty.data.state === 4 || bounty.data.state === 5) && (() => {
            const evs = (index.data?.events ?? [])
              .filter((e) => (e.args as { bountyId?: bigint }).bountyId === id);
            const resolved = evs.find((e) => e.eventName === "DisputeResolved");
            const credits = evs.filter((e) => e.eventName === "Credited");
            const wasDisputed = !!resolved;
            const upheld = (resolved?.args as { upheld?: boolean } | undefined)?.upheld;
            return (
              <div className="rounded-xl border border-ink/10 bg-white/70 p-5">
                <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-gray">ruling</h2>
                <p className="mt-2 text-sm text-gray">
                  {bounty.data.state === 4 ? "Paid" : "Refunded"}
                  {wasDisputed && (
                    <> — the dispute was {upheld ? <span className="text-orange">upheld</span> : <span className="text-deep">rejected</span>}.</>)}
                  {!wasDisputed && " — unchallenged verdict finalized."}
                </p>
                {credits.length > 0 && (
                  <ul className="mt-2 space-y-1 font-mono text-xs text-gray">
                    {credits.map((e, i) => {
                      const a = e.args as { account?: string; amount?: bigint; payeeGated?: boolean };
                      return (
                        <li key={i}>
                          <a className="hover:text-deep" href={explorerAddress(a.account ?? "")} target="_blank" rel="noreferrer">{shortAddr(a.account)}</a>
                          {" "}credited {a.amount !== undefined ? <Qor wei={a.amount} /> : "?"}
                          {a.payeeGated ? " (payee-gated)" : ""}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })()}

          <Suspense fallback={null}>
            <TxActions id={id} bounty={bounty.data} />
          </Suspense>

          <div className="rounded-xl border border-ink/10 bg-white/70 p-5">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-gray">verifiers</h2>
            <div className="mt-3 space-y-2">
              {bounty.data.verifiers.map((v) => <VerifierBadge key={v} addr={v} />)}
            </div>
          </div>

          <div className="rounded-xl border border-ink/10 bg-white/70 p-5">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-gray">timeline</h2>
            <ol className="mt-4 space-y-3 border-l border-ink/10 pl-4">
              {(index.data?.events ?? [])
                .filter((e) => (e.args as { bountyId?: bigint }).bountyId === id)
                .map((e, i) => (
                  <li key={i} className="relative text-sm">
                    <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-salmon/80" aria-hidden />
                    <span className="text-ink">{EVENT_LABEL[e.eventName] ?? e.eventName}</span>
                    <span className="ml-2 font-mono text-xs text-gray">
                      block {e.blockNumber.toString()}
                    </span>
                    <a href={explorerTx(e.transactionHash)} target="_blank" rel="noreferrer"
                      className="ml-2 font-mono text-xs text-gray underline decoration-dotted hover:text-deep">
                      tx {e.transactionHash.slice(0, 10)}…
                    </a>
                  </li>
                ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
