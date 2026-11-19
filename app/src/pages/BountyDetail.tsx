import { useParams, Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useBounty, useIndex, useNextBountyId, usePqcStatus } from "../hooks/queries";
import { StatusChip, Countdown, Qor, Skeleton, ErrorState, EmptyState, shortAddr } from "../components/ui";
import { explainError } from "../chain/errors";
import { explorerAddress, explorerTx } from "../chain/config";
import { getIssue, getPull, getLinkedPrs, GithubRateLimitError, type GhIssue, type GhPull } from "../github/client";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">{label}</dt>
      <dd className="mt-1 break-words font-mono text-sm text-paper-100">{children}</dd>
    </div>
  );
}

function VerifierBadge({ addr }: { addr: `0x${string}` }) {
  const s = usePqcStatus(addr);
  return (
    <div className="flex items-center gap-2">
      <a className="font-mono text-sm text-paper-200 hover:text-vermilion"
        href={explorerAddress(addr)} target="_blank" rel="noreferrer">{shortAddr(addr)}</a>
      {s.isPending && <span className="text-xs text-ink-400">…</span>}
      {s.data && (
        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${
          s.data.live ? "border-emerald-400/40 text-emerald-300" : "border-zinc-500/40 text-zinc-400"}`}>
          {s.data.live ? "PQ key live" : "no live key"}
        </span>
      )}
      {s.error && <span className="text-[10px] text-ink-400">key status unavailable</span>}
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

  if (issue.isPending) return <Skeleton className="h-32" />;
  if (issue.error) {
    const msg = issue.error instanceof GithubRateLimitError
      ? issue.error.message
      : "Couldn't load the GitHub item (private repo or API error).";
    return <div className="rounded-xl border border-white/10 p-5 text-sm text-ink-300">
      {msg} <a className="text-vermilion underline underline-offset-4"
        href={`https://github.com/${ownerRepo}/${kind === 1 ? "pull" : "issues"}/${n}`}
        target="_blank" rel="noreferrer">Open on GitHub</a>
    </div>;
  }
  const d = issue.data as GhIssue & GhPull;
  return (
    <div className="rounded-xl border border-white/10 bg-ink-900/60 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <a href={d.html_url} target="_blank" rel="noreferrer"
          className="font-serif text-lg text-paper-100 hover:text-vermilion">
          {d.title}
        </a>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
          d.state === "open" ? "border-emerald-400/40 text-emerald-300" : "border-zinc-500/40 text-zinc-400"}`}>
          {d.state}
        </span>
      </div>
      <p className="mt-2 font-mono text-xs text-ink-300">
        {ownerRepo}{kind === 1 ? "/pull/" : "#"}{n} · by {d.user?.login}
      </p>
      {d.labels && d.labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {d.labels.map((l) => (
            <span key={l.name} className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-ink-200">{l.name}</span>
          ))}
        </div>
      )}
      {kind === 1 && "merged" in d && (
        <p className="mt-3 text-sm">
          {d.merged
            ? <span className="text-emerald-300">merged {d.merged_at ? new Date(d.merged_at).toLocaleString() : ""} {d.merge_commit_sha ? `· ${d.merge_commit_sha.slice(0, 10)}` : ""}</span>
            : <span className="text-amber-300">not merged</span>}
        </p>
      )}
      {kind === 0 && linkedPr.data && (
        <p className="mt-3 text-sm text-ink-300">
          linked PR <a className="text-vermilion underline underline-offset-4" href={linkedPr.data.html_url} target="_blank" rel="noreferrer">#{linkedPr.data.number}</a>
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

export default function BountyDetail() {
  const { id: idStr } = useParams();
  const id = (() => { try { return BigInt(idStr ?? ""); } catch { return undefined; } })();
  const next = useNextBountyId();
  const bounty = useBounty(id);
  const index = useIndex();

  if (id === undefined) {
    return <EmptyState title="Bad bounty id."><Link className="text-vermilion underline" to="/explore">Back to explore</Link></EmptyState>;
  }
  const notFound = next.data !== undefined && id >= next.data;

  return (
    <div className="py-10">
      <Link to="/explore" className="text-sm text-ink-300 hover:text-paper-100">← all bounties</Link>
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
            <h1 className="font-serif text-3xl font-semibold text-paper-100">
              Bounty <span className="font-mono text-vermilion">#{id.toString()}</span>
            </h1>
            <StatusChip state={bounty.data.state} />
          </div>

          {index.data?.metaById.get(id) && (() => {
            const m = index.data.metaById.get(id)!;
            return (
              <>
                {m.workHashMismatch && (
                  <div role="alert" className="rounded-lg border border-vermilion/50 bg-vermilion/10 p-3 font-mono text-xs text-vermilion">
                    Warning: emitted work metadata does not re-hash to the on-chain workHash. Do not trust this bounty.
                  </div>
                )}
                <GithubCard ownerRepo={m.ownerRepo} kind={m.kind} number={m.number} />
              </>
            );
          })()}

          <dl className="grid grid-cols-2 gap-5 rounded-xl border border-white/10 bg-ink-900/60 p-5 sm:grid-cols-3">
            <Field label="funder"><a className="hover:text-vermilion" href={explorerAddress(bounty.data.funder)} target="_blank" rel="noreferrer">{shortAddr(bounty.data.funder)}</a></Field>
            <Field label="principal"><Qor wei={bounty.data.amount} /></Field>
            <Field label="challenge reward"><Qor wei={bounty.data.challengeReward} /></Field>
            <Field label="bond"><Qor wei={bounty.data.bondAmount} /></Field>
            <Field label="deadline"><Countdown to={bounty.data.deadline} /></Field>
            <Field label="claim timeout">{Number(bounty.data.claimTimeout) / 3600}h</Field>
            <Field label="claim round">{bounty.data.claimRound.toString()}</Field>
            {bounty.data.payee !== "0x0000000000000000000000000000000000000000" && (
              <Field label="claimant / payee">
                <a className="hover:text-vermilion" href={explorerAddress(bounty.data.payee)} target="_blank" rel="noreferrer">{shortAddr(bounty.data.payee)}</a>
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
              <Field label="disputer"><a className="hover:text-vermilion" href={explorerAddress(bounty.data.disputer)} target="_blank" rel="noreferrer">{shortAddr(bounty.data.disputer)}</a></Field>
            )}
            <Field label="work hash">{bounty.data.workHash.slice(0, 18)}…</Field>
            <Field label="initial verdict">
              {bounty.data.initialOutcome === 0 && bounty.data.pendingVerdictHash !== "0x0000000000000000000000000000000000000000000000000000000000000000" ? "PAY"
                : bounty.data.initialOutcome === 1 ? "REFUND" : "—"}
              {bounty.data.initialMergedAt > 0n && ` · merged ${new Date(Number(bounty.data.initialMergedAt) * 1000).toLocaleDateString()}`}
            </Field>
          </dl>

          <div className="rounded-xl border border-white/10 bg-ink-900/60 p-5">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">verifiers</h2>
            <div className="mt-3 space-y-2">
              {bounty.data.verifiers.map((v) => <VerifierBadge key={v} addr={v} />)}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-ink-900/60 p-5">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">timeline</h2>
            <ol className="mt-4 space-y-3 border-l border-white/10 pl-4">
              {(index.data?.events ?? [])
                .filter((e) => (e.args as { bountyId?: bigint }).bountyId === id)
                .map((e, i) => (
                  <li key={i} className="relative text-sm">
                    <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-vermilion/80" aria-hidden />
                    <span className="text-paper-200">{EVENT_LABEL[e.eventName] ?? e.eventName}</span>
                    <span className="ml-2 font-mono text-xs text-ink-400">
                      block {e.blockNumber.toString()}
                    </span>
                    <a href={explorerTx(e.transactionHash)} target="_blank" rel="noreferrer"
                      className="ml-2 font-mono text-xs text-ink-400 underline decoration-dotted hover:text-vermilion">
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
