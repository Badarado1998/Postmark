import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Page } from "@playwright/test";
const e2eDeployment = JSON.parse(readFileSync(new URL("../../deployments/diana-e2e.json", import.meta.url), "utf8")) as { address: string };

export const E2E_ESCROW = e2eDeployment.address as `0x${string}`;

const PROFILES_DIR = `${homedir()}/.config/postmark/e2e`;

export function loadAccount(profile = "funder") {
  const env = readFileSync(`${PROFILES_DIR}/${profile}.env`, "utf8");
  const key = env.match(/^(?:DEPLOYER_)?KEY=(0x[0-9a-fA-F]{64})$/m)?.[1];
  if (!key) throw new Error(`${profile}.env missing KEY=`);
  return privateKeyToAccount(key as `0x${string}`);
}

export function profileAddress(profile: string) {
  const env = readFileSync(`${PROFILES_DIR}/${profile}.env`, "utf8");
  const a = env.match(/^(?:DEPLOYER_)?ADDRESS=(0x[0-9a-fA-F]{40})$/m)?.[1];
  if (!a) throw new Error(`${profile}.env missing ADDRESS`);
  return a as `0x${string}`;
}

const CHAIN = {
  id: 9800, name: "QoreChain diana",
  nativeCurrency: { name: "test QOR", symbol: "QOR", decimals: 18 },
  rpcUrls: { default: { http: ["https://evm-testnet.qore.host"] } },
  testnet: true,
} as const;

export function nodePublic() {
  return createPublicClient({ chain: CHAIN,
    transport: http("https://evm-testnet.qore.host", { timeout: 30_000 }) });
}

export function nodeWallet(profile = "funder") {
  return createWalletClient({
    account: loadAccount(profile),
    chain: CHAIN,
    transport: http("https://evm-testnet.qore.host", { timeout: 30_000 }),
  });
}

/** Run window.mjs for a profile. */
export function windowCtl(args: string[], profile = "funder") {
  return execFileSync("node",
    ["../scripts/window.mjs", "--env", `${PROFILES_DIR}/${profile}`, ...args],
    { cwd: new URL("..", import.meta.url).pathname, stdio: ["ignore", "pipe", "inherit"] })
    .toString();
}

/** Inject an EIP-6963 EIP-1193 provider; all requests are proxied into Node
 * via an exposed binding, so the private key never enters page JS. */
export async function installTestWallet(page: Page, profile = "funder") {
  const client = nodeWallet(profile);
  const address = client.account.address;
  await page.exposeBinding("__postmarkE2eRequest", async (_s, req: { method: string; params?: unknown[] }) => {
    const { method, params } = req;
    if (method !== "eth_chainId" && method !== "eth_accounts") {
      console.log(`[testWallet] ${method}`, JSON.stringify(params));
    }
    if (method === "eth_accounts" || method === "eth_requestAccounts") return [address];
    if (method === "eth_chainId") return "0x2648";
    if (method === "net_version") return "9800";
    if (method === "eth_sendTransaction") {
      // sign locally, broadcast raw — avoids provider-arg validation quirks
      const tx = (params as Record<string, unknown>[])[0]!;
      const pub = nodePublic();
      const prep: Record<string, unknown> = {
        to: tx.to, data: tx.data, from: undefined,
        account: client.account,
        nonce: tx.nonce !== undefined ? Number(BigInt(tx.nonce as string))
          : await pub.getTransactionCount({ address }),
        gas: tx.gas !== undefined ? BigInt(tx.gas as string) : undefined,
        gasPrice: tx.gasPrice !== undefined ? BigInt(tx.gasPrice as string)
          : await pub.getGasPrice(),
        value: tx.value !== undefined ? BigInt(tx.value as string) : 0n,
        chainId: 9800, type: "legacy",
      };
      const signed = await client.account.signTransaction(prep as never);
      const hash = await pub.request({ method: "eth_sendRawTransaction", params: [signed] });
      console.log("[testWallet] sent", hash, "gas", tx.gas);
      return hash;
    }
    // everything else (eth_sendTransaction, eth_call, gas, receipts…)
    // handled by the viem wallet client over the diana RPC
    try {
      return await client.request({ method, params } as never);
    } catch (e) {
      console.log(`[testWallet] ${method} failed:`,
        e instanceof Error ? e.message.slice(0, 500) : e);
      throw e;
    }
  });
  await page.addInitScript(() => {
    const info = { uuid: "b5c1f6d0-0000-4e2e-8e2e-p0stmark-e2e", name: "Postmark E2E", icon: "data:image/svg+xml,", rdns: "dev.postmark.e2e" };
    const listeners = new Map<string, Set<(...a: unknown[]) => void>>();
    const provider = {
      isPostmarkE2E: true,
      request: (args: { method: string; params?: unknown[] }) =>
        (window as never as { __postmarkE2eRequest: (r: unknown) => Promise<unknown> })
          .__postmarkE2eRequest(args) as Promise<unknown>,
      on: (ev: string, fn: (...a: unknown[]) => void) => {
        listeners.get(ev)?.add(fn) ?? listeners.set(ev, new Set([fn]));
        return provider;
      },
      removeListener: (ev: string, fn: (...a: unknown[]) => void) => {
        listeners.get(ev)?.delete(fn); return provider;
      },
      emit: (ev: string, ...a: unknown[]) => listeners.get(ev)?.forEach((f) => f(...a)),
    };
    const announce = () =>
      window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: { info, provider } }));
    window.addEventListener("eip6963:requestProvider", announce);
    announce();
  });
}

/** Github API fixtures for postmark-e2e/sandbox#1. */
export async function mockGithub(page: Page, opts: { comments?: unknown[] } = {}) {
  const issue = {
    number: 1, title: "Postmark sandbox: wire the funder flow",
    state: "open", html_url: "https://github.com/postmark-e2e/sandbox/issues/1",
    user: { login: "octocat" }, labels: [{ name: "bounty" }], comments: 0,
  };
  await page.route("https://api.github.com/**", (route) => {
    const u = route.request().url();
    if (u.includes("/issues/1/comments")) {
      return route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify(opts.comments ?? []) });
    }
    if (u.includes("/issues/1")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(issue) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
}
