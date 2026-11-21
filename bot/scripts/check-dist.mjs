// Fails when the committed dist/postmark-verifier.mjs is not what the sources build to.
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "./build.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = mkdtempSync(join(tmpdir(), "postmark-bot-"));
try {
  const fresh = readFileSync(await bundle(join(tmp, "postmark-verifier.mjs")));
  const committed = readFileSync(join(root, "dist/postmark-verifier.mjs"));
  if (!fresh.equals(committed)) {
    console.error("bot/dist/postmark-verifier.mjs is stale: run `npm run build` in bot/ and commit the result");
    process.exit(1);
  }
  console.log("dist is up to date");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
