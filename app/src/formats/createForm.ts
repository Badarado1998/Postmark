// Pure validation for the create-bounty form (no React, no chain access).
import { parseUnits, isAddress, zeroAddress } from "viem";
import { qorToEvm } from "../chain/bech32";
import { isZeroAddress, sameAddress } from "../chain/address";
import { nowSec } from "../chain/time";

export const MIN_CLAIM_TIMEOUT_SEC = 3600;
export const MAX_CLAIM_TIMEOUT_SEC = 604800;
const CLAIM_BUFFER_SEC = 600n;

export function validateForm(f: {
  amount: string; reward: string; bond: string;
  deadlineLocal: string; claimTimeoutSec: number;
  verifiers: string[]; funder?: string;
}): { ok: true; parsed: {
  amount: bigint; reward: bigint; bond: bigint;
  deadline: bigint; claimTimeout: bigint; verifiers: `0x${string}`[];
} } | { ok: false; error: string } {
  let amount: bigint, reward: bigint, bond: bigint;
  try {
    amount = parseUnits(f.amount, 18);
    reward = parseUnits(f.reward, 18);
    bond = parseUnits(f.bond, 18);
  } catch { return { ok: false, error: "Amounts must be decimal numbers (max 18 dp)." }; }
  if (amount <= 0n) return { ok: false, error: "Amount must be above zero." };
  if (reward <= 0n) return { ok: false, error: "Challenge reward must be above zero." };
  if (bond <= 0n) return { ok: false, error: "Dispute bond must be above zero." };
  const dl = Math.floor(new Date(f.deadlineLocal).getTime() / 1000);
  if (!Number.isFinite(dl)) return { ok: false, error: "Pick a deadline." };
  if (f.claimTimeoutSec < MIN_CLAIM_TIMEOUT_SEC || f.claimTimeoutSec > MAX_CLAIM_TIMEOUT_SEC) {
    return { ok: false, error: "Claim timeout must be between 1 hour and 7 days." };
  }
  const now = Number(nowSec());
  if (dl <= now) return { ok: false, error: "Deadline is in the past." };
  if (BigInt(dl - now) < BigInt(f.claimTimeoutSec) + CLAIM_BUFFER_SEC) {
    return { ok: false, error:
      "Deadline too close: a claim window plus a 10-minute buffer must fit before it." };
  }
  const vs: `0x${string}`[] = [];
  for (const [i, raw] of f.verifiers.entries()) {
    const err = verifierFieldError(raw, i, f.verifiers, f.funder);
    if (err) return { ok: false, error: `Verifier ${i + 1}: ${err}` };
    vs.push(normalizeVerifier(raw));
  }
  return { ok: true, parsed: {
    amount, reward, bond, deadline: BigInt(dl),
    claimTimeout: BigInt(f.claimTimeoutSec), verifiers: vs } };
}

function normalizeVerifier(raw: string): `0x${string}` {
  const v = raw.trim();
  try { return v.startsWith("0x") ? v as `0x${string}` : qorToEvm(v); }
  catch { return zeroAddress; }
}

/** Per-field verifier error (undefined when the field is empty or valid). */
export function verifierFieldError(
  raw: string, index: number, all: string[], funder?: string,
): string | undefined {
  const v = raw.trim();
  if (!v) return "Required — three verifier addresses.";
  let evm: `0x${string}`;
  try { evm = v.startsWith("0x") ? v as `0x${string}` : qorToEvm(v); }
  catch { return "Not a valid 0x or qor1 address."; }
  if (!isAddress(evm, { strict: false })) return "Invalid address.";
  if (isZeroAddress(evm)) return "Cannot be the zero address.";
  if (sameAddress(evm, funder)) return "Equals the funder.";
  if (all.some((o, j) => j !== index && o.trim()
    && sameAddress(normalizeVerifier(o), evm))) {
    return "Duplicated — verifier addresses must differ.";
  }
  return undefined;
}
