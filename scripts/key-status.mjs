#!/usr/bin/env node
// Usage: node scripts/key-status.mjs <qor1... address>
// Checks whether an account's ML-DSA-87 key is live on diana: bech32 -> EVM
// address, pqcKeyStatus eth_call on 0x..0a02, cross-checked against the REST API.
import { createHash } from 'node:crypto';

const REST = process.env.QORE_REST || 'https://api-testnet.qore.host';
const RPC = process.env.QORE_EVM_RPC || 'https://evm-testnet.qore.host';
const PRECOMPILE = '0x0000000000000000000000000000000000000a02';
const SELECTOR = '0x850dfe51'; // pqcKeyStatus(address)
const EXPECTED_CHAIN_ID = 9800;

const die = (msg) => { console.error(`key-status: ${msg}`); process.exit(2); };

// --- bech32 (BIP173) ---
const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GENERATORS = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values) {
  let chk = 1;
  for (const v of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >> i) & 1) chk ^= GENERATORS[i];
  }
  return chk;
}

function decodeBech32(addr) {
  if (addr !== addr.toLowerCase() && addr !== addr.toUpperCase()) die('mixed-case bech32 string');
  addr = addr.toLowerCase();
  const pos = addr.lastIndexOf('1');
  if (pos < 1 || pos + 7 > addr.length || addr.length > 90) die('invalid bech32 string');
  const hrp = addr.slice(0, pos);
  const data = [];
  for (const c of addr.slice(pos + 1)) {
    const v = CHARSET.indexOf(c);
    if (v === -1) die(`invalid bech32 character '${c}'`);
    data.push(v);
  }
  const expanded = [...hrp].map((c) => c.charCodeAt(0) >> 5)
    .concat([0], [...hrp].map((c) => c.charCodeAt(0) & 31), data);
  if (polymod(expanded) !== 1) die('bech32 checksum mismatch');
  return { hrp, words: data.slice(0, -6) };
}

function convertBits(data, from, to, pad) {
  let acc = 0, bits = 0;
  const out = [], maxv = (1 << to) - 1;
  for (const v of data) {
    if (v < 0 || v >> from) die('invalid data range');
    acc = (acc << from) | v;
    bits += from;
    while (bits >= to) { bits -= to; out.push((acc >> bits) & maxv); }
  }
  if (pad) { if (bits) out.push((acc << (to - bits)) & maxv); }
  else if (bits >= from || ((acc << (to - bits)) & maxv)) die('invalid padding');
  return out;
}

function bech32ToEvm(addr) {
  const { hrp, words } = decodeBech32(addr);
  if (hrp !== 'qor') die(`expected 'qor' prefix, got '${hrp}'`);
  const bytes = convertBits(words, 5, 8, false);
  if (bytes.length !== 20) die(`expected 20-byte payload, got ${bytes.length}`);
  return '0x' + Buffer.from(bytes).toString('hex');
}

// --- JSON-RPC ---
async function rpc(method, params) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) die(`RPC ${method} HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) die(`RPC ${method}: ${json.error.message || JSON.stringify(json.error)}`);
  return json.result;
}

// ABI-decode (bool registered, uint8 algorithmId, bytes pubkey, bool possessionProven)
function decodeKeyStatus(hex) {
  const buf = Buffer.from(hex.slice(2), 'hex');
  if (buf.length < 128) die('short pqcKeyStatus return data');
  const word = (i) => buf.subarray(i * 32, (i + 1) * 32);
  const registered = word(0)[31] === 1;
  const algorithmId = word(1)[31];
  const offset = Number(word(2).readBigUInt64BE(24));
  const possessionProven = word(3)[31] === 1;
  const len = Number(buf.subarray(offset, offset + 32).readBigUInt64BE(24));
  const pubkey = buf.subarray(offset + 32, offset + 32 + len);
  return { registered, algorithmId, pubkey, possessionProven };
}

// --- main ---
const input = process.argv[2];
if (!input) die('usage: node scripts/key-status.mjs <qor1... address>');

const evmAddress = bech32ToEvm(input.toLowerCase());

const chainIdHex = await rpc('eth_chainId', []);
const chainId = parseInt(chainIdHex, 16);
if (chainId !== EXPECTED_CHAIN_ID) die(`eth_chainId ${chainId}, expected ${EXPECTED_CHAIN_ID}`);

const callData = SELECTOR + evmAddress.slice(2).padStart(64, '0');
const ret = await rpc('eth_call', [{ to: PRECOMPILE, data: callData }, 'latest']);
const { registered, algorithmId, pubkey, possessionProven } = decodeKeyStatus(ret);

let restFound = false, restPossessionProven = false, restCreatedAtHeight = null, restKeyMatches = false;
const restRes = await fetch(`${REST}/qorechain/pqc/v1/account/${input.toLowerCase()}`);
if (restRes.ok) {
  const restJson = await restRes.json();
  const acct = restJson.account || {};
  restFound = restJson.found === true;
  restPossessionProven = acct.possession_proven === true;
  restCreatedAtHeight = acct.created_at_height ?? null;
  if (restFound && typeof acct.public_key === 'string') {
    restKeyMatches = Buffer.from(acct.public_key, 'base64').equals(pubkey);
  }
} else if (restRes.status !== 404) {
  die(`REST HTTP ${restRes.status}`);
}

const out = {
  address: input.toLowerCase(),
  evmAddress,
  chainId,
  registered,
  algorithmId,
  pubkeyBytes: pubkey.length,
  pubkeySha256: createHash('sha256').update(pubkey).digest('hex'),
  possessionProven,
  restFound,
  restPossessionProven,
  restCreatedAtHeight,
  restKeyMatches,
  live: registered && algorithmId === 1 && pubkey.length === 2592 && possessionProven && restKeyMatches,
};
console.log(JSON.stringify(out, null, 2));
process.exit(out.live ? 0 : 1);
