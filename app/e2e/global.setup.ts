import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";

const PROFILE = `${homedir()}/.config/postmark/e2e/funder`;
const ROOT = new URL("..", import.meta.url).pathname;
const e2eDeployment = JSON.parse(
  readFileSync(new URL("../../deployments/diana-e2e.json", import.meta.url), "utf8"),
) as { address: string };

function win(args: string[]): string {
  return execFileSync("node", ["../scripts/window.mjs", "--env", PROFILE, ...args],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] }).toString();
}

export default async function globalSetup() {
  try {
    const out = win(["open", "600", "10", "1000000", e2eDeployment.address]);
    console.log("[e2e] funder window opened:", out.slice(0, 200).replace(/\s+/g, " "));
    return;
  } catch (e) {
    const msg = e instanceof Error ? String((e as { stderr?: Buffer }).stderr ?? e.message) : String(e);
    console.warn("[e2e] window open failed, checking existing:", msg.slice(0, 300));
  }
  const status = win(["status"]);
  if (!/"live":\s*true/.test(status)) {
    throw new Error("funder has no live EVM window and open failed");
  }
  console.log("[e2e] reusing existing live window");
}
