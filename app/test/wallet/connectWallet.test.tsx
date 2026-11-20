import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CLAIMANT } from "../fixtures";

const wagmi = vi.hoisted(() => ({
  account: { address: undefined as string | undefined, isConnected: false },
  connect: vi.fn(), disconnect: vi.fn(), switchChain: vi.fn(), reset: vi.fn(),
  connectors: [] as { uid: string; name: string }[],
  isPending: false, error: null as Error | null, chainId: 9800,
  qorex: { installed: false, qorAddress: null as string | null },
  windowData: undefined as { live: boolean } | undefined,
  pqcData: undefined as { live: boolean } | undefined,
}));

vi.mock("wagmi", () => ({
  useAccount: () => wagmi.account,
  useConnect: () => ({ connect: wagmi.connect, connectors: wagmi.connectors,
    isPending: wagmi.isPending, error: wagmi.error, reset: wagmi.reset }),
  useDisconnect: () => ({ disconnect: wagmi.disconnect }),
  useChainId: () => wagmi.chainId,
  useSwitchChain: () => ({ switchChain: wagmi.switchChain }),
}));
vi.mock("../../src/wallet/WalletRoot", async () => (await import("../mocks")).walletRootModule);
vi.mock("../../src/wallet/qorex", () => ({ useQorex: () => wagmi.qorex }));
vi.mock("../../src/hooks/queries", () => ({
  useEvmWindow: () => ({ data: wagmi.windowData }),
  usePqcStatus: () => ({ data: wagmi.pqcData }),
}));

import ConnectWallet from "../../src/wallet/ConnectWallet";

// jsdom has no <dialog> modal support
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute("open"); });
  Object.assign(wagmi, {
    account: { address: undefined, isConnected: false }, isPending: false, error: null, chainId: 9800,
    connectors: [{ uid: "a", name: "Alpha Wallet" }, { uid: "b", name: "Beta Wallet" }],
    qorex: { installed: false, qorAddress: null }, windowData: undefined, pqcData: undefined,
  });
  vi.clearAllMocks();
});

describe("disconnected", () => {
  it("shows one Connect wallet button that opens a named chooser", () => {
    render(<ConnectWallet />);
    expect(screen.getAllByRole("button", { name: "Connect wallet" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
    expect(wagmi.reset).toHaveBeenCalled();
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Alpha Wallet", hidden: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Beta Wallet", hidden: true })).toBeInTheDocument();
  });

  it("connects the chosen connector on the diana chain and closes the chooser", () => {
    wagmi.connect.mockImplementation((_args, opts) => opts.onSuccess());
    render(<ConnectWallet />);
    fireEvent.click(screen.getByRole("button", { name: "Beta Wallet", hidden: true }));
    expect(wagmi.connect).toHaveBeenCalledWith(
      { connector: wagmi.connectors[1], chainId: 9800 }, expect.any(Object));
    expect(HTMLDialogElement.prototype.close).toHaveBeenCalled();
  });

  it("closes from the Close button", () => {
    render(<ConnectWallet />);
    fireEvent.click(screen.getByRole("button", { name: "Close", hidden: true }));
    expect(HTMLDialogElement.prototype.close).toHaveBeenCalled();
  });

  it("explains an empty wallet list", () => {
    wagmi.connectors = [];
    render(<ConnectWallet />);
    expect(screen.getByText(/No EVM wallet detected/, { selector: "p" })).toBeInTheDocument();
  });

  it("shows a safe error and notes QoreX is identity-only", () => {
    wagmi.error = new Error("secret stack trace");
    wagmi.qorex = { installed: true, qorAddress: "qor1abcdefghijklmnop" };
    render(<ConnectWallet />);
    expect(screen.getByRole("alert", { hidden: true })).toHaveTextContent("Couldn't connect");
    expect(screen.queryByText(/secret stack trace/)).toBeNull();
    expect(screen.getByText(/QoreX is detected/)).toHaveTextContent("identity only");
  });

  it("disables the button while a connection is pending", () => {
    wagmi.isPending = true;
    render(<ConnectWallet />);
    expect(screen.getByRole("button", { name: "Connecting…" })).toBeDisabled();
  });
});

describe("connected", () => {
  beforeEach(() => { wagmi.account = { address: CLAIMANT, isConnected: true }; });

  it("shows the short address and disconnects on click", () => {
    render(<ConnectWallet />);
    fireEvent.click(screen.getByRole("button", { name: "0x478F…c4B6" }));
    expect(wagmi.disconnect).toHaveBeenCalled();
  });

  it("offers a chain switch on the wrong network", () => {
    wagmi.chainId = 1;
    render(<ConnectWallet />);
    fireEvent.click(screen.getByRole("button", { name: /Switch to diana/ }));
    expect(wagmi.switchChain).toHaveBeenCalledWith({ chainId: 9800 });
  });

  it("reports the PQ key and a missing EVM window", () => {
    wagmi.pqcData = { live: true };
    wagmi.windowData = { live: false };
    render(<ConnectWallet />);
    expect(screen.getByText("PQ key")).toBeInTheDocument();
    expect(screen.getByText("No EVM window")).toBeInTheDocument();
  });

  it("flags an account without a live PQ key", () => {
    wagmi.pqcData = { live: false };
    render(<ConnectWallet />);
    expect(screen.getByText("no PQ key")).toBeInTheDocument();
  });
});
