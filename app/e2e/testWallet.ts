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

// ---- shared spec helpers ---------------------------------------------------
import { postmarkEscrowAbi } from "../src/chain/abi.ts";
import { existsSync } from "node:fs";

const STATE_FILE = new URL("./.signer-state.json", import.meta.url).pathname;

export function signerState() {
  if (!existsSync(STATE_FILE)) return null;
  return JSON.parse(readFileSync(STATE_FILE, "utf8")) as {
    pairingCode: string; pid: number;
    signers?: Record<string, { pairingCode: string; pid: number; profile: string }>;
  };
}

/** pairing code for the signer on `port` (default: the claimant's). */
export function pairingCodeFor(port = 47321): string {
  const s = signerState();
  const code = s?.signers?.[String(port)]?.pairingCode ?? s?.pairingCode;
  if (!code) throw new Error("no signer pairing code — global setup did not start signers");
  return code;
}

export function verifierAddr(i: number) {
  const env = readFileSync(`${PROFILES_DIR}/verifier${i}.env`, "utf8");
  return env.match(/^ADDRESS=(0x[0-9a-fA-F]{40})$/m)![1] as `0x${string}`;
}

/** Reuse an existing Open bounty whose deadline still fits a 1 h claim
 * window; otherwise create one — via the e2e funder when it can afford gas,
 * else a dust-value bounty from the deployer (outside the e2e QOR budget;
 * createBounty is permissionless). */
export async function openBountyOrCreate(): Promise<bigint> {
  const w = nodeWallet("funder");
  const pub = nodePublic();
  const next = (await pub.readContract({
    address: E2E_ESCROW, abi: postmarkEscrowAbi, functionName: "nextBountyId",
  })) as bigint;
  const now = BigInt(Math.floor(Date.now() / 1000));
  for (let id = next - 1n; id >= 1n; id--) {
    const b = await pub.readContract({ address: E2E_ESCROW, abi: postmarkEscrowAbi,
      functionName: "getBounty", args: [id] }) as
      { state: number; deadline: bigint; claimTimeout: bigint };
    if (b.state === 0 && b.deadline > now + b.claimTimeout + 600n) {
      console.log("[e2e] reusing open bounty", id.toString());
      return id;
    }
  }
  const id = next;
  const deadline = now + 3n * 3600n;
  const gasPrice = await pub.getGasPrice();
  const budget = await pub.getBalance({ address: w.account.address });
  const useFunder = budget > 300_000_000_000_000_000n + gasPrice * 1_000_000n;
  const wallet = useFunder ? w : nodeWallet("../deployer");
  const [amount, reward, bond] = useFunder
    ? [200_000_000_000_000_000n, 50_000_000_000_000_000n, 50_000_000_000_000_000n]
    : [1_000n, 1_000n, 1_000n];
  console.log(`[e2e] creating bounty via ${useFunder ? "funder" : "deployer (dust)"}`);
  const hash = await wallet.writeContract({
    address: E2E_ESCROW, abi: postmarkEscrowAbi, functionName: "createBounty",
    args: [amount, "postmark-e2e/sandbox", 0, 1n,
      deadline, 3600n, [verifierAddr(0), verifierAddr(1), verifierAddr(2)],
      reward, bond],
    value: amount + reward,
    gas: 900_000n,
  });
  const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (receipt.status !== "success") throw new Error(`createBounty failed: ${hash}`);
  console.log("[e2e] spec bounty", id.toString(), "tx", hash);
  return id;
}

export async function connectInjected(page: Page) {
  const connectBtn = page.getByRole("button", { name: /connect/i }).first();
  if (await connectBtn.isVisible({ timeout: 6_000 }).catch(() => false)) {
    await connectBtn.click();
    const pick = page.getByText("Postmark E2E");
    if (await pick.isVisible({ timeout: 6_000 }).catch(() => false)) await pick.click();
  }
}

/** Synthesized comments for the demo: every bounty id gets the exact claim
 * line from e2e-claimant and the exact dispute line from e2e-disputer, with
 * stable distinct comment ids, so every scan works in stub mode. */
export function synthComments(escrow: string, claimant: string, upToId: bigint) {
  const out: { id: number; user: { login: string }; body: string; created_at: string }[] = [];
  const t0 = Math.floor(Date.now() / 1000) - 3600;
  for (let id = 1n; id <= upToId; id++) {
    // claim lines must reuse the fixture comment id the live claims were made
    // with: payeeIdentityHash commits to (login, claimant, commentId)
    out.push({ id: 987654321, user: { login: "e2e-claimant" },
      body: `postmark-claim v1 chain=9800 escrow=${escrow.toLowerCase()} bounty=${id} claimant=${claimant.toLowerCase()}`,
      created_at: new Date((t0 + Number(id)) * 1000).toISOString() });
    out.push({ id: 900_000_001 + Number(id) * 2, user: { login: "e2e-disputer" },
      body: `postmark-dispute v1 chain=9800 escrow=${escrow.toLowerCase()} bounty=${id}`,
      created_at: new Date((t0 + Number(id)) * 1000 + 500).toISOString() });
  }
  return out;
}

/** Github API fixtures for postmark-e2e/sandbox#1 (+ pull/2 + timeline).
 * `mergedAt` pins the default PR's merged_at (same PAY evidence in every
 * window). `synthesize` replaces the comments fixture with per-bounty claim +
 * dispute lines, paginated 100/page like the real API. */
export async function mockGithub(page: Page, opts: {
  comments?: unknown[]; pull?: unknown; timeline?: unknown[];
  mergedAt?: string;
  synthesize?: { claimant: string; upToId: bigint };
} = {}) {
  const issue = {
    number: 1, title: "Postmark sandbox: wire the funder flow",
    state: "open", html_url: "https://github.com/postmark-e2e/sandbox/issues/1",
    user: { login: "octocat" }, labels: [{ name: "bounty" }], comments: 0,
  };
  const pull = opts.pull ?? {
    number: 2, title: "wire the funder flow", state: "closed", merged: true,
    merged_at: opts.mergedAt ?? new Date().toISOString(),
    merge_commit_sha: "f".repeat(40),
    user: { login: "e2e-claimant" },
    html_url: "https://github.com/postmark-e2e/sandbox/pull/2",
  };
  const allComments = opts.synthesize
    ? [...synthComments(E2E_ESCROW, opts.synthesize.claimant, opts.synthesize.upToId),
       ...(opts.comments ?? [])]
    : (opts.comments ?? []);
  const timeline = opts.timeline ?? [{
    event: "cross-referenced",
    source: { issue: { number: 2, pull_request: {
      html_url: "https://github.com/postmark-e2e/sandbox/pull/2" } } },
  }];
  await page.route("https://api.github.com/**", (route) => {
    const u = route.request().url();
    if (u.includes("/issues/1/comments")) {
      // paginate 100/page like the real API (Link header + short last page)
      const page = Math.max(1, Number(new URL(u).searchParams.get("page") ?? "1"));
      const slice = allComments.slice((page - 1) * 100, page * 100) as unknown[];
      const headers: Record<string, string> = { "content-type": "application/json" };
      if ((allComments as unknown[]).length > page * 100)
        headers.link = `<${u.replace(/page=\d+/, `page=${page + 1}`)}>; rel="next"`;
      return route.fulfill({ status: 200, headers, body: JSON.stringify(slice) });
    }
    if (u.includes("/issues/1/timeline")) {
      return route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify(timeline) });
    }
    if (u.includes("/pulls/2")) {
      return route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify(pull) });
    }
    if (u.includes("/issues/1")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(issue) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
}
