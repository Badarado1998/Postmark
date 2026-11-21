import { BlurHeadline, MagnetButton } from "../../components/motion";
import { Link } from "react-router";
import { FadeIn } from "./FadeIn";
import { ProductFrame } from "./ProductFrame";
import { PixelBand } from "../../components/PixelBand";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-paper px-4 pt-14 text-center md:pt-20">
      <div className="relative z-10 mx-auto max-w-3xl">
        <FadeIn>
          <h1 className="text-5xl font-semibold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
            <BlurHeadline line1="Bounties that pay when" line2="the work is" accent="verified" tail="." accentClass="text-deep" />
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-charcoal">
            Fund a real GitHub issue with test QOR. Two of three ML-DSA-87
            verifier seals release the bounty after a 24-hour challenge window.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <MagnetButton>
              <Link to="/create"
                className="inline-block rounded-lg bg-deep px-6 py-3 font-medium text-paper transition hover:brightness-110">
                Fund a bounty
              </Link>
            </MagnetButton>
            <Link to="/explore"
              className="rounded-lg border border-ink/30 bg-white px-6 py-3 font-medium text-ink transition hover:bg-ink/5">
              Browse bounties
            </Link>
          </div>
          <p className="mt-4 text-sm text-charcoal">
            New here? <Link to="/start" className="font-medium text-deep underline underline-offset-4">Get started in a few steps</Link>
          </p>
        </FadeIn>
      </div>
      <div className="relative mt-12 pb-16 md:pb-24">
        <PixelBand className="absolute inset-x-0 bottom-0 h-28 md:h-40" stripeHeight={20} />
        <FadeIn className="relative z-10 mx-auto max-w-3xl">
          <ProductFrame />
        </FadeIn>
      </div>
    </section>
  );
}
