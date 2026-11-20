import { test } from "node:test";
import assert from "node:assert/strict";
import { decide } from "./finalize-when-ready.mjs";

const T = 1_800_000_000n;

test("waits while Pending and before challengeEndsAt", () => {
  assert.equal(decide({ state: 2, challengeEndsAt: T }, T - 1n), "wait");
});

test("finalizes at and after challengeEndsAt", () => {
  assert.equal(decide({ state: 2, challengeEndsAt: T }, T), "finalize");
  assert.equal(decide({ state: 2, challengeEndsAt: T }, T + 3600n), "finalize");
});

test("exits without a tx when not Pending", () => {
  for (const state of [0, 1, 3, 4, 5]) {
    assert.equal(decide({ state, challengeEndsAt: T }, T + 1n), "not-pending", `state ${state}`);
  }
});

test("waits when Pending has no challenge window set", () => {
  assert.equal(decide({ state: 2, challengeEndsAt: 0n }, T + 1n), "wait");
});
