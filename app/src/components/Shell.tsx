import { useState, type ReactNode } from "react";
import { Link, NavLink, Outlet } from "react-router";
import { ConnectButton } from "./Connect";
import { useFeedStatus } from "../chain/IndexerProvider";

function FeedDot() {
  const feed = useFeedStatus();
  const meta = {
    live: ["bg-emerald-400", "live"],
    polling: ["bg-amber-400", "polling"],
    connecting: ["bg-zinc-500", "connecting"],
  }[feed];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-300" title={`Chain feed: ${meta[1]}`}>
      <span className={`size-1.5 rounded-full ${meta[0]} ${feed === "live" ? "animate-pulse" : ""}`} />
      {meta[1]}
    </span>
  );
}

const navLink = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-1.5 text-sm transition-colors ${isActive ? "text-paper-100" : "text-ink-300 hover:text-paper-200"}`;

export function Shell({ children }: { children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-dvh flex-col bg-ink-950 text-paper-100">
      <header className="sticky top-0 z-40 border-b border-white/5 bg-ink-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-5">
            <Link to="/" className="flex items-baseline gap-2">
              <span className="font-serif text-xl font-semibold tracking-tight">Postmark</span>
              <span className="hidden font-mono text-[10px] uppercase tracking-[0.2em] text-vermilion sm:inline">testnet</span>
            </Link>
            <nav className="hidden items-center gap-1 md:flex">
              <NavLink to="/explore" className={navLink}>Explore</NavLink>
              <NavLink to="/create" className={navLink}>Create</NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <FeedDot />
            <ConnectButton />
            <button className="md:hidden rounded-md p-1.5 text-ink-300 hover:text-paper-100"
              aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                {open ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3 6h14M3 10h14M3 14h14" />}
              </svg>
            </button>
          </div>
        </div>
        {open && (
          <nav className="border-t border-white/5 px-4 pb-4 pt-2 md:hidden">
            <NavLink to="/explore" className={navLink} onClick={() => setOpen(false)}>Explore</NavLink>
            <NavLink to="/create" className={navLink} onClick={() => setOpen(false)}>Create</NavLink>
          </nav>
        )}
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {children ?? <Outlet />}
      </main>
      <footer className="border-t border-white/5 py-6">
        <p className="mx-auto max-w-6xl px-4 font-mono text-[11px] text-ink-400">
          Postmark — diana testnet. Payouts are in test QOR with no monetary value.
        </p>
      </footer>
    </div>
  );
}
