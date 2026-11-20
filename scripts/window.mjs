#!/usr/bin/env node
// Postmark diana deploy window helper. Account profiles live outside the
// repo: a pair `<base>.env` (KEY=0x..., ADDRESS=0x...) and `<base>-pqc.env`
// (PQC_RECOVERY_CODE=QRC1...). --env <base> selects the profile; the default
// is the deployer pair under ~/.config/postmark, whose vars keep the legacy
// DEPLOYER_ names. Nothing secret is ever printed.
// Subcommands:
//   new-account <name>   create e2e/<name>.env + <name>-pqc.env
//   recovery-code        write the -pqc.env file for the selected profile
//   status | register | send <to> <uqor> | open <b> <n> <v> [targets] | close
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
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
import { hex, toBytes, sha256hex, json, parseEnv, makeDie } from './lib/common.mjs';

const REST = process.env.QORE_REST || 'https://api-testnet.qore.host';
const RPC = process.env.QORE_RPC || 'https://rpc-testnet.qore.host';
const CHAIN_ID = 'qorechain-diana';
const DENOM = 'uqor';
const CONFIG_DIR = `${process.env.HOME}/.config/postmark`;
const E2E_DIR = `${CONFIG_DIR}/e2e`;
const FEE = { amount: [{ denom: DENOM, amount: '60000' }], gas: '600000' };

const die = makeDie('window');

// Parse --env <base> then load the profile files into process.env (real env wins).
let profileBase = `${CONFIG_DIR}/deployer`;
{
  const i = process.argv.indexOf('--env');
  if (i !== -1) {
    const p = process.argv[i + 1];
    if (!p) die('--env needs a path');
    profileBase = p.endsWith('.env') ? p.slice(0, -4) : p;
    process.argv.splice(i, 2);
  }
}
const ENV_FILE = `${profileBase}.env`;
const PQC_FILE = `${profileBase}-pqc.env`;

for (const f of [ENV_FILE, PQC_FILE]) {
  if (!existsSync(f)) continue;
  for (const [name, value] of Object.entries(parseEnv(readFileSync(f, 'utf8')))) {
    if (!(name in process.env)) process.env[name] = value;
  }
}
const envVar = (name, legacy) => process.env[name] || (legacy && process.env[legacy]);

function keyBytes() {
  const k = envVar('KEY', 'DEPLOYER_KEY');
  if (!k) die(`KEY not set (env or ${ENV_FILE})`);
  const b = toBytes(k);
  if (b.length !== 32) die('KEY is not 32 bytes');
  return b;
}

// Classical address check: KEY must produce ADDRESS.
function classicalAccount() {
  const seed = keyBytes();
  const pub = secp256k1.getPublicKey(seed, true);
  const uncompressed = secp256k1.getPublicKey(seed, false).slice(1);
  const addr20 = keccak256(uncompressed).slice(12);
  const addrs = qoreAddresses({ hex: hex(addr20) });
  const want = (envVar('ADDRESS', 'DEPLOYER_ADDRESS') || '').toLowerCase();
  if (addrs.evm.toLowerCase() !== want) {
    die(`signer mismatch: KEY derives ${addrs.evm}, expected ${want}`);
  }
  return { seed, pub, cosmos: addrs.cosmos, evm: addrs.evm };
}

