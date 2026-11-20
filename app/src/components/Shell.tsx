import { useState, type ReactNode } from "react";
import { Link, NavLink, Outlet } from "react-router";
import { DeferredConnect } from "./Deferred";
import { useFeedStatus } from "../chain/IndexerProvider";
import { Logo } from "./Logo";

function FeedDot() {
  const feed = useFeedStatus();
  const meta = {
    live: ["bg-leaf", "live"],
    polling: ["bg-orange", "polling"],
    connecting: ["bg-gray", "connecting"],
  }[feed];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray" title={`Chain feed: ${meta[1]}`}>
      <span className={`size-1.5 rounded-full ${meta[0]} ${feed === "live" ? "animate-pulse" : ""}`} />
      {meta[1]}
    </span>
  );
}

const navLink = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-1.5 text-sm font-medium transition-colors ${isActive ? "text-ink" : "text-gray hover:text-ink"}`;

export function Shell({ children }: { children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-dvh flex-col bg-paper text-ink">
      {/* announcement bar */}
      <div className="bg-ink px-4 py-1.5 text-center font-mono text-[11px] text-paper/80">
        Live on QoreChain diana testnet · test QOR, no monetary value
      </div>
      <header className="sticky top-0 z-40 border-b border-ink/10 bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2">
              <Logo size={26} />
              <span className="text-xl font-semibold tracking-tight">Postmark</span>
            </Link>
            <nav className="hidden items-center gap-1 md:flex">
              <NavLink to="/explore" className={navLink}>Explore</NavLink>
              <NavLink to="/create" className={navLink}>Create</NavLink>
              <NavLink to="/me" className={navLink}>Mine</NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <FeedDot />
            <DeferredConnect />
            <Link to="/create"
              className="hidden rounded-md bg-deep px-3.5 py-1.5 text-sm font-medium text-paper transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep md:inline-block">
              Fund a bounty
            </Link>
            <button className="md:hidden rounded-md p-1.5 text-gray hover:text-ink"
              aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                {open ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3 6h14M3 10h14M3 14h14" />}
              </svg>
            </button>
          </div>
        </div>
        {open && (
          <nav className="border-t border-ink/10 px-4 pb-4 pt-2 md:hidden">
            <NavLink to="/explore" className={navLink} onClick={() => setOpen(false)}>Explore</NavLink>
            <NavLink to="/create" className={navLink} onClick={() => setOpen(false)}>Create</NavLink>
            <NavLink to="/me" className={navLink} onClick={() => setOpen(false)}>Mine</NavLink>
          </nav>
        )}
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {children ?? <Outlet />}
      </main>
      <footer className="border-t border-ink/10 py-6">
        <p className="mx-auto max-w-6xl px-4 font-mono text-[11px] text-gray">
          Postmark — diana testnet. Payouts are in test QOR with no monetary value.
        </p>
      </footer>
    </div>
  );
}
