import { zeroAddress, zeroHash } from "viem";

/** Case-insensitive address comparison; false when either side is missing. */
export function sameAddress(a: string | undefined | null, b: string | undefined | null): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

export const isZeroAddress = (a: string) => a === zeroAddress;
export const isZeroHash = (h: string) => h === zeroHash;
