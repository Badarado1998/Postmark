import { FadeIn } from "./FadeIn";
import { FEATURES } from "./content";

function PixelIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-5 text-deep" aria-hidden>
      <rect x="1" y="1" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="4" y="4" width="3" height="3" fill="currentColor" />
      <rect x="9" y="9" width="3" height="3" fill="currentColor" />
    </svg>
  );
}

export function Features() {
  return (
    <section className="px-4 py-20">
      <FadeIn className="mx-auto max-w-5xl">
        <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
          Post-quantum by construction, not by label.
        </h2>
        <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-ink/10 bg-ink/10 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([t, b]) => (
            <div key={t} className="bg-white p-6">
              <PixelIcon />
              <h3 className="mt-4 font-semibold tracking-tight">{t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray">{b}</p>
            </div>
          ))}
        </div>
      </FadeIn>
    </section>
  );
}

export function Disputes() {
  return (
    <section className="border-y border-ink/10 bg-leaf/25 px-4 py-20">
      <FadeIn className="mx-auto grid max-w-5xl items-center gap-10 md:grid-cols-2">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            A bad verdict gets challenged, not settled.
          </h2>
          <p className="mt-5 leading-relaxed text-charcoal">
            During the 24-hour window anyone can post a bond and dispute.
            The bond freezes the payout, and the verifiers rule on a second
            verdict — the same 2-of-3 quorum, the same ML-DSA-87 seals. If the
            dispute is upheld, the disputer takes the bond and the challenge
            reward; if it is rejected, the bond goes to the verdict's payee
            and the reward to the funder.
          </p>
        </div>
        <div className="rounded-xl border border-ink/10 bg-white p-6 font-mono text-xs leading-relaxed text-charcoal">
          Disputed(bounty, disputer, bond)<br />
          → payout frozen<br />
          DisputeResolved(upheld=false) — PAY stands<br />
          → payee credited principal + bond (gated)<br />
          → funder credited challenge reward<br />
          Settled(Paid)
        </div>
      </FadeIn>
    </section>
  );
}
