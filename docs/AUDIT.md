# QCAI audit

| Run | Date | Setting | Source | Report | Result |
|---|---|---|---|---|---|
| 1 | 2026-11-20 | Ethereum (EVM/Solidity) | `src/PostmarkEscrow.sol` at `241d0c7`, the code deployed at `0xb781E296FB35ccd2497589526114373bA0bff79b` | [`audit/qcai-stage1-2026-11-20.pdf`](audit/qcai-stage1-2026-11-20.pdf) | 65/100, 6 findings (2 high, 2 medium, 1 low, 1 info) |
| 2 | pending | Ethereum (EVM/Solidity) | same source | — | — |

Every run 1 finding is answered below. None needed a code change: each one describes a risk the
contract already handles, and the named tests prove it. The contract source is unchanged, so the
deployed bytecode still matches `forge inspect PostmarkEscrow deployedBytecode` exactly.

The report's line numbers don't line up with the source (line 177 is `_validOwnerRepo`, line 540 is
inside `_keyStatus`), so each finding is matched to the code it describes.

## Findings

### 1. Missing access control on `reopen` (HIGH): by design, no change
`reopen(bountyId)` is permissionless on purpose (SPEC.md claim rules; owner decision on Nov 19).
It only works once a claim has expired (`ClaimActive` otherwise), and all it does is clear the
expired claimant and set the bounty back to Open. `claim()` does the same normalization itself, so
`reopen` adds no power anyone lacks. Limiting it to the funder or claimant would let either of them
hold an expired bounty Closed. The claimant would block new claims; the funder would block
contributors.
Tests: `Claim.t.sol` `testReopenReleasesExpiredClaim` (a stranger reopens; reverts while the claim
is active), `testReplacementAtAndAfterExpiry`, `testClaimRoundIncrementsOnlyOnSuccess`.

### 2. Potential overflow in credit management (HIGH): false positive
The contract compiles with `pragma solidity ^0.8.24`, so `+=` is checked and reverts on overflow;
SafeMath is redundant on 0.8. Credits also can't approach `2^256`: every credited wei is native QOR
already held by the contract (`amount + challengeReward` at funding, the exact bond at dispute).
Tests: `Invariant.t.sol` `invariant_liabilitiesCoveredAndExact` (the sum of all credits plus
unsettled escrow equals the balance after random call sequences), `Settlement.t.sol` `testBondCountsInLiabilities`.

### 3. Front-running in the claim process (MEDIUM): mitigated, documented
A copied claim is useless to a front-runner. The ML-DSA-87 claim signature covers `msg.sender`,
the chain id, the escrow address, the bounty id, the identity hash and the next `claimRound`. It is
checked against the live key registered to `msg.sender`, so it only works when sent by the
claimant's own account. Racing to be first with your own claim is claim squatting (THREAT_MODEL.md
T-11). A commitment scheme wouldn't stop that, because claims are first come, first served by
design. What limits squatting:
- the funder picks the claim timeout (1 hour to 7 days);
- one active claim at a time, which expires;
- verifiers sign PAY only for the claimant whose GitHub identity comment matches the merged PR's
  author;
- a verdict is bound to the claimant and the claim round, so it can't pay a later claimant;
- REFUND is possible from Claimed.

Tests: `Claim.t.sol` `testCopiedSignatureCannotClaimForCopier`, `testClaimedReplayFails`,
`testClaimBadSignatures`; `Verdict.t.sol` `testCrossBountyReplay`; T-11 row in THREAT_MODEL.md.

### 4. Unchecked return values from PQC precompiles (MEDIUM): false positive
Both precompile calls fail closed. `_pqcVerify` (`0x…0a01`) reverts `PrecompileUnavailable` unless
the call succeeds and returns exactly 32 bytes holding 0 or 1. `_keyStatus` (`0x…0a02`) checks:
- the call succeeded;
- at least 0xa0 bytes came back;
- `registered` and `proven` are each 0 or 1;
- the algorithm id fits in `uint8`;
- the bytes offset is exactly 0x80;
- the key length (with padding) fits in the returned data.

It reverts otherwise. Callers then require `registered`, algorithm 1, a 2592-byte key and proven
possession.
Tests: `Verdict.t.sol` `testKeyStatusPrecompileFailures`, `testVerifyPrecompileFailures`;
`Keys.t.sol` `testMalformedVerifyReturn`, `testMalformedKeyStatusOnSubmit`; `Create.t.sol`
`testRejectsWhenPrecompileDown`, `testRejectsWhenPrecompileEmptyOrMalformed`,
`testRejectsWrongAlgorithmAndShortKey`; `Claim.t.sol` `testClaimPrecompileFailure`.

### 5. Unbounded loop in key validation (LOW): false positive
Every loop has a small fixed bound:
- key checks loop over exactly 3 verifiers (at most 3 × 3 comparisons);
- signer loops run over 2 or 3 indices, and anything else reverts `InvalidSigners`;
- `_validOwnerRepo` scans at most 140 bytes and rejects longer input first;
- the constructor scans the chain id string once, at deployment.

No loop depends on storage growth or the number of bounties.
Tests: `Create.t.sol` `testRejectsBadWorkReference` (including the length limits),
`testConstructorRejectsBadChainId`; `Verdict.t.sol` `testInvalidSignerShapes` (bad index sets).

### 6. Missing ERC standards implementation (INFO): not applicable
Postmark escrows native test QOR only (SPEC.md, native-only decision). It issues no token and
holds none, so ERC-20/721/1155 don't apply. Integrations use the events (`BountyCreated`,
`BountyWork`, `Claimed`, `VerdictSubmitted`, `Disputed`, `DisputeResolved`, `Settled`, `Credited`)
and the public view functions.

## Where the contract uses QoreChain PQC

The EVM setting reports quantum readiness as "not scored", so here is where it comes in:
- `claim` checks the claimant's live ML-DSA-87 key (`pqcKeyStatus`) and verifies the claim
  signature (`pqcVerify`).
- `submitVerdict` and `resolveDispute` need 2 or 3 verifier ML-DSA-87 signatures over the full
  verdict payload, each verified by `pqcVerify` against that verifier's live key. Duplicate
  verifier keys are refused.
- `withdraw` pays gated (payee) credits only while the payee's PQ key is live.

So a leaked ECDSA key alone can't claim, release or withdraw a payout. All payouts are testnet
payouts in test QOR, which has no monetary value.
