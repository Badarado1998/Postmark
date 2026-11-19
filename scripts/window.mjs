#!/usr/bin/env node
// Postmark diana deploy window helper. Reads DEPLOYER_KEY and
// DEPLOYER_PQC_RECOVERY_CODE from the environment; never prints secrets.
// Subcommands: recovery-code | status | register | open | close
import { writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import {
  unifiedAccountFromSeed,
  pqcKeyFromRecoveryCode,
  generatePqcRecoveryCode,
  openEvmWindowMsg,
  closeEvmWindowMsg,
  fetchEvmWindow,
  fetchPqcStatus,
  isRegisteredPqcKey,
  buildRegisterPqcKeyMsg,
  signProofOfPossession,
  classifyEvmWindowRejection,
  EthNativeSigner,
  qoreAddresses,
  keccak256,
} from '@qorechain/sdk';

const REST = process.env.QORE_REST || 'https://api-testnet.qore.host';
const RPC = process.env.QORE_RPC || 'https://rpc-testnet.qore.host';
const CHAIN_ID = 'qorechain-diana';
const DENOM = 'uqor';
const PQC_ENV = `${process.env.HOME}/.config/postmark/deployer-pqc.env`;
const FEE = { amount: [{ denom: DENOM, amount: '60000' }], gas: '600000' };

const die = (msg, code = 2) => { console.error(`window: ${msg}`); process.exit(code); };
const hex = (b) => Buffer.from(b).toString('hex');
const toBytes = (h) => Uint8Array.from(Buffer.from(h.replace(/^0x/, ''), 'hex'));

function deployerKeyBytes() {
  const k = process.env.DEPLOYER_KEY;
  if (!k) die('DEPLOYER_KEY not set in environment');
  const b = toBytes(k);
  if (b.length !== 32) die('DEPLOYER_KEY is not 32 bytes');
  return b;
}

// Classical address check: DEPLOYER_KEY must produce DEPLOYER_ADDRESS.
function classicalAccount() {
  const seed = deployerKeyBytes();
  const pub = secp256k1.getPublicKey(seed, true);
  const uncompressed = secp256k1.getPublicKey(seed, false).slice(1);
  const addr20 = keccak256(uncompressed).slice(12);
  const addrs = qoreAddresses({ hex: hex(addr20) });
  const want = (process.env.DEPLOYER_ADDRESS || '').toLowerCase();
  if (addrs.evm.toLowerCase() !== want) {
    die(`signer mismatch: DEPLOYER_KEY derives ${addrs.evm}, expected ${want}`);
  }
  return { seed, pub, cosmos: addrs.cosmos, evm: addrs.evm };
}

// Unified account incl. PQC key from the recovery code.
function unified() {
  const code = process.env.DEPLOYER_PQC_RECOVERY_CODE;
  if (!code) die('DEPLOYER_PQC_RECOVERY_CODE not set in environment');
  const { seed } = classicalAccount();
  const account = unifiedAccountFromSeed(seed, { recoveryCode: code });
  const expected = qoreAddresses({ evm: process.env.DEPLOYER_ADDRESS });
  if (account.cosmos !== expected.cosmos) {
    die(`signer mismatch: account derives ${account.cosmos}, expected ${expected.cosmos}`);
  }
  return account;
}

async function tmBroadcast(tx) {
  const res = await fetch(RPC, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'broadcast_tx_commit',
      params: { tx: Buffer.from(tx).toString('base64') } }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`rpc: ${JSON.stringify(j.error)}`);
  const r = j.result;
  const check = r.check_tx?.code ?? 0;
  const del = r.deliver_tx?.code ?? 0;
  return {
    code: del !== 0 ? del : check,
    transactionHash: r.hash,
    height: BigInt(r.height || 0),
    gasUsed: BigInt(r.deliver_tx?.gas_used || 0),
    gasWanted: BigInt(r.deliver_tx?.gas_wanted || 0),
    rawLog: r.deliver_tx?.log || r.check_tx?.log || '',
  };
}

async function accountSeq(cosmos) {
  const res = await fetch(`${REST}/cosmos/auth/v1beta1/accounts/${cosmos}`);
  const j = await res.json();
  let a = j.account;
  while (a && (a.base_account || a.base_account === null)) {
    if (!a.base_account) break;
    a = a.base_account;
  }
  if (!a || a.account_number === undefined) die(`cannot read account ${cosmos}`);
  return { accountNumber: BigInt(a.account_number), sequence: BigInt(a.sequence) };
}

