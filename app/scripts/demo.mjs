#!/usr/bin/env node
// demo.mjs — local walk-through of the full Postmark lifecycle (e2e deployment).
// Serves the built app, opens one headed Chromium window per role, injects each
// profile's EIP-6963 test wallet plus a role badge, optionally opens scoped EVM
// windows, and prints the signer commands to run in separate terminals.
//   npm run demo -- [--github stub|live] [--no-windows] [--headless]
import { readFileSync, existsSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { homedir } from "node:os";
import { chromium } from "@playwright/test";
import { installTestWallet, mockGithub, connectInjected,
  windowCtl, profileAddress, E2E_ESCROW } from "../e2e/testWallet.ts";

const ROLES = ["funder", "claimant", "verifier0", "verifier1", "verifier2", "disputer"];
const SIGNER_PORTS = { claimant: 47321, verifier0: 47322, verifier1: 47323, verifier2: 47324 };
const PORT = 4173;
const PROFILES = `${homedir()}/.config/postmark/e2e`;

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const github = flag("github", "stub");
const noWindows = args.includes("--no-windows");
const headless = args.includes("--headless");
const smoke = args.includes("--smoke");
if (!["stub", "live"].includes(github)) {
  console.error("--github must be stub|live"); process.exit(2);
}

const ts = () => new Date().toISOString().slice(11, 19);
const log = (m) => console.log(`[demo ${ts()}] ${m}`);

const ctxs = [];
const openedWindows = [];
let browser = null, server = null;

async function cleanup() {
  log("closing…");
  for (const p of openedWindows) {
    try { windowCtl(["close"], p); log(`window closed: ${p}`); }
    catch { log(`window already closed/expired: ${p}`); }
  }
  for (const c of ctxs) await c.close().catch(() => {});
  await browser?.close().catch(() => {});
  server?.kill("SIGTERM");
  process.exit(0);
}
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

// ---- build + serve (e2e deployment only) ----
log("building app (VITE_DEPLOYMENT=e2e)…");
execFileSync("npm", ["run", "build:e2e"], { stdio: "inherit" });
try { // fail fast if something else owns the port
  await fetch(`http://localhost:${PORT}`);
  console.error(`[demo] port ${PORT} is already in use — stop the other server first`);
  process.exit(1);
} catch { /* free */ }
server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"],
  { stdio: ["ignore", "pipe", "inherit"] });
server.on("exit", (c) => { if (c !== null && c !== 0) { console.error(`[demo] preview exited ${c}`); process.exit(1); } });
await new Promise((res, rej) => {
  const to = setTimeout(() => rej(new Error("preview did not come up")), 30_000);
  const poll = setInterval(async () => {
    try { await fetch(`http://localhost:${PORT}`); clearInterval(poll); clearTimeout(to); res(); }
    catch { /* not yet */ }
  }, 400);
});
log(`preview on http://localhost:${PORT}`);

// ---- scoped windows per role ----
if (!noWindows) {
  for (const role of ROLES) {
    try {
      windowCtl(["open", "1200", "10", "600000", E2E_ESCROW], role);
      openedWindows.push(role);
      log(`window opened: ${role} (1200 blocks, 10 txs, 600k uqor cap, target=escrow)`);
    } catch (e) {
      log(`window open failed for ${role} — continuing read-only for it`);
    }
  }
} else log("--no-windows: read-only run, no scoped windows opened");

// ---- headed windows, one per role ----
browser = await chromium.launch({ headless });
for (const role of ROLES) {
  const ctx = await browser.newContext({ viewport: { width: 1120, height: 800 } });
  const page = await ctx.newPage();
  await installTestWallet(page, role);
  // visible role badge — injected, no app changes
  await page.addInitScript(({ role: r, addr }) => {
    window.addEventListener("DOMContentLoaded", () => {
      const b = document.createElement("div");
      b.textContent = `${r.toUpperCase()}  ${addr.slice(0, 8)}…${addr.slice(-4)}`;
      b.style.cssText = "position:fixed;top:0;right:0;z-index:2147483647;" +
        "font:500 11px/1 ui-monospace,monospace;letter-spacing:.15em;" +
        "background:#e1482f;color:#070b14;padding:5px 10px;border-radius:0 0 0 8px";
      document.body.appendChild(b);
    });
  }, { role, addr: profileAddress(role) });
  if (github === "stub") await mockGithub(page);
  await page.goto(`http://localhost:${PORT}/explore`);
  await connectInjected(page);
  ctxs.push(ctx);
  if (smoke) {
    const badge = page.getByText(new RegExp(`^${role.toUpperCase()}  0x`, "i"));
    await badge.waitFor({ timeout: 10_000 });
    const walletBtn = page.getByRole("button",
      { name: new RegExp(profileAddress(role).slice(0, 6), "i") });
    await walletBtn.first().waitFor({ timeout: 15_000 });
    log(`smoke: ${role} badge + wallet connected`);
  }
  log(`${role} window ready (${profileAddress(role)})`);
}
if (smoke) { log("smoke OK — all roles connected, badges visible"); await cleanup(); }

// ---- signer instructions ----
console.log(`
[demo] Signing roles need the local PQ signer, one terminal tab each
       (interactive TTY confirm — no --yes):
`);
for (const [role, port] of Object.entries(SIGNER_PORTS)) {
  console.log(
    `  # ${role} (port ${port})\n` +
    `  node scripts/signer.mjs serve --env ${PROFILES}/${role} ` +
    `--deployment e2e --origin http://localhost:${PORT} --port ${port}\n`);
}
console.log(
  `[demo] Each signer prints an 8-char pairing code — paste it into the app's\n` +
  `       signer card (set the matching port) the first time that role signs.\n`);
log(`github mode: ${github} · Ctrl-C closes every window and stops the preview`);

await new Promise(() => {}); // stay up until Ctrl-C
