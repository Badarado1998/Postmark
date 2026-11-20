import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { E2E_DEPLOYMENT } from "../util.ts";

export const E2E_ESCROW = E2E_DEPLOYMENT.address as `0x${string}`;
export const PROFILES_DIR = `${homedir()}/.config/postmark/e2e`;

const EVM_RPC = "https://evm-testnet.qore.host";
const RPC_TIMEOUT_MS = 30_000;
const CHAIN = {
  id: 9800, name: "QoreChain diana",
  nativeCurrency: { name: "test QOR", symbol: "QOR", decimals: 18 },
  rpcUrls: { default: { http: [EVM_RPC] } },
  testnet: true,
} as const;

const readProfile = (profile: string) => readFileSync(`${PROFILES_DIR}/${profile}.env`, "utf8");

export function loadAccount(profile = "funder") {
  const key = readProfile(profile).match(/^(?:DEPLOYER_)?KEY=(0x[0-9a-fA-F]{64})$/m)?.[1];
  if (!key) throw new Error(`${profile}.env missing KEY=`);
  return privateKeyToAccount(key as `0x${string}`);
}

export function profileAddress(profile: string) {
  const a = readProfile(profile).match(/^(?:DEPLOYER_)?ADDRESS=(0x[0-9a-fA-F]{40})$/m)?.[1];
  if (!a) throw new Error(`${profile}.env missing ADDRESS`);
  return a as `0x${string}`;
}

export const verifierAddr = (i: number) => profileAddress(`verifier${i}`);

export function nodePublic() {
  return createPublicClient({ chain: CHAIN, transport: http(EVM_RPC, { timeout: RPC_TIMEOUT_MS }) });
}

export function nodeWallet(profile = "funder") {
  return createWalletClient({
    account: loadAccount(profile), chain: CHAIN,
    transport: http(EVM_RPC, { timeout: RPC_TIMEOUT_MS }),
  });
}

/** Run window.mjs for a profile. */
export function windowCtl(args: string[], profile = "funder") {
  return execFileSync("node",
    ["../scripts/window.mjs", "--env", `${PROFILES_DIR}/${profile}`, ...args],
    { cwd: new URL("../..", import.meta.url).pathname, stdio: ["ignore", "pipe", "inherit"] })
    .toString();
}
