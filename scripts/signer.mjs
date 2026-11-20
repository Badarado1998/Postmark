#!/usr/bin/env node
// Postmark local PQ signer. ML-DSA-87 secrets never reach the web app: this
// process holds the key, binds 127.0.0.1 only, serves one app origin, and
// signs only after the user confirms the decoded summary on the TTY.
//
// Profile: same files as scripts/window.mjs — <base>.env (ADDRESS=0x...;
// the ECDSA KEY is never read) and <base>-pqc.env with either
// PQC_RECOVERY_CODE=QRC1... or MNEMONIC="..." (+ optional HD_INDEX).
//
//   signer.mjs serve --env <base> [--deployment diana|e2e] [--origin URL]
//                    [--port 47321] [--yes]
//   signer.mjs sign-claim <bountyId> <identityHash> <claimRound> --env <base>
//   signer.mjs sign-verdict '<verdict-json>' --env <base>
//   signer.mjs status --env <base>
//
// --yes (skip the TTY prompt) is refused unless POSTMARK_SIGNER_TEST=1 and
// --deployment e2e.
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import {
  pqcKeyFromRecoveryCode, derivePqcCanonical, deriveUnifiedAccount,
  qoreAddresses, keccak256, pqcSign,
} from "@qorechain/sdk";

const EVM_RPC = process.env.QORE_EVM || "https://evm-testnet.qore.host";
const REST = process.env.QORE_REST || "https://api-testnet.qore.host";
const NATIVE_CHAIN_ID = "qorechain-diana";
const CHAIN_ID = 9800n;
const MSG_PREFIX = `qorechain-msg-v1|${NATIVE_CHAIN_ID}|`;
const PQC_KEY_STATUS = "0x0000000000000000000000000000000000000a02";
const CONFIG_DIR = `${process.env.HOME}/.config/postmark`;

const die = (msg, code = 2) => { console.error(`signer: ${msg}`); process.exit(code); };
const hex = (b) => Buffer.from(b).toString("hex");
const utf8 = (s) => Uint8Array.from(Buffer.from(s, "utf8"));
const toBytes = (h) => Uint8Array.from(Buffer.from(String(h).replace(/^0x/, ""), "hex"));
const sha256hex = (b) => createHash("sha256").update(b).digest("hex");

// ---------- ABI helpers (static encoding only; no dynamic fields here) ----------
const word = (n) => BigInt(n).toString(16).padStart(64, "0");
const wordAddr = (a) => a.toLowerCase().replace(/^0x/, "").padStart(64, "0");
const wordBytes32 = (h) => String(h).toLowerCase().replace(/^0x/, "").padStart(64, "0");
const sel = (sig) => hex(keccak256(utf8(sig)).slice(0, 4));

const CLAIM_TYPEHASH = hex(keccak256(utf8(
  "ClaimV1(uint256 chainId,address escrow,uint256 bountyId,address claimant,"
  + "bytes32 identityHash,uint256 claimRound)")));
const VERDICT_TYPEHASH = hex(keccak256(utf8(
  "PostmarkEscrowVerdictV1(uint256 chainId,address escrow,uint256 bountyId,uint8 phase,"
  + "uint8 outcome,address payee,uint64 mergedAt,bytes32 evidenceHash,uint256 nonce,"
  + "uint256 claimRound,bytes32 disputedVerdictHash,bytes32 disputeEvidenceHash)")));

/** "qorechain-msg-v1|qorechain-diana|" || abi.encode(...) — the ClaimV1 message. */
export function buildClaimMessage({ bountyId, claimant, identityHash, claimRound, escrow }) {
  const head = Buffer.from(MSG_PREFIX, "utf8");
  const body = Buffer.from([
    wordBytes32(CLAIM_TYPEHASH), word(CHAIN_ID), wordAddr(escrow), word(bountyId),
    wordAddr(claimant), wordBytes32(identityHash), word(claimRound),
  ].join(""), "hex");
  return Buffer.concat([head, body]);
}

/** Verdict message; dispute hashes are encoded only for phase 1 (DISPUTE). */
export function buildVerdictMessage({ v, escrow }) {
  const z = "0".repeat(64);
  const dispV = v.phase === 1 ? wordBytes32(v.disputedVerdictHash) : z;
  const dispE = v.phase === 1 ? wordBytes32(v.disputeEvidenceHash) : z;
  const head = Buffer.from(MSG_PREFIX, "utf8");
  const body = Buffer.from([
    wordBytes32(VERDICT_TYPEHASH), word(CHAIN_ID), wordAddr(escrow), word(v.bountyId),
    word(v.phase), word(v.outcome), wordAddr(v.payee), word(v.mergedAt),
    wordBytes32(v.evidenceHash), word(v.nonce), word(v.claimRound), dispV, dispE,
  ].join(""), "hex");
  return Buffer.concat([head, body]);
}

