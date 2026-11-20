#!/usr/bin/env node
// finalize-when-ready.mjs <bountyId> --env <profileBase> [--deployment e2e|diana]
// Polls the escrow until the bounty is finalizable (Pending and chain time
// >= challengeEndsAt), then opens a scoped EVM window, sends finalize(id),
// waits for the receipt and closes the window. Polls every 5 minutes.
// Never prints key material.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { postmarkEscrowAbi } from "../app/src/chain/abi.ts";

const POLL_MS = 5 * 60 * 1000;
const RPC = "https://evm-testnet.qore.host";
const CHAIN = {
  id: 9800, name: "QoreChain diana",
  nativeCurrency: { name: "test QOR", symbol: "QOR", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } }, testnet: true,
};

const ts = () => new Date().toISOString();
const log = (m) => console.log(`[finalize ${ts()}] ${m}`);

/** What to do about this bounty right now. Pure — unit tested. */
export function decide(bounty, chainNowSec) {
  if (bounty.state !== 2) return "not-pending";
  if (bounty.challengeEndsAt <= 0n) return "wait"; // no verdict frozen in
  return chainNowSec >= bounty.challengeEndsAt ? "finalize" : "wait";
}

async function main() {
  const args = process.argv.slice(2);
  let envBase = null, deployment = "e2e", idStr = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--env") envBase = args[++i];
    else if (args[i] === "--deployment") deployment = args[++i];
    else if (!args[i].startsWith("-")) idStr = args[i];
  }
  const die = (m, c = 1) => { console.error(`[finalize] ${m}`); process.exit(c); };
  if (!idStr || !envBase) {
    die("usage: finalize-when-ready.mjs <bountyId> --env <profileBase> [--deployment e2e|diana]", 2);
  }
  const bountyId = BigInt(idStr);
  const deployments = { e2e: "deployments/diana-e2e.json", diana: "deployments/diana.json" };
  if (!deployments[deployment]) die(`unknown --deployment ${deployment}`, 2);
  const ESCROW = JSON.parse(readFileSync(
    new URL(`../${deployments[deployment]}`, import.meta.url), "utf8")).address;
  const WINDOW_MJS = new URL("./window.mjs", import.meta.url).pathname;
  const ROOT = new URL("..", import.meta.url).pathname;

  const env = readFileSync(`${envBase}.env`, "utf8");
  const key = env.match(/^(?:DEPLOYER_)?KEY=(0x[0-9a-fA-F]{64})$/m)?.[1];
  if (!key) die(`${envBase}.env missing KEY=`);
  const account = privateKeyToAccount(key);

  const pub = createPublicClient({ chain: CHAIN, transport: http(RPC, { timeout: 30_000 }) });
  const wallet = createWalletClient({ account, chain: CHAIN, transport: http(RPC, { timeout: 30_000 }) });
  const escrow = { address: ESCROW, abi: postmarkEscrowAbi };
  const windowCtl = (a) =>
    execFileSync("node", [WINDOW_MJS, "--env", envBase, ...a],
      { cwd: ROOT, stdio: ["ignore", "pipe", "inherit"] }).toString();

  async function tick() {
    const b = await pub.readContract({ ...escrow, functionName: "getBounty", args: [bountyId] });
    const now = (await pub.getBlock({ blockTag: "latest" })).timestamp;
    const action = decide(b, now);
    if (action === "not-pending") {
      log(`bounty ${bountyId} state=${b.state} — not Pending, nothing to do`);
      process.exit(0);
    }
    if (action === "wait") {
      const left = Number(b.challengeEndsAt - now);
      log(`bounty ${bountyId} Pending; challenge ends in ${Math.max(0, left)}s ` +
        `(${new Date(Number(b.challengeEndsAt) * 1000).toISOString()})`);
      return;
    }
    log(`challengeEndsAt reached (chain ${now}); opening window and finalizing bounty ${bountyId}`);
    let opened = false;
    let failure = null;
    try {
      const out = windowCtl(["open", "300", "2", "100000", ESCROW]);
      opened = true;
      log(`window opened: ${out.match(/"transactionHash":\s*"([^"]+)"/)?.[1] ?? "?"}`);
      const est = await pub.estimateContractGas({
        ...escrow, functionName: "finalize", args: [bountyId],
        account: account.address,
      }).catch(() => 300_000n);
      const gas = est * 125n / 100n;
      const hash = await wallet.writeContract({
        ...escrow, functionName: "finalize", args: [bountyId], gas });
      log(`finalize submitted: ${hash} (gas limit ${gas})`);
      const r = await pub.waitForTransactionReceipt({ hash, timeout: 120_000 });
      if (r.status !== "success") throw new Error(`finalize reverted: ${hash}`);
      log(`finalize confirmed in block ${r.blockNumber}`);
    } catch (e) {
      failure = `finalize failed: ${e instanceof Error ? e.message.slice(0, 400) : e}`;
    } finally {
      if (opened) {
        try { log(`window closed: ${windowCtl(["close"]).match(/"transactionHash":\s*"([^"]+)"/)?.[1] ?? "?"}`); }
        catch { log("window close failed (may already be expired)"); }
      }
    }
    if (failure) die(failure);
    process.exit(0);
  }

  log(`watching bounty ${bountyId} on ${deployment} escrow ${ESCROW} as ${account.address}`);
  await tick();
  setInterval(() => tick().catch((e) => log(`poll error: ${e.message?.slice(0, 300)}`)), POLL_MS);
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) await main();
