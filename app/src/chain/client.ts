import { createPublicClient, http, webSocket , type PublicClient } from "viem";
import { diana, EVM_RPC, EVM_WS, ESCROW_ADDRESS } from "./config";
import { postmarkEscrowAbi } from "./abi";

export const httpClient = createPublicClient({
  chain: diana,
  transport: http(EVM_RPC, { timeout: 20_000 }),
});

let wsClient: PublicClient | null = null;
export function wsPublicClient(): PublicClient {
  wsClient ??= createPublicClient({ chain: diana, transport: webSocket(EVM_WS) });
  return wsClient;
}

export const escrow = {
  address: ESCROW_ADDRESS,
  abi: postmarkEscrowAbi,
} as const;

export type Bounty = Awaited<ReturnType<typeof getBounty>>;

export function getBounty(id: bigint) {
  return httpClient.readContract({
    ...escrow, functionName: "getBounty", args: [id],
  });
}
export const nextBountyId = () =>
  httpClient.readContract({ ...escrow, functionName: "nextBountyId" });
export const totalLiabilities = () =>
  httpClient.readContract({ ...escrow, functionName: "totalLiabilities" });
export const creditOf = (account: `0x${string}`) =>
  httpClient.readContract({ ...escrow, functionName: "creditOf", args: [account] });
