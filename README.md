# Postmark — Build Before Q-Day

QoreChain Post-Quantum dApp track: a reusable **real ML-DSA-87 Foundry test
library**, plus `PostmarkEscrow`, a GitHub bounty escrow: contributors make a PQ-signed claim,
and payout needs 2-of-3 ML-DSA-87 verifier verdicts.
**Real issues, testnet payouts**: diana pays test QOR, not money.

Repository (draft, not yet published): github.com/Ololadestephen/Postmark

Prior work: Proven, our outcome-paid escrow on NEAR. This is a new, post-quantum implementation built during the fest.

Install first: `npm ci`. Tests fail without it.

```sh
forge test -vv
```

With no standalone Forge on PATH, `npm test` uses the pinned npm Forge binary.

Check that an account's ML-DSA-87 key is live on diana: `npm run key-status -- qor1...`.

Requires Node 22 (>=20.19) and trusted local FFI execution; `ffi=true` is enabled.
The root npm dependencies pin the PQC package and an optional convenience Forge
binary. Initialize the pinned forge-std submodule with
`git submodule update --init lib/forge-std` after cloning. The escrow
(`src/PostmarkEscrow.sol`) uses open claims and native test QOR only.

## Deployment (diana testnet, testnet payouts only)

| Item | Value |
|---|---|
| PostmarkEscrow | [`0x4f15e9Ca6dFD3a3f38940A84E592f8bC1e816AD2`](https://dashboard.qorechain.io/explorer/address/0x4f15e9Ca6dFD3a3f38940A84E592f8bC1e816AD2) (chain 9800, `qorechain-diana`) |
| Deploy tx | [`0x5f38a4eb…8891be`](https://dashboard.qorechain.io/explorer/tx/0x5f38a4ebdb56ff6c015616db0d2e61096446f0c1660a4e99f131899aeb8891be), block 10391519, 5,198,980 gas |
| Deployer | `0x9d7d0f1364d6F37115d1d5be1C89362595287313` (testnet-only key, ML-DSA-87 registered in `779144F4…C4B017`) |
| Scoped EVM window | opened `28AC7A1C…4CC29B` (600 blocks, 3 txs, 2 QOR cap; unscoped targets, because a target list refuses contract creation), closed right after the deploy in `D42BD1BB…02C3BA` |

The on-chain code matches `forge inspect PostmarkEscrow deployedBytecode` byte for byte. Full record:
[`deployments/diana.json`](deployments/diana.json). Window tooling: `npm run window -- status|register|open|close`.
In the explorer, switch the network to Testnet (diana).

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
