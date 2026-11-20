import { useRef } from "react";
import { Link } from "react-router";
import {
  motion, useReducedMotion, useScroll, useTransform,
  type MotionValue,
} from "motion/react";
import { formatUnits } from "viem";
import { useIndex, useTotalLiabilities } from "../hooks/queries";

const ACTS = 6;

/* Cross-fade window for act i inside [0,1] progress. */
function useAct(progress: MotionValue<number>, i: number) {
  const a = i / ACTS, b = (i + 1) / ACTS;
  const fade = Math.min(0.05, (b - a) * 0.3);
  return useTransform(progress,
    [a, a + fade, b - fade, Math.min(b, 1)],
    [i === 0 ? 1 : 0, 1, 1, i === ACTS - 1 ? 1 : 0]);
}

/** Cancellation waves — full-bleed, endlessly drawing, parallax. */
function Waves({ progress }: { progress: MotionValue<number> }) {
  const y = useTransform(progress, [0, 1], [0, -80]);
  const d = (k: number) =>
    `M-60 ${60 + k * 26} Q 80 ${30 + k * 26} 220 ${60 + k * 26} T 500 ${60 + k * 26} T 780 ${60 + k * 26} T 1060 ${60 + k * 26} T 1340 ${60 + k * 26} T 1620 ${60 + k * 26}`;
  return (
    <motion.svg viewBox="0 0 1560 210" preserveAspectRatio="xMidYMid slice"
      className="absolute inset-x-0 top-[78%] -z-10 h-[30vh] w-full -translate-y-1/2 text-vermilion opacity-60 md:top-1/2 md:opacity-100"
      style={{ y }} aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.path key={i} d={d(i)} fill="none" stroke="currentColor"
          strokeWidth={2.5 - i * 0.35} strokeLinecap="round"
          opacity={0.5 - i * 0.09}
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
          transition={{ duration: 2.2, delay: 0.3 + i * 0.18, ease: "easeInOut" }} />
      ))}
    </motion.svg>
  );
}

function Stamp({ size = "size-48 md:size-64" }: { size?: string }) {
  return (
    <div className={`relative grid ${size} place-items-center rounded-full border-4 border-vermilion/90 text-vermilion`}
      style={{ rotate: "-8deg" }}>
      <div className="grid size-[78%] place-items-center rounded-full border-2 border-vermilion/60 text-center">
        <div className="font-mono text-xs font-bold uppercase leading-relaxed tracking-[0.25em] md:text-sm">
          Verified<br />2 of 3<br />ML-DSA-87
        </div>
      </div>
    </div>
  );
}

/** Perforated postage-stamp frame (radial notches). */
const PERFORATION =
  "radial-gradient(circle at 8px 8px, transparent 5px, black 5.5px)";

function ActVisual({ act, progress }: { act: number; progress: MotionValue<number> }) {
  const local = useTransform(progress, [act / ACTS, (act + 1) / ACTS], [0, 1]);
  if (act === 1) return <IssueCard />;
  if (act === 2) return <ClaimStamp local={local} />;
  if (act === 3) return <SealTrio local={local} />;
  if (act === 4) return <Ring local={local} />;
  if (act === 5) return <Slam local={local} />;
  return null;
}

function IssueCard() {
  return (
    <div className="w-full max-w-sm rounded-xl border border-white/15 bg-ink-900/90 p-5 shadow-2xl shadow-black/60">
      <div className="flex items-center gap-2 font-mono text-xs text-ink-300">
        <span className="size-2 rounded-full bg-emerald-400" /> postmark-e2e/sandbox
        <span className="text-ink-500">#1</span>
      </div>
      <p className="mt-3 font-serif text-xl text-paper-100">Bridge the escrow to the app</p>
      <div className="mt-3 flex gap-1.5">
        {["bounty", "good first issue", "pq"].map((l) => (
          <span key={l} className="rounded-full bg-white/8 px-2.5 py-0.5 font-mono text-[10px] text-ink-200">{l}</span>
        ))}
      </div>
      <p className="mt-4 border-t border-white/8 pt-3 font-mono text-[11px] text-ink-400">
        octocat opened 3 days ago
      </p>
    </div>
  );
}