function checkBroadcast(res) {
  if (res.code !== 0) {
    const reason = classifyEvmWindowRejection(new Error(res.rawLog || ''));
    die(`tx failed code=${res.code} reason=${reason} log=${res.rawLog}`, 1);
  }
  return res;
}

const [cmd, ...args] = process.argv.slice(2);

if (cmd === 'recovery-code') {
  if (existsSync(PQC_ENV)) die(`${PQC_ENV} already exists; refusing to overwrite`);
  const { cosmos } = classicalAccount();
  const code = generatePqcRecoveryCode();
  const key = pqcKeyFromRecoveryCode(code, cosmos);
  writeFileSync(PQC_ENV, `DEPLOYER_PQC_RECOVERY_CODE=${code}\n`, { mode: 0o600 });
  console.log(JSON.stringify({
    file: PQC_ENV,
    account: cosmos,
    pubkeySha256: createHash('sha256').update(key.publicKey).digest('hex'),
  }));
  process.exit(0);
}

if (cmd === 'status') {
  const { cosmos, evm } = classicalAccount();
  const pqc = await fetchPqcStatus({ rest: REST, address: cosmos });
  const window = await fetchEvmWindow({ rest: REST, address: cosmos });
  const bal = await fetch(`${REST}/cosmos/bank/v1beta1/balances/${cosmos}`);
  const { balances } = await bal.json();
  console.log(JSON.stringify({ cosmos, evm, pqc, window,
    balances: balances || [] }, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2));
  process.exit(0);
}

if (cmd === 'register') {
  const account = unified();
  const status = await fetchPqcStatus({ rest: REST, address: account.cosmos });
  if (status.registered) {
    const match = isRegisteredPqcKey(status, account.pqc.publicKey);
    if (match === false) die('account already has a DIFFERENT PQC key registered', 1);
    console.log(JSON.stringify({ alreadyRegistered: true, keyVerified: match !== false }));
    process.exit(0);
  }
  const proof = signProofOfPossession({
    chainId: CHAIN_ID, account: account.cosmos, keypair: account.pqc });
  const ecdsaPubkey = toBytes(account.publicKey);
  const message = buildRegisterPqcKeyMsg(account.cosmos, {
    pqcKeypair: account.pqc, ecdsaPubkey, proofOfPossession: proof });
  const signer = new EthNativeSigner(account, { signMode: 'classical', rest: REST });
  const seq = await accountSeq(account.cosmos);
  const res = await signer.signAndBroadcast({ broadcastTx: tmBroadcast }, {
    chainId: CHAIN_ID, ...seq, fee: FEE, messages: [message] });
  checkBroadcast(res);
  console.log(JSON.stringify({
    transactionHash: res.transactionHash, height: res.height.toString(),
    gasUsed: res.gasUsed.toString() }));
  process.exit(0);
}

if (cmd === 'open') {
  const [blocks, maxTxs, maxValue, ...targets] = args;
  if (!blocks || !maxTxs || !maxValue) die('usage: open <blocks> <maxTxs> <maxValueUqor> [target,...]');
  const account = unified();
  const message = openEvmWindowMsg({
    sender: account.cosmos,
    blocks: BigInt(blocks), maxTxs: BigInt(maxTxs), maxValue,
    ...(targets.length ? { allowedTargets: targets } : {}),
  });
  const signer = new EthNativeSigner(account, { rest: REST });
  const seq = await accountSeq(account.cosmos);
  const res = await signer.signAndBroadcast({ broadcastTx: tmBroadcast }, {
    chainId: CHAIN_ID, ...seq, fee: FEE, messages: [message] });
  checkBroadcast(res);
  const window = await fetchEvmWindow({ rest: REST, address: account.cosmos });
  console.log(JSON.stringify({ transactionHash: res.transactionHash,
    height: res.height.toString(), gasUsed: res.gasUsed.toString(), window },
    (k, v) => typeof v === 'bigint' ? v.toString() : v, 2));
  process.exit(0);
}

if (cmd === 'close') {
  const account = unified();
  const signer = new EthNativeSigner(account, { rest: REST });
  const seq = await accountSeq(account.cosmos);
  const res = await signer.signAndBroadcast({ broadcastTx: tmBroadcast }, {
    chainId: CHAIN_ID, ...seq, fee: FEE,
    messages: [closeEvmWindowMsg(account.cosmos)] });
  checkBroadcast(res);
  console.log(JSON.stringify({ transactionHash: res.transactionHash,
    height: res.height.toString(), gasUsed: res.gasUsed.toString() }));
  process.exit(0);
}

die('usage: window.mjs recovery-code|status|register|open <blocks> <maxTxs> <maxValue> [targets]|close');
