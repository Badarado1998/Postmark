import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const m = vi.hoisted(() => ({
  getBlockNumber: vi.fn(), getLogs: vi.fn(), watch: vi.fn(), unwatch: vi.fn(),
  onError: null as null | (() => void),
}));
vi.mock("../../src/chain/client", () => ({
  httpClient: { getBlockNumber: m.getBlockNumber, getLogs: m.getLogs },
  wsPublicClient: () => ({
    watchContractEvent: (opts: { onError: () => void }) => { m.onError = opts.onError; m.watch(); return m.unwatch; },
  }),
}));

import { IndexerProvider, useFeedStatus } from "../../src/chain/IndexerProvider";
import { wagmiConfig } from "../../src/wallet/wagmi";
import { DEPLOYMENT_NAME, ESCROW_ADDRESS, NATIVE_CHAIN_ID, MESSAGE_PREFIX, diana } from "../../src/chain/config";

const Status = () => <p>feed:{useFeedStatus()}</p>;
const mount = async (qc = new QueryClient()) => {
  const view = render(
    <QueryClientProvider client={qc}><IndexerProvider><Status /></IndexerProvider></QueryClientProvider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  return view;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  m.getBlockNumber.mockResolvedValue(100n);
  m.getLogs.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

describe("IndexerProvider", () => {
  it("starts connecting, then reports live once the socket survives its grace period", async () => {
    await mount();
    expect(screen.getByText("feed:connecting")).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(4100); });
    expect(m.watch).toHaveBeenCalled();
    expect(screen.getByText("feed:live")).toBeInTheDocument();
  });

  it("falls back to polling when the socket errors and retries later", async () => {
    await mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(4100); });
    act(() => m.onError?.());
    expect(m.unwatch).toHaveBeenCalled();
    expect(screen.getByText("feed:polling")).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(25_100); });
    expect(m.watch).toHaveBeenCalledTimes(2);
  });

  it("polls for new logs after a socket error and invalidates the affected queries", async () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    await mount(qc);
    act(() => m.onError?.());
    m.getBlockNumber.mockResolvedValue(105n);
    m.getLogs.mockResolvedValue([]);
    await act(async () => { await vi.advanceTimersByTimeAsync(6100); });
    expect(m.getLogs).toHaveBeenCalledWith(expect.objectContaining({ fromBlock: 101n, toBlock: 105n }));
    spy.mockRestore();
  });

  it("stops watching on unmount", async () => {
    const { unmount } = await mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(4100); });
    unmount();
    expect(m.unwatch).toHaveBeenCalled();
  });
});

describe("chain configuration", () => {
  it("targets diana with the production escrow by default", () => {
    expect(diana.id).toBe(9800);
    expect(DEPLOYMENT_NAME).toBe("diana");
    expect(ESCROW_ADDRESS).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(MESSAGE_PREFIX).toBe(`qorechain-msg-v1|${NATIVE_CHAIN_ID}|`);
  });

  it("builds the wagmi config for the diana chain only", () => {
    expect(wagmiConfig.chains.map((c) => c.id)).toEqual([9800]);
  });
});
