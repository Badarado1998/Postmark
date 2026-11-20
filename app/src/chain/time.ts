/** Wall-clock unix seconds, as the bigint the contract timestamps use. */
export const nowSec = (): bigint => BigInt(Math.floor(Date.now() / 1000));
