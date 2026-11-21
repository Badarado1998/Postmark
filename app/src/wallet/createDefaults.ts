// Friendly defaults for the Create form. Pure; the contract-level rules stay in formats/createForm.ts.
import { MAX_CLAIM_TIMEOUT_SEC, MIN_CLAIM_TIMEOUT_SEC } from "../formats/createForm";
import { MS_PER_MINUTE, SECONDS_PER_DAY } from "../chain/time";

export const REWARD_PERCENT = 10;
export const BOND_PERCENT = 20;
export const MIN_SIDE_AMOUNT = 0.001;
export const DEFAULT_AMOUNT = "0.5";
export const AMOUNT_CHIPS = ["0.1", "0.5", "1"] as const;
export const DEFAULT_CLAIM_TIMEOUT_SEC = 3 * SECONDS_PER_DAY;
const CLAIM_BUFFER_SEC = 600;

export const DEADLINE_PRESETS = [
  { id: "1w", label: "1 week", days: 7 },
  { id: "2w", label: "2 weeks", days: 14 },
  { id: "1m", label: "1 month", days: 30 },
] as const;
export type DeadlineChoice = (typeof DEADLINE_PRESETS)[number]["id"] | "custom";

/** `percent` of `amount`, rounded to 4 decimals, never below 0.001; "" when the amount isn't a positive number. */
export function percentOf(amount: string, percent: number): string {
  const n = Number(amount);
  if (!amount.trim() || !Number.isFinite(n) || n <= 0) return "";
  const v = Math.max(MIN_SIDE_AMOUNT, Math.round(n * percent * 100) / 10_000);
  return String(Number(v.toFixed(4)));
}

export const defaultReward = (amount: string) => percentOf(amount, REWARD_PERCENT);
export const defaultBond = (amount: string) => percentOf(amount, BOND_PERCENT);

/** `datetime-local` value for `days` from `now`, in local time. */
export function deadlineLocalIn(days: number, nowMs = Date.now()): string {
  const d = new Date(nowMs + days * SECONDS_PER_DAY * 1000);
  return new Date(d.getTime() - d.getTimezoneOffset() * MS_PER_MINUTE).toISOString().slice(0, 16);
}

/**
 * The default claim timeout, shortened to fit before the deadline (claim window + 10-minute buffer) and
 * kept inside the contract's 1 hour – 7 day range where possible. Returns the unclamped-low value when the
 * deadline is too close, so form validation can explain it.
 */
export function clampClaimTimeout(desiredSec: number, deadlineSec: number, nowSec: number): number {
  const fits = deadlineSec - nowSec - CLAIM_BUFFER_SEC;
  return Math.min(desiredSec, MAX_CLAIM_TIMEOUT_SEC, Math.max(fits, MIN_CLAIM_TIMEOUT_SEC));
}
