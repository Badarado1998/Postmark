# Postmark — Build Before Q-Day

QoreChain Post-Quantum dApp track: a reusable **real ML-DSA-87 Foundry test
library**, plus the specification (not implementation) of a GitHub bounty escrow.
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
`git submodule update --init lib/forge-std` after cloning. No escrow contracts are
implemented yet. The planned escrow uses open claims and native test QOR only.

* [Library setup, API, example and limitations](src/test-utils/README.md)
* [PostmarkEscrow specification and future test plan](SPEC.md)

Credits: QoreChain's Build Before Q-Day workshop-2 QDayVault ABI and precompile
addresses; QoreChain docs and SDK EVM-window/QoreX guidance;
`@qorechain/pqc` and its shared vectors; noble post-quantum; Foundry and forge-std.
See the library README for precise sources/revisions. MIT; dependency/fixture
licenses remain their own. This directory has no project Git remote and requires
no pushes, mainnet deployments, or changes to any prior project.

* [Build plan and milestones](PLAN.md)
* [Agent instructions](AGENTS.md)
