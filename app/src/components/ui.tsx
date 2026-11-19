import { useEffect, useState, type ReactNode } from "react";
import { formatUnits } from "viem";

export const STATE_NAMES = ["Open", "Claimed", "Pending", "Disputed", "Paid", "Refunded"] as const;
export type BountyStateName = (typeof STATE_NAMES)[number];

const CHIP_STYLES: Record<BountyStateName, string> = {
  Open: "border-emerald-400/40 text-emerald-300",
  Claimed: "border-sky-400/40 text-sky-300",
  Pending: "border-amber-400/40 text-amber-300",
  Disputed: "border-vermilion text-vermilion",
  Paid: "border-emerald-500/50 text-emerald-400",
  Refunded: "border-zinc-500/50 text-zinc-400",
};

export function StatusChip({ state }: { state: number }) {
  const name = STATE_NAMES[state] ?? `#${state}`;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-wide ${CHIP_STYLES[name as BountyStateName] ?? "border-zinc-600 text-zinc-300"}`}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {name}
    </span>
  );
}

/** Live countdown to a unix-seconds timestamp. */
export function Countdown({ to, className }: { to: number | bigint; className?: string }) {
  const target = Number(to) * 1000;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = target - now;
  if (diff <= 0) return <span className={className}>expired</span>;
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  return (
    <span className={className} title={new Date(target).toLocaleString()}>
      {d > 0 && `${d}d `}{h}h {m}m{d === 0 && ` ${s}s`}
    </span>
  );
}

export function Qor({ wei, className }: { wei: bigint; className?: string }) {
  return (
    <span className={className} title={`${wei.toString()} wei`}>
      {formatUnits(wei, 18)} <span className="text-ink-400">tQOR</span>
    </span>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-white/5 ${className}`} />;
}

export function shortAddr(a: string | undefined | null) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—";
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-vermilion/40 bg-vermilion/5 p-6 text-center">
      <p className="font-mono text-sm text-paper-200">{message}</p>
      {onRetry && (
        <button onClick={onRetry}
          className="mt-4 rounded-lg border border-paper-300/30 px-4 py-1.5 text-sm text-paper-100 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-vermilion">
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-paper-300/20 p-12 text-center">
      <p className="font-serif text-xl text-paper-200">{title}</p>
      {children && <div className="mt-3 text-sm text-ink-300">{children}</div>}
    </div>
  );
}
