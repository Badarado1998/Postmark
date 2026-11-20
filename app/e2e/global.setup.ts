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

/** Start a local signer for a profile (test-only --yes path), capture its
 * pairing code. Returns {code, pid}. */
function startSigner(profile: string, port: number): Promise<{ code: string; pid: number }> {
  const child = spawn("node", [
    "../scripts/signer.mjs", "serve",
    "--env", `${E2E}/${profile}`,
    "--deployment", "e2e",
    "--origin", "http://localhost:4173",
    "--port", String(port), "--yes",
  ], {
    cwd: ROOT, env: { ...process.env, POSTMARK_SIGNER_TEST: "1" },
    stdio: ["ignore", "pipe", "inherit"],
  });
  return new Promise((resolve, reject) => {
    let buf = "";
    const to = setTimeout(() => reject(new Error(`${profile} signer did not print a pairing code\n` + buf)), 60_000);
    child.stdout!.on("data", (d) => {
      buf += d;
      const m = buf.match(/pairing code: ([0-9a-f]{8})/);
      if (m) { clearTimeout(to); resolve({ code: m[1]!, pid: child.pid! }); }
    });
    child.on("exit", (c) => {
      if (!buf.match(/pairing code/)) reject(new Error(`${profile} signer exited ${c}\n${buf}`));
    });
  });
}

export default async function globalSetup() {
  if (process.env.E2E_NO_WINDOWS) {
    console.log("[e2e] E2E_NO_WINDOWS — skipping window opens (read-only run)");
  } else {
    openWindow("funder", "funder", "10", "1000000");
    openWindow("claimant", "claimant", "10", "1000000");
    openWindow("disputer", "disputer", "3", "200000");
  }
  // claimant on the default port; verifiers on successive ports so the
  // review specs can point the app's signer port at each one
  const profiles: [string, number][] = [
    ["claimant", 47321], ["verifier0", 47322], ["verifier1", 47323], ["verifier2", 47324],
  ];
  const signers: Record<string, { pairingCode: string; pid: number; profile: string }> = {};
  for (const [profile, port] of profiles) {
    const s = await startSigner(profile, port);
    signers[String(port)] = { pairingCode: s.code, pid: s.pid, profile };
    console.log(`[e2e] ${profile} signer on :${port}`);
  }
  // legacy shape: pairingCode/pid at top level for the claimant (claim.spec)
  writeFileSync(STATE_FILE, JSON.stringify({
    pairingCode: signers["47321"]!.pairingCode, pid: signers["47321"]!.pid,
    signers,
  }));
  console.log("[e2e] signers running, pairing codes captured");
}
