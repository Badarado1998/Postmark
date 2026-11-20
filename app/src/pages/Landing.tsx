import { Link } from "react-router";
import { motion, useReducedMotion } from "motion/react";
import { StatusChip, Qor } from "../components/ui";
import { Logo } from "../components/Logo";
import { ESCROW_ADDRESS, explorerAddress, explorerTx } from "../chain/config";

/* ------------------------------------------------------------------ */
/* Framed product view: a real bounty-detail card with fixture data.   */
/* ------------------------------------------------------------------ */

function ProductFrame() {
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

/* ------------------------------------------------------------------ */
/* Sections                                                            */
/* ------------------------------------------------------------------ */

const BUILT_ON = [
  "QoreChain diana", "ML-DSA-87", "pqcVerify 0x…0a01", "pqcKeyStatus 0x…0a02", "GitHub",
];

const STEPS = [
  ["Fund", "A maintainer escrows test QOR against a real GitHub issue or PR."],
  ["Claim", "A contributor comments on the issue, then claims with an ML-DSA-87 signature."],
  ["Verify 2 of 3", "Three independent verifiers sign a verdict; any two matching seals settle it."],
  ["24h challenge", "Every verdict sits open a day. Anyone can post a bond and dispute it."],
  ["Withdraw", "The payee pulls their credit; payee credits need a live registered PQ key."],
];

const FEATURES: [string, string][] = [
  ["PQ-signed claims", "Claims carry an ML-DSA-87 signature checked by a chain precompile, not by us."],
  ["2-of-3 quorum", "Two matching verifier seals release the escrow. No single signer can settle alone."],
  ["Bonded disputes", "A dispute posts a bond that freezes the payout until verifiers rule again."],
  ["GitHub merge check", "Verdict evidence binds to the merged PR — the payout can't drift from the work."],
  ["Local signer", "ML-DSA-87 keys live in a local signer process, never in the browser."],
  ["Pull payouts", "Pull payments: payee credits withdraw only while a live PQ key is registered."],
];

const PROOF = [
  { label: "production escrow", value: ESCROW_ADDRESS, mono: true,
    href: explorerAddress(ESCROW_ADDRESS) },
  { label: "bounty #17 dispute resolved", value: "resolveDispute", mono: false,
    href: explorerTx("0xeaf7dde973740f3fd2838fba70df3bf0ce6065f0829aa951e5147d1a5af3e8a0") },
  { label: "bounty #17 payout withdrawn", value: "withdraw", mono: false,
    href: explorerTx("0x9aaabb1eb2a780bca7e0093fdbe78445825c231abd154d350c3516548f089cac") },
  { label: "test suite", value: "126 Foundry tests, real ML-DSA-87 signatures", mono: false },
  { label: "audit", value: "QCAI Contract Auditor — docs/AUDIT.md", mono: false },
];

const FAQ = [
  ["Is this real money?",
   "No. Postmark pays in diana test QOR, which has no monetary value. It's a testnet payout demonstration."],
  ["Why a local signer?",
   "QoreX can't yet sign arbitrary ML-DSA-87 messages, so claims and verdicts are signed by a small local process. Your PQ keys never touch the browser."],
  ["What happens on a dispute?",
   "Anyone can post a bond before the 24-hour challenge window closes. The bond freezes the payout and the verifiers rule a second time."],
  ["Who can verify?",
   "Three verifier accounts chosen by the funder at creation. Each must hold a registered, live ML-DSA-87 key on diana."],
  ["What if nobody claims?",
   "The funder can refund the escrow after the deadline passes."],
  ["What if a PQ key is lost?",
   "Payee credits need a live registered key to withdraw; funder and disputer credits are ungated. If a payee's key lapses, their credit waits in the escrow until a key is registered."],
];

function PixelIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-5 text-deep" aria-hidden>
      <rect x="1" y="1" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="4" y="4" width="3" height="3" fill="currentColor" />
      <rect x="9" y="9" width="3" height="3" fill="currentColor" />
    </svg>
  );
}

function FadeIn({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className}
      initial={reduce ? false : { y: 24 }}
      whileInView={{ y: 0 }}
      viewport={{ once: true, amount: 0 }}
      transition={{ duration: reduce ? 0 : 0.5, ease: "easeOut" }}>
      {children}
    </motion.div>
  );
}

export default function Landing() {
  return (
    <div className="-mx-4">
      {/* ---------- hero ---------- */}
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

      {/* ---------- built on ---------- */}
      <section className="border-y border-ink/10 bg-paper px-4 py-6">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-8 gap-y-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-gray">built on</span>
          {BUILT_ON.map((b) => (
            <span key={b} className="font-mono text-xs text-ink/70">{b}</span>
          ))}
        </div>
      </section>

      {/* ---------- dark value prop ---------- */}
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

      {/* ---------- how it works ---------- */}
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

      {/* ---------- dark features grid ---------- */}
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

      {/* ---------- deep-green disputes ---------- */}
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

      {/* ---------- proof ---------- */}
      <section className="px-4 py-20">
        <FadeIn className="mx-auto max-w-5xl">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Proof, not promises</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PROOF.map((p) => (
              <div key={p.label} className="rounded-xl border border-ink/10 bg-white p-5">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-gray">{p.label}</div>
                {p.href ? (
                  <a href={p.href} target="_blank" rel="noreferrer"
                    className={`mt-2 block break-all text-sm text-deep underline decoration-deep/30 underline-offset-2 hover:decoration-deep ${p.mono ? "font-mono text-xs" : "font-medium"}`}>
                    {p.value}
                  </a>
                ) : (
                  <p className="mt-2 text-sm text-ink">{p.value}</p>
                )}
              </div>
            ))}
          </div>
        </FadeIn>
      </section>

      {/* ---------- FAQ ---------- */}
      <section className="border-t border-ink/10 px-4 py-20">
        <FadeIn className="mx-auto grid max-w-5xl gap-10 md:grid-cols-[1fr_1.6fr]">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Questions</h2>
          <div className="divide-y divide-ink/10 border-y border-ink/10">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium tracking-tight">
                  {q}
                  <span className="text-deep transition-transform group-open:rotate-45" aria-hidden>+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-gray">{a}</p>
              </details>
            ))}
          </div>
        </FadeIn>
      </section>

      {/* ---------- lime CTA with dithered edges ---------- */}
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

      {/* ---------- dark footer ---------- */}
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
    </div>
  );
}
