import { Card, Countdown, Qor, SectionLabel } from "../../components/ui";
import { usePqcStatus } from "../../hooks/queries";
import { AddressLink } from "../../components/ui";
import { nowSec } from "../../chain/time";
import type { Bounty } from "../../chain/client";

const CHALLENGE_WINDOW_SEC = 24n * 3600n;

/** Fraction of [start, end] elapsed, clamped to 0..1. */
export function progress(start: bigint, end: bigint, now: bigint): number {
  if (end <= start) return 1;
  const f = Number(now - start) / Number(end - start);
  return Math.min(1, Math.max(0, f));
}

function Bar({ label, fraction, end, tone }: { label: string; fraction: number; end: bigint; tone: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="font-mono uppercase tracking-[0.14em] text-gray">{label}</span>
        <Countdown to={end} className="font-mono text-ink" />
      </div>
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={Math.round(fraction * 100)} className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink/10">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.round(fraction * 100)}%` }} />
      </div>
    </div>
  );
}

export function AmountBreakdown({ bounty: b }: { bounty: Bounty }) {
  const rows: [string, bigint][] = [["principal", b.amount], ["challenge reward", b.challengeReward], ["dispute bond", b.bondAmount]];
  return (
    <Card>
      <SectionLabel>amounts</SectionLabel>
      <dl className="mt-3 space-y-2 text-sm">
        {rows.map(([label, wei]) => (
          <div key={label} className="flex items-center justify-between gap-3">
            <dt className="text-charcoal">{label}</dt>
            <dd className="font-mono"><Qor wei={wei} /></dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3 border-t border-ink/10 pt-2 font-semibold">
          <dt>locked at creation</dt>
          <dd className="font-mono"><Qor wei={b.amount + b.challengeReward} /></dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-gray">The bond is only locked by whoever disputes a verdict.</p>
    </Card>
  );
}

export function Deadlines({ bounty: b }: { bounty: Bounty }) {
  const now = nowSec();
  return (
    <Card>
      <SectionLabel>deadlines</SectionLabel>
      <div className="mt-3 space-y-4">
        <div className="flex items-center justify-between text-xs">
          <span className="font-mono uppercase tracking-[0.14em] text-gray">bounty deadline</span>
          <Countdown to={b.deadline} className="font-mono text-ink" />
        </div>
        {b.state === 1 && b.claimExpiresAt > 0n && (
          <Bar label="claim expires" end={b.claimExpiresAt} tone="bg-mustard"
            fraction={progress(b.claimExpiresAt - b.claimTimeout, b.claimExpiresAt, now)} />
        )}
        {(b.state === 2 || b.state === 3) && b.challengeEndsAt > 0n && (
          <Bar label="challenge window" end={b.challengeEndsAt} tone="bg-orange"
            fraction={progress(b.challengeEndsAt - CHALLENGE_WINDOW_SEC, b.challengeEndsAt, now)} />
        )}
      </div>
    </Card>
  );
}

function VerifierRow({ addr }: { addr: `0x${string}` }) {
  const s = usePqcStatus(addr);
  return (
    <li className="flex items-center justify-between gap-2">
      <AddressLink address={addr} className="font-mono text-sm hover:text-deep" />
      {s.isPending && <span className="text-xs text-gray">…</span>}
      {s.data && (
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.data.live ? "bg-leaf text-ink" : "bg-gray/30 text-charcoal"}`}>
          {s.data.live ? "PQ key live" : "no live key"}
        </span>
      )}
      {s.error && <span className="text-[10px] text-gray">key status unavailable</span>}
    </li>
  );
}

export function Verifiers({ bounty: b }: { bounty: Bounty }) {
  return (
    <Card>
      <SectionLabel>verifiers</SectionLabel>
      <ul className="mt-3 space-y-2.5">{b.verifiers.map((v) => <VerifierRow key={v} addr={v} />)}</ul>
      <p className="mt-3 text-xs text-gray">Any two matching ML-DSA-87 verdicts settle the bounty.</p>
    </Card>
  );
}
