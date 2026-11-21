import { STATUS_STYLES, type BountyStateName } from "../../components/status";

interface Step { name: BountyStateName; branch?: boolean }

/** Open → Claimed → Pending → Paid/Refunded, with the dispute branch when it applies. */
export function lifecycleSteps(state: number): { steps: Step[]; current: number } {
  const end: BountyStateName = state === 5 ? "Refunded" : "Paid";
  const base: Step[] = [{ name: "Open" }, { name: "Claimed" }, { name: "Pending" }];
  if (state === 3) return { steps: [...base, { name: "Disputed", branch: true }, { name: end }], current: 3 };
  const steps = [...base, { name: end }];
  const current = state === 4 || state === 5 ? 3 : state;
  return { steps, current };
}

export function Lifecycle({ state }: { state: number }) {
  const { steps, current } = lifecycleSteps(state);
  const settled = state === 4 || state === 5;
  return (
    <ol aria-label="Bounty lifecycle" className="flex flex-wrap items-center gap-y-2 py-1">
      {steps.map((s, i) => {
        const done = i < current || (settled && i === current);
        const active = i === current && !settled;
        const style = STATUS_STYLES[s.name];
        return (
          <li key={s.name} className="flex items-center gap-1" aria-current={active ? "step" : undefined}>
            {i > 0 && <span aria-hidden className={`h-0.5 w-5 sm:w-8 ${done || active ? style.bar : "bg-ink/15"}`} />}
            <span className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
              done || active ? style.pill : "border border-ink/15 bg-white text-gray"} ${active ? "ring-2 ring-ink/30" : ""}`}>
              <span aria-hidden className="grid size-4 place-items-center rounded-full bg-ink/15 text-[9px]">
                {done ? "✓" : i + 1}
              </span>
              {s.name}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
