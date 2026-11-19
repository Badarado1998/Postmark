import { useRef } from "react";
import { Link } from "react-router";
import { motion, useReducedMotion, useScroll, useTransform, useInView } from "motion/react";
import { formatUnits } from "viem";
import { useIndex, useTotalLiabilities, usePqcStatus } from "../hooks/queries";

const EASE = [0.22, 1, 0.36, 1] as const;

function Reveal({ children, delay = 0, className = "" }:
  { children: React.ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className}
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-15% 0px" }}
      transition={{ duration: 0.8, delay, ease: EASE }}>
      {children}
    </motion.div>
  );
}

/** Cancellation waves: three concentric arcs that draw themselves in. */
function CancelWaves({ animate }: { animate: boolean }) {
  const waves = [
    "M0 60 Q60 30 120 60 T240 60 T360 60",
    "M0 75 Q60 45 120 75 T240 75 T360 75",
    "M0 90 Q60 60 120 90 T240 90 T360 90",
  ];
  return (
    <svg viewBox="0 0 360 130" className="w-full max-w-md text-vermilion" aria-hidden>
      {waves.map((d, i) => (
        <motion.path key={i} d={d} fill="none" stroke="currentColor" strokeWidth="3"
          strokeLinecap="round" opacity={0.85 - i * 0.25}
          initial={animate ? { pathLength: 0 } : { pathLength: 1 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.6, delay: 0.4 + i * 0.25, ease: "easeInOut" }} />
      ))}
    </svg>
  );
}

/** The rubber stamp pressing down: VERIFIED · 2 OF 3 · ML-DSA-87 */
function Stamp({ animate }: { animate: boolean }) {
  return (
    <motion.div
      className="relative grid size-44 place-items-center rounded-full border-4 border-vermilion/90 text-vermilion md:size-52"
      style={{ rotate: "-8deg" }}
      initial={animate ? { scale: 2.2, opacity: 0, rotate: "-14deg" } : false}
      animate={{ scale: 1, opacity: 1, rotate: "-8deg" }}
      transition={{ type: "spring", stiffness: 240, damping: 16, delay: 1.1 }}>
      <div className="grid size-36 place-items-center rounded-full border-2 border-vermilion/60 text-center md:size-40">
        <div className="font-mono text-[10px] font-bold uppercase leading-relaxed tracking-[0.25em] md:text-xs">
          Verified<br />2 of 3<br />ML-DSA-87
        </div>
      </div>
    </motion.div>
  );
}

/** Three verifier slots; two seals light up on scroll. */
function SealTrio() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-30% 0px" });
  const reduce = useReducedMotion();
  return (
    <div ref={ref} className="flex items-center gap-6" aria-label="Two of three verifier seals lit">
      {[0, 1, 2].map((i) => {
        const lit = inView && i < 2;
        return (
          <motion.div key={i}
            className={`grid size-16 place-items-center rounded-full border-2 font-mono text-[10px] uppercase tracking-wider transition-colors duration-700 ${
              lit ? "border-vermilion bg-vermilion/15 text-vermilion shadow-[0_0_30px_rgba(225,72,47,0.35)]"
                  : "border-paper-300/20 text-ink-400"}`}
            initial={reduce ? false : { opacity: 0.4 }}
            animate={{ opacity: lit ? 1 : 0.55 }}
            transition={{ delay: i * 0.5 }}>
            {lit ? "sealed" : `v${i + 1}`}
          </motion.div>
        );
      })}
    </div>
  );
}

/** 24 h challenge ring counting down. */
function ChallengeRing() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-30% 0px" });
  const reduce = useReducedMotion();
  const r = 44, c = 2 * Math.PI * r;
  return (
    <div ref={ref} className="relative grid place-items-center">
      <svg viewBox="0 0 100 100" className="size-36 -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="5" className="stroke-white/10" />
        <motion.circle cx="50" cy="50" r={r} fill="none" strokeWidth="5" strokeLinecap="round"
          className="stroke-vermilion"
          strokeDasharray={c}
          initial={reduce ? { strokeDashoffset: 0 } : { strokeDashoffset: c }}
          animate={inView || reduce ? { strokeDashoffset: c * 0.35 } : {}}
          transition={{ duration: 2.4, ease: "easeOut" }} />
      </svg>
      <div className="absolute text-center font-mono">
        <div className="text-2xl text-paper-100">24h</div>
        <div className="text-[10px] uppercase tracking-widest text-ink-300">challenge</div>
      </div>
    </div>
  );
}

