import { Link } from "react-router";
import { FadeIn } from "./FadeIn";
import { ProductFrame } from "./ProductFrame";

export function Hero() {
  return (
    <section className="relative overflow-hidden px-4 pb-12 pt-16 md:pb-20 text-center md:pt-24">
      <div className="relative z-10 mx-auto max-w-3xl">
        <FadeIn>
          <h1 className="text-5xl font-semibold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
            Bounties that pay when the work is{" "}
            <span className="text-deep">verified</span>.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-charcoal">
            Fund a real GitHub issue with test QOR. Two of three ML-DSA-87
            verifier seals release the bounty after a 24-hour challenge window.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/create"
              className="rounded-lg bg-deep px-6 py-3 font-medium text-paper transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep">
              Fund a bounty
            </Link>
            <Link to="/explore"
              className="rounded-lg border border-ink/25 px-6 py-3 font-medium text-ink transition hover:bg-ink/5">
              Browse bounties
            </Link>
          </div>
        </FadeIn>
        <FadeIn className="relative z-10 mt-12">
          <ProductFrame />
        </FadeIn>
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 top-1/3 bg-[radial-gradient(ellipse_at_50%_72%,#d9e6d9_0%,transparent_68%)]" />
    </section>
  );
}
