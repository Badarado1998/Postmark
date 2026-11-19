import { decodeErrorResult, type Hex } from "viem";
import { postmarkEscrowAbi } from "./abi";

const MESSAGES: Record<string, string> = {
  BadClaimSignature: "The claim signature is not a valid ML-DSA-87 signature.",
  BadSignature: "A verifier signature did not verify.",
  ChallengeClosed: "The 24-hour challenge window has already closed.",
  ChallengeOpen: "The verdict is still inside its challenge window.",
  ClaimActive: "A claim is already active on this bounty.",
  ClaimClosed: "Claiming is closed for this bounty.",
  ClaimExpired: "The claim has expired.",
  ClaimWindowTooShort: "The claim window does not fit before the deadline.",
  ClaimantExcluded: "Funders and verifiers cannot claim their own bounty.",
  DeadlineNotPassed: "The bounty deadline has not passed yet.",
  DuplicateVerifierKey: "Two verifier slots share the same post-quantum key.",
  InvalidClaimRound: "The verdict names a different claim round.",
  InvalidClaimTimeout: "Claim timeout must be between 1 hour and 7 days.",
  InvalidNonce: "This verdict nonce was already used.",
  InvalidParameters: "Invalid bounty parameters.",
  InvalidPhase: "The verdict phase does not match the bounty state.",
  InvalidSigners: "Verifier indices are invalid or duplicated.",
  InvalidState: "The bounty is not in a state that allows this action.",
  InvalidVerdict: "Verdict fields are inconsistent for its outcome.",
  KeyIneligible: "An account has no live ML-DSA-87 key registered.",
  NotClaimant: "Only the frozen claimant can be paid.",
  NotFunder: "Only the funder can do this.",
  NothingToWithdraw: "There is nothing to withdraw.",
  PrecompileUnavailable: "The post-quantum precompile is unavailable on this chain.",
  ReentrancyGuardReentrantCall: "Reentrant call blocked.",
  SubmissionClosed: "Verdicts are closed for this bounty.",
  TransferFailed: "The native transfer failed.",
  UnknownBounty: "No bounty exists with that id.",
  WrongValue: "The transaction value does not match the required amount.",
};

/** Decode a revert into a plain-English message; falls back to the raw text. */
export function explainError(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  const hex = (text.match(/0x[0-9a-fA-F]{8,}/)?.[0] ?? "") as Hex;
  if (hex) {
    try {
      const d = decodeErrorResult({ abi: postmarkEscrowAbi, data: hex });
      const msg = MESSAGES[d.errorName];
      if (msg) {
        const detail = d.errorName === "UnknownBounty" && d.args?.[0] !== undefined
          ? ` (id ${d.args[0]})` : "";
        return msg + detail;
      }
      return `Contract rejected: ${d.errorName}`;
    } catch { /* not a known selector */ }
  }
  return classifyWindowRefusal(text) ?? tidy(text);
}

/** Map chain-side EVM window refusals to plain English. */
export function classifyWindowRefusal(text: string): string | null {
  const t = text.toLowerCase();
  if (t.includes("no open evm authorisation window"))
    return "No open EVM authorisation window. Open one in QoreX scoped to the escrow address.";
  if (t.includes("window exhausted"))
    return "The EVM authorisation window is exhausted. Close it and open a new one in QoreX.";
  if (t.includes("no registered post-quantum key"))
    return "This account has no registered post-quantum key on diana.";
  if (t.includes("nonce too low"))
    return "Stale nonce — retry; the account already sent a newer transaction.";
  if (t.includes("only replay-protected"))
    return "The wallet sent a pre-EIP-155 transaction. Enable chain-id signing (chain 9800).";
  return null;
}

function tidy(text: string): string {
  const first = text.split("\n")[0] ?? text;
  return first.length > 180 ? `${first.slice(0, 177)}…` : first;
}
