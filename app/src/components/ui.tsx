import { useEffect, useState, type ReactNode } from "react";
import { formatUnits } from "viem";

export const STATE_NAMES = ["Open", "Claimed", "Pending", "Disputed", "Paid", "Refunded"] as const;
export type BountyStateName = (typeof STATE_NAMES)[number];

const CHIP_STYLES: Record<BountyStateName, string> = {
  Open: "border-leaf bg-leaf/15 text-deep",
  Claimed: "border-mustard bg-mustard/30 text-orange",
  Pending: "border-orange bg-orange/15 text-orange",
  Disputed: "border-salmon bg-salmon/25 text-ink",
  Paid: "border-deep bg-deep text-paper",
  Refunded: "border-gray/60 bg-ink/5 text-gray",
};

export function StatusChip({ state }: { state: number }) {
  const name = STATE_NAMES[state] ?? `#${state}`;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-wide ${CHIP_STYLES[name as BountyStateName] ?? "border-gray text-gray"}`}>
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
      {formatUnits(wei, 18)} <span className="text-gray">QOR</span>
    </span>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-ink/5 ${className}`} />;
}

export function shortAddr(a: string | undefined | null) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—";
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-salmon/40 bg-salmon/5 p-6 text-center">
      <p className="font-mono text-sm text-ink">{message}</p>
      {onRetry && (
        <button onClick={onRetry}
          className="mt-4 rounded-lg border border-ink/25 px-4 py-1.5 text-sm text-ink hover:bg-ink/5 focus-visible:outline-2 focus-visible:outline-deep">
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-ink/15 p-12 text-center">
      <p className="font-sans text-xl text-ink">{title}</p>
      {children && <div className="mt-3 text-sm text-gray">{children}</div>}
    </div>
  );
}