// ---------- chain reads ----------
export function makeRpc(endpoint = EVM_RPC) {
  return async function call(to, data) {
    const res = await fetch(endpoint, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call",
        params: [{ to, data: "0x" + data }, "latest"] }),
    });
    const j = await res.json();
    if (j.error) throw new Error(`rpc: ${JSON.stringify(j.error)}`);
    if (!j.result || j.result === "0x") throw new Error("eth_call returned empty");
    return j.result.slice(2);
  };
}

async function chainClaimMessage(rpc, escrow, bountyId, claimant, identityHash, claimRound) {
  const data = sel("claimMessage(uint256,address,bytes32,uint256)")
    + word(bountyId) + wordAddr(claimant) + wordBytes32(identityHash) + word(claimRound);
  const out = await rpc(escrow, data);
  // returns (bytes): head offset 0x20, then len + data
  const len = Number(BigInt("0x" + out.slice(64, 128)));
  return Buffer.from(out.slice(128, 128 + len * 2), "hex");
}

async function chainVerdictMessage(rpc, escrow, v) {
  const head = sel("verdictMessage((uint256,uint8,uint8,address,uint64,bytes32,uint256,uint256))")
    + word(32) // tuple offset
    + word(v.bountyId) + word(v.phase) + word(v.outcome) + wordAddr(v.payee)
    + word(v.mergedAt) + wordBytes32(v.evidenceHash) + word(v.nonce) + word(v.claimRound);
  const out = await rpc(escrow, head);
  const len = Number(BigInt("0x" + out.slice(64, 128)));
  return Buffer.from(out.slice(128, 128 + len * 2), "hex");
}

const BOUNTY_WORDS = 23;
async function chainBounty(rpc, escrow, bountyId) {
  const out = await rpc(escrow, sel("getBounty(uint256)") + word(bountyId));
  const w = (i) => out.slice(i * 64, (i + 1) * 64);
  const addr = (i) => "0x" + w(i).slice(24);
  const num = (i) => BigInt("0x" + w(i));
  if (out.length < BOUNTY_WORDS * 64 || num(0) === 0n) throw new Error(`bounty ${bountyId} not found`);
  return {
    funder: addr(0), amount: num(1), challengeReward: num(2), workHash: "0x" + w(3),
    deadline: num(4), claimTimeout: num(5), claimRound: num(6), claimExpiresAt: num(7),
    payee: addr(8), payeeIdentityHash: "0x" + w(9),
    verifiers: [addr(10), addr(11), addr(12)],
    bondAmount: num(13), state: Number(num(14)), nonce: num(15),
    initialOutcome: Number(num(16)), initialMergedAt: num(17), initialEvidenceHash: "0x" + w(18),
    pendingVerdictHash: "0x" + w(19), challengeEndsAt: num(20),
    disputer: addr(21), disputeEvidenceHash: "0x" + w(22),
  };
}

async function chainWorkMeta(rpc, escrow, bountyId) {
  // BountyWork(uint256 indexed bountyId, bytes32 indexed workHash, string ownerRepo, uint8 kind, uint256 number)
  const topic0 = "0x" + hex(keccak256(utf8("BountyWork(uint256,bytes32,string,uint8,uint256)")));
  const res = await fetch(EVM_RPC, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getLogs", params: [{
      address: escrow, topics: [topic0, "0x" + word(bountyId)], fromBlock: "0x0", toBlock: "latest",
    }] }),
  });
  const j = await res.json();
  const log = j.result?.[0];
  if (!log) return null;
  const d = log.data.slice(2);
  const kind = Number(BigInt("0x" + d.slice(64, 128)));
  const number = BigInt("0x" + d.slice(128, 192));
  const strLen = Number(BigInt("0x" + d.slice(192, 256)));
  const ownerRepo = Buffer.from(d.slice(256, 256 + strLen * 2), "hex").toString("utf8");
  return { ownerRepo, kind, number };
}

