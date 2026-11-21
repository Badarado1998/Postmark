import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CLAIMANT, META, makeBounty } from "../fixtures";

vi.mock("wagmi", () => ({ useAccount: () => ({ address: CLAIMANT, isConnected: true }) }));
vi.mock("../../src/wallet/WalletRoot", async () => (await import("../mocks")).walletRootModule);
vi.mock("../../src/hooks/useTxAction", () => ({
  useTxAction: () => ({ state: { phase: "idle" }, run: vi.fn(), busy: false }),
}));
vi.mock("../../src/components/Toasts", () => ({ useToast: () => vi.fn() }));

import { PendingVerdict } from "../../src/pages/bounty/VerdictBanners";

const now = () => BigInt(Math.floor(Date.now() / 1000));
const pendingEnding = (challengeEndsAt: bigint) => makeBounty({ state: 2, payee: CLAIMANT, challengeEndsAt });

describe("Pending verdict view", () => {
  it("offers the dispute form and bond while the challenge window is open", async () => {
    render(<PendingVerdict id={13n} bounty={pendingEnding(now() + 3600n)} meta={META} />);
    expect(screen.getByText("verdict pending")).toBeInTheDocument();
    expect(await screen.findByText(/dispute this verdict/i)).toBeInTheDocument();
    expect(screen.getByText(/Anyone can bond/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("your GitHub login")).toBeInTheDocument();
    expect(screen.queryByText(/ready to finalize/i)).toBeNull();
  });

  it("says the payout is ready to finalize once the window has closed", () => {
    render(<PendingVerdict id={13n} bounty={pendingEnding(now() - 60n)} meta={META} />);
    expect(screen.getByRole("status")).toHaveTextContent("Challenge window closed — ready to finalize");
    expect(screen.queryByPlaceholderText("your GitHub login")).toBeNull();
  });
});
