import { describe, it, expect } from "vitest";
import {
  clampClaimTimeout, defaultBond, defaultReward, deadlineLocalIn, percentOf, DEFAULT_CLAIM_TIMEOUT_SEC,
} from "../../src/wallet/createDefaults";

describe("create defaults", () => {
  it("derives the challenge reward (10%) and dispute bond (20%) to four decimals", () => {
    expect(defaultReward("0.5")).toBe("0.05");
    expect(defaultBond("0.5")).toBe("0.1");
    expect(defaultReward("1")).toBe("0.1");
    expect(defaultBond("1.2345")).toBe("0.2469");
    expect(percentOf("0.123456", 10)).toBe("0.0123");
  });
  it("never goes below 0.001 and blanks bad input", () => {
    expect(defaultReward("0.001")).toBe("0.001");
    expect(defaultBond("0.002")).toBe("0.001");
    expect(defaultReward("")).toBe("");
    expect(defaultReward("abc")).toBe("");
    expect(defaultBond("-1")).toBe("");
  });
  it("builds deadline presets in local datetime format", () => {
    const now = Date.parse("2026-01-01T12:00:00Z");
    expect(deadlineLocalIn(7, now)).toMatch(/^2026-01-0[89]T\d\d:\d\d$/);
    expect(deadlineLocalIn(30, now)).toMatch(/^2026-01-3[01]T\d\d:\d\d$|^2026-02-0\dT\d\d:\d\d$/);
  });
  it("keeps the 3-day claim timeout when the deadline is far away", () => {
    const now = 1_000_000;
    expect(clampClaimTimeout(DEFAULT_CLAIM_TIMEOUT_SEC, now + 7 * 86_400, now)).toBe(DEFAULT_CLAIM_TIMEOUT_SEC);
  });
  it("shortens it to fit before a close deadline, with the 10-minute buffer", () => {
    const now = 1_000_000;
    expect(clampClaimTimeout(DEFAULT_CLAIM_TIMEOUT_SEC, now + 2 * 86_400, now)).toBe(2 * 86_400 - 600);
  });
  it("never goes below one hour or above seven days", () => {
    const now = 1_000_000;
    expect(clampClaimTimeout(DEFAULT_CLAIM_TIMEOUT_SEC, now + 60, now)).toBe(3600);
    expect(clampClaimTimeout(30 * 86_400, now + 60 * 86_400, now)).toBe(604_800);
  });
});
