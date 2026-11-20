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
      const { pid } = JSON.parse(readFileSync(STATE_FILE, "utf8")) as { pid: number };
      process.kill(pid, "SIGTERM");
    } catch { /* signer already gone */ }
    unlinkSync(STATE_FILE);
  }
  closeWindow("funder");
  closeWindow("claimant");
}