// Unified account incl. PQC key from the recovery code.
function unified() {
  const code = envVar('PQC_RECOVERY_CODE', 'DEPLOYER_PQC_RECOVERY_CODE');
  if (!code) die(`PQC_RECOVERY_CODE not set (env or ${PQC_FILE})`);
  const { seed } = classicalAccount();
  const account = unifiedAccountFromSeed(seed, { recoveryCode: code });
  const expected = qoreAddresses({ evm: envVar('ADDRESS', 'DEPLOYER_ADDRESS') });
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

// Sign `messages` with the profile's classical key and broadcast; returns the checked result.
async function broadcast(signer, account, messages) {
  const seq = await accountSeq(account.cosmos);
  return checkBroadcast(await signer.signAndBroadcast({ broadcastTx: tmBroadcast }, {
    chainId: CHAIN_ID, ...seq, fee: FEE, messages }));
}

const txSummary = (res) => ({
  transactionHash: res.transactionHash, height: res.height.toString(),
  gasUsed: res.gasUsed.toString(),
});

const commands = {
  'new-account'([name]) {
    if (!/^[a-z0-9_-]+$/i.test(name || '')) die('usage: new-account <name> ([a-z0-9_-])');
    const envF = `${E2E_DIR}/${name}.env`;
    const pqcF = `${E2E_DIR}/${name}-pqc.env`;
    if (existsSync(envF) || existsSync(pqcF)) {
      die(`${envF} or ${pqcF} already exists; refusing to overwrite`);
    }
    mkdirSync(E2E_DIR, { recursive: true, mode: 0o700 });
    const seed = secp256k1.utils.randomSecretKey();
    const uncompressed = secp256k1.getPublicKey(seed, false).slice(1);
    const addrs = qoreAddresses({ hex: hex(keccak256(uncompressed).slice(12)) });
    const code = generatePqcRecoveryCode();
    writeFileSync(envF, `KEY=0x${hex(seed)}\nADDRESS=${addrs.evm}\n`, { mode: 0o600 });
    writeFileSync(pqcF, `PQC_RECOVERY_CODE=${code}\n`, { mode: 0o600 });
    const key = pqcKeyFromRecoveryCode(code, addrs.cosmos);
    console.log(json({
      evm: addrs.evm, cosmos: addrs.cosmos,
      pubkeySha256: sha256hex(key.publicKey),
      files: [envF, pqcF],
    }));
  },

  'recovery-code'() {
    if (existsSync(PQC_FILE)) die(`${PQC_FILE} already exists; refusing to overwrite`);
    const { cosmos } = classicalAccount();
    const code = generatePqcRecoveryCode();
    const key = pqcKeyFromRecoveryCode(code, cosmos);
    const varName = profileBase.endsWith('/deployer')
      ? 'DEPLOYER_PQC_RECOVERY_CODE' : 'PQC_RECOVERY_CODE';
    writeFileSync(PQC_FILE, `${varName}=${code}\n`, { mode: 0o600 });
    console.log(json({
      file: PQC_FILE,
      account: cosmos,
      pubkeySha256: sha256hex(key.publicKey),
    }));
  },

  async status() {
    const { cosmos, evm } = classicalAccount();
    const pqc = await fetchPqcStatus({ rest: REST, address: cosmos });
    const window = await fetchEvmWindow({ rest: REST, address: cosmos });
    const bal = await fetch(`${REST}/cosmos/bank/v1beta1/balances/${cosmos}`);
    const { balances } = await bal.json();
    console.log(json({ profile: profileBase, cosmos, evm, pqc, window,
      balances: balances || [] }));
  },

  async register() {
    const account = unified();
    const status = await fetchPqcStatus({ rest: REST, address: account.cosmos });
    if (status.registered) {
      const match = isRegisteredPqcKey(status, account.pqc.publicKey);
      if (match === false) die('account already has a DIFFERENT PQC key registered', 1);
      console.log(json({ alreadyRegistered: true, keyVerified: match !== false }));
      return;
    }
    const proof = signProofOfPossession({
      chainId: CHAIN_ID, account: account.cosmos, keypair: account.pqc });
    const message = buildRegisterPqcKeyMsg(account.cosmos, {
      pqcKeypair: account.pqc, ecdsaPubkey: toBytes(account.publicKey), proofOfPossession: proof });
    const signer = new EthNativeSigner(account, { signMode: 'classical', rest: REST });
    console.log(json(txSummary(await broadcast(signer, account, [message]))));
  },

  async send([to, uqor]) {
    if (!to || !uqor || !/^[0-9]+$/.test(uqor)) {
      die('usage: send <to-qor1-or-0x> <uqor>');
    }
    const account = unified();
    const status = await fetchPqcStatus({ rest: REST, address: account.cosmos });
    if (!status.registered) die('sender has no registered PQC key; run register first', 1);
    const toQor = to.startsWith('0x') ? qoreAddresses({ evm: to }).cosmos : to;
    const signer = new EthNativeSigner(account, { rest: REST });
    const seq = await accountSeq(account.cosmos);
    const res = checkBroadcast(await signer.bankSend({ broadcastTx: tmBroadcast }, toQor,
      [{ denom: DENOM, amount: uqor }],
      { chainId: CHAIN_ID, ...seq, fee: FEE }));
    console.log(json({ from: account.cosmos, to: toQor, uqor,
      transactionHash: res.transactionHash, height: res.height?.toString() }));
  },

  async open([blocks, maxTxs, maxValue, ...targets]) {
    if (!blocks || !maxTxs || !maxValue) die('usage: open <blocks> <maxTxs> <maxValueUqor> [target,...]');
    const account = unified();
    const message = openEvmWindowMsg({
      sender: account.cosmos,
      blocks: BigInt(blocks), maxTxs: BigInt(maxTxs), maxValue,
      ...(targets.length ? { allowedTargets: targets } : {}),
    });
    const signer = new EthNativeSigner(account, { rest: REST });
    const res = await broadcast(signer, account, [message]);
    const window = await fetchEvmWindow({ rest: REST, address: account.cosmos });
    console.log(json({ ...txSummary(res), window }));
  },

  async close() {
    const account = unified();
    const signer = new EthNativeSigner(account, { rest: REST });
    console.log(json(txSummary(await broadcast(signer, account, [closeEvmWindowMsg(account.cosmos)]))));
  },
};

const [cmd, ...args] = process.argv.slice(2);
if (!Object.hasOwn(commands, cmd ?? '')) {
  die('usage: window.mjs [--env <profileBase>] new-account <name>|recovery-code|status|register|send <to> <uqor>|open <blocks> <maxTxs> <maxValue> [targets]|close');
}
await commands[cmd](args);
process.exit(0);
