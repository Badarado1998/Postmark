import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { homedir } from "node:os";

const E2E = `${homedir()}/.config/postmark/e2e`;
const ROOT = new URL("..", import.meta.url).pathname;
const STATE_FILE = new URL("./.signer-state.json", import.meta.url).pathname;
const e2eDeployment = JSON.parse(
  readFileSync(new URL("../../deployments/diana-e2e.json", import.meta.url), "utf8"),
) as { address: string };

function win(profile: string, args: string[]): string {
  return execFileSync("node", ["../scripts/window.mjs", "--env", `${E2E}/${profile}`, ...args],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] }).toString();
}

function openWindow(profile: string, label: string, maxTxs: string, uqor: string) {
  try {
    const out = win(profile, ["open", "600", maxTxs, uqor, e2eDeployment.address]);
    console.log(`[e2e] ${label} window opened:`, out.slice(0, 160).replace(/\s+/g, " "));
    return;
  } catch (e) {
    const msg = e instanceof Error ? String((e as { stderr?: Buffer }).stderr ?? e.message) : String(e);
    console.warn(`[e2e] ${label} window open failed, checking existing:`, msg.slice(0, 250));
  }
  const status = win(profile, ["status"]);
  if (!/"live":\s*true/.test(status)) {
    // The funder only needs a window when the run sends funder txs (create.spec,
    // funder-side creates). The claimant and deployer-dust paths do not, so a
    // depleted funder is a warning, not a hard failure.
    if (profile === "funder") {
      console.warn(`[e2e] ${label} has no live EVM window — funder txs will fail this run`);
      return;
    }
    throw new Error(`${label} has no live EVM window and open failed`);
  }
  console.log(`[e2e] reusing existing live ${label} window`);
}

/** Start the claimant's local signer (test-only --yes path), capture the
 * pairing code, and stash it + the pid for specs/teardown. */
function startSigner(): Promise<string> {
  const child = spawn("node", [
    "../scripts/signer.mjs", "serve",
    "--env", `${E2E}/claimant`,
    "--deployment", "e2e",
    "--origin", "http://localhost:4173",
    "--port", "47321", "--yes",
  ], {
    cwd: ROOT, env: { ...process.env, POSTMARK_SIGNER_TEST: "1" },
    stdio: ["ignore", "pipe", "inherit"],
  });
  return new Promise((resolve, reject) => {
    let buf = "";
    const to = setTimeout(() => reject(new Error("signer did not print a pairing code\n" + buf)), 60_000);
    child.stdout!.on("data", (d) => {
      buf += d;
      const m = buf.match(/pairing code: ([0-9a-f]{8})/);
      if (m) {
        clearTimeout(to);
        writeFileSync(STATE_FILE, JSON.stringify({ pairingCode: m[1], pid: child.pid }));
        resolve(m[1]!);
      }
    });
    child.on("exit", (c) => {
      if (!buf.match(/pairing code/)) reject(new Error(`signer exited ${c}\n${buf}`));
    });
  });
}

export default async function globalSetup() {
  openWindow("funder", "funder", "10", "1000000");
  openWindow("claimant", "claimant", "5", "300000");
  await startSigner();
  console.log("[e2e] claimant signer running, pairing code captured");
}
