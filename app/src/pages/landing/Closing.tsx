import { Link } from "react-router";
import { Logo } from "../../components/Logo";
import { PixelBand, DitherEdge } from "../../components/PixelBand";
import { ESCROW_ADDRESS, explorerAddress } from "../../chain/config";
import { FadeIn } from "./FadeIn";
import { StarLink } from "../../components/motion";

export function CtaBand() {
  return (
    <section className="relative bg-lime px-4 py-20 text-center text-ink">
      <DitherEdge color="#D4F57A" className="absolute inset-x-0 top-0 -translate-y-full" />
      <FadeIn>
        <h2 className="text-4xl font-semibold tracking-tight md:text-5xl">
          Fund your first bounty in minutes.
        </h2>
        <p className="mx-auto mt-4 max-w-md text-ink/75">Escrow test QOR against a real issue and let three post-quantum verifiers settle it.</p>
        <div className="mt-8">
          <StarLink to="/create" className="inline-block rounded-lg bg-ink px-8 py-3 font-medium text-paper transition hover:bg-charcoal">
            Fund a bounty
          </StarLink>
        </div>
        <p className="mt-4 font-mono text-[11px] text-ink/70">diana testnet · test QOR, no monetary value</p>
      </FadeIn>
      <DitherEdge color="#D4F57A" className="absolute inset-x-0 bottom-0 translate-y-full" />
    </section>
  );
}

const PRECOMPILES = [
  ["pqcVerify precompile", "0x0000000000000000000000000000000000000a01"],
  ["pqcKeyStatus precompile", "0x0000000000000000000000000000000000000a02"],
] as const;

export function Footer() {
  return (
    <footer className="on-dark bg-ink text-paper">
      <PixelBand className="h-3" stripeHeight={8} />
      <div className="mx-auto grid max-w-5xl gap-10 px-4 py-14 sm:grid-cols-3">
        <div>
          <div className="flex items-center gap-2">
            <Logo size={22} />
            <span className="font-semibold tracking-tight">Postmark</span>
          </div>
          <p className="mt-3 font-mono text-[11px] leading-relaxed text-paper/65">
            GitHub bounties released by 2-of-3 ML-DSA-87 verifier verdicts on QoreChain.
          </p>
        </div>
        <div>
          <h3 className="font-mono text-[10px] uppercase tracking-[0.25em] text-paper/60">App</h3>
          <ul className="mt-3 space-y-2 text-sm text-paper/80">
            <li><Link className="hover:text-paper" to="/explore">Explore bounties</Link></li>
            <li><Link className="hover:text-paper" to="/create">Fund a bounty</Link></li>
            <li><Link className="hover:text-paper" to="/me">My bounties</Link></li>
            <li><Link className="hover:text-paper" to="/signer">Local signer</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="font-mono text-[10px] uppercase tracking-[0.25em] text-paper/60">Protocol</h3>
          <ul className="mt-3 space-y-2 text-sm text-paper/80">
            <li><a className="hover:text-paper" href={explorerAddress(ESCROW_ADDRESS)} target="_blank" rel="noreferrer">Escrow contract</a></li>
            {PRECOMPILES.map(([label, addr]) => (
              <li key={addr}><a className="hover:text-paper" href={explorerAddress(addr)} target="_blank" rel="noreferrer">{label}</a></li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mx-auto flex max-w-5xl items-center justify-between border-t border-paper/10 px-4 py-5">
        <p className="font-mono text-[10px] text-paper/60">diana testnet · test QOR, no monetary value</p>
      </div>
    </footer>
  );
}
