// Shared vi.mock factories: `vi.mock(path, async () => (await import("../mocks")).walletRootModule)`.
import type { ReactNode } from "react";

/** WalletRoot without the wagmi provider. */
export const walletRootModule = {
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
};

/** IndexerProvider with a fixed feed status. */
export const indexerModule = (feed: "live" | "polling" | "connecting" = "live") => ({
  useFeedStatus: () => feed,
  IndexerProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
});
