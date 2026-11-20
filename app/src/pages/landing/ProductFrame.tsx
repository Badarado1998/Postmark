import { StatusChip, Qor } from "../../components/ui";

/* ------------------------------------------------------------------ */
/* Framed product view: a real bounty-detail card with fixture data.   */
/* ------------------------------------------------------------------ */

export function ProductFrame() {
  return (
    <div className="overflow-hidden rounded-xl border border-ink/15 bg-white shadow-lg shadow-ink/5">
      <div className="flex items-center gap-2 border-b border-ink/10 bg-paper px-4 py-2.5">
        <span className="size-2 rounded-full border border-ink/30" />
        <span className="font-mono text-[10px] text-gray">Example · bounty detail</span>
      </div>
      <div className="p-5 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold tracking-tight">Example issue</h3>
          <StatusChip state={4} />
        </div>
        <p className="mt-1 font-mono text-xs text-gray">owner/repo · pull/1 · merged</p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["principal", <Qor key="r" wei={250000000000000000n} className="font-mono text-sm" />],
            ["bond", <Qor key="b" wei={50000000000000000n} className="font-mono text-sm" />],
            ["verdict", <span key="v" className="font-mono text-sm">PAY · 2 of 3</span>],
            ["challenge", <span key="c" className="font-mono text-sm">passed</span>],
          ].map(([label, v]) => (
            <div key={label as string} className="rounded-lg border border-ink/10 bg-paper px-3 py-2">
              <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-gray">{label}</div>
              <div className="mt-0.5">{v}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-lg bg-leaf/30 px-3 py-2.5 font-mono text-[10px] leading-relaxed text-charcoal">
          verdictMessage → pqcVerify 0x…0a01 ×2 · Credited(payee, 0.25 QOR, gated)
        </div>
      </div>
    </div>
  );
}
