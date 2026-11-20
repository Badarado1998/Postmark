import { test } from "node:test";
import assert from "node:assert/strict";
import { bech32ToEvm, decodeBech32, decodeKeyStatus, isLive, KeyStatusError } from "./key-status.mjs";

const DEPLOYER_QOR = "qor1n47s7ymy6mehz9w36klpezfkyk2jsucnhgk58p";
const DEPLOYER_EVM = "0x9d7d0f1364d6f37115d1d5be1c89362595287313";

const word = (n) => BigInt(n).toString(16).padStart(64, "0");
const keyStatusReturn = ({ registered, algorithmId, pubkey, possessionProven }) => {
  const pk = Buffer.from(pubkey);
  const padded = pk.toString("hex").padEnd(Math.ceil(pk.length / 32) * 64, "0");
  return "0x" + word(registered ? 1 : 0) + word(algorithmId) + word(0x80)
    + word(possessionProven ? 1 : 0) + word(pk.length) + padded;
};

test("bech32ToEvm maps a qor1 address to its 20-byte EVM address", () => {
  assert.equal(bech32ToEvm(DEPLOYER_QOR), DEPLOYER_EVM);
  assert.equal(bech32ToEvm(DEPLOYER_QOR.toUpperCase()), DEPLOYER_EVM);
});

test("bech32 decoding rejects bad checksums, mixed case and foreign prefixes", () => {
  const badChecksum = DEPLOYER_QOR.slice(0, -1) + (DEPLOYER_QOR.endsWith("p") ? "q" : "p");
  assert.throws(() => decodeBech32(badChecksum), KeyStatusError);
  assert.throws(() => decodeBech32("Qor1" + DEPLOYER_QOR.slice(4)), /mixed-case/);
  assert.throws(() => decodeBech32("noseparator"), /invalid bech32/);
  assert.throws(() => bech32ToEvm("cosmos1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq6tdq6z"), KeyStatusError);
});

test("decodeKeyStatus reads the (bool, uint8, bytes, bool) return", () => {
  const pubkey = Uint8Array.from({ length: 2592 }, (_, i) => i % 251);
  const out = decodeKeyStatus(keyStatusReturn({
    registered: true, algorithmId: 1, pubkey, possessionProven: true }));
  assert.equal(out.registered, true);
  assert.equal(out.algorithmId, 1);
  assert.equal(out.possessionProven, true);
  assert.deepEqual([...out.pubkey], [...pubkey]);
  assert.throws(() => decodeKeyStatus("0x00"), /short/);
});

test("a key is live only when registered, ML-DSA-87 sized, proven and matched by REST", () => {
  const live = { registered: true, algorithmId: 1, pubkey: Buffer.alloc(2592),
    possessionProven: true, restKeyMatches: true };
  assert.equal(isLive(live), true);
  for (const patch of [{ registered: false }, { algorithmId: 2 }, { pubkey: Buffer.alloc(32) },
    { possessionProven: false }, { restKeyMatches: false }]) {
    assert.equal(isLive({ ...live, ...patch }), false, JSON.stringify(Object.keys(patch)));
  }
});
