import { Suspense, type ReactNode } from "react";
import { Link } from "react-router";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { creditOf, type Bounty } from "../chain/client";
import { githubItemLabel } from "../github/parse";
import { useIndex, useBounties, useGithubItem, usePqcStatus } from "../hooks/queries";
import { Card, SectionLabel, StatusChip, Qor, Countdown, shortAddr, Skeleton } from "../components/ui";
import { useTxAction } from "../hooks/useTxAction";
import { useToast } from "../components/Toasts";
import { TxStatusPanel } from "./TxWidgets";
import TxActions from "./TxActions";
import { sameAddress } from "../chain/address";
import { nowSec } from "../chain/time";
import type { BountyMeta } from "../chain/indexer";

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
  if (!address) return null;
  if (credits.isPending) return <Skeleton className="h-28" />;
  const [ungated, gated] = credits.data ?? [0n, 0n];
  if (ungated === 0n && gated === 0n) {
    return <p className="text-sm text-gray">No credits yet.</p>;
  }
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-8">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-gray">ungated</div>
            <Qor wei={ungated} />
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-gray">payee-gated</div>
            <Qor wei={gated} />
          </div>
        </div>
        <button disabled={tx.busy || (ungated === 0n && gated === 0n)}
          onClick={() => void tx.run({ functionName: "withdraw", args: [],
            onConfirmed: () => toast({ kind: "info", text: "Withdrawn." }) })}
          className="rounded-lg bg-deep px-5 py-2 text-sm font-medium text-paper hover:brightness-110 disabled:opacity-40">
          Withdraw
        </button>
      </div>
      {gated > 0n && (
        <p className="mt-3 text-xs text-gray">
          Payee-gated credit withdraws only while your ML-DSA-87 key is live.
          {pqc.data && !pqc.data.live && " Yours is not registered — withdrawals will revert."}
        </p>
      )}
      <TxStatusPanel state={tx.state} />
    </Card>
  );
}

function WorkRef({ meta }: { meta: BountyMeta }) {
  const q = useGithubItem(meta);
  return (
    <div className="min-w-0">
      <span className="font-mono text-xs text-gray">{githubItemLabel(meta)}</span>
      {q.data?.title && <p className="truncate text-sm text-ink">{q.data.title}</p>}
    </div>
  );
}

type Row = { id: bigint; bounty: Bounty };

/** Bounties matching `pick`, rendered as linked rows; `aside` is the right-hand column. */
function BountyList({ pick, empty, skeleton, aside, extra }: {
  pick: (b: Bounty, me: string) => boolean;
  empty: ReactNode;
  skeleton: string;
  aside: (row: Row) => ReactNode;
  extra?: (row: Row) => ReactNode;
}) {
  const { address } = useAccount();
  const index = useIndex();
  const bounties = useBounties(index.data?.bountyIds);
  if (!address) return null;
  if (index.isPending || bounties.isPending) return <Skeleton className={skeleton} />;
  const mine: Row[] = [];
  for (const { id, bounty } of bounties.data ?? []) {
    if (bounty && pick(bounty, address)) mine.push({ id, bounty });
  }
  if (mine.length === 0) return <p className="text-sm text-gray">{empty}</p>;
  return (
    <ul className="space-y-3">
      {mine.map((row) => {
        const meta = index.data?.metaById.get(row.id);
        return (
          <li key={row.id.toString()} className="rounded-xl border border-ink/10 bg-white/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link to={`/bounty/${row.id}`} className="group flex min-w-0 items-center gap-3">
                <span className="font-mono text-deep group-hover:underline">#{row.id.toString()}</span>
                <StatusChip state={row.bounty.state} />
                {meta && <WorkRef meta={meta} />}
              </Link>
              {aside(row)}
            </div>
            {extra?.(row)}
          </li>
        );
      })}
    </ul>
  );
}

function FundedBounties() {
  return (
    <BountyList skeleton="h-40"
      pick={(b, me) => sameAddress(b.funder, me)}
      empty={<>You haven't funded a bounty yet. <Link className="text-deep underline" to="/create">Fund one.</Link></>}
      aside={({ bounty }) => (
        <div className="flex items-center gap-4 text-sm text-gray">
          <Qor wei={bounty.amount} />
          <span className="font-mono text-xs">deadline <Countdown to={bounty.deadline} /></span>
        </div>
      )}
      extra={({ id, bounty }) => (
        <Suspense fallback={null}>
          <TxActions id={id} bounty={bounty} />
        </Suspense>
      )} />
  );
}

function MyClaims() {
  return (
    <BountyList skeleton="h-28"
      pick={(b, me) => sameAddress(b.payee, me)}
      empty="No claims yet — claim a bounty from its page."
      aside={({ bounty }) => {
        const active = bounty.state === 1 && bounty.claimExpiresAt > nowSec();
        return (
          <div className="text-right font-mono text-xs text-gray">
            <div>{active ? "expires" : "claim"} <Countdown to={bounty.claimExpiresAt} /></div>
            <div className="text-gray">round {bounty.claimRound.toString()}</div>
          </div>
        );
      }} />
  );
}

const verifierAction = (state: number) =>
  state === 1 ? "review claim" : state === 3 ? "resolve dispute"
  : state === 2 ? "verdict pending" : null;

function VerifierBounties() {
  return (
    <BountyList skeleton="h-28"
      pick={(b, me) => b.verifiers.some((v) => sameAddress(v, me))}
      empty="You're not a verifier on any bounty."
      aside={({ id, bounty }) => {
        const action = verifierAction(bounty.state);
        return (
          <div className="flex items-center gap-4 text-sm">
            {action
              ? <Link to={`/bounty/${id}/review`} className="text-deep underline underline-offset-4">{action} →</Link>
              : <span className="font-mono text-xs text-gray">nothing due</span>}
          </div>
        );
      }} />
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <SectionLabel className="mt-8">{title}</SectionLabel>
      <div className="mt-3">{children}</div>
    </>
  );
}

export default function MeInner() {
  const { address, isConnected } = useAccount();
  if (!isConnected || !address) {
    return (
      <div className="py-16 text-center">
        <h1 className="font-sans text-4xl font-semibold text-ink">My bounties</h1>
        <p className="mt-4 text-gray">Connect an EVM wallet to see your funded bounties and credits.</p>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-3xl py-10">
      <h1 className="font-sans text-4xl font-semibold text-ink">My bounties</h1>
      <p className="mt-1 font-mono text-sm text-gray">{shortAddr(address)}</p>
      <Section title="credits"><Credits /></Section>
      <Section title="funded"><FundedBounties /></Section>
      <Section title="my claims"><MyClaims /></Section>
      <Section title="verifier"><VerifierBounties /></Section>
    </div>
  );
}
