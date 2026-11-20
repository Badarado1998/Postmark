import type { ReactNode } from "react";
import { AddressLink, Countdown, Qor, Card } from "../../components/ui";
import { SECONDS_PER_HOUR } from "../../chain/time";
import { isZeroAddress, isZeroHash } from "../../chain/address";
import type { Bounty } from "../../chain/client";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-gray">{label}</dt>
      <dd className="mt-1 break-words font-mono text-sm text-ink">{children}</dd>
    </div>
  );
}

function initialVerdictLabel(b: Bounty) {
  if (b.initialOutcome === 0 && !isZeroHash(b.pendingVerdictHash)) return "PAY";
  return b.initialOutcome === 1 ? "REFUND" : "—";
}

export function BountyFacts({ bounty: b }: { bounty: Bounty }) {
  return (
    <Card>
      <dl className="grid grid-cols-2 gap-5 sm:grid-cols-3">
        <Field label="funder"><AddressLink address={b.funder} /></Field>
        <Field label="principal"><Qor wei={b.amount} /></Field>
        <Field label="challenge reward"><Qor wei={b.challengeReward} /></Field>
        <Field label="bond"><Qor wei={b.bondAmount} /></Field>
        <Field label="deadline"><Countdown to={b.deadline} /></Field>
        <Field label="claim timeout">{Number(b.claimTimeout) / SECONDS_PER_HOUR}h</Field>
        <Field label="claim round">{b.claimRound.toString()}</Field>
        {!isZeroAddress(b.payee) && (
          <Field label="claimant / payee"><AddressLink address={b.payee} /></Field>
        )}
        {b.claimExpiresAt > 0n && (
          <Field label="claim expires"><Countdown to={b.claimExpiresAt} /></Field>
        )}
        {!isZeroHash(b.payeeIdentityHash) && (
          <Field label="identity hash">{b.payeeIdentityHash.slice(0, 18)}…</Field>
        )}
        {b.challengeEndsAt > 0n && (
          <Field label="challenge ends"><Countdown to={b.challengeEndsAt} /></Field>
        )}
        {!isZeroAddress(b.disputer) && (
          <Field label="disputer"><AddressLink address={b.disputer} /></Field>
        )}
        <Field label="work hash">{b.workHash.slice(0, 18)}…</Field>
        <Field label="initial verdict">
          {initialVerdictLabel(b)}
          {b.initialMergedAt > 0n && ` · merged ${new Date(Number(b.initialMergedAt) * 1000).toLocaleDateString()}`}
        </Field>
      </dl>
    </Card>
  );
}
