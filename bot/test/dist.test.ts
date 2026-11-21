import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

describe("committed bundle", () => {
  it("matches what the sources build to", () => {
    const script = fileURLToPath(new URL("../scripts/check-dist.mjs", import.meta.url));
    expect(() => execFileSync("node", [script], { stdio: "pipe" })).not.toThrow();
  });
});