function ClaimStamp({ local }: { local: MotionValue<number> }) {
  const draw = useTransform(local, [0.15, 0.85], [0, 1]);
  return (
    <div className="relative">
      {/* perforated edge: a masked paper ring; the solid face is a sibling, never masked */}
      <div aria-hidden className="absolute inset-0 rounded-sm bg-paper-100 shadow-2xl shadow-black/60"
        style={{ WebkitMaskImage: PERFORATION, maskImage: PERFORATION,
          WebkitMaskSize: "16px 16px", maskSize: "16px 16px" }} />
      <div className="relative m-2.5 grid place-items-center border border-ink-900/20 bg-[#f6efdd] px-8 py-8 text-center">
        <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-ink-900/50">postmark · diana</p>
        <p className="mt-1 font-serif text-4xl font-semibold tabular-nums text-ink-950">0.25</p>
        <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-ink-900/50">test qor</p>
        <div className="my-3 h-px w-40 bg-ink-900/20" />
        <p className="font-mono text-[10px] text-ink-900/70">postmark-e2e/sandbox #1</p>
        <svg viewBox="0 0 220 60" className="mt-1 w-44 text-ink-950/80" aria-hidden>
          <motion.path
            d="M10 40 C 40 10, 70 55, 100 30 S 160 45, 210 22"
            fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"
            style={{ pathLength: draw }} />
          <motion.path
            d="M8 48 C 60 34, 120 52, 214 38"
            fill="none" stroke="currentColor" strokeWidth="2" opacity="0.5"
            style={{ pathLength: draw }} />
        </svg>
      </div>
    </div>
  );
}

function SealTrio({ local }: { local: MotionValue<number> }) {
  // hooks can't run in a loop callback — unrolled instead
  const l0 = useTransform(local, [0.2, 0.22], [0, 1]);
  const l1 = useTransform(local, [0.55, 0.57], [0, 1]);
  const lits = [l0, l1, useTransform(local, [0, 1], [0, 0])];
  return (
    <div className="flex items-center gap-6 md:gap-8">
      {lits.map((lit, i) => (
        <motion.div key={i}
          className={`grid size-16 place-items-center rounded-full border-2 font-mono text-[10px] uppercase tracking-wider md:size-20 ${
            i < 2 ? "border-vermilion/60 text-vermilion" : "border-paper-300/20 text-ink-400"}`}
          style={{
            opacity: useTransform(lit, [0, 1], [0.45, 1]),
            boxShadow: useTransform(lit, (v) =>
              `0 0 ${v * 34}px rgba(225,72,47,${v * 0.45})`),
            backgroundColor: useTransform(lit, (v) =>
              `rgba(225,72,47,${v * 0.16})`),
          }}>
          {i < 2 ? "sealed" : `v${i + 1}`}
        </motion.div>
      ))}
    </div>
  );
}

function Ring({ local }: { local: MotionValue<number> }) {
  const r = 52, c = 2 * Math.PI * r;
  const off = useTransform(local, [0.1, 0.9], [c, c * 0.32]);
  return (
    <div className="relative grid place-items-center">
      <svg viewBox="0 0 120 120" className="size-44 -rotate-90 md:size-52" aria-hidden>
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="6" className="stroke-white/10" />
        <motion.circle cx="60" cy="60" r={r} fill="none" strokeWidth="6"
          strokeLinecap="round" className="stroke-vermilion"
          strokeDasharray={c} style={{ strokeDashoffset: off }} />
      </svg>
      <div className="absolute text-center font-mono">
        <div className="text-3xl text-paper-100">24h</div>
        <div className="text-[10px] uppercase tracking-widest text-ink-300">challenge</div>
      </div>
    </div>
  );
}

function Slam({ local }: { local: MotionValue<number> }) {
  const scale = useTransform(local, [0, 0.28], [2.1, 1]);
  const rot = useTransform(local, [0, 0.28], [-16, -8]);
  const stampO = useTransform(local, [0, 0.18, 0.3], [0, 0.6, 1]);
  const inkO = useTransform(local, [0.3, 0.55], [0, 0.55]);
  const inkBlur = useTransform(local, [0.3, 0.6], [10, 0]);
  const amount = useTransform(local, [0.45, 0.95], [0, 1.5]);
  const amountText = useTransform(amount, (v) => `+${v.toFixed(3)} QOR`);
  const amountO = useTransform(local, [0.5, 0.65], [0, 1]);
  return (
    <div className="relative grid place-items-center">
      {/* ink impression */}
      <motion.div className="absolute size-56 rounded-full bg-vermilion/25 blur-md md:size-72"
        style={{ opacity: inkO, filter: useTransform(inkBlur, (b) => `blur(${b + 6}px)`) }} />
      <motion.div style={{ scale, rotate: rot, opacity: stampO }}>
        <Stamp />
      </motion.div>
      <motion.div className="absolute -bottom-16 font-serif text-4xl font-semibold text-paper-100 md:text-5xl"
        style={{ opacity: amountO }}>
        <motion.span>{amountText}</motion.span>
        <span className="ml-2 align-middle font-mono text-[10px] uppercase tracking-[0.25em] text-vermilion">testnet</span>
      </motion.div>
    </div>
  );
}

