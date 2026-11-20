// Offline checks of the window CLI: argument handling and profile creation
// (a throwaway HOME keeps the real ~/.config/postmark untouched; nothing hits the chain).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const WINDOW = new URL("./window.mjs", import.meta.url).pathname;
const run = (home, ...args) =>
  spawnSync("node", [WINDOW, ...args], { env: { ...process.env, HOME: home }, encoding: "utf8" });

test("unknown commands and missing arguments exit 2 with a usage line", () => {
  const home = mkdtempSync(join(tmpdir(), "pm-window-"));
  try {
    for (const args of [["bogus"], [], ["open", "5"], ["send", "abc"], ["new-account", "bad name"]]) {
      const r = run(home, ...args);
      assert.equal(r.status, 2, args.join(" "));
      assert.match(r.stderr, /^window: .*usage/);
    }
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("new-account writes mode-600 profile files and refuses to overwrite them", () => {
  const home = mkdtempSync(join(tmpdir(), "pm-window-"));
  try {
    const first = run(home, "new-account", "tester");
    assert.equal(first.status, 0, first.stderr);
    const out = JSON.parse(first.stdout);
    assert.match(out.evm, /^0x[0-9a-fA-F]{40}$/);
    assert.match(out.cosmos, /^qor1/);
    const [envFile, pqcFile] = out.files;
    for (const f of out.files) assert.equal(statSync(f).mode & 0o777, 0o600);
    const env = readFileSync(envFile, "utf8");
    assert.match(env, /^KEY=0x[0-9a-f]{64}$/m);
    assert.ok(env.includes(`ADDRESS=${out.evm}`));
    assert.match(readFileSync(pqcFile, "utf8"), /^PQC_RECOVERY_CODE=QRC1/);
    assert.ok(!first.stdout.includes("QRC1") && !first.stdout.includes("KEY="));

    const again = run(home, "new-account", "tester");
    assert.equal(again.status, 2);
    assert.match(again.stderr, /refusing to overwrite/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});
