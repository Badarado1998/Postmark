import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "./wagmi";

/** Mounts the wagmi context for a lazily loaded subtree. Multiple roots share
 * the same config store, so state stays consistent across chunks. */
export default function WalletRoot({ children }: { children: React.ReactNode }) {
  return <WagmiProvider config={wagmiConfig}>{children}</WagmiProvider>;
}
