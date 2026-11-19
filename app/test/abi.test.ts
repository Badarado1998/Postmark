import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { postmarkEscrowAbi } from "../src/chain/abi";

describe("generated abi.ts", () => {
  it("matches the Foundry artifact exactly", () => {
    const artifact = JSON.parse(readFileSync("../out/PostmarkEscrow.sol/PostmarkEscrow.json", "utf8"));
    expect(postmarkEscrowAbi).toEqual(artifact.abi);
  });
});
