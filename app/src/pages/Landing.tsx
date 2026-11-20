import { Link } from "react-router";
import { motion, useReducedMotion } from "motion/react";
import { StatusChip, Qor } from "../components/ui";
import { Logo } from "../components/Logo";
import { ESCROW_ADDRESS, explorerAddress, explorerTx } from "../chain/config";

/* ------------------------------------------------------------------ */
/* Signature pixel band: horizontal stripes with dithered stair edges. */
/* ------------------------------------------------------------------ */

const STRIPES = ["#23663F", "#7DB069", "#F1A783", "#CE8E3D", "#DDC362"];

function PixelBand() {
  const reduce = useReducedMotion();
  const W = 1200;
  const stripeH = 24;
  const ditherRows = 3;
  const px = 8; // pixel size
  return (
    <svg viewBox={`0 0 ${W} ${STRIPES.length * stripeH}`}
      preserveAspectRatio="none" aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 h-28 w-full md:h-36">
      <motion.g animate={{ x: reduce ? 0 : -px * 4 }}
        transition={reduce ? { duration: 0 } : { repeat: Infinity, repeatType: "mirror", duration: 8, ease: "linear" }}>
        {STRIPES.map((c, i) => (
          <g key={c}>
            {/* dithered stair edge into the next stripe */}
            {i > 0 && Array.from({ length: ditherRows }).map((_, r) =>
              Array.from({ length: W / (px * 4) }).map((_, j) => {
                const on = (j + r + i) % 2 === 0;
                return on ? (
                  <rect key={`${r}-${j}`}
                    x={j * px * 4 + ((r + i) % 2) * px * 2}
                    y={i * stripeH - (ditherRows - r) * px}
                    width={px} height={px} fill={c} />
                ) : null;
              })
            )}
            <rect x={0} y={i * stripeH} width={W} height={stripeH} fill={c} />
          </g>
        ))}
      </motion.g>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Framed product view: a real bounty-detail card with fixture data.   */
/* ------------------------------------------------------------------ */

function ProductFrame() {
  return (
    <div className="overflow-hidden rounded-xl border border-ink/15 bg-white shadow-xl shadow-ink/10">
      <div className="flex items-center gap-2 border-b border-ink/10 bg-paper px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-salmon" />
        <span className="size-2.5 rounded-full bg-mustard" />
        <span className="size-2.5 rounded-full bg-leaf" />
        <span className="ml-2 font-mono text-[10px] text-gray">postmark / bounty detail — example</span>
        <span className="ml-auto rounded-full border border-mustard bg-mustard/30 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-orange">example</span>
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
        <div className="mt-4 rounded-lg bg-ink px-3 py-2.5 font-mono text-[10px] leading-relaxed text-paper/70">
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

const FEATURES: [string, string, string][] = [
  ["PQ-signed claims", "Claims carry an ML-DSA-87 signature checked by a chain precompile, not by us.", "#7DB069"],
  ["2-of-3 quorum", "Two matching verifier seals release the escrow. No single signer can settle alone.", "#DDC362"],
  ["Bonded disputes", "A dispute posts a bond that freezes the payout until verifiers rule again.", "#F1A783"],
  ["GitHub merge check", "Verdict evidence binds to the merged PR — the payout can't drift from the work.", "#CE8E3D"],
  ["Local signer", "ML-DSA-87 keys live in a local signer process, never in the browser.", "#7DB069"],
  ["Pull payouts", "Pull payments: payee credits withdraw only while a live PQ key is registered.", "#DDC362"],
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

function PixelIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 16 16" className="size-5" aria-hidden>
      <rect x="1" y="1" width="14" height="14" fill="none" stroke={color} strokeWidth="1.5" />
      <rect x="4" y="4" width="3" height="3" fill={color} />
      <rect x="9" y="9" width="3" height="3" fill={color} />
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
      <section className="relative overflow-hidden px-4 pb-48 pt-16 text-center md:pt-24">
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
        <PixelBand />
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
      <section className="bg-ink px-4 py-20 text-paper">
        <FadeIn className="mx-auto max-w-3xl">
          <h2 className="text-4xl font-semibold tracking-tight md:text-5xl">
            A leaked key can't release a bounty.
          </h2>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-paper/70">
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
      <section className="bg-ink px-4 py-20 text-paper">
        <FadeIn className="mx-auto max-w-5xl">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Post-quantum by construction, not by label.
          </h2>
          <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(([t, b, c]) => (
              <div key={t} className="bg-charcoal p-6">
                <PixelIcon color={c} />
                <h3 className="mt-4 font-semibold tracking-tight">{t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-paper/60">{b}</p>
              </div>
            ))}
          </div>
        </FadeIn>
      </section>

      {/* ---------- deep-green disputes ---------- */}
      <section className="bg-deep px-4 py-20 text-paper">
        <FadeIn className="mx-auto grid max-w-5xl items-center gap-10 md:grid-cols-2">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              A bad verdict gets challenged, not settled.
            </h2>
            <p className="mt-5 leading-relaxed text-paper/80">
              During the 24-hour window anyone can post a bond and dispute.
              The bond freezes the payout, and the verifiers rule on a second
              verdict — the same 2-of-3 quorum, the same ML-DSA-87 seals. If the
              dispute is upheld, the disputer takes the bond and the challenge
              reward; if it is rejected, the bond goes to the verdict's payee
              and the reward to the funder.
            </p>
          </div>
          <div className="rounded-xl border border-paper/20 bg-ink/20 p-6 font-mono text-xs leading-relaxed text-paper/80">
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
      <section className="relative bg-leaf px-4 py-20 text-center text-ink">
        <div className="pixel-dither absolute inset-x-0 top-0 h-3 -translate-y-full text-leaf" aria-hidden />
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
        <div className="mx-auto grid max-w-5xl gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <Logo size={22} />
              <span className="font-semibold tracking-tight">Postmark</span>
            </div>
            <p className="mt-3 font-mono text-[11px] leading-relaxed text-paper/50">
              GitHub bounties released by 2-of-3 ML-DSA-87 verifier verdicts on QoreChain.
            </p>
          </div>
          <div>
            <h3 className="font-mono text-[10px] uppercase tracking-[0.25em] text-paper/40">App</h3>
            <ul className="mt-3 space-y-2 text-sm text-paper/70">
              <li><Link className="hover:text-paper" to="/explore">Explore bounties</Link></li>
              <li><Link className="hover:text-paper" to="/create">Fund a bounty</Link></li>
              <li><Link className="hover:text-paper" to="/me">My bounties</Link></li>
              <li><Link className="hover:text-paper" to="/signer">Local signer</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="font-mono text-[10px] uppercase tracking-[0.25em] text-paper/40">Protocol</h3>
            <ul className="mt-3 space-y-2 text-sm text-paper/70">
              <li><a className="hover:text-paper" href={explorerAddress(ESCROW_ADDRESS)} target="_blank" rel="noreferrer">Escrow contract</a></li>
              <li><a className="hover:text-paper" href={explorerAddress("0x0000000000000000000000000000000000000a01")} target="_blank" rel="noreferrer">pqcVerify precompile</a></li>
              <li><a className="hover:text-paper" href={explorerAddress("0x0000000000000000000000000000000000000a02")} target="_blank" rel="noreferrer">pqcKeyStatus precompile</a></li>
            </ul>
          </div>
          <div>
            <h3 className="font-mono text-[10px] uppercase tracking-[0.25em] text-paper/40">Docs</h3>
            <ul className="mt-3 space-y-2 text-sm text-paper/70">
              <li>SPEC.md</li>
              <li>THREAT_MODEL.md</li>
              <li>docs/AUDIT.md</li>
            </ul>
          </div>
        </div>
        <div className="mx-auto mt-12 flex max-w-5xl items-center justify-between border-t border-white/10 pt-6">
          <p className="font-mono text-[10px] text-paper/40">diana testnet · test QOR, no monetary value</p>
          <div className="flex gap-2" aria-hidden>
            {STRIPES.map((c) => <span key={c} className="size-3" style={{ background: c }} />)}
          </div>
        </div>
      </section>
    </div>
  );
}
