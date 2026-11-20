import { readFileSync, existsSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";

const E2E = `${homedir()}/.config/postmark/e2e`;
const ROOT = new URL("..", import.meta.url).pathname;
const STATE_FILE = new URL("./.signer-state.json", import.meta.url).pathname;

function closeWindow(profile: string) {
  try {
    execFileSync("node", ["../scripts/window.mjs", "--env", `${E2E}/${profile}`, "close"],
      { cwd: ROOT, stdio: ["ignore", "pipe", "inherit"] });
  } catch {
    // already closed or expired — fine
  }
}

export default async function globalTeardown() {
  if (existsSync(STATE_FILE)) {
    try {
      const state = JSON.parse(readFileSync(STATE_FILE, "utf8")) as
        { pid: number; signers?: Record<string, { pid: number }> };
      const pids = state.signers
        ? Object.values(state.signers).map((s) => s.pid) : [state.pid];
      for (const pid of pids) { try { process.kill(pid, "SIGTERM"); } catch { /* gone */ } }
    } catch { /* state file unreadable */ }
    unlinkSync(STATE_FILE);
  }
  if (!process.env.E2E_NO_WINDOWS) {
    closeWindow("funder");
    closeWindow("claimant");
    closeWindow("disputer");
  }
}
