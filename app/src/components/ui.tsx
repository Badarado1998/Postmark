import { useEffect, useState, type ReactNode } from "react";
import { explorerAddress } from "../chain/config";
import { exactQor, formatQor } from "./qor";
import { STATE_NAMES, statusStyle, type BountyStateName } from "./status";
export { STATE_NAMES };
export type { BountyStateName };

export function StatusChip({ state }: { state: number }) {
  const name = STATE_NAMES[state] ?? `#${state}`;
  const style = statusStyle(state)?.pill ?? "bg-gray text-paper";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide ${style}`}>
      <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />
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
    <span className={className} title={exactQor(wei)}>
      {formatQor(wei)} <span className="text-gray">QOR</span>
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

type Tone = "plain" | "accent" | "warn";

const CARD_TONES: Record<Tone, string> = {
  plain: "border-ink/10 bg-white/70",
  accent: "border-salmon/30 bg-white/70",
  warn: "border-orange/40 bg-orange/10",
};
const LABEL_TONES: Record<Tone, string> = {
  plain: "text-gray", accent: "text-deep", warn: "text-orange",
};

export function Card({ tone = "plain", className = "", children }:
  { tone?: Tone; className?: string; children: ReactNode }) {
  return <div className={`rounded-xl border p-5 ${CARD_TONES[tone]} ${className}`}>{children}</div>;
}

/** Small uppercase mono heading that titles a card or page section. */
export function SectionLabel({ tone = "plain", className = "", children }:
  { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <h2 className={`font-mono text-[10px] uppercase tracking-[0.18em] ${LABEL_TONES[tone]} ${className}`}>
      {children}
    </h2>
  );
}

/** Shortened address linking to its explorer page. */
export function AddressLink({ address, className = "hover:text-deep" }:
  { address: string | undefined | null; className?: string }) {
  return (
    <a className={className} href={explorerAddress(address ?? "")} target="_blank" rel="noreferrer">
      {shortAddr(address)}
    </a>
  );
}
