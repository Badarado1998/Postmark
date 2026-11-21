import { FadeIn } from "./FadeIn";
import { BUILT_ON, STEPS } from "./content";

export function BuiltOn() {
  return (
    <section className="on-dark border-b border-paper/10 bg-ink px-4 py-6">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-8 gap-y-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-paper/50">built on</span>
        {BUILT_ON.map((b) => (
          <span key={b} className="font-mono text-xs text-paper/85">{b}</span>
        ))}
      </div>
    </section>
  );
}

export function ValueProp() {
  return (
    <section className="on-dark bg-ink px-4 pb-24 pt-16 text-paper">
      <FadeIn className="mx-auto max-w-3xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-lime">post-quantum by design</p>
        <h2 className="mt-4 text-4xl font-semibold tracking-tight md:text-6xl">
          A leaked key <span className="text-lime">can't release</span> a bounty.
        </h2>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-paper/75">
          An ECDSA key alone can't claim a bounty, release it, or withdraw a payout. Claims and
          verdicts carry ML-DSA-87 signatures verified by chain precompiles, and payee
          withdrawals need a live registered PQ key.
        </p>
      </FadeIn>
    </section>
  );
}

const STEP_TILES = ["bg-leaf text-ink", "bg-mustard text-ink", "bg-orange text-ink", "bg-salmon text-ink", "bg-deep text-paper"];

export function HowItWorks() {
  return (
    <section className="bg-paper px-4 py-20">
      <FadeIn className="mx-auto max-w-5xl">
        <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">How it works</h2>
        <p className="mt-3 max-w-xl text-charcoal">From a GitHub issue to a withdrawn payout in five steps.</p>
        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map(([t, b], i) => (
            <li key={t} className="rounded-xl border border-ink/10 bg-white p-5">
              <span className={`grid size-9 place-items-center rounded-lg font-mono text-sm font-semibold ${STEP_TILES[i]}`}>
                {i + 1}
              </span>
              <h3 className="mt-4 font-semibold tracking-tight">{t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-charcoal">{b}</p>
            </li>
          ))}
        </ol>
      </FadeIn>
    </section>
  );
}
