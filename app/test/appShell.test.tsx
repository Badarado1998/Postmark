import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { renderApp } from "./fixtures";

vi.mock("../src/chain/IndexerProvider", () => ({
  useFeedStatus: () => "live",
  IndexerProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("../src/wallet/ConnectWallet", () => ({ default: () => <button>Connect wallet</button> }));
vi.mock("../src/wallet/MeInner", () => ({ default: () => <p>me inner</p> }));
vi.mock("../src/wallet/WalletRoot", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("../src/wallet/CreateInner", () => ({ default: () => <p>create inner</p> }));
vi.mock("../src/pages/Explore", () => ({ default: () => <p>explore page</p> }));

import App from "../src/App";
import Landing from "../src/pages/Landing";
import Me from "../src/pages/Me";
import Create from "../src/pages/Create";
import { ESCROW_ADDRESS } from "../src/chain/config";

describe("Landing", () => {
  it("states the pitch and links to the app", () => {
    renderApp(<Landing />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Bounties that pay when the work is verified.");
    expect(screen.getAllByRole("link", { name: "Fund a bounty" })[0]).toHaveAttribute("href", "/create");
    expect(screen.getByRole("link", { name: "Browse bounties" })).toHaveAttribute("href", "/explore");
  });

  it("labels the product view as an example and never claims real money", () => {
    renderApp(<Landing />);
    expect(screen.getByText(/Example · bounty detail/)).toBeInTheDocument();
    expect(screen.getAllByText(/no monetary value/i).length).toBeGreaterThan(0);
  });

  it("proves the claims with the production contract address and the FAQ", () => {
    renderApp(<Landing />);
    expect(screen.getByRole("link", { name: ESCROW_ADDRESS })).toBeInTheDocument();
    expect(screen.getByText("Is this real money?")).toBeInTheDocument();
    expect(screen.getByText(/126 Foundry tests/)).toBeInTheDocument();
  });
});

describe("pages", () => {
  it("Me loads the wallet view lazily", async () => {
    render(<MemoryRouter><Me /></MemoryRouter>);
    expect(await screen.findByText("me inner")).toBeInTheDocument();
  });

  it("Create loads the form lazily", async () => {
    render(<MemoryRouter><Create /></MemoryRouter>);
    expect(await screen.findByText("create inner")).toBeInTheDocument();
  });
});

describe("App routing", () => {
  const at = (path: string) => render(
    <MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);

  it("renders the landing page at /", () => {
    at("/");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Bounties that pay/);
  });

  it("lazy-loads Explore", async () => {
    at("/explore");
    expect(await screen.findByText("explore page")).toBeInTheDocument();
  });

  it("falls back to the not-found page", () => {
    at("/no/such/page");
    expect(screen.getByRole("heading", { name: /never arrived/i })).toBeInTheDocument();
  });
});
