import { FadeIn } from "./FadeIn";
import { BUILT_ON, STEPS } from "./content";

export function BuiltOn() {
  return (
    <section className="border-y border-ink/10 bg-paper px-4 py-6">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-8 gap-y-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-gray">built on</span>
        {BUILT_ON.map((b) => (
          <span key={b} className="font-mono text-xs text-ink/70">{b}</span>
        ))}
      </div>
    </section>
  );
}

export function ValueProp() {
  return (
    <section className="border-y border-ink/10 bg-white/60 px-4 py-20">
      <FadeIn className="mx-auto max-w-3xl">
        <h2 className="text-4xl font-semibold tracking-tight md:text-5xl">
          A leaked key can't release a bounty.
        </h2>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-gray">
          An ECDSA key alone can't claim a bounty, release it, or withdraw a payout. Claims and
          verdicts carry ML-DSA-87 signatures verified by chain precompiles,
          and payee withdrawals need a live registered PQ key.
        </p>
      </FadeIn>
    </section>
  );
}

export function HowItWorks() {
  return (
    <section className="px-4 py-20">
      <FadeIn className="mx-auto max-w-5xl">
        <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">How it works</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map(([t, b], i) => (
            <div key={t} className="rounded-xl border border-ink/10 bg-white p-5">
              <div className="font-mono text-[10px] text-deep">{String(i + 1).padStart(2, "0")}</div>
              <h3 className="mt-2 font-semibold tracking-tight">{t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray">{b}</p>
            </div>
          ))}
        </div>
      </FadeIn>
    </section>
  );
}
