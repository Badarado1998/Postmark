import { test } from "node:test";
import assert from "node:assert/strict";
import { run, tuple } from "./pqc.mjs";

const SEED = "0x" + "11".repeat(32);

/** Split an ABI tuple of dynamic `bytes` back into hex strings. */
function decodeBytesTuple(out, count) {
  const body = out.slice(2);
  return Array.from({ length: count }, (_, i) => {
    const off = Number(BigInt("0x" + body.slice(i * 64, i * 64 + 64))) * 2;
    const len = Number(BigInt("0x" + body.slice(off, off + 64)));
    return "0x" + body.slice(off + 64, off + 64 + len * 2);
  });
}

test("tuple encodes head offsets then padded tails", () => {
  const out = tuple([Uint8Array.of(1, 2, 3)]);
  assert.equal(out.length, (32 + 32 + 32) * 2);
  assert.equal(BigInt("0x" + out.slice(0, 64)), 32n);
  assert.equal(BigInt("0x" + out.slice(64, 128)), 3n);
  assert.ok(out.slice(128).startsWith("010203"));
});

test("keygen is deterministic and its key signs and verifies", () => {
  const [pk, sk] = decodeBytesTuple(run("keygen", [SEED]), 2);
  assert.deepEqual(decodeBytesTuple(run("keygen", [SEED]), 2), [pk, sk]);
  const message = "0x" + Buffer.from("postmark").toString("hex");
  const [sig] = decodeBytesTuple(run("sign", [sk, message]), 1);
  assert.equal(BigInt(run("verify", [pk, sig, message])), 1n);
  assert.equal(BigInt(run("verify", [pk, sig, "0x00"])), 0n);
});

test("the bundled vector verifies", () => {
  const [pk, sig, message] = decodeBytesTuple(run("vector", []), 3);
  assert.equal(BigInt(run("verify", [pk, sig, message])), 1n);
});

test("unknown operations and non-hex inputs are rejected", () => {
  assert.throws(() => run("nope", []), /Unknown operation/);
  assert.throws(() => run("keygen", ["not-hex"]), /0x-prefixed/);
});
