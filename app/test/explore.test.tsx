import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import Explore from "../src/pages/Explore";
import * as queries from "../src/hooks/queries";

vi.mock("../src/hooks/queries", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../src/hooks/queries")>();
  return { ...mod, useIndex: vi.fn(), useBounties: vi.fn() };
});
vi.mock("../src/chain/IndexerProvider", () => ({
  useFeedStatus: () => "polling",
  IndexerProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

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