/** pqcKeyStatus(account) via the 0x…0a02 precompile: (bool, uint8, bytes, bool). */
export async function pqcStatus(rpc, evm) {
  const out = await rpc(PQC_KEY_STATUS, "850dfe51" + wordAddr(evm));
  const registered = BigInt("0x" + out.slice(0, 64)) === 1n;
  const algorithmId = Number(BigInt("0x" + out.slice(64, 128)));
  const pkOff = Number(BigInt("0x" + out.slice(128, 192))) * 2;
  const possessionProven = BigInt("0x" + out.slice(192, 256)) === 1n;
  const pkLen = Number(BigInt("0x" + out.slice(pkOff, pkOff + 64)));
  const pubkey = out.slice(pkOff + 64, pkOff + 64 + pkLen * 2);
  return { registered, algorithmId, pubkey, possessionProven,
    live: registered && algorithmId === 1 && pkLen === 2592 && possessionProven };
}

// ---------- profile / key derivation ----------
export class SignerConfigError extends Error {}

export function loadProfile(base) {
  const envFile = `${base}.env`, pqcFile = `${base}-pqc.env`;
  for (const f of [envFile, pqcFile]) {
    if (!existsSync(f)) continue;
    if ((statSync(f).mode & 0o077) !== 0) {
      throw new SignerConfigError(`profile file ${f} must be mode 600 (chmod 600 it)`);
    }
  }
  const vars = {};
  for (const f of [envFile, pqcFile]) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) vars[m[1]] = m[2];
    }
  }
  return vars;
}

/** Derive the ML-DSA-87 keypair for the profile. Never prints secrets. */
export async function deriveKey(vars) {
  if (vars.PQC_RECOVERY_CODE || vars.DEPLOYER_PQC_RECOVERY_CODE) {
    const code = vars.PQC_RECOVERY_CODE || vars.DEPLOYER_PQC_RECOVERY_CODE;
    if (!vars.ADDRESS && !vars.DEPLOYER_ADDRESS) {
      throw new SignerConfigError("ADDRESS missing in profile .env");
    }
    const cosmos = qoreAddresses({ evm: vars.ADDRESS || vars.DEPLOYER_ADDRESS }).cosmos;
    return { keypair: pqcKeyFromRecoveryCode(code, cosmos), evm: vars.ADDRESS || vars.DEPLOYER_ADDRESS, cosmos };
  }
  if (vars.MNEMONIC) {
    const index = vars.HD_INDEX ? Number(vars.HD_INDEX) : 0;
    let evm = vars.ADDRESS || vars.DEPLOYER_ADDRESS;
    if (!evm) {
      const u = await deriveUnifiedAccount(vars.MNEMONIC, index);
      evm = u.evm;
    }
    const cosmos = qoreAddresses({ evm }).cosmos;
    return { keypair: derivePqcCanonical(cosmos, vars.MNEMONIC), evm, cosmos };
  }
  throw new SignerConfigError("no PQC_RECOVERY_CODE or MNEMONIC in the -pqc.env profile file");
}

/** Refuse to run unless the derived key is the account's live registered key. */
export async function assertKeyLive(rpc, evm, keypair) {
  const st = await pqcStatus(rpc, evm);
  const pkHex = hex(keypair.publicKey);
  const pkSha = sha256hex(keypair.publicKey);
  if (!st.live) {
    throw new SignerConfigError(`no live ML-DSA-87 key registered for ${evm}`);
  }
  if (st.pubkey !== pkHex) {
    throw new SignerConfigError(
      `derived key does NOT match the registered key for ${evm}\n` +
      `  derived sha256 ${pkSha}\n  registered sha256 ${sha256hex(toBytes(st.pubkey))}`);
  }
  return st;
}

/** --yes is a test-only escape hatch. */
export function yesAllowed(testEnv, deployment) {
  return testEnv === "1" && deployment === "e2e";
}

// ---------- shared sign pipeline (testable, IO injected) ----------
const PREFIX_BYTES = Buffer.from(MSG_PREFIX, "utf8");

export class SignRefusal extends Error {}

/**
 * Verify the request end to end, then sign. deps:
 *   rpc, escrow, keypair, evm, confirm(summary) → Promise<boolean>
 * Returns {signature, message}.
 */
