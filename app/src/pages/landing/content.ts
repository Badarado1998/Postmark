import { ESCROW_ADDRESS, explorerAddress, explorerTx } from "../../chain/config";


export const BUILT_ON = [
  "QoreChain diana", "ML-DSA-87", "pqcVerify 0x…0a01", "pqcKeyStatus 0x…0a02", "GitHub",
];

export const STEPS = [
  ["Fund", "A maintainer escrows test QOR against a real GitHub issue or PR."],
  ["Claim", "A contributor comments on the issue, then claims with an ML-DSA-87 signature."],
  ["Verify 2 of 3", "Three independent verifiers sign a verdict; any two matching seals settle it."],
  ["24h challenge", "Every verdict sits open a day. Anyone can post a bond and dispute it."],
  ["Withdraw", "The payee pulls their credit; payee credits need a live registered PQ key."],
];

export const FEATURES: [string, string][] = [
  ["PQ-signed claims", "Claims carry an ML-DSA-87 signature checked by a chain precompile, not by us."],
  ["2-of-3 quorum", "Two matching verifier seals release the escrow. No single signer can settle alone."],
  ["Bonded disputes", "A dispute posts a bond that freezes the payout until verifiers rule again."],
  ["GitHub merge check", "Verdict evidence binds to the merged PR — the payout can't drift from the work."],
  ["Local signer", "ML-DSA-87 keys live in a local signer process, never in the browser."],
  ["Pull payouts", "Pull payments: payee credits withdraw only while a live PQ key is registered."],
];

export interface ProofItem { label: string; value: string; mono: boolean; href?: string; note?: string }

export const PROOF: ProofItem[] = [
  { label: "production escrow", value: ESCROW_ADDRESS, mono: true,
    href: explorerAddress(ESCROW_ADDRESS) },
  { label: "bounty #17 dispute resolved", value: "resolveDispute", mono: false,
    href: explorerTx("0xeaf7dde973740f3fd2838fba70df3bf0ce6065f0829aa951e5147d1a5af3e8a0") },
  { label: "bounty #17 payout withdrawn", value: "withdraw", mono: false,
    href: explorerTx("0x9aaabb1eb2a780bca7e0093fdbe78445825c231abd154d350c3516548f089cac") },
  { label: "bounty #18 finalized", value: "finalize", mono: false,
    href: explorerTx("0xd4b904905997b9cfbb096833c71d7ccb8dc318b2563e77ea87dd0d30ee1a8601"),
    note: "e2e contract, finalized after the real 24h window" },
  { label: "test suite", value: "126 Foundry tests, real ML-DSA-87 signatures", mono: false },
  { label: "audit", value: "QCAI Contract Auditor — docs/AUDIT.md", mono: false },
];

export const FAQ = [
  ["Is this real money?",
   "No. Postmark pays in diana test QOR, which has no monetary value. It's a testnet payout demonstration."],
  ["Why a local signer?",
   "QoreX can't yet sign arbitrary ML-DSA-87 messages, so claims and verdicts are signed by a small local process. Your PQ keys never touch the browser."],
  ["What happens on a dispute?",
   "Anyone can post a bond before the 24-hour challenge window closes. The bond freezes the payout and the verifiers rule a second time."],
  ["Who can verify?",
   "Three verifier accounts chosen by the funder at creation. Each must hold a registered, live ML-DSA-87 key on diana."],
  ["What if nobody claims?",
   "The funder can refund the escrow after the deadline passes."],
  ["What if a PQ key is lost?",
   "Payee credits need a live registered key to withdraw; funder and disputer credits are ungated. If a payee's key lapses, their credit waits in the escrow until a key is registered."],
];
