import type { Page } from "@playwright/test";
import { e2eLog } from "../util.ts";
import { nodePublic, nodeWallet } from "./accounts.ts";

type Rpc = { method: string; params?: unknown[] };
type Client = ReturnType<typeof nodeWallet>;

const optionalBig = (v: unknown) => (v === undefined ? undefined : BigInt(v as string));

/** Sign locally and broadcast raw — avoids provider-argument validation quirks. */
async function sendTransaction(client: Client, tx: Record<string, unknown>) {
  const pub = nodePublic();
  const address = client.account.address;
  const prepared = {
    to: tx.to, data: tx.data, from: undefined, account: client.account,
    nonce: tx.nonce !== undefined ? Number(BigInt(tx.nonce as string))
      : await pub.getTransactionCount({ address }),
    gas: optionalBig(tx.gas),
    gasPrice: optionalBig(tx.gasPrice) ?? await pub.getGasPrice(),
    value: optionalBig(tx.value) ?? 0n,
    chainId: 9800, type: "legacy",
  };
  const signed = await client.account.signTransaction(prepared as never);
  const hash = await pub.request({ method: "eth_sendRawTransaction", params: [signed] });
  e2eLog("testWallet", "sent", hash, "gas", tx.gas);
  return hash;
}

/** Answer one EIP-1193 request; everything unhandled goes to the diana RPC. */
async function handleRequest(client: Client, { method, params }: Rpc) {
  if (method !== "eth_chainId" && method !== "eth_accounts") {
    e2eLog("testWallet", method, JSON.stringify(params));
  }
  switch (method) {
    case "eth_accounts":
    case "eth_requestAccounts": return [client.account.address];
    case "eth_chainId": return "0x2648";
    case "net_version": return "9800";
    case "eth_sendTransaction":
      return sendTransaction(client, (params as Record<string, unknown>[])[0]!);
    default:
      try {
        return await client.request({ method, params } as never);
      } catch (e) {
        e2eLog("testWallet", `${method} failed:`, e instanceof Error ? e.message.slice(0, 500) : e);
        throw e;
      }
  }
}

/** Runs in the page: announce an EIP-6963 provider that forwards to the Node binding. */
function announceProvider() {
  const info = { uuid: "b5c1f6d0-0000-4e2e-8e2e-p0stmark-e2e", name: "Postmark E2E", icon: "data:image/svg+xml,", rdns: "dev.postmark.e2e" };
  type Listener = (...a: unknown[]) => void;
  const listeners = new Map<string, Set<Listener>>();
  const forward = (args: Rpc) =>
    (window as never as { __postmarkE2eRequest: (r: unknown) => Promise<unknown> }).__postmarkE2eRequest(args);
  const provider = {
    isPostmarkE2E: true,
    request: forward,
    on: (ev: string, fn: Listener) => {
      listeners.get(ev)?.add(fn) ?? listeners.set(ev, new Set([fn]));
      return provider;
    },
    removeListener: (ev: string, fn: Listener) => { listeners.get(ev)?.delete(fn); return provider; },
    emit: (ev: string, ...a: unknown[]) => listeners.forEach((set, k) => { if (k === ev) set.forEach((f) => f(...a)); }),
  };
  const announce = () =>
    window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: { info, provider } }));
  window.addEventListener("eip6963:requestProvider", announce);
  announce();
}

/** Inject an EIP-6963 EIP-1193 provider; all requests are proxied into Node
 * via an exposed binding, so the private key never enters page JS. */
export async function installTestWallet(page: Page, profile = "funder") {
  const client = nodeWallet(profile);
  await page.exposeBinding("__postmarkE2eRequest", (_source, req: Rpc) => handleRequest(client, req));
  await page.addInitScript(announceProvider);
}

export async function connectInjected(page: Page) {
  const connectBtn = page.getByRole("button", { name: /connect/i }).first();
  if (await connectBtn.isVisible({ timeout: 6_000 }).catch(() => false)) {
    await connectBtn.click();
    const pick = page.getByText("Postmark E2E");
    if (await pick.isVisible({ timeout: 6_000 }).catch(() => false)) await pick.click();
  }
}
