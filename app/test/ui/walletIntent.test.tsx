import { describe, it, expect, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

vi.mock("../../src/wallet/ConnectWallet", () => ({
  default: ({ openOnMount }: { openOnMount?: boolean }) => <p>wallet chunk loaded{openOnMount ? " and opening" : ""}</p>,
}));

import { DeferredConnect } from "../../src/components/Deferred";
import { requestWallet, resetWalletIntent } from "../../src/components/walletIntent";

beforeEach(() => { localStorage.clear(); resetWalletIntent(); });

describe("deferred wallet", () => {
  it("renders a plain Connect button immediately and loads the wallet only when it is clicked", async () => {
    render(<DeferredConnect />);
    const btn = screen.getByRole("button", { name: "Connect wallet" });
    expect(btn).toHaveAttribute("aria-haspopup", "dialog");
    expect(screen.queryByText(/wallet chunk loaded/)).toBeNull();
    fireEvent.click(btn);
    expect(await screen.findByText("wallet chunk loaded and opening")).toBeInTheDocument();
  });

  it("loads the wallet straight away when a previous connection is remembered", async () => {
    localStorage.setItem("wagmi.recentConnectorId", '"io.metamask"');
    resetWalletIntent();
    render(<DeferredConnect />);
    expect(await screen.findByText("wallet chunk loaded")).toBeInTheDocument();
  });

  it("requestWallet from elsewhere (an action prompt) also loads it", async () => {
    render(<DeferredConnect />);
    act(() => requestWallet());
    expect(await screen.findByText(/wallet chunk loaded/)).toBeInTheDocument();
  });
});
