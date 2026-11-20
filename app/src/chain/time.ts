/** Wall-clock unix seconds, as the bigint the contract timestamps use. */
export const nowSec = (): bigint => BigInt(Math.floor(Date.now() / 1000));

export const SECONDS_PER_HOUR = 3600;
export const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;
export const MS_PER_MINUTE = 60_000;

/** Local date-time text for a unix-seconds timestamp. */
export const formatUnixTime = (sec: bigint | number) => new Date(Number(sec) * 1000).toLocaleString();
