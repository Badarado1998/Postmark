import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import Explore from "../../src/pages/Explore";
import * as queries from "../../src/hooks/queries";

vi.mock("../../src/hooks/queries", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../src/hooks/queries")>();
  return { ...mod, useIndex: vi.fn(), useBounties: vi.fn() };
});
vi.mock("../../src/chain/IndexerProvider", async () => (await import("../mocks")).indexerModule("polling"));

const wrap = (ui: React.ReactElement) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>{ui}</MemoryRouter>
  </QueryClientProvider>);

const pending = (data?: never) => ({ data, isPending: true, error: null, refetch: vi.fn() }) as any;

describe("Explore states", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows skeletons while loading", () => {
    vi.mocked(queries.useIndex).mockReturnValue(pending());
    vi.mocked(queries.useBounties).mockReturnValue(pending());
    const { container } = wrap(<Explore />);
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("shows the real empty state when there are no bounties", () => {
    vi.mocked(queries.useIndex).mockReturnValue({
      data: { events: [], metaById: new Map(), bountyIds: [], lastBlock: 1n },
      isPending: false, error: null, refetch: vi.fn(),
    } as any);
    vi.mocked(queries.useBounties).mockReturnValue({ data: [], isPending: false, error: null, refetch: vi.fn() } as any);
    wrap(<Explore />);
    expect(screen.getByText(/no bounties yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Fund a bounty" })).toHaveAttribute("href", "/create");
  });

  it("shows an error state with retry", () => {
    vi.mocked(queries.useIndex).mockReturnValue({
      data: undefined, isPending: false,
      error: new Error("rpc down"), refetch: vi.fn(),
    } as any);
    vi.mocked(queries.useBounties).mockReturnValue({ data: undefined, isPending: false, error: null, refetch: vi.fn() } as any);
    wrap(<Explore />);
    expect(screen.getByRole("alert")).toHaveTextContent("rpc down");
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});

describe("Explore with bounties", () => {
  const mk = (state: number, amount: bigint, deadline: bigint) => ({
    funder: "0x1", amount, challengeReward: 0n, deadline, state, payee: "0x0000000000000000000000000000000000000000",
  });
  const setup = () => {
    vi.mocked(queries.useIndex).mockReturnValue({
      data: { events: [], bountyIds: [1n, 2n, 3n], lastBlock: 1n, metaById: new Map([
        [1n, { ownerRepo: "a/one", kind: 0, number: 1n, workHashMismatch: false }],
        [2n, { ownerRepo: "b/two", kind: 1, number: 2n, workHashMismatch: false }],
        [3n, { ownerRepo: "c/three", kind: 0, number: 3n, workHashMismatch: false }]]) },
      isPending: false, error: null, refetch: vi.fn() } as any);
    vi.mocked(queries.useBounties).mockReturnValue({ data: [
      { id: 1n, bounty: mk(0, 5n * 10n ** 18n, 300n) }, { id: 2n, bounty: mk(4, 1n * 10n ** 18n, 100n) },
      { id: 3n, bounty: mk(0, 9n * 10n ** 18n, 200n) }], isPending: false, error: null, refetch: vi.fn() } as any);
  };

  it("shows status tabs with counts and filters by status", () => {
    setup();
    wrap(<Explore />);
    expect(screen.getByRole("tab", { name: /^all 3/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^Open 2/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /^Paid 1/ }));
    expect(screen.getAllByText("b/two/pull/2").length).toBeGreaterThan(0);
    expect(screen.queryByText("a/one#1")).toBeNull();
  });

  it("sorts by amount and searches by repo", () => {
    setup();
    wrap(<Explore />);
    fireEvent.change(screen.getByLabelText("Sort bounties"), { target: { value: "amount" } });
    const first = screen.getAllByRole("link", { name: /^#\d$/ })[0]!;
    expect(first).toHaveTextContent("#3");
    fireEvent.change(screen.getByLabelText("Search bounties"), { target: { value: "a/one" } });
    expect(screen.queryByText("c/three#3")).toBeNull();
  });
});