export async function processSignRequest(body, deps) {
  const { rpc, escrow, keypair, evm } = deps;
  let message, summary;
  if (body?.kind === "claim") {
    const { bountyId, identityHash, claimRound } = body;
    for (const [k, v] of [["bountyId", bountyId], ["claimRound", claimRound]]) {
      if (v === undefined || v === null || !/^\d+$/.test(String(v))) {
        throw new SignRefusal(`${k} must be a decimal integer`);
      }
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(String(identityHash))) {
      throw new SignRefusal("identityHash must be a bytes32 hex");
    }
    const expected = await chainClaimMessage(rpc, escrow,
      BigInt(bountyId), evm, identityHash, BigInt(claimRound));
    const local = buildClaimMessage({ bountyId, claimant: evm, identityHash, claimRound, escrow });
    if (!local.equals(expected)) throw new SignRefusal("locally built message != chain message");
    message = local;
    const bounty = await chainBounty(rpc, escrow, BigInt(bountyId));
    if (bounty.funder.toLowerCase() === evm.toLowerCase()
        || bounty.verifiers.some((v) => v.toLowerCase() === evm.toLowerCase())) {
      throw new SignRefusal("funders and verifiers cannot claim their own bounty (ClaimantExcluded)");
    }
    const meta = await chainWorkMeta(rpc, escrow, BigInt(bountyId)).catch(() => null);
    summary = {
      kind: "CLAIM", bounty: `#${bountyId}`,
      work: meta ? `${meta.ownerRepo}${meta.kind === 1 ? "/pull/" : "#"}${meta.number}` : "?",
      amount: `${bounty.amount} wei`, claimant: evm,
      identityHash, claimRound: Number(claimRound),
    };
  } else if (body?.kind === "verdict") {
    const v = body.verdict;
    if (!v || typeof v !== "object") throw new SignRefusal("verdict fields missing");
    const bounty = await chainBounty(rpc, escrow, BigInt(v.bountyId));
    const vv = {
      bountyId: BigInt(v.bountyId), phase: Number(v.phase), outcome: Number(v.outcome),
      payee: String(v.payee), mergedAt: BigInt(v.mergedAt),
      evidenceHash: String(v.evidenceHash), nonce: BigInt(v.nonce), claimRound: BigInt(v.claimRound),
      disputedVerdictHash: bounty.pendingVerdictHash,
      disputeEvidenceHash: bounty.disputeEvidenceHash,
    };
    const expected = await chainVerdictMessage(rpc, escrow, vv);
    const local = buildVerdictMessage({ v: vv, escrow });
    if (!local.equals(expected)) throw new SignRefusal("locally built message != chain message");
    message = local;
    const meta = await chainWorkMeta(rpc, escrow, BigInt(vv.bountyId)).catch(() => null);
    summary = {
      kind: vv.phase === 1 ? "DISPUTE VERDICT" : "VERDICT",
      bounty: `#${vv.bountyId}`,
      work: meta ? `${meta.ownerRepo}${meta.kind === 1 ? "/pull/" : "#"}${meta.number}` : "?",
      outcome: vv.outcome === 0 ? "PAY" : "REFUND", payee: vv.payee,
      mergedAt: Number(vv.mergedAt), nonce: Number(vv.nonce), claimRound: Number(vv.claimRound),
      evidenceHash: vv.evidenceHash,
    };
  } else {
    throw new SignRefusal('kind must be "claim" or "verdict"');
  }
  if (!message.subarray(0, PREFIX_BYTES.length).equals(PREFIX_BYTES)) {
    throw new SignRefusal("message does not start with the qorechain-msg-v1 prefix");
  }
  const ok = await deps.confirm(summary);
  if (!ok) throw new SignRefusal("declined at the terminal");
  return { signature: "0x" + hex(pqcSign(keypair.secretKey, message)), message };
}

function ttyConfirm(summary) {
  console.log("\n— postmark sign request —");
  for (const [k, v] of Object.entries(summary)) console.log(`  ${k}: ${v}`);
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question("sign this? [y/N] ", (a) => {
      rl.close();
      resolve(/^y(es)?$/i.test(a.trim()));
    });
  });
}

// ---------- HTTP ----------
export function createHandler({ origin, code, statusPayload, sign }) {
  const json = (res, status, obj, reqOrigin) => {
    res.writeHead(status, {
      "content-type": "application/json",
      ...(reqOrigin === origin ? { "access-control-allow-origin": origin,
        "access-control-allow-headers": "x-postmark-pair, content-type",
        "vary": "Origin" } : {}),
    });
    res.end(JSON.stringify(obj));
  };
  return async function handler(req, res) {
    const reqOrigin = req.headers.origin;
    if (req.method === "OPTIONS") {
      // CORS: exact origin only — anything else is refused, preflights included
      return json(res, reqOrigin === origin ? 204 : 403, {}, reqOrigin);
    }
    if (reqOrigin !== origin) return json(res, 403, { error: "origin refused" });
    if (req.headers["x-postmark-pair"] !== code) {
      return json(res, 401, { error: "pairing code missing or wrong" });
    }
    if (req.method === "GET" && req.url === "/status") {
      return json(res, 200, statusPayload(), reqOrigin);
    }
    if (req.method === "POST" && req.url === "/sign") {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 64 * 1024) return json(res, 413, { error: "too large" }, reqOrigin);
      }
      let parsed;
      try { parsed = JSON.parse(body); } catch {
        return json(res, 400, { error: "bad json" }, reqOrigin);
      }
      try {
        const out = await sign(parsed);
        return json(res, 200, out, reqOrigin);
      } catch (e) {
        return json(res, e instanceof SignRefusal ? 422 : 500,
          { error: e.message }, reqOrigin);
      }
    }
    return json(res, 404, { error: "not found" }, reqOrigin);
  };
}

