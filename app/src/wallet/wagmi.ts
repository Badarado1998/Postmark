import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { diana, EVM_RPC } from "../chain/config";

export const wagmiConfig = createConfig({
  chains: [diana],
  connectors: [injected({ shimDisconnect: true })],
  transports: { [diana.id]: http(EVM_RPC) },
  ssr: false,
});

declare module "wagmi" {
  interface Register { config: typeof wagmiConfig }
}