function LiveStrip() {
  const index = useIndex();
  const liab = useTotalLiabilities();
    const verifiers = new Set<string>();
  for (const e of index.data?.events ?? []) {
    if (e.eventName === "BountyCreated") {
      for (const v of (e.args as unknown as { verifiers: readonly string[] }).verifiers) verifiers.add(v);
    }
  }
  const vList = [...verifiers] as `0x${string}`[];
  return (
    <div className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/5">
      <Stat label="bounties on diana"
        value={index.data ? String(index.data.bountyIds.length) : "…"} />
      <Stat label="test QOR in escrow"
        value={liab.data !== undefined ? `${formatUnits(liab.data, 18)}` : "…"} />
      <VerifierStat verifiers={vList} />
    </div>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-ink-900/80 p-5 text-center">
      <div className="font-serif text-3xl text-paper-100 tabular-nums">{value}</div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-300">{label}</div>
    </div>
  );
}
function VerifierStat({ verifiers }: { verifiers: `0x${string}`[] }) {
  // bounded live check over unique verifier addresses (usually 0 today)
  const first = verifiers[0];
  const s = usePqcStatus(first);
  const live = verifiers.length === 0 ? "0"
    : (s.data?.live ? `${verifiers.length}` : "…");
  return <Stat label="live verifier keys" value={live} />;
}

const CHAPTERS = [
  {
    k: "01", title: "Fund a GitHub issue",
    body: "A maintainer escrows test QOR against a real issue or PR. The work reference — owner/repo, kind, number — is hashed and emitted on chain, so the payout can never drift from the work.",
    art: <div className="font-mono text-sm text-paper-200/90">github.com/<span className="text-vermilion">acme/widgets</span>/issues/<span className="text-vermilion">42</span></div>,
  },
  {
    k: "02", title: "Claim with a post-quantum signature",
    body: "The contributor posts one public comment, then claims the bounty with an ML-DSA-87 signature verified by the chain itself. Stealing the ECDSA key is not enough.",
    art: <div className="font-mono text-xs text-paper-200/80">postmark-claim v1 chain=9800 …</div>,
  },
  {
    k: "03", title: "Three verifiers, two seals",
    body: "Independent verifiers — each with a registered ML-DSA-87 key — review the merged PR. Any two matching signatures settle the verdict.",
    art: <SealTrio />,
  },
  {
    k: "04", title: "A 24-hour challenge window",
    body: "Every initial verdict sits in the open for a day. Anyone can post a bond and dispute it before it settles.",
    art: <ChallengeRing />,
  },
  {
    k: "05", title: "Payout in testnet QOR",
    body: "The escrow credits the payee. They withdraw when their live PQ key is still registered — a pull payment, never a push.",
    art: <div className="font-serif text-4xl text-paper-100">+ tQOR</div>,
  },
];

export default function Landing() {
  const reduce = useReducedMotion();
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef, offset: ["start start", "end start"],
  });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  return (
    <div>
      {/* hero */}
      <section ref={heroRef} className="relative flex min-h-[88dvh] items-center overflow-hidden py-16">
        <motion.div style={reduce ? {} : { y: heroY, opacity: heroOpacity }}
          className="grid w-full items-center gap-10 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-vermilion">
              Real issues · testnet payouts
            </p>
            <h1 className="mt-5 font-serif text-5xl font-semibold leading-[1.05] tracking-tight text-paper-100 sm:text-6xl lg:text-7xl">
              Get stamped for<br />merged work.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-200">
              Postmark is a bounty escrow on QoreChain diana. Fund a GitHub issue,
              and a contributor collects test QOR when three post-quantum
              verifiers stamp the merged PR — two seals are enough.
            </p>
            <CancelWaves animate={!reduce} />
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/explore"
                className="rounded-lg bg-vermilion px-6 py-3 font-medium text-ink-950 transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermilion">
                Explore bounties
              </Link>
              <Link to="/create"
                className="rounded-lg border border-paper-300/30 px-6 py-3 font-medium text-paper-100 transition hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-paper-200">
                Fund an issue
              </Link>
            </div>
          </div>
          <div className="hidden justify-center lg:flex">
            <Stamp animate={!reduce} />
          </div>
        </motion.div>
      </section>

      {/* live strip */}
      <section aria-label="Live chain numbers" className="py-8">
        <LiveStrip />
      </section>

      {/* chapters */}
      <section className="space-y-24 py-24">
        {CHAPTERS.map((c) => (
          <Reveal key={c.k}>
            <div className="grid items-center gap-8 border-t border-white/5 pt-12 md:grid-cols-[0.9fr_1.1fr]">
              <div>
                <div className="font-mono text-xs text-vermilion">{c.k}</div>
                <h2 className="mt-3 font-serif text-3xl font-semibold text-paper-100 md:text-4xl">
                  {c.title}
                </h2>
                <p className="mt-4 max-w-md leading-relaxed text-ink-200">{c.body}</p>
              </div>
              <div className="flex min-h-28 items-center justify-start md:justify-center">
                {c.art}
              </div>
            </div>
          </Reveal>
        ))}
      </section>

      {/* honest footer note + CTA */}
      <section className="border-t border-white/5 py-20 text-center">
        <p className="mx-auto max-w-2xl font-serif text-2xl leading-relaxed text-paper-200">
          Signatures are ML-DSA-87 — checked by a chain precompile, not by us.
          Payouts are diana test QOR: real flow, no monetary value.
        </p>
        <Link to="/explore"
          className="mt-8 inline-block rounded-lg bg-vermilion px-8 py-3 font-medium text-ink-950 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermilion">
          See what's stamped
        </Link>
      </section>
    </div>
  );
}