const CHAPTERS = [
  { k: "01", title: "Fund a GitHub issue",
    body: "A maintainer escrows test QOR against a real issue or PR. The work reference — owner/repo, kind, number — is hashed and emitted on chain, so the payout can never drift from the work." },
  { k: "02", title: "Claim with a post-quantum signature",
    body: "The contributor posts one public comment, then claims the bounty with an ML-DSA-87 signature verified by the chain itself. Stealing the ECDSA key is not enough." },
  { k: "03", title: "Three verifiers, two seals",
    body: "Independent verifiers — each with a registered ML-DSA-87 key — review the merged PR. Any two matching signatures settle the verdict." },
  { k: "04", title: "A 24-hour challenge window",
    body: "Every initial verdict sits in the open for a day. Anyone can post a bond and dispute it before it settles." },
  { k: "05", title: "Payout in test QOR",
    body: "The escrow credits the payee. They withdraw when their live PQ key is still registered — a pull payment, never a push." },
];

function LiveStrip() {
  const index = useIndex();
  const liab = useTotalLiabilities();
  const verifiers = new Set<string>();
  for (const e of index.data?.events ?? []) {
    if (e.eventName === "BountyCreated") {
      for (const v of (e.args as unknown as { verifiers: readonly string[] }).verifiers) verifiers.add(v);
    }
  }
  return (
    <div className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/5">
      <Stat label="bounties on diana" value={index.data ? String(index.data.bountyIds.length) : "…"} />
      <Stat label="test QOR in escrow" value={liab.data !== undefined ? `${formatUnits(liab.data, 18)}` : "…"} />
      <Stat label="verifier slots used" value={index.data ? String(verifiers.size) : "…"} />
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

export default function Landing() {
  const reduce = useReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: stageRef });

  if (reduce) {
    return <StaticLanding />;
  }

  const actRanges = Array.from({ length: ACTS }, (_, i) => i);

  return (
    <div>
      {/* pinned scroll stage: hero + 5 chapters, one morphing visual */}
      <section ref={stageRef} className="relative" style={{ height: `${(ACTS + 1) * 82}vh` }}>
        <div className="sticky top-0 flex h-dvh items-center overflow-hidden">
          {/* depth: vignette + waves */}
          <div className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(7,11,20,0.9)_100%)]" />
          <Waves progress={scrollYProgress} />

          <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-8 px-4 md:grid-cols-[1.25fr_1fr] md:gap-14">
            {/* text column */}
            <div className="relative order-2 min-h-[40dvh] md:order-1 md:min-h-[55dvh]">
              {/* act 0: hero text */}
              <ActText progress={scrollYProgress} i={0}>
                <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-vermilion">
                  Real issues · testnet payouts
                </p>
                <h1 className="mt-5 font-serif text-5xl font-semibold leading-[1.02] tracking-tight text-paper-100 sm:text-6xl lg:text-6xl xl:text-7xl">
                  Get stamped for<br />merged work.
                </h1>
                <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-200 lg:text-xl">
                  Postmark is a bounty escrow on QoreChain diana. Fund a GitHub issue,
                  and a contributor collects test QOR when three post-quantum
                  verifiers stamp the merged PR — two seals are enough.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link to="/explore" className="rounded-lg bg-vermilion px-6 py-3 font-medium text-ink-950 transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermilion">Explore bounties</Link>
                  <Link to="/create" className="rounded-lg border border-paper-300/30 px-6 py-3 font-medium text-paper-100 transition hover:bg-white/5">Fund an issue</Link>
                </div>
              </ActText>
              {CHAPTERS.map((c, i) => (
                <ActText key={c.k} progress={scrollYProgress} i={i + 1}>
                  <div className="font-mono text-xs text-vermilion">{c.k}</div>
                  <h2 className="mt-3 font-serif text-4xl font-semibold text-paper-100 md:text-5xl lg:text-6xl">{c.title}</h2>
                  <p className="mt-5 max-w-md text-lg leading-relaxed text-ink-200">{c.body}</p>
                </ActText>
              ))}
            </div>
            {/* visual column — stamp present from the hero on all sizes */}
            <div className="relative order-1 flex min-h-[30dvh] items-center justify-center md:order-2 md:min-h-[55dvh]">
              <ActVisual progress={scrollYProgress} act={0} />
              <HeroVisual progress={scrollYProgress} />
              {[1, 2, 3, 4, 5].map((i) => (
                <ActLayer key={i} progress={scrollYProgress} i={i}>
                  <ActVisual act={i} progress={scrollYProgress} />
                </ActLayer>
              ))}
            </div>
          </div>

          {/* progress marks */}
          <div className="absolute bottom-8 left-1/2 flex -translate-x-1/2 gap-2" aria-hidden>
            {actRanges.map((i) => <Dot key={i} progress={scrollYProgress} i={i} />)}
          </div>
        </div>
      </section>

      <section aria-label="Live chain numbers" className="py-8">
        <LiveStrip />
      </section>

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

