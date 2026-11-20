import { describe, it, expect } from "vitest";
import { errorMessage } from "../src/chain/errors";
import { sameAddress, isZeroAddress, isZeroHash } from "../src/chain/address";
import { tryQorToEvm, evmToQor } from "../src/chain/bech32";
import { githubItemUrl, githubItemLabel } from "../src/github/parse";
import { claimLine, disputeLine } from "../src/formats/lines";

const ESCROW = "0x13De819fE37133d19287aAFE1991a921F84b9F45" as const;
const ME = "0x478F2A08a81be7CEa42bd34BD6900593fA56c4B6" as const;

describe("errorMessage", () => {
  it("uses Error.message", () => expect(errorMessage(new Error("boom"))).toBe("boom"));
  it("falls back to the supplied text for non-errors", () => {
    expect(errorMessage("raw", "fallback")).toBe("fallback");
  });
  it("stringifies non-errors without a fallback", () => expect(errorMessage(42)).toBe("42"));
});

describe("address helpers", () => {
  it("compares case-insensitively and rejects missing values", () => {
    expect(sameAddress(ME, ME.toLowerCase())).toBe(true);
    expect(sameAddress(ME, ESCROW)).toBe(false);
    expect(sameAddress(undefined, ME)).toBe(false);
    expect(sameAddress(null, null)).toBe(false);
  });
  it("detects the zero address and zero hash", () => {
    expect(isZeroAddress("0x0000000000000000000000000000000000000000")).toBe(true);
    expect(isZeroAddress(ME)).toBe(false);
    expect(isZeroHash(`0x${"00".repeat(32)}`)).toBe(true);
    expect(isZeroHash(`0x${"01".repeat(32)}`)).toBe(false);
  });
  it("tryQorToEvm round-trips a valid address and swallows bad input", () => {
    expect(tryQorToEvm(evmToQor(ME))?.toLowerCase()).toBe(ME.toLowerCase());
    expect(tryQorToEvm("not-an-address")).toBeUndefined();
    expect(tryQorToEvm(null)).toBeUndefined();
  });
});

describe("github item links", () => {
  it("builds issue and pull URLs and labels", () => {
    const issue = { ownerRepo: "o/r", kind: 0, number: 7 };
    const pull = { ownerRepo: "o/r", kind: 1, number: 9n };
    expect(githubItemUrl(issue)).toBe("https://github.com/o/r/issues/7");
    expect(githubItemLabel(issue)).toBe("o/r#7");
    expect(githubItemUrl(pull)).toBe("https://github.com/o/r/pull/9");
    expect(githubItemLabel(pull)).toBe("o/r/pull/9");
  });
});

describe("comment lines", () => {
  it("emits the exact claim and dispute lines with lowercase addresses", () => {
    expect(claimLine(3n, ME, ESCROW)).toBe(
      `postmark-claim v1 chain=9800 escrow=${ESCROW.toLowerCase()} bounty=3 claimant=${ME.toLowerCase()}`);
    expect(disputeLine(3n, ESCROW)).toBe(
      `postmark-dispute v1 chain=9800 escrow=${ESCROW.toLowerCase()} bounty=3`);
  });
});
