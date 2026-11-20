import type { ReactElement, ReactNode } from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import type { Bounty } from "../src/chain/client";
import type { BountyMeta } from "../src/chain/indexer";

export const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as const;
export const ZERO_HASH = `0x${"0".repeat(64)}` as const;
export const CLAIMANT = "0x478F2A08a81be7CEa42bd34BD6900593fA56c4B6" as const;
export const FUNDER = "0x4Fe9f2B175f6D533c9b88902Dc257A34384873bD" as const;
export const VERIFIERS = [
  "0x01B451550bEf4cc51Bb24B8C5E5b4b23a368a9cE",
  "0x8e815476f878b05a2a0E4BC452112311eAEcEa31",
  "0xFac4a64980C8777799EBae562a82825185e20558",
] as const;

export const META: BountyMeta = {
  ownerRepo: "postmark-e2e/sandbox", kind: 0, number: 1n,
  workHash: `0x${"ab".repeat(32)}`, workHashMismatch: false,
};

/** An Open bounty by default; override fields to reach the other states. */
export function makeBounty(overrides: Partial<Bounty> = {}): Bounty {
  return {
    funder: FUNDER, amount: 50_000_000_000_000_000n, challengeReward: 10_000_000_000_000_000n,
    workHash: META.workHash, deadline: 4_000_000_000n, claimTimeout: 86_400n,
    claimRound: 0n, claimExpiresAt: 0n, payee: ZERO_ADDR, payeeIdentityHash: ZERO_HASH,
    verifiers: [...VERIFIERS], bondAmount: 10_000_000_000_000_000n, state: 0, nonce: 0n,
    initialOutcome: 0, initialMergedAt: 0n, initialEvidenceHash: ZERO_HASH,
    pendingVerdictHash: ZERO_HASH, challengeEndsAt: 0n, disputer: ZERO_ADDR,
    disputeEvidenceHash: ZERO_HASH,
    ...overrides,
  } as Bounty;
}

export const newQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

/** Render inside a fresh QueryClient and an in-memory router. */
export function renderApp(ui: ReactElement, route = "/") {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={newQueryClient()}>
      <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  return render(ui, { wrapper: Wrapper });
}
