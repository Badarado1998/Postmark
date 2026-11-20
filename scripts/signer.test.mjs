// node --test scripts/signer.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createHandler, processSignRequest, SignRefusal, SignerConfigError,
  loadProfile, buildClaimMessage, assertKeyLive, yesAllowed, claimCallData, verdictCallData,
} from "./signer.mjs";
import { generatePqcKeypair } from "@qorechain/sdk";

const EVM = "0x478F2A08a81be7CEa42bd34BD6900593fA56c4B6";
const ESCROW = "0xae80681E92b63eFEa78cB742dd612ecc940B896A";
const IH = "0x" + "ab".repeat(32);

const keypair = generatePqcKeypair(new Uint8Array(32).fill(7));

function serve(handler) {
  return new Promise((resolve) => {
    const s = http.createServer(handler);
    s.listen(0, "127.0.0.1", () => resolve({ s, port: s.address().port }));
  });
}
const call = (port, path, { method = "GET", origin, code, body } = {}) =>
  fetch(`http://127.0.0.1:${port}${path}`, {
    method, headers: {
      ...(origin ? { origin } : {}),
      ...(code ? { "x-postmark-pair": code } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    }, ...(body ? { body } : {}),
  });

test("origin refusal: OPTIONS and wrong/missing origin are refused", async () => {
  const h = createHandler({ origin: "http://localhost:5173", code: "c0de1234",
    statusPayload: () => ({}), sign: async () => ({}) });
  const { s, port } = await serve(h);
  const bad = await call(port, "/status", { method: "OPTIONS", origin: "http://evil.example" });
  assert.equal(bad.status, 403);
  const wrong = await call(port, "/status", { origin: "http://evil.example", code: "c0de1234" });
  assert.equal(wrong.status, 403);
  const none = await call(port, "/status", { code: "c0de1234" });
  assert.equal(none.status, 403);
  s.close();
});

test("pairing: missing and wrong codes are refused", async () => {
  const h = createHandler({ origin: "http://localhost:5173", code: "c0de1234",
    statusPayload: () => ({ ok: true }), sign: async () => ({}) });
  const { s, port } = await serve(h);
  const missing = await call(port, "/status", { origin: "http://localhost:5173" });
  assert.equal(missing.status, 401);
  const wrong = await call(port, "/status", { origin: "http://localhost:5173", code: "00000000" });
  assert.equal(wrong.status, 401);
  const good = await call(port, "/status", { origin: "http://localhost:5173", code: "c0de1234" });
  assert.equal(good.status, 200);
  s.close();
});

const claimMsgCall = "claimMessage(uint256,address,bytes32,uint256)";
const bountyCall = "getBounty(uint256)";
const selOf = (sig) => Buffer.from(sig).toString("hex").slice(0, 8);

function rpcFor({ message, bounty }) {
  const w = (n) => n.toString(16).padStart(64, "0");
  return async (_to, data) => {
    // claimMessage returns (bytes) — head: offset, len, data
    if (data.slice(0, 8) === selClaim) {
      const m = message.toString("hex");
      return w(32) + w(m.length / 2) + m + "0".repeat((64 - (m.length % 64)) % 64);
    }
    if (data.slice(0, 8) === selBounty) return bounty;
    throw new Error("unexpected call " + data.slice(0, 8));
  };
}
import { keccak256 as k256 } from "@qorechain/sdk";
const utf8 = (s) => Uint8Array.from(Buffer.from(s, "utf8"));
const selClaim = Buffer.from(k256(utf8(claimMsgCall)).slice(0, 4)).toString("hex");
const selBounty = Buffer.from(k256(utf8(bountyCall)).slice(0, 4)).toString("hex");

const word = (n) => BigInt(n).toString(16).padStart(64, "0");
const wordAddr = (a) => a.toLowerCase().replace(/^0x/, "").padStart(64, "0");

function bountyHex({ funder, verifiers }) {
  const words = [
    wordAddr(funder), word(1n), word(0n), word(0n), // funder, amount, reward, workHash
    word(BigInt(Math.floor(Date.now() / 1000) + 7200)), word(3600n), word(0n), word(0n), // deadline, timeout, round, expires
    wordAddr("0x0000000000000000000000000000000000000000"), word(0n), // payee, identityHash
    wordAddr(verifiers[0]), wordAddr(verifiers[1]), wordAddr(verifiers[2]),
    word(0n), word(0n), word(0n), word(0n), word(0n), word(0n),
    word(0n), word(0n), wordAddr("0x0000000000000000000000000000000000000000"), word(0n), word(0n),
  ];
  return words.join("");
}

const V = ["0x01B451550bEf4cc51Bb24B8C5E5b4b23a368a9cE",
  "0x8e815476f878b05a2a0E4BC452112311eAEcEa31", "0xFac4a64980C8777799EBae562a82825185e20558"];

function deps(overrides = {}) {
  const message = buildClaimMessage({ bountyId: 1, claimant: EVM,
    identityHash: IH, claimRound: 1, escrow: ESCROW });
  const bounty = bountyHex({ funder: "0x4Fe9f2B175f6D533c9b88902Dc257A34384873bD", verifiers: V });
  return {
    rpc: rpcFor({ message, bounty }), escrow: ESCROW, keypair, evm: EVM,
    confirm: async () => true, ...overrides,
  };
}

test("message mismatch: chain bytes differing from the local build refuse", async () => {
  const bad = Buffer.from(buildClaimMessage({ bountyId: 1, claimant: EVM,
    identityHash: IH, claimRound: 1, escrow: "0x00000000000000000000000000000000000000ff" }));
  const d = deps();
  d.rpc = async (_t, data) => data.slice(0, 8) === selClaim
    ? word(32) + word(bad.length) + bad.toString("hex")
    : bountyHex({ funder: "0x4Fe9f2B175f6D533c9b88902Dc257A34384873bD", verifiers: V });
  await assert.rejects(
    processSignRequest({ kind: "claim", bountyId: 1, identityHash: IH, claimRound: 1 }, d),
    /locally built message != chain message/);
});

test("claimant mismatch: funder/verifier addresses refuse before signing", async () => {
  const d = deps();
  d.rpc = rpcFor({
    message: buildClaimMessage({ bountyId: 1, claimant: EVM,
      identityHash: IH, claimRound: 1, escrow: ESCROW }),
    bounty: bountyHex({ funder: EVM, verifiers: V }), // this EVM is the funder
  });
  await assert.rejects(
    processSignRequest({ kind: "claim", bountyId: 1, identityHash: IH, claimRound: 1 }, d),
    /ClaimantExcluded/);
});

test("happy path returns a signature that starts only after confirm", async () => {
  const d = deps();
  const out = await processSignRequest(
    { kind: "claim", bountyId: 1, identityHash: IH, claimRound: 1 }, d);
  assert.match(out.signature, /^0x[0-9a-f]{9254}$/); // ML-DSA-87 sig = 4627 bytes
  // declined confirm refuses
  await assert.rejects(
    processSignRequest({ kind: "claim", bountyId: 1, identityHash: IH, claimRound: 1 },
      { ...d, confirm: async () => false }),
    /declined at the terminal/);
});

test("profile mode check refuses permissive files", () => {
  const dir = mkdtempSync(join(tmpdir(), "pm-"));
  const f = join(dir, "acct.env");
  writeFileSync(f, "ADDRESS=" + EVM + "\n");
  chmodSync(f, 0o644);
  assert.throws(() => loadProfile(join(dir, "acct")), SignerConfigError);
  chmodSync(f, 0o600);
  assert.doesNotThrow(() => loadProfile(join(dir, "acct")));
});

test("startup key mismatch refuses", async () => {
  const other = generatePqcKeypair(new Uint8Array(32).fill(9));
  const pk = Buffer.from(other.publicKey).toString("hex");
  const w = word;
  const rpc = async () => w(1) + w(1) + w(128) + w(1) + w(2592) + pk; // reg, alg, off, prov, len, key
  await assert.rejects(assertKeyLive(rpc, EVM, keypair), /does NOT match/);
});

test("--yes is refused outside the e2e test escape hatch", () => {
  assert.equal(yesAllowed("1", "e2e"), true);
  assert.equal(yesAllowed("1", "diana"), false);
  assert.equal(yesAllowed(undefined, "e2e"), false);
});

test("prefix guarantee holds for locally built claims", () => {
  const m = buildClaimMessage({ bountyId: 1, claimant: EVM,
    identityHash: IH, claimRound: 1, escrow: ESCROW });
  assert.equal(m.subarray(0, 33).toString("utf8"), "qorechain-msg-v1|qorechain-diana|");
});

// regression: the eth_call calldata must be canonical ABI (the tuple-offset
// bug sent a head offset for a static tuple, which reverts on chain)
test("call data matches viem encodeFunctionData", async () => {
  const { encodeFunctionData, parseAbiItem } = await import("viem");
  const claim = encodeFunctionData({
    abi: [parseAbiItem("function claimMessage(uint256,address,bytes32,uint256) view returns (bytes)")],
    functionName: "claimMessage", args: [7n, EVM, IH, 2n],
  });
  assert.equal("0x" + claimCallData(7, EVM, IH, 2), claim);

  const v = { bountyId: 13n, phase: 1, outcome: 0, payee: EVM,
    mergedAt: 1700000000n, evidenceHash: IH, nonce: 4n, claimRound: 2n };
  const expected = encodeFunctionData({
    abi: [parseAbiItem("function verdictMessage((uint256,uint8,uint8,address,uint64,bytes32,uint256,uint256)) view returns (bytes)")],
    functionName: "verdictMessage",
    args: [[v.bountyId, v.phase, v.outcome, v.payee, v.mergedAt, v.evidenceHash, v.nonce, v.claimRound]],
  });
  assert.equal("0x" + verdictCallData(v), expected);
});
