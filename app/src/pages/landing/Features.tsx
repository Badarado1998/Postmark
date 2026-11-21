import type { ReactNode } from "react";
import { FadeIn } from "./FadeIn";
import { FEATURES } from "./content";
import { DitherEdge } from "../../components/PixelBand";

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const ICONS: ReactNode[] = [
  <svg key="key" viewBox="0 0 24 24" {...stroke}><circle cx="8" cy="15" r="4" /><path d="M11 12l8-8M16 7l3 3" /></svg>,
  <svg key="quorum" viewBox="0 0 24 24" {...stroke}><circle cx="7" cy="9" r="3" /><circle cx="17" cy="9" r="3" /><path d="M3 20c0-3 2-5 4-5M21 20c0-3-2-5-4-5M9 20c0-3 1.5-5 3-5s3 2 3 5" /></svg>,
  <svg key="shield" viewBox="0 0 24 24" {...stroke}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></svg>,
  <svg key="merge" viewBox="0 0 24 24" {...stroke}><circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="12" r="2.5" /><path d="M6 8.5v7M8.5 6c5 0 7 2 7 4.5" /></svg>,
  <svg key="terminal" viewBox="0 0 24 24" {...stroke}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9l3 3-3 3M13 15h4" /></svg>,
  <svg key="wallet" viewBox="0 0 24 24" {...stroke}><path d="M4 7h14a2 2 0 012 2v9a2 2 0 01-2 2H4z" /><path d="M4 7l2-3h10M16 14h2" /></svg>,
];
const TILES = ["bg-leaf", "bg-mustard", "bg-salmon", "bg-orange", "bg-leaf", "bg-mustard"];

export function Features() {
  return (
    <section className="on-dark bg-charcoal px-4 py-20 text-paper">
      <FadeIn className="mx-auto max-w-5xl">
        <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
          Post-quantum by construction, not by label.
        </h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([t, b], i) => (
            <div key={t} className="rounded-xl border border-paper/10 bg-ink p-6">
              <span className={`grid size-10 place-items-center rounded-lg text-ink ${TILES[i]}`}>
                <span className="size-5" aria-hidden>{ICONS[i]}</span>
              </span>
              <h3 className="mt-5 font-semibold tracking-tight">{t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-paper/65">{b}</p>
            </div>
          ))}
        </div>
      </FadeIn>
    </section>
  );
}

export function Disputes() {
  return (
    <section className="on-dark relative bg-deep px-4 py-20 text-paper">
      <DitherEdge color="#32312F" className="absolute inset-x-0 top-0" />
      <FadeIn className="mx-auto grid max-w-5xl items-center gap-10 md:grid-cols-2">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            A bad verdict gets challenged, not settled.
          </h2>
          <p className="mt-5 leading-relaxed text-paper/85">
            During the 24-hour window anyone can post a bond and dispute.
            The bond freezes the payout, and the verifiers rule on a second
            verdict — the same 2-of-3 quorum, the same ML-DSA-87 seals. If the
            dispute is upheld, the disputer takes the bond and the challenge
            reward; if it is rejected, the bond goes to the verdict's payee
            and the reward to the funder.
          </p>
        </div>
        <div className="rounded-xl border border-paper/15 bg-ink p-6 font-mono text-xs leading-relaxed text-paper/85 shadow-xl">
          <div className="mb-3 flex gap-1.5" aria-hidden>
            <span className="size-2.5 rounded-full bg-salmon" /><span className="size-2.5 rounded-full bg-mustard" /><span className="size-2.5 rounded-full bg-leaf" />
          </div>
          <span className="text-salmon">Disputed</span>(bounty, disputer, bond)<br />
          → payout frozen<br />
          <span className="text-leaf">DisputeResolved(upheld=false)</span> — PAY stands<br />
          → payee credited principal + bond (gated)<br />
          → funder credited challenge reward<br />
          <span className="text-lime">Settled(Paid)</span>
        </div>
      </FadeIn>
    </section>
  );
}
