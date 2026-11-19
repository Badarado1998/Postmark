# AGENTS.md

Instructions for AI coding agents (Devin, Poke, others) working in this repo.

## Project
QoreChain Build Before Q-Day entry, Post-Quantum dApp category. A bounty escrow that pays out on 2-of-3 ML-DSA-87 verifier verdicts.
Design source of truth: `SPEC.md`. Schedule and milestones: `PLAN.md`.

## Setup and checks
- Node >=20.19 (Node 22 preferred), Foundry.
- `npm ci`, then `forge test -vv` (or `npm test`). `ffi = true` is required: the PQC mocks shell out to `scripts/pqc.mjs`.
- Every change keeps `forge test` green. Paste the summary line in PR descriptions.

## Hard rules
- Never touch the Proven repo (Ololadestephen/Proven). Write all code new here; do not copy from Proven.
- Call diana payouts "testnet payouts" (test QOR, no monetary value). Never imply real money.
- Do not fund or comment on bounties in QoreChain-owned repos unless the Discord answer recorded in PLAN.md T3 says yes.
- The mocks in `src/test-utils/` are test-only. Never deploy them.
- Use the real precompiles on diana: `pqcVerify` at `0x…0a01` and `pqcKeyStatus` at `0x…0a02`. Keep the ABI from `src/test-utils/IQorePQC.sol`.
- Deploy only through a scoped EVM window. No mainnet deployments.
- No secrets, private keys or seed phrases in the repo. ML-DSA test seeds in tests are fine.
- Stretch features (PLAN.md T11) only start after T1–T10 are done.

## Code style
- Solidity: custom errors, checks-effects-interactions, `nonReentrant` on every value transfer, events for every state change.
- Small, focused commits, at least one a day (judges see the activity feed).
- Implement against the spec. When code and SPEC.md disagree, update SPEC.md in the same PR.

## Milestone reporting
After each milestone in PLAN.md, report the milestone ID, its exit check output, and links (PR, tx, explorer). Then mark it done in PLAN.md.
