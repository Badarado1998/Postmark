import type { EscrowLog } from "../../chain/indexer";
import { AddressLink, Card, Qor, SectionLabel } from "../../components/ui";

type IndexedEvent = EscrowLog;
type CreditArgs = { account?: string; amount?: bigint; payeeGated?: boolean };

export const eventsFor = (events: readonly IndexedEvent[] | undefined, id: bigint) =>
  (events ?? []).filter((e) => (e.args as { bountyId?: bigint }).bountyId === id);

/** Outcome of a settled bounty: dispute verdict (if any) and the credits it posted. */
export function Ruling({ state, events }: { state: number; events: IndexedEvent[] }) {
  const resolved = events.find((e) => e.eventName === "DisputeResolved");
  const credits = events.filter((e) => e.eventName === "Credited");
  const upheld = (resolved?.args as { upheld?: boolean } | undefined)?.upheld;
  return (
    <Card>
      <SectionLabel>ruling</SectionLabel>
      <p className="mt-2 text-sm text-gray">
        {state === 4 ? "Paid" : "Refunded"}
        {resolved
          ? <> — the dispute was {upheld ? <span className="text-orange">upheld</span> : <span className="text-deep">rejected</span>}.</>
          : " — unchallenged verdict finalized."}
      </p>
      {credits.length > 0 && (
        <ul className="mt-2 space-y-1 font-mono text-xs text-gray">
          {credits.map((e, i) => {
            const a = e.args as CreditArgs;
            return (
              <li key={i}>
                <AddressLink address={a.account} />
                {" "}credited {a.amount !== undefined ? <Qor wei={a.amount} /> : "?"}
                {a.payeeGated ? " (payee-gated)" : ""}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