function ActLayer({ progress, i, children }:
  { progress: MotionValue<number>; i: number; children: React.ReactNode }) {
  const o = useAct(progress, i);
  return (
    <motion.div className="absolute inset-0 grid place-items-center" style={{ opacity: o }}>
      {children}
    </motion.div>
  );
}

function ActText({ progress, i, children }:
  { progress: MotionValue<number>; i: number; children: React.ReactNode }) {
  const o = useAct(progress, i);
  const y = useTransform(o, [0, 1], [40, 0]);
  return (
    <motion.div className="absolute inset-0 flex flex-col justify-center"
      style={{ opacity: o, y, pointerEvents: useTransform(o, (v) => v > 0.5 ? "auto" : "none") }}>
      {children}
    </motion.div>
  );
}

function HeroVisual({ progress }: { progress: MotionValue<number> }) {
  const o = useAct(progress, 0);
  const scale = useTransform(o, [0, 1], [0.9, 1]);
  return (
    <motion.div className="absolute inset-0 grid place-items-center" style={{ opacity: o, scale }}>
      <Stamp size="size-40 sm:size-48 md:size-64 lg:size-72" />
    </motion.div>
  );
}

function Dot({ progress, i }: { progress: MotionValue<number>; i: number }) {
  const o = useAct(progress, i);
  const bg = useTransform(o, [0, 0.5], ["rgba(255,255,255,0.15)", "rgba(225,72,47,1)"]);
  return <motion.div className="size-1.5 rounded-full" style={{ backgroundColor: bg }} />;
}

/* Static composition for prefers-reduced-motion. */
function StaticLanding() {
  return (
    <div className="py-10">
      <div className="grid items-center gap-10 md:grid-cols-2">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-vermilion">
            Real issues · testnet payouts
          </p>
          <h1 className="mt-5 font-serif text-5xl font-semibold leading-[1.02] tracking-tight text-paper-100 sm:text-6xl lg:text-7xl">
            Get stamped for<br />merged work.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-200">
            Postmark is a bounty escrow on QoreChain diana. Fund a GitHub issue,
            and a contributor collects test QOR when three post-quantum
            verifiers stamp the merged PR — two seals are enough.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/explore" className="rounded-lg bg-vermilion px-6 py-3 font-medium text-ink-950">Explore bounties</Link>
            <Link to="/create" className="rounded-lg border border-paper-300/30 px-6 py-3 font-medium text-paper-100">Fund an issue</Link>
          </div>
        </div>
        <div className="flex justify-center"><Stamp /></div>
      </div>
      <section aria-label="Live chain numbers" className="mt-14"><LiveStrip /></section>
      <div className="mt-16 space-y-10">
        {CHAPTERS.map((c) => (
          <div key={c.k} className="border-t border-white/5 pt-8">
            <div className="font-mono text-xs text-vermilion">{c.k}</div>
            <h2 className="mt-2 font-serif text-3xl font-semibold text-paper-100">{c.title}</h2>
            <p className="mt-3 max-w-xl leading-relaxed text-ink-200">{c.body}</p>
          </div>
        ))}
      </div>
      <section className="border-t border-white/5 py-16 text-center">
        <p className="mx-auto max-w-2xl font-serif text-2xl leading-relaxed text-paper-200">
          Signatures are ML-DSA-87 — checked by a chain precompile, not by us.
          Payouts are diana test QOR: real flow, no monetary value.
        </p>
      </section>
    </div>
  );
}
