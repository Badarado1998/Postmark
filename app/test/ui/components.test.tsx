import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Routes, Route } from "react-router";
import { renderApp } from "../fixtures";

vi.mock("../../src/chain/IndexerProvider", async () => (await import("../mocks")).indexerModule("live"));
vi.mock("../../src/hooks/queries", () => ({
  useBlockNumber: () => ({ data: 12345n, isError: false }),
}));
vi.mock("../../src/wallet/ConnectWallet", () => ({
  default: () => <button>Connect wallet</button>,
}));

import { Shell } from "../../src/components/Shell";
import { ErrorBoundary } from "../../src/components/ErrorBoundary";
import { DeferredConnect } from "../../src/components/Deferred";
import {
  AddressLink, Card, Countdown, EmptyState, ErrorState, Qor, SectionLabel, StatusChip, shortAddr,
} from "../../src/components/ui";
import NotFound from "../../src/pages/NotFound";
import Signer from "../../src/pages/Signer";

afterEach(() => vi.useRealTimers());

describe("Shell", () => {
  it("shows the announcement, nav links, feed status and wallet button", async () => {
    renderApp(<Shell><p>page body</p></Shell>);
    expect(screen.getByText(/test QOR, no monetary value/i)).toBeInTheDocument();
    for (const name of ["Explore", "Create", "Dashboard", "Get started", "Signer"]) {
      expect(screen.getAllByRole("link", { name })[0]).toBeInTheDocument();
    }
    expect(screen.getByText("page body")).toBeInTheDocument();
    expect(screen.getByTitle("Chain feed: live")).toHaveTextContent("#12345");
    expect(await screen.findByRole("button", { name: "Connect wallet" })).toBeInTheDocument();
  });

  it("toggles the mobile menu", () => {
    renderApp(<Shell />);
    const menu = screen.getByRole("button", { name: "Menu" });
    expect(menu).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(menu);
    expect(menu).toHaveAttribute("aria-expanded", "true");
    expect(within(screen.getByRole("navigation", { name: "Mobile" })).getAllByRole("link")).toHaveLength(6);
    expect(screen.getByRole("navigation", { name: "Mobile" })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("navigation", { name: "Mobile" })).getByRole("link", { name: "Explore" }));
    expect(menu).toHaveAttribute("aria-expanded", "false");
  });

  it("renders routed content through the outlet-less children slot", () => {
    renderApp(
      <Shell><Routes><Route path="/" element={<p>home</p>} /></Routes></Shell>);
    expect(screen.getByText("home")).toBeInTheDocument();
  });
});

describe("DeferredConnect", () => {
  it("mounts the wallet button after the first paint", async () => {
    render(<DeferredConnect />);
    expect(await screen.findByRole("button", { name: "Connect wallet" })).toBeInTheDocument();
  });
});

describe("ErrorBoundary", () => {
  it("shows the error message and a way home", () => {
    const Boom = () => { throw new Error("kaboom"); };
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    renderApp(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.getByText("This page hit an error.")).toBeInTheDocument();
    expect(screen.getByText("kaboom")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back home" })).toHaveAttribute("href", "/");
    log.mockRestore();
  });

  it("renders children when nothing throws", () => {
    renderApp(<ErrorBoundary><p>fine</p></ErrorBoundary>);
    expect(screen.getByText("fine")).toBeInTheDocument();
  });
});

describe("ui primitives", () => {
  it("names every bounty state and falls back for unknown ones", () => {
    const names = ["Open", "Claimed", "Pending", "Disputed", "Paid", "Refunded"];
    names.forEach((n, i) => {
      const { unmount } = render(<StatusChip state={i} />);
      expect(screen.getByText(n)).toBeInTheDocument();
      unmount();
    });
    render(<StatusChip state={9} />);
    expect(screen.getByText("#9")).toBeInTheDocument();
  });

  it("formats QOR amounts with the wei in the tooltip", () => {
    render(<Qor wei={1_500_000_000_000_000_000n} />);
    expect(screen.getByText(/1\.5/)).toHaveAttribute("title", "1.5 QOR (1500000000000000000 wei)");
  });

  it("counts down and reports expiry", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000_000_000);
    const { rerender } = render(<Countdown to={1_000_000_000n + 90_061n} />);
    expect(screen.getByText(/1d 1h 1m/)).toBeInTheDocument();
    rerender(<Countdown to={1_000_000_000n - 1n} />);
    expect(screen.getByText("expired")).toBeInTheDocument();
  });

  it("shortens addresses and tolerates missing ones", () => {
    expect(shortAddr("0x478F2A08a81be7CEa42bd34BD6900593fA56c4B6")).toBe("0x478F…c4B6");
    expect(shortAddr(undefined)).toBe("—");
  });

  it("links an address to the explorer", () => {
    render(<AddressLink address="0x478F2A08a81be7CEa42bd34BD6900593fA56c4B6" />);
    expect(screen.getByRole("link", { name: "0x478F…c4B6" }))
      .toHaveAttribute("href", expect.stringContaining("/address/0x478F2A08"));
  });

  it("renders cards, section labels and the error and empty states", () => {
    const retry = vi.fn();
    render(<>
      <Card tone="warn"><SectionLabel tone="warn">heads up</SectionLabel></Card>
      <ErrorState message="rpc down" onRetry={retry} />
      <EmptyState title="Nothing here"><p>try later</p></EmptyState>
    </>);
    expect(screen.getByRole("heading", { name: "heads up" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("rpc down");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });
});

describe("static pages", () => {
  it("NotFound links home", () => {
    renderApp(<NotFound />);
    expect(screen.getByRole("heading", { name: /never arrived/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back home" })).toBeInTheDocument();
  });

  it("Signer page explains the security model", () => {
    renderApp(<Signer />);
    expect(screen.getByRole("heading", { name: "Signing your claims" })).toBeInTheDocument();
    expect(screen.getByText("Advanced: use the local signer")).toBeInTheDocument();
    expect(screen.getByText(/Binds/)).toBeInTheDocument();
    expect(screen.getByText(/pairing code/i, { selector: "p" })).toBeInTheDocument();
  });
});
