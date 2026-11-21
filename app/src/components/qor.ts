import { formatUnits } from "viem";

const WEI_PER_QOR_DECIMALS = 18;
const DISPLAY_DECIMALS = 4;
const DUST_THRESHOLD = 10n ** BigInt(WEI_PER_QOR_DECIMALS - DISPLAY_DECIMALS);

/** QOR amount for display: up to 4 decimals, "<0.0001" for dust, "0" for zero. */
export function formatQor(wei: bigint): string {
  if (wei === 0n) return "0";
  if (wei < DUST_THRESHOLD) return "<0.0001";
  const [whole, frac = ""] = formatUnits(wei, WEI_PER_QOR_DECIMALS).split(".");
  const trimmed = frac.slice(0, DISPLAY_DECIMALS).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole!;
}

/** Exact amount for tooltips. */
export const exactQor = (wei: bigint) => `${formatUnits(wei, WEI_PER_QOR_DECIMALS)} QOR (${wei.toString()} wei)`;
