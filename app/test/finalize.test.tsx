import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("../src/wallet/WalletRoot", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("wagmi", () => ({
  useAccount: () => ({ isConnected: true, address: "0x478F2A08a81be7CEa42bd34BD6900593fA56c4B6" }),
}));
vi.mock("../src/hooks/useTxAction", () => ({
  useTxAction: () => ({ state: { phase: "idle" }, run: vi.fn() }),
}));
vi.mock("../src/components/Toasts", () => ({ useToast: () => vi.fn() }));

import TxActions from "../src/wallet/TxActions";
import DisputePanel from "../src/wallet/DisputePanel";
import type { Bounty } from "../src/chain/client";

const CHALLENGE_ENDS = 1_800_000_000n;
const pending: Bounty = {
  funder: "0x1111111111111111111111111111111111111111",
  amount: 1000n, challengeReward: 1000n,
  workHash: "0x" + "0".repeat(64),
  deadline: CHALLENGE_ENDS - 10_000n, claimTimeout: 3600n,
  claimRound: 1n, claimExpiresAt: CHALLENGE_ENDS - 5000n,
  payee: "0x478F2A08a81be7CEa42bd34BD6900593fA56c4B6",
  payeeIdentityHash: "0x" + "0".repeat(64),
  verifiers: ["0x2222222222222222222222222222222222222222",
    "0x3333333333333333333333333333333333333333",
    "0x4444444444444444444444444444444444444444"],
  bondAmount: 1000n, state: 2, nonce: 1n,
  initialOutcome: 0, initialMergedAt: 1_700_000_000n,
  initialEvidenceHash: "0x" + "0".repeat(64),
  pendingVerdictHash: "0x" + "1".repeat(64),
  challengeEndsAt: CHALLENGE_ENDS,
  disputer: "0x0000000000000000000000000000000000000000",
  disputeEvidenceHash: "0x" + "0".repeat(64),
} as Bounty;

const meta = { ownerRepo: "postmark-e2e/sandbox", kind: 0, number: 1n } as never;

const at = (sec: bigint) => vi.setSystemTime(Number(sec) * 1000);

describe("challenge-window timing", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); cleanup(); });

  it("finalize hidden and dispute open before challengeEndsAt", () => {
    at(CHALLENGE_ENDS - 1n);
    const { container } = render(<TxActions id={7n} bounty={pending} />);
    expect(screen.queryByText(/finalize payout/i)).toBeNull();
    expect(container.textContent).not.toMatch(/actions/i);
    cleanup();
    render(<DisputePanel id={7n} bounty={pending} meta={meta} />);
    expect(screen.getByText(/dispute this verdict/i)).toBeTruthy();
  });

  it("finalize appears and dispute closes at challengeEndsAt", () => {
    at(CHALLENGE_ENDS);
    render(<TxActions id={7n} bounty={pending} />);
    const btn = screen.getByText(/finalize payout/i).closest("button")!;
    expect(btn.disabled).toBe(false);
    cleanup();
    const { container } = render(<DisputePanel id={7n} bounty={pending} meta={meta} />);
    expect(container.textContent).not.toMatch(/dispute this verdict/i);
  });

  it("still true after the window", () => {
    at(CHALLENGE_ENDS + 3600n);
    render(<TxActions id={7n} bounty={pending} />);
    expect(screen.getByText(/finalize payout/i)).toBeTruthy();
  });
});
