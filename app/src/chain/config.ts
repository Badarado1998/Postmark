import { defineChain } from "viem";
import deployment from "../../../deployments/diana.json";

export const diana = defineChain({
  id: 9800,
  name: "QoreChain diana",
  nativeCurrency: { name: "test QOR", symbol: "tQOR", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://evm-testnet.qore.host"],
      webSocket: ["wss://evm-ws-testnet.qore.host"],
    },
  },
  testnet: true,
});

export const EVM_RPC = diana.rpcUrls.default.http[0];
export const EVM_WS = diana.rpcUrls.default.webSocket![0];
export const REST = "https://api-testnet.qore.host";
export const NATIVE_CHAIN_ID = "qorechain-diana";
export const MESSAGE_PREFIX = `qorechain-msg-v1|${NATIVE_CHAIN_ID}|`;
export const EXPLORER = "https://dashboard.qorechain.io/explorer";
export const PQC_VERIFY_PRECOMPILE = "0x0000000000000000000000000000000000000a01" as const;
export const PQC_KEY_STATUS_PRECOMPILE = "0x0000000000000000000000000000000000000a02" as const;
export const ESCROW_ADDRESS = deployment.address as `0x${string}`;
export const DEPLOY_BLOCK = BigInt(deployment.deploy.block);

export const explorerTx = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const explorerAddress = (addr: string) => `${EXPLORER}/address/${addr}`;
export const explorerBlock = (height: number | bigint) => `${EXPLORER}/block/${height}`;
