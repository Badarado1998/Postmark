# AI usage

Postmark was built with AI coding agents under the owner's direction. This file says what the agents did,
what people decided, and how the AI output was checked.

## Tools

- **Devin (Cognition)**, running locally in Devin Desktop on the owner's Mac, as the lead agent. It read
  the docs and chain state, made the design calls recorded in SPEC.md ("Implementation decisions"),
  wrote the briefs, reviewed every diff and made the commits.
- **Devin's sidekick agent**, a second agent that did the hands-on work: Solidity, Foundry tests, Node
  scripts, the local ML-DSA-87 signer (`scripts/signer.mjs`), the web app (funder, claimant, verifier
  review, dispute/resolution and dashboard flows) and its tests, and the testnet transactions, all from
  the lead's written briefs.
- The QoreChain **QCAI Contract Auditor** for the two-stage contract audit (see docs/AUDIT.md).

## What people decided

The owner set the product and its rules: the 2-of-3 ML-DSA-87 verdict escrow, the claim step and its rules,
native test QOR only, the name Postmark, when to deploy, which accounts to use, and that no repo is
created or pushed without approval. The owner also chose between options the agents laid out: the local
PQ signer until QoreX can sign messages, an EVM wallet plus QoreX for transactions, and a local build
before hosting. Recruiting verifiers, the Discord question and running the QCAI audit are done by people.

## How AI output was checked

- **Spec first.** Code is written against SPEC.md. When code and spec disagreed, the spec was updated in
  the same commit, with the reason.
- **Tests that don't trust the code under test.** The Foundry suite uses real ML-DSA-87 signatures from
  independently seeded keys (no always-true stubs), and the message tests rebuild the signed bytes from the
  spec strings instead of calling the contract's own helpers. Hash formats in the app are checked against
  vectors produced separately with `cast`. The app's own message builders and verdict-bundle merge are
  verified against Viem `encodeFunctionData` and live-RPC `claimMessage`/`verdictMessage` reads —
  the suite that caught the signer's static-tuple offset bug — and the signer's Node tests refuse on
  message mismatch, wrong claimant, wrong origin or wrong pairing code.
- **End-to-end on the real chain.** The Playwright e2e runs the full lifecycle — create, claim,
  2-of-3 INITIAL verdict, bonded dispute, DISPUTE-phase resolution, withdrawal — against the dedicated
  e2e escrow on diana (bounty #17 paid out), with GitHub as the only stubbed dependency.
- **Chain facts verified on chain.** Every deployment was checked by comparing the on-chain code with the
  compiled bytecode and reading the constants back with `cast call`. Key registrations were checked with
  `pqcKeyStatus` and the REST key record.
- **Review before commit.** The lead read every diff and sent problems back before anything was committed.
- **Secrets stay out.** Private keys and PQ recovery codes live outside the repo with owner-only file
  permissions; agents never printed them. The history was scanned for them.

## Limits

AI-written code can be wrong in ways tests miss. The contract has had no human professional audit. Payouts
are testnet payouts: diana QOR has no monetary value.
