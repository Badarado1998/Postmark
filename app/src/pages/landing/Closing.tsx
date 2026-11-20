import { Link } from "react-router";
import { Logo } from "../../components/Logo";
import { ESCROW_ADDRESS, explorerAddress } from "../../chain/config";
import { FadeIn } from "./FadeIn";

export function CtaBand() {
  return (
    <section className="border-t border-ink/10 bg-leaf/30 px-4 py-20 text-center text-ink">
      <FadeIn>
        <h2 className="text-4xl font-semibold tracking-tight md:text-5xl">
          Fund your first bounty in minutes.
        </h2>
        <Link to="/create"
          className="mt-8 inline-block rounded-lg bg-ink px-8 py-3 font-medium text-paper transition hover:brightness-125">
          Fund a bounty
        </Link>
        <p className="mt-4 font-mono text-[11px] text-ink/60">diana testnet · test QOR, no monetary value</p>
      </FadeIn>
    </section>
  );
}

export function Footer() {
  return (
    <section className="bg-ink px-4 py-16 text-paper">
      <div className="mx-auto grid max-w-5xl gap-10 sm:grid-cols-3">
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
            <li><a className="hover:text-paper" href={explorerAddress("0x0000000000000000000000000000000000000a01")} target="_blank" rel="noreferrer">pqcVerify precompile</a></li>
            <li><a className="hover:text-paper" href={explorerAddress("0x0000000000000000000000000000000000000a02")} target="_blank" rel="noreferrer">pqcKeyStatus precompile</a></li>
          </ul>
        </div>
      </div>
      <div className="mx-auto mt-12 flex max-w-5xl items-center justify-between border-t border-white/10 pt-6">
        <p className="font-mono text-[10px] text-paper/60">diana testnet · test QOR, no monetary value</p>
      </div>
    </section>
  );
}
