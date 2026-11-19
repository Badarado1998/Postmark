# Build plan — Postmark (QoreChain Build Before Q-Day)

**Category:** Post-Quantum dApp (1st $1,500 / 2nd $750 / 3rd $500). Agents are a feature here, not the category.
**Product:** a post-quantum bounty board that pays out on verified outcomes, in native test QOR only. A funder locks QOR on a GitHub PR or issue; a contributor makes a PQ-signed, time-limited identity claim. Payout to that claimant needs ML-DSA-87 signatures from 2 of 3 independent verifiers, then a 24-hour challenge window. A bonded dispute freezes the payout; the same verifier set resolves it, not an independent appeal panel.
**Repo:** Ololadestephen/Postmark (draft; create/push only after owner approval).
**Deadline:** Dec 2, 23:59 UTC. **Our target:** Dec 2, 12:00 UTC (1:00 PM WAT).
**Wording rule:** "real issues, testnet payouts". Diana QOR has no monetary value.
**Prior-work rule:** all code is new, in this repo. The README names Proven as prior work.

## Milestones

Each milestone is done only when its exit check passes. Report to Poke after each one.
Kane owns Nov 20–26, so T4–T6 are small daily escrow slices, not a full-build day.
The threat-model review runs in parallel rather than blocking all implementation until Nov 27.

| ID | Dates | Milestone | Exit check |
|----|-------|-----------|------------|
| T1 | Nov 19 | Spec + PQC test library | `forge test` 12/12 passing; SPEC.md written (done) |
| T2 | Nov 19–20 | Accounts and chain setup: register (GitHub, X, QoreX testnet address), faucet QOR, register an ML-DSA-87 key, attend workshop 3 (Nov 20, 16:30 UTC) | `pqcKeyStatus` returns live for our key on diana (exit check passed Nov 19: qor1y5t5h5af3nvr8t909zxefaxvxfpz06vawzg8sk / 0x25174bd3…e99d, alg 1, 2592-byte key sha256 31fc187d…788f, possession proven, registered by QoreX at height 10375785; `npm run key-status -- <addr>`. Workshop 3 still open) |
| T3 | Nov 20 | Recruit 2 outside verifiers (co-founder plus one other person); ask on QoreChain Discord about demoing bounties on their lightnode docs issues | 3 verifier keys from 3 different people, registered; Discord answer logged (yes, or fall back to Soryn/fibcheck issues) |
| T4a | Nov 21 | Create/fund slice: native QOR accounting, immutable verifier accounts, Open state | Foundry tests: exact msg.value, parameter bounds, live distinct verifier keys, liability accounting (**done Nov 19**) |
| T4b | Nov 22 | Claim slice: ClaimV1 signing, live claimant key, timeout and round replacement | Foundry tests: valid/invalid/replayed claims, excluded roles, active/expired/deadline boundaries (**done Nov 19**) |
| T4c | Nov 23 | Verdict slice: 2-of-3 INITIAL PAY/REFUND, claim-round binding, Pending snapshot | Foundry tests: quorum, stale claimant/round, domain/nonce replay, live key rotation, claim freeze (**done Nov 19**) |
| T5a | Nov 24 | Challenge slice: 24h timer, no-dispute finalize, expired-bounty refund to pull credits | Foundry tests: exact timer/deadline boundaries, anyone finalize, legal transitions, no double credit (**done Nov 19**) |
| T5b | Nov 25 | Dispute slice: exact bond, evidence, freeze, fresh same-set quorum resolution | Foundry tests: upheld/rejected outcomes, reward/bond accounting, no-claim REFUND, replay, indefinite lock (**done Nov 19**) |
| T6 | Nov 26 | Withdraw and hardening slice: native pull payments, live payee gating, reentrancy guards | Foundry tests: failed/reentrant withdrawal, mixed gated credits, forced QOR, state/liability invariants; full suite green (**done Nov 19, 122/122**) |
| T7 | Nov 21–26 (parallel) | Threat model + SPEC review: independence, same-set dispute limits, indefinite lock, claim griefing, leaked-ECDSA analysis | THREAT_MODEL.md reviewed against SPEC.md; trust/liveness limitations explicit (drafted Nov 19; waiting on owner review) |
| T8 | Nov 27 | Deploy on diana (chain 9800) through a scoped EVM window; QCAI audit run 1; workshop 4 clinic at 16:30 UTC | Contract addresses + txs in README; audit run 1 saved |
| T9 | Nov 28 | Fix findings, audit run 2, write docs/AUDIT.md | Regression tests for fixes; run 2 clean or every finding answered in docs/AUDIT.md |
| T10 | Nov 29 | Simple QoreX UI: list, fund, claim, show verdict, challenge timer, dispute, withdraw | One bounty claimed and paid end to end on diana from the UI |
| T11 | Nov 29 (only if T1–T10 are done) | Stretch: acceptance-check jobs with planted fakes, QoreSeal deliverables, `signArbitrary` identity, MCP tool | Each stretch item has its own tests; skip any that isn't ready |
| T12 | Nov 30–Dec 1 | Submission pack: README (prior-work line, testnet wording, kit credits), AI_USAGE.md, featured image, video under 3 min | Project page reads "verified", not just "declared" |
| T13 | Dec 2 by 12:00 UTC | Submit, tick AI-native box, post with #BuildBeforeQDay | Submission confirmation received |
| T14 | Dec 6–15 | Stay reachable for judging; answer finalist change requests within 48h | No request older than 24h without an answer |

