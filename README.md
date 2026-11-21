# Postmark — Build Before Q-Day

[![Built on QoreChain](https://build.qorechain.io/badge/postmark.svg)](https://build.qorechain.io/p/postmark)

QoreChain Post-Quantum dApp track: a reusable **real ML-DSA-87 Foundry test
library**, plus `PostmarkEscrow`, a GitHub bounty escrow: contributors make a PQ-signed claim,
and payout needs 2-of-3 ML-DSA-87 verifier verdicts.
**Real issues, testnet payouts**: diana pays test QOR, which has no monetary value.

Repository: [github.com/Ololadestephen/Postmark](https://github.com/Ololadestephen/Postmark) · Project page: [build.qorechain.io/p/postmark](https://build.qorechain.io/p/postmark)

Prior work: Proven, our outcome-paid escrow on NEAR. This is a new, post-quantum implementation built during the fest.

## How it works

1. **Fund** — a funder locks test QOR on a GitHub issue or PR, naming three verifier accounts and a claim deadline.
2. **Claim** — a contributor posts their `postmark-claim v1 …` line as a GitHub comment, then claims with an ML-DSA-87 signature that binds their GitHub identity to their payout address.
3. **Verdict** — 2 of the 3 verifiers review the work off-chain and each sign a PAY or REFUND verdict; anyone relays the signatures to `submitVerdict`.
4. **Challenge** — a winning verdict sits Pending for 24 hours. Anyone can bond a dispute; a bonded dispute freezes the payout.
5. **Resolution** — the same verifier set signs a second DISPUTE-phase verdict; upheld sends the bond plus challenge reward to the disputer, rejected pays the original verdict.
6. **Withdraw** — payouts land as pull-payment credits; the payee withdraws to their own address (a live PQ key is required for gated credits).

## Deployment (diana testnet, testnet payouts only)

| Item | Value |
|---|---|
| PostmarkEscrow (production) | [`0x13De819fE37133d19287aAFE1991a921F84b9F45`](https://dashboard.qorechain.io/explorer/address/0x13De819fE37133d19287aAFE1991a921F84b9F45) (chain 9800, `qorechain-diana`) |
| Deploy tx | [`0xa01ae24d…3ffdbc`](https://dashboard.qorechain.io/explorer/tx/0xa01ae24d57869e0e16bbfbfec29a36a539bd65998600188d1f5439b0663ffdbc), block 10429957, 3,389,585 gas |
| Deployer | `0x9d7d0f1364d6F37115d1d5be1C89362595287313` (testnet-only key with a registered ML-DSA-87 key) |
| Scoped EVM window | opened `E0AEE6F4…35BE10` (600 blocks, 3 txs, 2 QOR cap; no target list, because a target list refuses contract creation), closed right after the deploy in `F6093526…2E2893` |

The on-chain code matches `forge inspect PostmarkEscrow deployedBytecode` byte for byte. Full record, including the
superseded first deployment: [`deployments/diana.json`](deployments/diana.json). Window tooling:
`npm run window -- status|register|open|close`. In the explorer, switch the network to Testnet (diana).

A dedicated **e2e instance** lives at
[`0xae80681E92b63eFEa78cB742dd612ecc940B896A`](https://dashboard.qorechain.io/explorer/address/0xae80681E92b63eFEa78cB742dd612ecc940B896A)
(deploy tx `0xc8325407…076cd4`, block 10396129) so test bounties never pollute the production
deployment's Explore view. Record: [`deployments/diana-e2e.json`](deployments/diana-e2e.json).

## Setup

Requires Node 22 (>=20.19) and Foundry. `ffi=true` is enabled — the PQC mocks shell out to
`scripts/pqc.mjs`, so tests need trusted local FFI execution.

```sh
npm ci                         # root: pins @qorechain/pqc + pinned Forge binary
git submodule update --init lib/forge-std
forge test -vv                 # or npm test (uses the pinned npm Forge binary)
cd app && npm ci && npm run dev
```

Check that an account's ML-DSA-87 key is live on diana: `npm run key-status -- qor1...`.

The web app targets the production deployment by default. To point it at the e2e instance:

```sh
cd app && VITE_DEPLOYMENT=e2e npm run dev     # or `npm run build:e2e` for a built bundle
```

Sending transactions needs two things: a connected **QoreX wallet** (EVM address on chain 9800)
and a live **scoped EVM window** for the account — on diana, EVM writes are authorized through a
Cosmos-lane `MsgOpenEVMWindow` (block limit, tx count, value cap, optional allowed targets). The
app's preflight shows the exact QoreX steps when a window is missing or too small.

### Local PQ signer

QoreX cannot yet sign arbitrary ML-DSA-87 messages, so claim and verdict signatures come from a
local signer, `scripts/signer.mjs` — a small HTTP service on 127.0.0.1 that holds the ML-DSA-87
key, asks for confirmation on the TTY, and only signs after re-verifying the exact bytes the
escrow will hash:

```sh
npm run signer -- serve --env ~/.config/postmark/<profile> --origin http://localhost:5173 --port 47321
```

The profile directory holds a mode-600 `config.env` with `MNEMONIC` (QoreX-derived key, optional
`HD_INDEX`) or `PQC_RECOVERY_CODE` (QRC1), plus the account's address files — the signer refuses to
start unless the derived key equals the account's live registered key. It prints a pairing code that
the app must send on every request. Offline `sign-claim` / `sign-verdict` subcommands print a
signature hex for copy/paste.

## Testing

| Command | Covers |
|---|---|
| `forge test` (or `npm test`) | 125 Foundry tests: claims, verdicts, disputes, withdrawals, reentrancy, invariants — all against real ML-DSA-87 signatures, plus the live Diana precompiles in the `test-utils` mocks |
| `npm run test:signer` | Node tests for the local signer: origin/pairing refusal, message-mismatch and claimant-mismatch refusal, key-equality and file-mode startup checks, and calldata regression against Viem `encodeFunctionData` |
| `cd app && npm test` | Vitest suites: form validation, preflight decisions, comment-scan pagination, verdict-bundle merge/verify with real signatures, dispute hashes, mocked-clock finalize/dispute boundaries |
| `cd app && npm run test:chain` | Live-RPC byte-match tests: app-built `claimMessage`/`verdictMessage` (both phases) vs the deployed escrow on diana |
| `cd app && npm run typecheck && npm run build` | Strict TS + production bundle |
| `cd app && npm run e2e` | Playwright on real diana with an injected EIP-6963 test wallet: create → claim → 2-of-3 verdict → dispute → resolution → withdraw. Only GitHub is route-mocked. **Spends test QOR** from disposable profiles in `~/.config/postmark/e2e/` and opens scoped windows |
| `cd app && E2E_NO_WINDOWS=1 npx playwright test e2e/screens-w4.spec.ts` | Read-only/screenshot runs against existing e2e fixtures — no transactions, no windows |

## Security notes and limitations

- Pull payments only; every value transfer is `nonReentrant`; every state change emits events.
- Keys and seeds never enter the repo — profiles live under `~/.config/postmark/` with mode-600 files; the signer enforces it.
- Known limits: **no dispute timeout** (a Disputed bounty stays locked unless the verifier set signs a resolution — see THREAT_MODEL.md), the **local signer is required until QoreX learns `signArbitrary` for ML-DSA-87**, and the unauthenticated **GitHub REST API rate limit** (60 req/h per IP) can stall comment scans.
- Trust model, griefing analysis and the full format spec: [THREAT_MODEL.md](THREAT_MODEL.md), [SPEC.md](SPEC.md).

## Audit

Both QCAI runs (Nov 20, Ethereum EVM/Solidity) scored 65/100. Run 2 reported MEDIUM overall risk and did not meet the 70+ Top Quality threshold. The reports, source changes, and finding-by-finding responses are in [`docs/AUDIT.md`](docs/AUDIT.md).

* [Library setup, API, example and limitations](src/test-utils/README.md)
* [PostmarkEscrow specification and test plan](SPEC.md)
* [Threat model](THREAT_MODEL.md)

Credits: QoreChain's Build Before Q-Day workshop-2 QDayVault ABI and precompile
addresses; QoreChain docs and SDK EVM-window/QoreX guidance;
`@qorechain/pqc` and its shared vectors; noble post-quantum; Foundry and forge-std;
OpenZeppelin Contracts 5.7.0 (`ReentrancyGuard` only).
See the library README for precise sources/revisions. MIT; dependency/fixture
licenses remain their own. This directory has no project Git remote and requires
no pushes, mainnet deployments, or changes to any prior project.

* [Build plan and milestones](PLAN.md)
* [Agent instructions](AGENTS.md)
