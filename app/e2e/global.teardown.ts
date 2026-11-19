import { execFileSync } from "node:child_process";
import { homedir } from "node:os";

const PROFILE = `${homedir()}/.config/postmark/e2e/funder`;
const ROOT = new URL("..", import.meta.url).pathname;

export default async function globalTeardown() {
  try {
    execFileSync("node", ["../scripts/window.mjs", "--env", PROFILE, "close"],
      { cwd: ROOT, stdio: ["ignore", "pipe", "inherit"] });
  } catch {
    // already closed or expired — fine
  }
}
