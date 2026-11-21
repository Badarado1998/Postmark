import type { EscrowLog } from "../../chain/indexer";
import { explorerTx } from "../../chain/config";
import { Card, SectionLabel } from "../../components/ui";
import { STATUS_STYLES, type BountyStateName } from "../../components/status";

const EVENT_STATE: Record<string, BountyStateName> = {
  BountyCreated: "Open", BountyWork: "Open", Claimed: "Claimed", ClaimReleased: "Refunded",
  VerdictSubmitted: "Pending", Disputed: "Disputed", DisputeResolved: "Disputed",
  Settled: "Paid", Credited: "Paid", Withdrawn: "Paid",
};

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

export function Timeline({ events }: { events: EscrowLog[] }) {
  return (
    <Card>
      <SectionLabel>timeline</SectionLabel>
      <ol className="mt-4 space-y-3 border-l border-ink/10 pl-4">
        {events.map((e, i) => (
          <li key={i} className="relative text-sm">
            <span className={`absolute -left-[22px] top-1 size-3 rounded-full ring-4 ring-white ${STATUS_STYLES[EVENT_STATE[e.eventName] ?? "Open"].dot}`} aria-hidden />
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
    </Card>
  );
}