By Nov 23, create/fund/claim and the 2-of-3 verdict are tested. By Nov 26,
challenge/dispute/finalize/withdraw and the full regression suite are tested.

## Video outline (under 3 minutes)
1. The problem, in 20 seconds: classical keys and trusted oracles.
2. A live bounty on a real issue: fund, PQ-sign a claim, pay testnet QOR after the 2-of-3 verdict.
3. A release attempt signed only with a classical key gets refused.
4. A dispute freezes the payout.
5. Audit fixes, then the outro.

## Judging checklist
- [ ] Scoped EVM window used and shown
- [ ] `pqcVerify` and `pqcKeyStatus` used and shown in txs
- [ ] Two-stage QCAI audit + docs/AUDIT.md
- [ ] Foundry tests
- [ ] Kits listed in package.json / foundry deps
- [ ] MIT license, README credits, testnet addresses
- [ ] Threat model, AI_USAGE.md, video, featured image
- [ ] Daily small commits (live feed, "most active" chart)

## Milestone reports

### T2 exit check (Nov 19)
`npm run key-status -- qor1y5t5h5af3nvr8t909zxefaxvxfpz06vawzg8sk` gives `live: true`: registered, algorithm 1, 2592-byte key (sha256 `31fc187d…788f`), possession proven, registered by QoreX at height 10375785. Workshop 3 and the fest sign-up are with the owner.

### T4a–T6 PostmarkEscrow (Nov 19, moved up from Nov 21–26)
Claims (ClaimV1, claim rounds, timeout), native test QOR only, 2-of-3 verdicts bound to the claimant and round, 24 h challenge, bonded dispute, pull payments.
`forge test`: `Ran 9 test suites: 122 tests passed, 0 failed, 0 skipped (122 total tests)`. Coverage of `src/PostmarkEscrow.sol`: 100% lines, 99.6% statements, 97.5% branches, 100% functions. Design calls: SPEC.md D1–D10. Links: none yet (no remote, not deployed).

### T7 threat model (Nov 19, draft)
THREAT_MODEL.md: T-1 to T-11 (claims, same-set disputes, native-only), with a threat-to-test map. Waiting on owner review.

Next: T8 deploy on diana through a scoped EVM window with the fresh testnet-only deployer `0x9d7d0f1364d6F37115d1d5be1C89362595287313` (`qor1n47s7ymy6mehz9w36klpezfkyk2jsucnhgk58p`), once the owner funds it.

### T8 deploy on diana (Nov 19, partly done)
PostmarkEscrow at `0x4f15e9Ca6dFD3a3f38940A84E592f8bC1e816AD2`, deploy tx `0x5f38a4ebdb56ff6c015616db0d2e61096446f0c1660a4e99f131899aeb8891be` (status 1, 5,198,980 gas, block 10391519). Deployer PQ key registered in `779144F4…C4B017`; window opened `28AC7A1C…4CC29B` (600 blocks / 3 txs / 2 QOR) and closed `D42BD1BB…02C3BA`. On-chain code equals the compiled runtime; typehashes, chain ID and constants checked with `cast call`. Record: deployments/diana.json.
Still open for T8: QCAI audit run 1 (dashboard sign-in, owner) and the workshop 4 clinic (Nov 27, 16:30 UTC).