// ---------- CLI ----------
function argValue(flag) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return undefined;
  return process.argv[i + 1];
}

async function main() {
  const FLAG_VALUE = new Set(["--env", "--deployment", "--origin", "--port"]);
  const argv = process.argv.slice(2);
  const pos = argv.filter((a, i) => !a.startsWith("--") && !FLAG_VALUE.has(argv[i - 1]));
  const [cmd] = pos;
  const envBase = argValue("--env") || `${CONFIG_DIR}/deployer`;
  const deployment = argValue("--deployment") || "diana";
  const yes = process.argv.includes("--yes");
  if (yes && !yesAllowed(process.env.POSTMARK_SIGNER_TEST, deployment)) {
    die("--yes is refused outside POSTMARK_SIGNER_TEST=1 with --deployment e2e");
  }
  const depFile = new URL(
    `../deployments/${deployment === "e2e" ? "diana-e2e" : "diana"}.json`, import.meta.url);
  const deployment_ = JSON.parse(readFileSync(depFile, "utf8"));
  const escrow = deployment_.address;

  const vars = loadProfile(envBase.endsWith(".env") ? envBase.slice(0, -4) : envBase);
  const { keypair, evm, cosmos } = await deriveKey(vars);

  const rpc = makeRpc();
  const st = await assertKeyLive(rpc, evm, keypair);
  const pkHex = hex(keypair.publicKey);
  const pkSha = sha256hex(keypair.publicKey);
  // REST cross-check
  try {
    const r = await fetch(`${REST}/qorechain/pqc/v1/account/${cosmos}`);
    if (r.ok) {
      const j = await r.json();
      const restPk = j.public_key ?? j.publicKey;
      if (restPk && hex(toBytes(restPk)) !== pkHex) {
        die("REST registered key differs from the derived key");
      }
    }
  } catch (e) { if (!String(e).startsWith("Error: signer")) { /* REST optional */ } else throw e; }

  const statusPayload = () => ({
    address: evm, qor1: cosmos, pubkeySha256: pkSha, live: st.live,
    escrow, chainId: Number(CHAIN_ID), nativeChainId: NATIVE_CHAIN_ID,
  });

  const confirm = yes ? async () => true : ttyConfirm;
  const deps = { rpc, escrow, keypair, evm, confirm };

  if (!cmd || cmd === "status") {
    console.log(JSON.stringify({ ...statusPayload() }, null, 2));
    return;
  }

  if (cmd === "serve") {
    const origin = argValue("--origin") || "http://localhost:5173";
    const port = Number(argValue("--port") || 47321);
    const code = randomBytes(4).toString("hex"); // 8 chars
    const sign = async (body) => {
      const { signature } = await processSignRequest(body, deps);
      return { signature, signer: evm, pubkeySha256: pkSha };
    };
    const server = http.createServer(
      createHandler({ origin, code, statusPayload, sign }));
    server.listen(port, "127.0.0.1", () => {
      console.log(`signer: ${evm} (${cosmos})`);
      console.log(`signer: ML-DSA-87 pubkey sha256 ${pkSha} — matches the live registered key`);
      console.log(`signer: serving ${origin} on 127.0.0.1:${port}, escrow ${escrow} (${deployment})`);
      console.log(`\n  pairing code: ${code}\n`);
    });
    return; // keep the process alive
  }

  const offlineSign = async (body) => {
    const { signature } = await processSignRequest(body, deps);
    console.log(signature);
  };
  if (cmd === "sign-claim") {
    const [bountyId, identityHash, claimRound] = pos.slice(1);
    if (!bountyId || !identityHash || !claimRound) {
      die("usage: sign-claim <bountyId> <identityHash> <claimRound> --env <base>");
    }
    await offlineSign({ kind: "claim", bountyId, identityHash, claimRound });
    return;
  }
  if (cmd === "sign-verdict") {
    if (!pos[1]) die("usage: sign-verdict '<verdict-json>' --env <base>");
    let verdict;
    try { verdict = JSON.parse(pos[1]); } catch { die("verdict is not valid JSON"); }
    await offlineSign({ kind: "verdict", verdict });
    return;
  }
  die(`unknown subcommand ${cmd}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => die(e.message ?? String(e), 1));
}
