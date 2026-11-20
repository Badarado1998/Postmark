import { test } from "node:test";
import assert from "node:assert/strict";
import { hex, toBytes, utf8, sha256hex, json, parseEnv } from "./lib/common.mjs";

test("hex and toBytes round-trip, with or without a 0x prefix", () => {
  assert.equal(hex([0, 1, 255]), "0001ff");
  assert.deepEqual([...toBytes("0x0001ff")], [0, 1, 255]);
  assert.deepEqual([...toBytes("0001ff")], [0, 1, 255]);
  assert.deepEqual([...utf8("hi")], [104, 105]);
});

test("sha256hex digests bytes", () => {
  assert.equal(sha256hex(utf8("abc")),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("json renders bigints as strings", () => {
  assert.equal(json({ n: 10n }), '{\n  "n": "10"\n}');
});

test("parseEnv reads NAME=value lines and ignores everything else", () => {
  const vars = parseEnv("KEY=0xabc\n# comment\n  ADDRESS = 0x1\nlower=1\nEMPTY=\n");
  assert.deepEqual(vars, { KEY: "0xabc", ADDRESS: "0x1", EMPTY: "" });
});
